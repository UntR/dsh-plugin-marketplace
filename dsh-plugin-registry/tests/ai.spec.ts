import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { digest, loadAiRecords, overlayAi, validateRecord } from '../src/ai.js'
import { publishRegistry } from '../src/publish.js'
import { buildRegistryDocuments } from '../src/protocol.js'
import { replaceRegistry } from '../src/filesystem.js'
import { detail, entry } from './fixtures/plugin.js'

const pythonFixture = JSON.parse(await readFile(new URL('./fixtures/ai-record.json', import.meta.url), 'utf8'))
const currentDetail = { ...detail, github: { ...detail.github, headSha: 'a'.repeat(40) } }

describe('AI public overlay', () => {
  it('validates the actual Python canonical hash and evidence', () => {
    expect(validateRecord(pythonFixture).inputHash).toBe(pythonFixture.inputHash)
    const broken = structuredClone(pythonFixture)
    broken.input.metadata.description = 'Tampered'
    expect(() => validateRecord(broken)).toThrow('checksum')
    const ungrounded = structuredClone(pythonFixture)
    ungrounded.output.evidence[0].quote = 'Fabricated evidence that was never part of the source text.'
    expect(() => validateRecord(ungrounded)).toThrow('grounded')
  })
  it('uses approved AI only when source and semantics still match', () => {
    const record = validateRecord(pythonFixture)
    expect(overlayAi(entry, currentDetail, record).entry.description).toBe(record.output.summary_zh)
    expect(overlayAi({ ...entry, stats: { ...entry.stats, stars: 999 } }, currentDetail, record).applied).toBe(true)
    expect(overlayAi({ ...entry, description: 'Changed purpose' }, currentDetail, record).applied).toBe(false)
    expect(overlayAi(entry, detail, record).applied).toBe(false)
    expect(overlayAi(entry, currentDetail).entry.description).toBe(entry.description)
  })
  it('does not change install facts and preserves original description', () => {
    const combined = overlayAi(entry, currentDetail, validateRecord(pythonFixture))
    expect(combined.entry.install).toEqual(entry.install)
    expect(combined.detail.install).toEqual(detail.install)
    expect(combined.entry.ai?.originalDescription).toBe(entry.description)
  })
  it('blocks a matching manual override from being silently replaced', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai-data-'))
    await mkdir(join(directory, 'records')); await mkdir(join(directory, 'overrides'))
    await writeFile(join(directory, 'records/123456789.json'), JSON.stringify(pythonFixture))
    await writeFile(join(directory, 'meta.json'), JSON.stringify({ schemaVersion: 1, revision: digest([pythonFixture]), recordCount: 1, records: [entry.id] }))
    await expect(loadAiRecords(directory)).resolves.toHaveProperty('size', 1)
    await writeFile(join(directory, 'overrides/123456789.json'), JSON.stringify({
      id: entry.id, inputHash: pythonFixture.inputHash, output: { ...pythonFixture.output, summary_zh: '手动校正的中文摘要，说明如何保存和检索跨会话知识。' },
      reason: 'Manual decision', at: '2026-11-09T00:00:00Z',
    }))
    await expect(loadAiRecords(directory)).rejects.toThrow('Manual override conflict')
  })
  it('publishes complete consistent snapshots and changes revision on AI-only changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-publish-')); const facts = join(root, 'facts'); const ai = join(root, 'ai'); const output = join(root, 'output')
    await replaceRegistry(facts, buildRegistryDocuments({ entries: [entry], details: [currentDetail], generatedAt: '2026-11-09T00:00:00Z' }))
    await mkdir(join(ai, 'records'), { recursive: true })
    const save = async (records: unknown[]) => {
      await writeFile(join(ai, 'meta.json'), JSON.stringify({ schemaVersion: 1, revision: digest(records), recordCount: records.length, records: records.length ? [entry.id] : [] }))
      if (records.length) await writeFile(join(ai, 'records/123456789.json'), JSON.stringify(records[0]))
    }
    await save([])
    const fallback = await publishRegistry({ facts, ai, output })
    await save([pythonFixture])
    const applied = await publishRegistry({ facts, ai, output })
    expect(applied).toMatchObject({ total: 1, aiApplied: 1, fallback: 0 })
    expect(applied.revision).not.toBe(fallback.revision)
    const index = JSON.parse(await readFile(join(output, 'index.json'), 'utf8'))
    const publishedDetail = JSON.parse(await readFile(join(output, 'plugins/123456789.json'), 'utf8'))
    expect(index.plugins[0].detailHash).toBe(digest(publishedDetail))
    expect(index.plugins[0].description).toBe(publishedDetail.presentation.description)
    expect((await publishRegistry({ facts, ai, output })).revision).toBe(applied.revision)
  })
})
