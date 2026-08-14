import { discoverRepositories } from './discovery.js'
import { enrichRepositories, type RepositoryEnrichmentClient } from './enrich.js'
import { loadRegistry, replaceRegistry } from './filesystem.js'
import type { GraphqlRequest, DiscoveredRepository } from './discovery.js'
import { buildRegistryDocuments } from './protocol.js'
import { classifyPluginCategory } from './category.js'
import type { RegistryIndexEntry, RegistryPluginDetail } from './types.js'

function indexEntry(repository: DiscoveredRepository, detail: RegistryPluginDetail): RegistryIndexEntry {
  return {
    id: repository.id,
    githubDatabaseId: repository.githubDatabaseId,
    githubNodeId: repository.githubNodeId,
    slug: repository.slug,
    name: repository.name,
    owner: repository.owner,
    repositoryUrl: repository.repositoryUrl,
    homepageUrl: repository.homepageUrl,
    description: detail.presentation.description,
    coverUrl: detail.presentation.coverUrl,
    category: classifyPluginCategory({
      name: repository.name,
      slug: repository.slug,
      description: detail.presentation.description,
      topics: repository.topics,
    }),
    topics: repository.topics,
    language: repository.language,
    license: repository.license?.spdxId ?? repository.license?.name ?? null,
    stats: { stars: repository.stars, forks: repository.forks },
    state: { archived: repository.archived, fork: repository.fork },
    timestamps: {
      createdAt: repository.createdAt,
      updatedAt: repository.updatedAt,
      pushedAt: repository.pushedAt,
    },
    install: {
      available: detail.install.available,
      packageName: detail.install.packageName,
      version: detail.install.version,
      requiresBuildApproval: detail.install.requiresBuildApproval,
    },
    detailPath: `./plugins/${repository.githubDatabaseId}.json`,
  }
}

export interface SyncSummary {
  discovered: number
  added: number
  changed: number
  metadataOnly: number
  unchanged: number
  removed: number
  enrichmentFailed: number
  registryChanged: boolean
}

export async function syncRegistry(options: {
  directory: string
  graphql: GraphqlRequest
  enrichment: RepositoryEnrichmentClient
  now?: () => Date
}): Promise<SyncSummary> {
  const previous = await loadRegistry(options.directory)
  const repositories = await discoverRepositories(options.graphql)
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const details = await enrichRepositories({
    repositories,
    previous: previous.details,
    client: options.enrichment,
    enrichedAt: generatedAt,
  })
  const byId = new Map(details.map(detail => [detail.id, detail]))
  const entries = repositories.map(repository => {
    const detail = byId.get(repository.id)
    if (detail === undefined) throw new Error(`Missing enriched detail for ${repository.id}.`)
    return indexEntry(repository, detail)
  })
  const slugs = new Set<string>()
  for (const entry of entries) {
    const slug = entry.slug.toLowerCase()
    if (slugs.has(slug)) throw new Error(`Duplicate active repository slug: ${entry.slug}`)
    slugs.add(slug)
  }
  const documents = buildRegistryDocuments({
    entries,
    details,
    generatedAt,
    ...(previous.meta === undefined ? {} : { previousMeta: previous.meta }),
  })
  const registryChanged = await replaceRegistry(options.directory, documents)
  let added = 0
  let changed = 0
  let metadataOnly = 0
  let unchanged = 0
  for (const detail of details) {
    const old = previous.details.get(detail.id)
    if (old === undefined) added += 1
    else if (old.crawl.headSha !== detail.crawl.headSha) changed += 1
    else if (JSON.stringify(old) !== JSON.stringify(detail)) metadataOnly += 1
    else unchanged += 1
  }
  const currentIds = new Set(details.map(detail => detail.id))
  return {
    discovered: repositories.length,
    added,
    changed,
    metadataOnly,
    unchanged,
    removed: [...previous.details.keys()].filter(id => !currentIds.has(id)).length,
    enrichmentFailed: details.filter(detail => detail.crawl.enrichmentStatus === 'failed'
      || detail.crawl.enrichmentStatus === 'stale').length,
    registryChanged,
  }
}

export function formatSyncSummary(summary: SyncSummary): string {
  return [
    'DSH Plugin Registry Sync',
    '',
    `Discovered:        ${summary.discovered}`,
    `New:               ${summary.added}`,
    `Changed:           ${summary.changed}`,
    `Metadata-only:     ${summary.metadataOnly}`,
    `Unchanged:         ${summary.unchanged}`,
    `Removed:           ${summary.removed}`,
    `Enrichment failed: ${summary.enrichmentFailed}`,
    `Registry changed:  ${summary.registryChanged ? 'yes' : 'no'}`,
  ].join('\n')
}
