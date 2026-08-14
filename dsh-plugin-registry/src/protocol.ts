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

function revisionFor(
  plugins: readonly RegistryIndexEntry[],
  details: readonly RegistryPluginDetail[],
): string {
  const content = stableStringify({ schemaVersion: 1, plugins, details })
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function buildRegistryDocuments(options: {
  entries: readonly RegistryIndexEntry[]
  details: readonly RegistryPluginDetail[]
  generatedAt: string
  previousMeta?: RegistryMeta
}): RegistryDocuments {
  const plugins = [...options.entries].sort(compareEntries)
  const details = new Map<string, RegistryPluginDetail>()
  for (const detailValue of options.details) {
    const detail = registryPluginDetailSchema.parse(detailValue)
    if (details.has(detail.id)) throw new Error(`Duplicate detail id: ${detail.id}`)
    details.set(detail.id, detail)
  }
  if (details.size !== plugins.length) {
    throw new Error(`Registry integrity failed: ${plugins.length} index entries but ${details.size} detail files.`)
  }
  const ids = new Set<string>()
  const databaseIds = new Set<number>()
  const slugs = new Set<string>()
  for (const entry of plugins) {
    const slug = entry.slug.toLowerCase()
    if (ids.has(entry.id)) throw new Error(`Duplicate index id: ${entry.id}.`)
    if (databaseIds.has(entry.githubDatabaseId)) {
      throw new Error(`Duplicate GitHub database id: ${entry.githubDatabaseId}.`)
    }
    if (slugs.has(slug)) throw new Error(`Duplicate active repository slug: ${entry.slug}.`)
    if (entry.id !== `gh:${entry.githubDatabaseId}`) {
      throw new Error(`Registry stable id mismatch for ${entry.id}.`)
    }
    if (entry.detailPath !== `./plugins/${entry.githubDatabaseId}.json`) {
      throw new Error(`Registry detail path mismatch for ${entry.id}.`)
    }
    ids.add(entry.id)
    databaseIds.add(entry.githubDatabaseId)
    slugs.add(slug)
    const detail = details.get(entry.id)
    if (detail === undefined) throw new Error(`Registry detail missing for ${entry.id}.`)
    if (detail.github.databaseId !== entry.githubDatabaseId) {
      throw new Error(`Registry identity mismatch for ${entry.id}.`)
    }
  }
  const sortedDetails = [...details.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'))
  const revision = revisionFor(plugins, sortedDetails)
  const generatedAt = options.previousMeta?.revision === revision
    ? options.previousMeta.generatedAt
    : options.generatedAt
  const index = registryIndexSchema.parse({ schemaVersion: 1, revision, plugins })
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
