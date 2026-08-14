import { describe, expect, it } from 'vitest'
import { filterCatalog, sortCatalog } from '../src/client/catalog.js'
import type { RegistryIndexEntry } from '../src/shared/schema.js'

function plugin(id: number, name: string, stars: number): RegistryIndexEntry {
  return {
    id: `gh:${id}`,
    githubDatabaseId: id,
    githubNodeId: `R_${id}`,
    slug: `owner/${name}`,
    name,
    owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner.png' },
    repositoryUrl: `https://github.com/owner/${name}`,
    homepageUrl: null,
    description: `${name} session memory`,
    coverUrl: null,
    topics: ['dsh-plugin'],
    language: 'TypeScript',
    license: 'MIT',
    stats: { stars, forks: 0 },
    state: { archived: false, fork: false },
    timestamps: {
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: `2026-08-${String(id).padStart(2, '0')}T00:00:00.000Z`,
      pushedAt: null,
    },
    install: { available: true, packageName: name, version: '1.0.0', requiresBuildApproval: false },
    detailPath: `./plugins/${id}.json`,
  }
}

describe('Marketplace catalog transforms', () => {
  const plugins = [plugin(2, 'zeta', 20), plugin(1, 'alpha', 5)]

  it('uses AND between query tokens and OR between fields', () => {
    expect(filterCatalog(plugins, 'zeta memory').map(item => item.name)).toEqual(['zeta'])
    expect(filterCatalog(plugins, 'owner missing')).toEqual([])
  })

  it('applies deterministic neutral and factual sorts', () => {
    expect(sortCatalog(plugins, 'name').map(item => item.name)).toEqual(['alpha', 'zeta'])
    expect(sortCatalog(plugins, 'stars').map(item => item.name)).toEqual(['zeta', 'alpha'])
    expect(sortCatalog(plugins, 'updated').map(item => item.name)).toEqual(['zeta', 'alpha'])
  })
})

