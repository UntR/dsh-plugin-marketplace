import { z } from 'zod'

export const DISCOVERY_QUERY = `query DshPluginRepositories($cursor: String) {
  topic(name: "dsh-plugin") {
    repositories(
      first: 100
      after: $cursor
      orderBy: { field: UPDATED_AT, direction: ASC }
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        databaseId
        name
        nameWithOwner
        url
        description
        homepageUrl
        visibility
        isArchived
        isFork
        stargazerCount
        forkCount
        createdAt
        updatedAt
        pushedAt
        openGraphImageUrl
        owner {
          login
          avatarUrl
        }
        primaryLanguage {
          name
        }
        licenseInfo {
          spdxId
          name
        }
        defaultBranchRef {
          name
          target {
            ... on Commit {
              oid
              committedDate
            }
          }
        }
        repositoryTopics(first: 50) {
          nodes {
            topic {
              name
            }
          }
        }
      }
    }
  }
}`

const dateTime = z.iso.datetime({ offset: true })
const repositorySchema = z.object({
  id: z.string().min(1),
  databaseId: z.int().positive(),
  name: z.string().min(1),
  nameWithOwner: z.string().regex(/^[^/]+\/[^/]+$/),
  url: z.url(),
  description: z.string().nullable(),
  homepageUrl: z.url().nullable(),
  visibility: z.enum(['PUBLIC', 'PRIVATE', 'INTERNAL']),
  isArchived: z.boolean(),
  isFork: z.boolean(),
  stargazerCount: z.int().nonnegative(),
  forkCount: z.int().nonnegative(),
  createdAt: dateTime,
  updatedAt: dateTime,
  pushedAt: dateTime.nullable(),
  openGraphImageUrl: z.url().nullable(),
  owner: z.object({
    login: z.string().min(1),
    avatarUrl: z.url(),
  }),
  primaryLanguage: z.object({ name: z.string().min(1) }).nullable(),
  licenseInfo: z.object({
    spdxId: z.string().min(1).nullable(),
    name: z.string().min(1).nullable(),
  }).nullable(),
  defaultBranchRef: z.object({
    name: z.string().min(1),
    target: z.object({
      oid: z.string().regex(/^[0-9a-f]{40}$/),
      committedDate: dateTime,
    }),
  }).nullable(),
  repositoryTopics: z.object({
    nodes: z.array(z.object({ topic: z.object({ name: z.string().min(1) }) }).nullable()),
  }),
})

const responseSchema = z.object({
  topic: z.object({
    repositories: z.object({
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        endCursor: z.string().min(1).nullable(),
      }),
      nodes: z.array(repositorySchema.nullable()),
    }),
  }).nullable(),
})

export interface DiscoveredRepository {
  id: string
  githubNodeId: string
  githubDatabaseId: number
  name: string
  slug: string
  repositoryUrl: string
  description: string | null
  homepageUrl: string | null
  archived: boolean
  fork: boolean
  stars: number
  forks: number
  createdAt: string
  updatedAt: string
  pushedAt: string | null
  openGraphImageUrl: string | null
  owner: { login: string; avatarUrl: string }
  language: string | null
  license: { spdxId: string | null; name: string | null } | null
  defaultBranch: string | null
  headSha: string | null
  committedAt: string | null
  topics: string[]
}

export type GraphqlRequest = (
  query: string,
  variables: { cursor: string | null },
) => Promise<unknown>

function normalizeRepository(repository: z.infer<typeof repositorySchema>): DiscoveredRepository {
  return {
    id: `gh:${repository.databaseId}`,
    githubNodeId: repository.id,
    githubDatabaseId: repository.databaseId,
    name: repository.name,
    slug: repository.nameWithOwner,
    repositoryUrl: repository.url,
    description: repository.description,
    homepageUrl: repository.homepageUrl,
    archived: repository.isArchived,
    fork: repository.isFork,
    stars: repository.stargazerCount,
    forks: repository.forkCount,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    pushedAt: repository.pushedAt,
    openGraphImageUrl: repository.openGraphImageUrl,
    owner: repository.owner,
    language: repository.primaryLanguage?.name ?? null,
    license: repository.licenseInfo,
    defaultBranch: repository.defaultBranchRef?.name ?? null,
    headSha: repository.defaultBranchRef?.target.oid ?? null,
    committedAt: repository.defaultBranchRef?.target.committedDate ?? null,
    topics: repository.repositoryTopics.nodes
      .flatMap(node => node === null ? [] : [node.topic.name])
      .sort((left, right) => left.localeCompare(right, 'en')),
  }
}

export async function discoverRepositories(request: GraphqlRequest): Promise<DiscoveredRepository[]> {
  const repositories: DiscoveredRepository[] = []
  const ids = new Set<number>()
  let cursor: string | null = null
  while (true) {
    const response = responseSchema.parse(await request(DISCOVERY_QUERY, { cursor }))
    if (response.topic === null) return []
    const connection = response.topic.repositories
    for (const node of connection.nodes) {
      if (node === null || node.visibility !== 'PUBLIC') continue
      if (ids.has(node.databaseId)) {
        throw new Error(`GitHub discovery returned duplicate repository databaseId ${node.databaseId}.`)
      }
      ids.add(node.databaseId)
      repositories.push(normalizeRepository(node))
    }
    if (!connection.pageInfo.hasNextPage) return repositories
    if (connection.pageInfo.endCursor === null) {
      throw new Error('GitHub discovery reported another page without an end cursor.')
    }
    cursor = connection.pageInfo.endCursor
  }
}

