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
    const sleep = vi.fn(async () => {})
    const client = new GitHubClient({ token: 'secret-token', fetch, sleep })
    await expect(client.graphql('query { topic(name: "dsh-plugin") { name } }', { cursor: null }))
      .resolves.toEqual({ topic: null })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1_000)
    expect(fetch.mock.calls[0]?.[1]?.body).not.toContain('secret-token')
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
})
