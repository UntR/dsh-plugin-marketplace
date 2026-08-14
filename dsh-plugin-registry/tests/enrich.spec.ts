import { describe, expect, it, vi } from 'vitest'
import type { DiscoveredRepository } from '../src/discovery.js'
import {
  enrichRepositories,
  enrichRepository,
  type RepositoryEnrichmentClient,
} from '../src/enrich.js'

function repository(id: number, head = 'a'.repeat(40)): DiscoveredRepository {
  return {
    id: `gh:${id}`,
    githubNodeId: `R_${id}`,
    githubDatabaseId: id,
    name: `plugin-${id}`,
    slug: `owner/plugin-${id}`,
    repositoryUrl: `https://github.com/owner/plugin-${id}`,
    description: null,
    homepageUrl: null,
    archived: false,
    fork: false,
    stars: id,
    forks: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    pushedAt: '2026-08-14T00:00:00.000Z',
    openGraphImageUrl: null,
    owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner.png' },
    language: 'TypeScript',
    license: { spdxId: 'MIT', name: 'MIT License' },
    defaultBranch: 'main',
    headSha: head,
    committedAt: '2026-08-14T00:00:00.000Z',
    topics: ['dsh-plugin'],
  }
}

function client(packageJson: string | null = null): RepositoryEnrichmentClient {
  return {
    readText: async (_repository, path) => path === 'README.md'
      ? '# Plugin\n\nA plugin fixture.'
      : packageJson,
    exists: async () => false,
    npmMetadata: async () => null,
  }
}

describe('repository enrichment', () => {
  it('includes malformed packages as unavailable records', async () => {
    const detail = await enrichRepository(repository(1), client('{'), '2026-08-14T06:30:00.000Z')
    expect(detail.package).toEqual({ status: 'invalid' })
    expect(detail.install.available).toBe(false)
    expect(detail.presentation.description).toBe('A plugin fixture.')
  })

  it('only enriches repositories whose HEAD changed', async () => {
    const initialRepositories = [repository(1), repository(2), repository(3)]
    const initial = await enrichRepositories({
      repositories: initialRepositories,
      previous: new Map(),
      client: client(),
      enrichedAt: '2026-08-14T06:30:00.000Z',
    })
    const changed = [repository(1), repository(2, 'b'.repeat(40)), repository(3)]
    const enrichment = vi.fn(async (repo: DiscoveredRepository, path: string) => {
      if (path === 'README.md') return `# Plugin\n\nChanged ${repo.id}.`
      return null
    })
    const result = await enrichRepositories({
      repositories: changed,
      previous: new Map(initial.map(detail => [detail.id, detail])),
      client: { readText: enrichment, exists: async () => false, npmMetadata: async () => null },
      enrichedAt: '2026-08-14T08:30:00.000Z',
    })
    expect(enrichment).toHaveBeenCalledTimes(2)
    expect(enrichment.mock.calls.every(call => call[0].id === 'gh:2')).toBe(true)
    expect(result[0]?.crawl.enrichedAt).toBe('2026-08-14T06:30:00.000Z')
    expect(result[1]?.crawl.enrichedAt).toBe('2026-08-14T08:30:00.000Z')
  })

  it('keeps previous derived data stale and includes new failures', async () => {
    const old = await enrichRepository(repository(1), client(), '2026-08-14T06:30:00.000Z')
    const failing: RepositoryEnrichmentClient = {
      readText: async () => { throw new Error('network') },
      exists: async () => { throw new Error('network') },
      npmMetadata: async () => { throw new Error('network') },
    }
    const result = await enrichRepositories({
      repositories: [repository(1, 'b'.repeat(40)), repository(2)],
      previous: new Map([[old.id, old]]),
      client: failing,
      enrichedAt: '2026-08-14T08:30:00.000Z',
    })
    expect(result[0]?.crawl.enrichmentStatus).toBe('stale')
    expect(result[0]?.readme.excerpt).toBe(old.readme.excerpt)
    expect(result[1]?.crawl.enrichmentStatus).toBe('failed')
    expect(result[1]?.install.available).toBe(false)
  })
})
