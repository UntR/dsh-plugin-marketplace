import { createHash } from 'node:crypto'
import {
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from './schema.js'
import { stableStringify } from './stable-json.js'
import type {
  RegistryIndex,
  RegistryIndexEntry,
  RegistryMeta,
  RegistryPluginDetail,
} from './types.js'

export interface RegistryDocuments {
  meta: RegistryMeta
  index: RegistryIndex
  details: ReadonlyMap<string, RegistryPluginDetail>
  bytes: {
    meta: string
    index: string
    details: ReadonlyMap<string, string>
  }
}

function compareEntries(left: RegistryIndexEntry, right: RegistryIndexEntry): number {
  const bySlug = left.slug.toLowerCase().localeCompare(right.slug.toLowerCase(), 'en')
  return bySlug === 0 ? left.id.localeCompare(right.id, 'en') : bySlug
}

function revisionFor(plugins: readonly RegistryIndexEntry[]): string {
  const content = stableStringify({ schemaVersion: 1, plugins })
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function buildRegistryDocuments(options: {
  entries: readonly RegistryIndexEntry[]
  details: readonly RegistryPluginDetail[]
  generatedAt: string
  previousMeta?: RegistryMeta
}): RegistryDocuments {
  const plugins = [...options.entries].sort(compareEntries)
  const revision = revisionFor(plugins)
  const generatedAt = options.previousMeta?.revision === revision
    ? options.previousMeta.generatedAt
    : options.generatedAt
  const index = registryIndexSchema.parse({ schemaVersion: 1, revision, plugins })
  const details = new Map<string, RegistryPluginDetail>()
  for (const detailValue of options.details) {
    const detail = registryPluginDetailSchema.parse(detailValue)
    if (details.has(detail.id)) throw new Error(`Duplicate detail id: ${detail.id}`)
    details.set(detail.id, detail)
  }
  if (details.size !== plugins.length) {
    throw new Error(`Registry integrity failed: ${plugins.length} index entries but ${details.size} detail files.`)
  }
  for (const entry of plugins) {
    const detail = details.get(entry.id)
    if (detail === undefined) throw new Error(`Registry detail missing for ${entry.id}.`)
    if (detail.github.databaseId !== entry.githubDatabaseId) {
      throw new Error(`Registry identity mismatch for ${entry.id}.`)
    }
  }
  const meta = registryMetaSchema.parse({
    schemaVersion: 1,
    registryVersion: '1',
    topic: 'dsh-plugin',
    revision,
    generatedAt,
    pluginCount: plugins.length,
    indexPath: './index.json',
  })
  const detailBytes = new Map<string, string>()
  for (const [id, detail] of details) detailBytes.set(id, stableStringify(detail))
  return {
    meta,
    index,
    details,
    bytes: {
      meta: stableStringify(meta),
      index: stableStringify(index),
      details: detailBytes,
    },
  }
}
