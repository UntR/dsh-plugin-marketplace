export {
  registryIndexEntrySchema,
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from './schema.js'
export { buildRegistryDocuments, type RegistryDocuments } from './protocol.js'
export { stableStringify } from './stable-json.js'
export { classifyPluginCategory, PLUGIN_CATEGORIES, type PluginCategory } from './category.js'
export {
  DISCOVERY_QUERY,
  discoverRepositories,
  type DiscoveredRepository,
  type GraphqlRequest,
} from './discovery.js'
export { extractReadmeDescription, selectDescription } from './description.js'
export {
  inferInstall,
  inspectNpmMetadata,
  parsePackageJson,
  type InstallFacts,
  type NpmFacts,
  type PackageFacts,
  type ParsedPackage,
} from './install.js'
export {
  enrichRepositories,
  enrichRepository,
  type RepositoryEnrichmentClient,
} from './enrich.js'
export { GitHubClient, type GitHubClientOptions } from './github.js'
export { loadRegistry, replaceRegistry } from './filesystem.js'
export { formatSyncSummary, syncRegistry, type SyncSummary } from './sync.js'
export type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryMeta,
  RegistryPluginDetail,
} from './types.js'
