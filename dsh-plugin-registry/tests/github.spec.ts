import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from '../src/github.js'

describe('GitHub client', () => {
  it('retries bounded server failures and never exposes the token in the body', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { topic: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    const sleep = vi.fn(async (_milliseconds: number) => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    await expect(client.graphql('query { topic(name: "dsh-plugin") { name } }', { cursor: null }))
      .resolves.toEqual({ topic: null })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1_000)
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('secret-token')
  })

  it('shares a quota circuit and does not retry exhausted quota', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', {
      status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '12345' },
    }))
    const sleep = vi.fn(async (_ms: number) => {})
    const client = new GitHubClient({ token: 'secret', fetch, sleep })
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('api_quota_or_auth HTTP 403; reset=12345')
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('api_quota')
    expect(fetch).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled()
  })

  it('keeps a successful response while reserving quota for subsequent work', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: {} }, {
      headers: { 'x-ratelimit-remaining': '50' },
    }))
    const client = new GitHubClient({ token: 'secret', fetch })
    await expect(client.graphql('query', { cursor: null })).resolves.toEqual({})
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('api_quota')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops before sending requests beyond a shared budget or deadline', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: {} }))
    const client = new GitHubClient({ token: 'secret', fetch, maxRequests: 1 })
    await client.graphql('query', { cursor: null })
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('request_budget')
    let now = 0
    const timed = new GitHubClient({ token: 'secret', fetch, now: () => now, maxDurationMs: 10 })
    now = 10
    await expect(timed.graphql('query', { cursor: null })).rejects.toThrow('time_budget')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('pauses instead of waiting an hour for secondary rate limits', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', {
      status: 429, headers: { 'retry-after': '3600' },
    }))
    const sleep = vi.fn(async (_ms: number) => {})
    const client = new GitHubClient({ token: 'secret', fetch, sleep })
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('api_quota')
    expect(fetch).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled()
  })

  it.each([401, 403, 429])('pauses every worker on HTTP %s even without rate headers', async status => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status }))
    const client = new GitHubClient({ token: 'secret', fetch })
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow(`HTTP ${status}`)
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('api_quota_or_auth')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns missing repository content as null', async () => {
    const client = new GitHubClient({
      token: 'secret-token',
      fetch: vi.fn(async () => new Response('', { status: 404 })),
      sleep: async () => {},
    })
    const repository = {
      slug: 'owner/repo',
      headSha: 'a'.repeat(40),
    } as Parameters<GitHubClient['readText']>[0]
    await expect(client.readText(repository, 'README.md')).resolves.toBeNull()
  })

  it('allows GraphQL discovery to use a longer timeout than content requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 20)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(init.signal?.reason)
        }, { once: true })
      })
      return new Response(JSON.stringify({ data: { topic: null } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const client = new GitHubClient({
      token: 'secret-token',
      fetch,
      sleep: async () => {},
      timeoutMs: 5,
      graphqlTimeoutMs: 50,
    })

    await expect(client.graphql('query { topic(name: "dsh-plugin") { name } }', { cursor: null }))
      .resolves.toEqual({ topic: null })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(['', '{"data":'])('retries an empty or truncated GraphQL response (%j)', async body => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(body))
      .mockResolvedValueOnce(Response.json({ data: { topic: null } }))
    const sleep = vi.fn(async (_milliseconds: number) => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    await expect(client.graphql('query', { cursor: 'page-2' })).resolves.toEqual({ topic: null })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1]?.[1]?.body).toBe(fetch.mock.calls[0]?.[1]?.body)
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000)
  })

  it('retries a body read timeout after headers have already arrived', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockImplementationOnce(async (_url, init) => new Response(new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true })
        },
      })))
      .mockResolvedValueOnce(Response.json({ data: { topic: null } }))
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep: async () => {}, graphqlTimeoutMs: 10 })
    await expect(client.graphql('query', { cursor: null })).resolves.toEqual({ topic: null })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reports the endpoint, HTTP status and bounded retry count when JSON stays invalid', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(''))
    const sleep = vi.fn(async (_milliseconds: number) => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    const error = await client.graphql('query', { cursor: null }).catch(error => error)
    if (!(error instanceof Error)) throw new Error('Expected request to fail with an Error.')
    expect(error.message).toContain('POST https://api.github.com/graphql failed after 5 attempts')
    expect(error.message).toContain('HTTP 200; invalid JSON or unreadable response body')
    expect(error.message).not.toContain('secret-token')
    expect(error.cause).toBeInstanceOf(SyntaxError)
    expect(fetch).toHaveBeenCalledTimes(5)
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([1_000, 2_000, 4_000, 8_000])
  })

  it('retries transport failures and honors Retry-After on server failures', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(Response.json({ data: { topic: null } }))
    const sleep = vi.fn(async (_milliseconds: number) => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    await expect(client.graphql('query', { cursor: null })).resolves.toEqual({ topic: null })
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([1_000, 3_000])
  })

  it('does not retry a permanent HTTP error or treat it as missing content', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 401 }))
    const sleep = vi.fn(async (_milliseconds: number) => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    await expect(client.graphql('query', { cursor: null })).rejects.toThrow('HTTP 401')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it.each([{ errors: [{ message: 'bad query' }] }, {}, null])(
    'rejects GraphQL application errors without transport retries (%j)', async envelope => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(envelope))
      const client = new GitHubClient({ token: 'secret-token', fetch, sleep: async () => {} })
      await expect(client.graphql('query', { cursor: null })).rejects.toThrow('GitHub GraphQL')
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('retries content JSON parsing without losing the pinned repository ref', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('{'))
      .mockResolvedValueOnce(Response.json({ type: 'file', encoding: 'base64', content: 'aGVsbG8=' }))
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep: async () => {} })
    const repository = { slug: 'owner/repo', headSha: 'a'.repeat(40) } as Parameters<GitHubClient['readText']>[0]
    await expect(client.readText(repository, 'README.md')).resolves.toBe('hello')
    expect(fetch.mock.calls[1]?.[0]).toBe(`https://api.github.com/repos/owner/repo/readme?ref=${repository.headSha}`)
  })

  it('retries npm responses without sending GitHub credentials', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(Response.json({ name: '@scope/plugin' }))
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep: async () => {} })
    await expect(client.npmMetadata('@scope/plugin')).resolves.toEqual({ name: '@scope/plugin' })
    expect(fetch).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe('https://registry.npmjs.org/%40scope%2Fplugin')
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      expect(new Headers(init?.headers).has('x-github-api-version')).toBe(false)
    }
  })

  it('returns an npm 404 as null without parsing or retrying', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('', { status: 404 }))
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep: async () => {} })
    await expect(client.npmMetadata('missing')).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

})
