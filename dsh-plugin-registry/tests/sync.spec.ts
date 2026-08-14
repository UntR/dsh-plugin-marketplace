import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { GraphqlRequest } from '../src/discovery.js'
import type { RepositoryEnrichmentClient } from '../src/enrich.js'
import { syncRegistry } from '../src/sync.js'

function node(id: number, options: { archived?: boolean; fork?: boolean; package?: string | null } = {}) {
  return {
    id: `R_${id}`,
    databaseId: id,
    name: `plugin-${id}`,
    nameWithOwner: `owner/plugin-${id}`,
    url: `https://github.com/owner/plugin-${id}`,
    description: null,
    homepageUrl: null,
    visibility: 'PUBLIC',
    isArchived: options.archived ?? false,
    isFork: options.fork ?? false,
    stargazerCount: id,
    forkCount: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
    pushedAt: '2026-08-14T00:00:00.000Z',
    openGraphImageUrl: null,
    owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner.png' },
    primaryLanguage: { name: 'TypeScript' },
    licenseInfo: { spdxId: 'MIT', name: 'MIT License' },
    defaultBranchRef: {
      name: 'main',
      target: { oid: id.toString(16).padStart(40, '0'), committedDate: '2026-08-14T00:00:00.000Z' },
    },
    repositoryTopics: { nodes: [{ topic: { name: 'dsh-plugin' } }] },
    packageFixture: options.package,
  }
}

function graphql(nodes: unknown[]): GraphqlRequest {
  return async () => ({
    topic: { repositories: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
  })
}

const enrichment: RepositoryEnrichmentClient = {
  readText: async (repository, path) => path === 'README.md'
    ? '# Plugin\n\nA fixture plugin.'
    : ((repository as unknown as { packageFixture?: string | null }).packageFixture ?? null),
  exists: async () => false,
  npmMetadata: async () => null,
}

describe('registry sync', () => {
  it('publishes every repository condition without using installability as a filter', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
    const variants = [
      node(1),
      node(2, { archived: true }),
      node(3, { fork: true }),
      node(4),
      node(5, { package: null }),
      node(6, { package: '{' }),
      node(7, { package: '{}' }),
    ]
    const packageById = new Map([
      ['gh:1', JSON.stringify({
        name: 'plugin-1',
        version: '1.0.0',
        main: './lib/index.js',
        dsh: { bundle: { patch: './cordis.patch.yml' } },
      })],
      ['gh:2', '{}'],
      ['gh:3', '{}'],
      ['gh:5', null],
      ['gh:6', '{'],
      ['gh:7', '{}'],
    ])
    const variantEnrichment: RepositoryEnrichmentClient = {
      readText: async (repository, path) => {
        if (path === 'README.md') return repository.id === 'gh:4' ? null : '# Plugin\n\nA fixture plugin.'
        return packageById.get(repository.id) ?? null
      },
      exists: async () => true,
      npmMetadata: async () => null,
    }
    const summary = await syncRegistry({
      directory: join(root, 'v1'),
      graphql: graphql(variants),
      enrichment: variantEnrichment,
      now: () => new Date('2026-08-14T06:30:00.000Z'),
    })
    const index = JSON.parse(await readFile(join(root, 'v1/index.json'), 'utf8')) as {
      plugins: Array<{ category: string }>
    }
    expect(index.plugins).toHaveLength(7)
    expect(index.plugins.every(plugin => plugin.category === 'other')).toBe(true)
    expect(summary).toMatchObject({ discovered: 7, added: 7, registryChanged: true })
    expect(await readdir(join(root, 'v1/plugins'))).toHaveLength(7)
  })

  it('removes absent repositories only after a successful full discovery', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
    const directory = join(root, 'v1')
    await syncRegistry({ directory, graphql: graphql([node(1), node(2), node(3)]), enrichment })
    const failedBytes = await readFile(join(directory, 'index.json'), 'utf8')
    await expect(syncRegistry({
      directory,
      graphql: async () => { throw new Error('pagination failed') },
      enrichment,
    })).rejects.toThrow('pagination failed')
    expect(await readFile(join(directory, 'index.json'), 'utf8')).toBe(failedBytes)
    const summary = await syncRegistry({ directory, graphql: graphql([node(1), node(3)]), enrichment })
    expect(summary.removed).toBe(1)
  })

  it('keeps the stable id and detail filename across a repository rename or transfer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
    const directory = join(root, 'v1')
    const original = {
      ...node(100),
      name: 'old',
      nameWithOwner: 'owner/old',
      url: 'https://github.com/owner/old',
    }
    const transferred = {
      ...original,
      name: 'new',
      nameWithOwner: 'next-owner/new',
      url: 'https://github.com/next-owner/new',
      owner: { login: 'next-owner', avatarUrl: 'https://avatars.example/next-owner.png' },
    }
    await syncRegistry({ directory, graphql: graphql([original]), enrichment })
    await syncRegistry({ directory, graphql: graphql([transferred]), enrichment })
    const index = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')) as {
      plugins: Array<{ id: string; slug: string; detailPath: string }>
    }
    expect(index.plugins).toEqual([expect.objectContaining({
      id: 'gh:100', slug: 'next-owner/new', detailPath: './plugins/100.json',
    })])
    expect(await readdir(join(directory, 'plugins'))).toEqual(['100.json'])
  })

  it('does not rewrite a no-op registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
    const directory = join(root, 'v1')
    await syncRegistry({
      directory,
      graphql: graphql([node(1)]),
      enrichment,
      now: () => new Date('2026-08-14T06:30:00.000Z'),
    })
    const metaPath = join(directory, 'meta.json')
    const before = await readFile(metaPath, 'utf8')
    const summary = await syncRegistry({
      directory,
      graphql: graphql([node(1)]),
      enrichment,
      now: () => new Date('2026-08-14T08:30:00.000Z'),
    })
    expect(summary.registryChanged).toBe(false)
    expect(await readFile(metaPath, 'utf8')).toBe(before)
  })

  it('rejects a corrupt existing registry rather than overwriting it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
    const directory = join(root, 'v1')
    await writeFile(join(root, 'marker'), 'kept')
    await expect(syncRegistry({ directory, graphql: graphql([node(1)]), enrichment })).resolves.toBeDefined()
    await writeFile(join(directory, 'index.json'), '{')
    await expect(syncRegistry({ directory, graphql: graphql([node(1)]), enrichment })).rejects.toThrow()
    expect(await readFile(join(root, 'marker'), 'utf8')).toBe('kept')
  })
})
