import { selectDescription } from './description.js'
import { inferInstall, parsePackageJson, type ParsedPackage } from './install.js'
import type { DiscoveredRepository } from './discovery.js'
import type { RegistryPluginDetail } from './types.js'

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

export async function enrichRepositories(options: {
  repositories: readonly DiscoveredRepository[]
  previous: ReadonlyMap<string, RegistryPluginDetail>
  client: RepositoryEnrichmentClient
  enrichedAt: string
}): Promise<RegistryPluginDetail[]> {
  const details: RegistryPluginDetail[] = []
  for (const repository of options.repositories) {
    const previous = options.previous.get(repository.id)
    if (previous !== undefined && previous.crawl.headSha === repository.headSha) {
      details.push(reuseDerived(repository, previous, 'ok', options.enrichedAt))
      continue
    }
    try {
      details.push(await enrichRepository(repository, options.client, options.enrichedAt))
    } catch {
      details.push(previous === undefined
        ? minimalDetail(repository, options.enrichedAt, 'failed')
        : reuseDerived(repository, previous, 'stale', options.enrichedAt))
    }
  }
  return details
}

