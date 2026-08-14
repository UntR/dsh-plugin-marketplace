import { selectDescription } from './description.js'
import { inferInstall, parsePackageJson, type ParsedPackage } from './install.js'
import type { DiscoveredRepository } from './discovery.js'
import type { RegistryPluginDetail } from './types.js'

const NPM_CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const ENRICHMENT_CONCURRENCY = 6

export interface RepositoryEnrichmentClient {
  readText(repository: DiscoveredRepository, path: string): Promise<string | null>
  exists(repository: DiscoveredRepository, path: string): Promise<boolean>
  npmMetadata(packageName: string): Promise<unknown | null>
}

function scriptsOf(pkg: ParsedPackage): RegistryPluginDetail['scripts'] {
  return pkg !== null && pkg.status === 'valid'
    ? pkg.scripts
    : { prepare: false, preinstall: false, install: false, postinstall: false }
}

function packageRecord(pkg: ParsedPackage): RegistryPluginDetail['package'] {
  if (pkg === null || pkg.status === 'invalid') return pkg
  return {
    status: 'valid',
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    main: pkg.main,
    ...(pkg.exports !== undefined ? { exports: pkg.exports } : {}),
  }
}

function parsedPackageFromDetail(detail: RegistryPluginDetail): ParsedPackage {
  if (detail.package === null || detail.package.status === 'invalid') return detail.package
  return {
    status: 'valid',
    name: detail.package.name,
    version: detail.package.version,
    type: detail.package.type,
    main: detail.package.main,
    ...(detail.package.exports !== undefined ? { exports: detail.package.exports } : {}),
    dshPatch: detail.bundle.patch,
    scripts: detail.scripts,
  }
}

function githubRecord(repository: DiscoveredRepository): RegistryPluginDetail['github'] {
  return {
    databaseId: repository.githubDatabaseId,
    nodeId: repository.githubNodeId,
    slug: repository.slug,
    url: repository.repositoryUrl,
    defaultBranch: repository.defaultBranch,
    headSha: repository.headSha,
    owner: repository.owner,
    description: repository.description,
    homepageUrl: repository.homepageUrl,
    topics: repository.topics,
    stars: repository.stars,
    forks: repository.forks,
    archived: repository.archived,
    fork: repository.fork,
    language: repository.language,
    license: repository.license,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    pushedAt: repository.pushedAt,
    openGraphImageUrl: repository.openGraphImageUrl,
  }
}

function minimalDetail(
  repository: DiscoveredRepository,
  enrichedAt: string,
  status: 'failed' | 'partial',
): RegistryPluginDetail {
  const description = selectDescription(repository.description, null)
  return {
    schemaVersion: 1,
    id: repository.id,
    github: githubRecord(repository),
    presentation: { description, coverUrl: repository.openGraphImageUrl ?? repository.owner.avatarUrl },
    readme: { available: false, excerpt: '' },
    package: null,
    bundle: { detected: false, patch: null, patchExists: null },
    scripts: { prepare: false, preinstall: false, install: false, postinstall: false },
    npm: { published: false, latestVersion: null, repositoryMatches: null },
    install: {
      available: false,
      preferred: null,
      spec: null,
      packageName: null,
      version: null,
      requiresBuildApproval: false,
      reason: 'Repository enrichment is unavailable.',
    },
    crawl: { headSha: repository.headSha, enrichmentStatus: status, enrichedAt },
  }
}

