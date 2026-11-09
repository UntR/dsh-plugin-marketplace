import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadRegistry, replaceRegistry } from './filesystem.js'
import { buildRegistryDocuments } from './protocol.js'
import { registryIndexSchema } from './schema.js'
import { digest, loadAiRecords, overlayAi } from './ai.js'
import type { RegistryIndexEntry, RegistryPluginDetail } from './types.js'

export async function publishRegistry(options: { facts: string; ai: string; output: string; now?: () => Date }) {
  const facts = await loadRegistry(options.facts)
  const index = registryIndexSchema.parse(JSON.parse(await readFile(join(options.facts, 'index.json'), 'utf8')))
  const records = await loadAiRecords(options.ai)
  const entries: RegistryIndexEntry[] = []; const details: RegistryPluginDetail[] = []
  let applied = 0
  for (const entry of index.plugins) {
    const detail = facts.details.get(entry.id)
    if (!detail) throw new Error(`Missing fact detail ${entry.id}`)
    const combined = overlayAi(entry, detail, records.get(entry.id))
    entries.push({ ...combined.entry, detailHash: digest(combined.detail) }); details.push(combined.detail)
    if (combined.applied) applied += 1
  }
  const previous = await loadRegistry(options.output)
  const documents = buildRegistryDocuments({ entries, details,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    ...(previous.meta ? { previousMeta: previous.meta } : {}),
  })
  await replaceRegistry(options.output, documents)
  return { total: entries.length, aiApplied: applied, fallback: entries.length - applied, revision: documents.meta.revision }
}
