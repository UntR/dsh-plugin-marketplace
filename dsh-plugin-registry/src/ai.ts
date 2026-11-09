import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { aiResultSchema } from './schema.js'
import type { RegistryIndexEntry, RegistryPluginDetail } from './types.js'

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`
  }
  const text = JSON.stringify(value)
  if (text === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new TypeError('Non JSON value')
  return text
}
export function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`
}
export function semanticMetadata(entry: RegistryIndexEntry) {
  return {
    id: entry.id, name: entry.name, slug: entry.slug, description: entry.description,
    topics: entry.topics, language: entry.language, install_available: entry.install.available,
  }
}
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/)
export const aiRecordSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^gh:[0-9]+$/), inputHash: hash,
  input: z.object({
    metadata: z.object({
      id: z.string(), name: z.string(), slug: z.string(), description: z.string(),
      topics: z.array(z.string()), language: z.string().nullable(), install_available: z.boolean(),
    }).strict(),
    paragraphs: z.array(z.object({ id: z.string(), text: z.string() }).strict()), truncated: z.boolean(),
  }).strict(),
  versions: z.record(z.string(), z.string()),
  source: z.object({
    headSha: z.string().regex(/^[0-9a-f]{40}$/), path: z.string().nullable(),
    rawHash: z.string().regex(/^[0-9a-f]{64}$/), metadataHash: hash, registryRevision: hash,
  }).strict(),
  output: aiResultSchema,
  review: z.object({
    level: z.enum(['human-reviewed', 'batch-approved', 'automated']), reason: z.string().min(1), at: z.iso.datetime({ offset: true }),
  }).strict(),
}).strict()
export type AiRecord = z.infer<typeof aiRecordSchema>

export function validateRecord(value: unknown): AiRecord {
  const record = aiRecordSchema.parse(value)
  if (record.id !== record.output.id || record.id !== record.input.metadata.id) throw new Error('AI identity mismatch')
  if (digest({ input: record.input, versions: record.versions }) !== record.inputHash) throw new Error('AI input checksum mismatch')
  if (digest(record.input.metadata) !== record.source.metadataHash) throw new Error('AI metadata checksum mismatch')
  if (new Set(record.output.tags).size !== record.output.tags.length) throw new Error('AI duplicate tags')
  const paragraphs = new Map(record.input.paragraphs.map(p => [p.id, p.text]))
  if (paragraphs.size !== record.input.paragraphs.length) throw new Error('AI duplicate paragraphs')
  for (const evidence of record.output.evidence) {
    if (!paragraphs.get(evidence.paragraph_id)?.includes(evidence.quote)) throw new Error('AI evidence is not grounded')
  }
  if (!record.versions.model || !record.versions.prompt) throw new Error('AI model and prompt versions required')
  if (record.review.level === 'batch-approved' && (record.input.truncated || record.output.insufficient_evidence
    || record.output.limitations.length > 0 || record.input.paragraphs.reduce((n, p) => n + p.text.length, 0) < 150
    || /认证|密码|隐私|安全|保证|平台|仅限|前提|依赖|提醒|iMessage/i.test(canonical(record.output)))) {
    throw new Error('Risky AI result requires individual review')
  }
  return record
}

export async function loadAiRecords(directory: string): Promise<ReadonlyMap<string, AiRecord>> {
  const meta = z.object({
    schemaVersion: z.literal(1), revision: hash, recordCount: z.number().int().nonnegative(),
    records: z.array(z.string().regex(/^gh:[0-9]+$/)),
  }).strict().parse(JSON.parse(await readFile(join(directory, 'meta.json'), 'utf8')))
  if (new Set(meta.records).size !== meta.records.length || meta.recordCount !== meta.records.length) throw new Error('AI manifest integrity failure')
  const records: AiRecord[] = []
  for (const id of meta.records) {
    const record = validateRecord(JSON.parse(await readFile(join(directory, 'records', `${id.slice(3)}.json`), 'utf8')))
    if (record.id !== id) throw new Error('AI filename identity mismatch')
    // Manual decisions are binding to a semantic hash and never silently overwritten.
    let override: { id: string; inputHash: string; output: unknown } | undefined
    try {
      override = z.object({ id: z.string(), inputHash: hash, output: aiResultSchema,
        reason: z.string().min(1), at: z.iso.datetime({ offset: true }),
      }).strict().parse(JSON.parse(await readFile(join(directory, 'overrides', `${id.slice(3)}.json`), 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (override && (override.id !== id || (override.inputHash === record.inputHash
      && canonical(override.output) !== canonical(record.output)))) throw new Error('Manual override conflict')
    records.push(record)
  }
  records.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  if (digest(records) !== meta.revision) throw new Error('AI manifest revision mismatch')
  return new Map(records.map(r => [r.id, r]))
}

export function overlayAi(entry: RegistryIndexEntry, detail: RegistryPluginDetail, record?: AiRecord) {
  if (!record || record.id !== entry.id || record.source.headSha !== detail.github.headSha
    || record.source.metadataHash !== digest(semanticMetadata(entry)) || detail.crawl.enrichmentStatus !== 'ok') {
    return { entry, detail, applied: false }
  }
  const ai = {
    status: 'approved' as const, summaryZh: record.output.summary_zh, tags: record.output.tags,
    sourceInputHash: record.inputHash, sourceHeadSha: record.source.headSha,
    model: record.versions.model!, promptVersion: record.versions.prompt!, reviewLevel: record.review.level,
    reviewedAt: record.review.at, originalDescription: entry.description,
    limitations: record.output.limitations, evidence: record.output.evidence,
  }
  return {
    entry: { ...entry, ai, description: ai.summaryZh, category: record.output.category },
    detail: { ...detail, ai, presentation: { ...detail.presentation, description: ai.summaryZh } },
    applied: true,
  }
}
