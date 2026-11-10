import { SyncPaused } from './sync-pause.js'
import type { DiscoveredRepository, GraphqlRequest } from './discovery.js'
import type { RepositoryEnrichmentClient } from './enrich.js'

const API_VERSION = '2026-03-10'

export interface GitHubClientOptions {
  token: string
  fetch?: typeof globalThis.fetch
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
  maxDurationMs?: number
  maxRequests?: number
  now?: () => number
  graphqlTimeoutMs?: number
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
  private readonly graphqlTimeoutMs: number
  private readonly now: () => number
  private readonly deadline: number
  private readonly maxRequests: number
  private requests = 0
  private paused: SyncPaused | undefined
  private readonly headers: HeadersInit

  constructor(options: GitHubClientOptions) {
    if (options.token.trim() === '') throw new Error('GitHub token is required.')
    this.now = options.now ?? Date.now
    this.deadline = this.now() + (options.maxDurationMs ?? Number.POSITIVE_INFINITY)
    this.maxRequests = options.maxRequests ?? Number.POSITIVE_INFINITY
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.graphqlTimeoutMs = options.graphqlTimeoutMs ?? 30_000
    this.headers = {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${options.token}`,
      'user-agent': 'dsh-plugin-registry',
      'x-github-api-version': API_VERSION,
    }
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    options: { timeoutMs?: number; missingAsNull?: boolean; authenticated?: boolean } = {},
  ): Promise<unknown> {
    const context = `${init.method ?? 'GET'} ${url}`
    let lastError: unknown
    let failure = 'network request failed'
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (this.paused) throw this.paused
      if (this.now() >= this.deadline || this.requests >= this.maxRequests) {
        this.paused = new SyncPaused(this.now() >= this.deadline ? 'time_budget' : 'request_budget')
        throw this.paused
      }
      this.requests += 1
      let response: Response | null = null
      try {
        response = await this.fetchImpl(url, {
          ...init,
          headers: options.authenticated === false
            ? (init.headers ?? {})
            : { ...this.headers, ...init.headers },
          signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
        })
      } catch (error) {
        lastError = error
        failure = 'network request failed or timed out'
      }
      if (response !== null) {
        const remaining = response.headers.get('x-ratelimit-remaining')
        const exhausted = remaining !== null && Number(remaining) <= 50
        if (exhausted || [401, 403, 429].includes(response.status)) {
          this.paused = new SyncPaused(`api_quota_or_auth HTTP ${response.status}; reset=${response.headers.get('x-ratelimit-reset') ?? 'unknown'}`)
          if (!response.ok) {
            await response.body?.cancel().catch(() => {})
            throw this.paused
          }
        }
        if (options.missingAsNull === true && response.status === 404) return null
        if (!response.ok) {
          failure = `HTTP ${response.status}`
          lastError = new Error(failure)
          // Release retryable error bodies without attempting to parse them as JSON.
          await response.body?.cancel().catch(() => {})
          if (!retryable(response)) throw new Error(`${context} failed: ${failure}.`)
        } else {
          try {
            // Reading the body belongs to the same timed attempt as fetching headers.
            return await response.json()
          } catch (error) {
            lastError = error
            failure = `HTTP ${response.status}; invalid JSON or unreadable response body`
          }
        }
      }
      if (attempt < 4) await this.sleep(Math.min(60_000, Math.max(0, this.deadline - this.now()), retryDelay(response, attempt)))
    }
    throw new Error(`${context} failed after 5 attempts: ${failure}.`, { cause: lastError })
  }

  readonly graphql: GraphqlRequest = async (query, variables) => {
    const envelope = await this.requestJson('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    }, { timeoutMs: this.graphqlTimeoutMs }) as { data?: unknown; errors?: unknown }
    if (envelope === null || typeof envelope !== 'object') {
      throw new Error('GitHub GraphQL returned an invalid envelope.')
    }
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
    const value = await this.requestJson(url.href, { method: 'GET' }, { missingAsNull: true }) as
      { type?: unknown; encoding?: unknown; content?: unknown } | null
    if (value === null) return null
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
    return this.requestJson(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-registry' },
    }, { missingAsNull: true, authenticated: false })
  }
}
