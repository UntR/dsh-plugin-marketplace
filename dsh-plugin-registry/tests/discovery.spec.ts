import { describe, expect, it } from 'vitest'
import {
  DISCOVERY_QUERY,
  discoverRepositories,
  type GraphqlRequest,
} from '../src/discovery.js'

function repository(databaseId: number, visibility = 'PUBLIC') {
  const sha = databaseId.toString(16).padStart(40, '0')
  return {
    id: `R_${databaseId}`,
    databaseId,
    name: `plugin-${databaseId}`,
    nameWithOwner: `owner/plugin-${databaseId}`,
    url: `https://github.com/owner/plugin-${databaseId}`,
    description: null,
    homepageUrl: null,
    visibility,
    isArchived: databaseId === 1,
    isFork: databaseId === 2,
    stargazerCount: databaseId,
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
      target: { oid: sha, committedDate: '2026-08-14T00:00:00.000Z' },
    },
    repositoryTopics: {
      nodes: [{ topic: { name: 'dsh-plugin' } }],
    },
  }
}

describe('GitHub topic discovery', () => {
  it('walks 25 pages and returns all 2500 repositories', async () => {
    const cursors: Array<string | null> = []
    const request: GraphqlRequest = async (query, variables) => {
      expect(query).toContain('topic(name: "dsh-plugin")')
      expect(query).not.toContain('search(')
      cursors.push(variables.cursor)
      const page = cursors.length - 1
      return {
        topic: {
          repositories: {
            pageInfo: {
              hasNextPage: page < 24,
              endCursor: page < 24 ? `cursor-${page + 1}` : null,
            },
            nodes: Array.from({ length: 100 }, (_, offset) => repository(page * 100 + offset + 1)),
          },
        },
      }
    }
    const result = await discoverRepositories(request)
    expect(result).toHaveLength(2500)
    expect(cursors).toHaveLength(25)
    expect(cursors[0]).toBeNull()
    expect(cursors[24]).toBe('cursor-24')
  })

  it('filters only non-public repositories and keeps archived and fork repositories', async () => {
    const result = await discoverRepositories(async () => ({
      topic: {
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [repository(1), repository(2), repository(3, 'PRIVATE')],
        },
      },
    }))
    expect(result.map(item => item.id)).toEqual(['gh:1', 'gh:2'])
    expect(result[0]?.archived).toBe(true)
    expect(result[1]?.fork).toBe(true)
  })

  it('keeps discovery complete when GitHub returns a malformed homepage URL', async () => {
    const malformed = { ...repository(1), homepageUrl: 'not a valid absolute URL' }
    const valid = { ...repository(2), homepageUrl: 'https://plugin.example/docs' }
    const result = await discoverRepositories(async () => ({
      topic: {
        repositories: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [malformed, valid],
        },
      },
    }))
    expect(result.map(item => item.homepageUrl)).toEqual([null, 'https://plugin.example/docs'])
  })

  it('fails the whole discovery when a later page fails', async () => {
    let page = 0
    await expect(discoverRepositories(async () => {
      page += 1
      if (page === 3) throw new Error('network failed')
      return {
        topic: {
          repositories: {
            pageInfo: { hasNextPage: true, endCursor: `cursor-${page}` },
            nodes: [repository(page)],
          },
        },
      }
    })).rejects.toThrow('network failed')
  })

  it('rejects an incomplete pagination response', async () => {
    await expect(discoverRepositories(async () => ({
      topic: {
        repositories: {
          pageInfo: { hasNextPage: true, endCursor: null },
          nodes: [],
        },
      },
    }))).rejects.toThrow('without an end cursor')
  })

  it('rejects a missing canonical topic instead of treating it as an empty Registry', async () => {
    await expect(discoverRepositories(async () => ({ topic: null })))
      .rejects.toThrow('canonical dsh-plugin topic')
  })

  it('uses the canonical topic connection query', () => {
    expect(DISCOVERY_QUERY).toContain('repositories(')
    expect(DISCOVERY_QUERY).toContain('first: 50')
    expect(DISCOVERY_QUERY).toContain('after: $cursor')
    expect(DISCOVERY_QUERY).toContain('orderBy: { field: CREATED_AT, direction: ASC }')
  })
})