export async function enrichRepository(
  repository: DiscoveredRepository,
  client: RepositoryEnrichmentClient,
  enrichedAt: string,
): Promise<RegistryPluginDetail> {
  const [readme, packageJson] = await Promise.all([
    client.readText(repository, 'README.md'),
    client.readText(repository, 'package.json'),
  ])
  const pkg = parsePackageJson(packageJson)
  const patch = pkg !== null && pkg.status === 'valid' ? pkg.dshPatch : null
  const patchExists = patch === null ? null : await client.exists(repository, patch)
  const npmMetadata = pkg !== null && pkg.status === 'valid' && pkg.name !== null
    ? await client.npmMetadata(pkg.name)
    : null
  const { npm, install } = await inferInstall({
    package: pkg,
    patchExists,
    repositorySlug: repository.slug,
    headSha: repository.headSha,
    npmMetadata,
    fileExists: path => client.exists(repository, path),
  })
  const description = selectDescription(repository.description, readme)
  return {
    schemaVersion: 1,
    id: repository.id,
    github: githubRecord(repository),
    presentation: { description, coverUrl: repository.openGraphImageUrl ?? repository.owner.avatarUrl },
    readme: { available: readme !== null, excerpt: readme === null ? '' : selectDescription(null, readme) },
    package: packageRecord(pkg),
    bundle: { detected: patch !== null, patch, patchExists },
    scripts: scriptsOf(pkg),
    npm,
    install,
    crawl: { headSha: repository.headSha, enrichmentStatus: 'ok', enrichedAt },
  }
}

function reuseDerived(
  repository: DiscoveredRepository,
  previous: RegistryPluginDetail,
  status: 'ok' | 'stale',
  enrichedAt: string,
): RegistryPluginDetail {
  return {
    ...previous,
    id: repository.id,
    github: githubRecord(repository),
    presentation: {
      ...previous.presentation,
      coverUrl: repository.openGraphImageUrl ?? repository.owner.avatarUrl,
    },
    crawl: {
      headSha: repository.headSha,
      enrichmentStatus: status,
      enrichedAt: status === 'ok' ? previous.crawl.enrichedAt : enrichedAt,
    },
  }
}

async function refreshNpmFacts(
  repository: DiscoveredRepository,
  previous: RegistryPluginDetail,
  client: RepositoryEnrichmentClient,
  enrichedAt: string,
): Promise<RegistryPluginDetail> {
  const pkg = parsedPackageFromDetail(previous)
  if (pkg === null || pkg.status === 'invalid' || pkg.name === null) {
    return reuseDerived(repository, previous, 'ok', enrichedAt)
  }
  const { npm, install } = await inferInstall({
    package: pkg,
    patchExists: previous.bundle.patchExists,
    repositorySlug: repository.slug,
    headSha: repository.headSha,
    npmMetadata: await client.npmMetadata(pkg.name),
    fileExists: path => client.exists(repository, path),
  })
  return {
    ...reuseDerived(repository, previous, 'ok', enrichedAt),
    npm,
    install,
    crawl: { headSha: repository.headSha, enrichmentStatus: 'ok', enrichedAt },
  }
}

export async function enrichRepositories(options: {
  repositories: readonly DiscoveredRepository[]
  previous: ReadonlyMap<string, RegistryPluginDetail>
  client: RepositoryEnrichmentClient
  enrichedAt: string
}): Promise<RegistryPluginDetail[]> {
  const details = new Array<RegistryPluginDetail>(options.repositories.length)
  let nextIndex = 0
  const enrichNext = async (): Promise<void> => {
    while (nextIndex < options.repositories.length) {
      const index = nextIndex
      nextIndex += 1
      const repository = options.repositories[index]
      if (repository === undefined) return
      const previous = options.previous.get(repository.id)
      const cacheAge = previous === undefined
        ? Number.POSITIVE_INFINITY
        : Date.parse(options.enrichedAt) - Date.parse(previous.crawl.enrichedAt)
      const unchangedHead = previous !== undefined
        && previous.crawl.enrichmentStatus === 'ok'
        && previous.crawl.headSha === repository.headSha
      if (unchangedHead && cacheAge >= 0 && cacheAge < NPM_CACHE_TTL_MS) {
        details[index] = reuseDerived(repository, previous, 'ok', options.enrichedAt)
        continue
      }
      try {
        details[index] = unchangedHead
          ? await refreshNpmFacts(repository, previous, options.client, options.enrichedAt)
          : await enrichRepository(repository, options.client, options.enrichedAt)
      } catch {
        details[index] = previous === undefined
          ? minimalDetail(repository, options.enrichedAt, 'failed')
          : reuseDerived(repository, previous, 'stale', options.enrichedAt)
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(ENRICHMENT_CONCURRENCY, options.repositories.length) },
    enrichNext,
  ))
  return details
}
