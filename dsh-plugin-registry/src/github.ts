import type { DiscoveredRepository, GraphqlRequest } from './discovery.js'
import type { RepositoryEnrichmentClient } from './enrich.js'

const API_VERSION = '2026-03-10'

export interface GitHubClientOptions {
  token: string
  fetch?: typeof globalThis.fetch
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
}

function retryDelay(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after')
  if (retryAfter !== null && retryAfter !== undefined) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000
  }
  return 1_000 * (2 ** attempt)
}

function retryable(response: Response): boolean {
  return response.status === 403 || response.status === 429 || response.status >= 500
}

export class GitHubClient implements RepositoryEnrichmentClient {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly timeoutMs: number
  private readonly headers: HeadersInit

  constructor(options: GitHubClientOptions) {
    if (options.token.trim() === '') throw new Error('GitHub token is required.')
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'user-agent': 'dsh-plugin-registry',
      'x-github-api-version': API_VERSION,
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt += 1) {
      let response: Response | null = null
      try {
        response = await this.fetchImpl(url, {
          ...init,
          headers: { ...this.headers, ...init.headers },
          signal: AbortSignal.timeout(this.timeoutMs),
        })
        if (!retryable(response)) return response
        lastError = new Error(`GitHub API returned ${response.status}.`)
      } catch (error) {
        lastError = error
      }
      if (attempt < 4) await this.sleep(retryDelay(response, attempt))
    }
    throw lastError
  }

  readonly graphql: GraphqlRequest = async (query, variables) => {
    const response = await this.request('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    if (!response.ok) throw new Error(`GitHub GraphQL request failed with ${response.status}.`)
    const envelope = await response.json() as { data?: unknown; errors?: unknown }
    if (envelope.errors !== undefined) {
      throw new Error(`GitHub GraphQL returned errors: ${JSON.stringify(envelope.errors)}`)
    }
    if (envelope.data === undefined) throw new Error('GitHub GraphQL returned no data.')
    return envelope.data
  }

  private async content(repository: DiscoveredRepository, path: string): Promise<string | null> {
    const normalized = path.replace(/^\.\//, '')
    if (normalized === '' || normalized.startsWith('/') || normalized.split('/').includes('..')) {
      throw new Error(`Invalid repository content path: ${path}`)
    }
    const encodedPath = normalized.split('/').map(segment => encodeURIComponent(segment)).join('/')
    const endpoint = normalized === 'README.md'
      ? `https://api.github.com/repos/${repository.slug}/readme`
      : `https://api.github.com/repos/${repository.slug}/contents/${encodedPath}`
    const url = new URL(endpoint)
    if (repository.headSha !== null) url.searchParams.set('ref', repository.headSha)
    const response = await this.request(url.href, { method: 'GET' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub contents request failed with ${response.status}.`)
    const value = await response.json() as { type?: unknown; encoding?: unknown; content?: unknown }
    if (value.type !== 'file' || value.encoding !== 'base64' || typeof value.content !== 'string') return null
    return Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8')
  }

  readText(repository: DiscoveredRepository, path: string): Promise<string | null> {
    return this.content(repository, path)
  }

  async exists(repository: DiscoveredRepository, path: string): Promise<boolean> {
    return await this.content(repository, path) !== null
  }

  async npmMetadata(packageName: string): Promise<unknown | null> {
    const response = await this.fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-registry' },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`npm registry request failed with ${response.status}.`)
    return response.json()
  }
}
