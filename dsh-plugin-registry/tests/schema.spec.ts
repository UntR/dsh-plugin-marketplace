import { describe, expect, it } from 'vitest'
import {
  registryIndexEntrySchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from '../src/schema.js'
import { detail, entry } from './fixtures/plugin.js'

describe('Registry Schema v1', () => {
  it('accepts valid index and detail records', () => {
    expect(registryIndexEntrySchema.parse(entry)).toEqual(entry)
    expect(registryPluginDetailSchema.parse(detail)).toEqual(detail)
  })

  it('rejects unsupported schema versions and malformed stable ids', () => {
    expect(() => registryMetaSchema.parse({
      schemaVersion: 2,
      registryVersion: '1',
      topic: 'dsh-plugin',
      revision: `sha256:${'0'.repeat(64)}`,
      generatedAt: '2026-08-14T06:30:00.000Z',
      pluginCount: 0,
      indexPath: './index.json',
    })).toThrow()
    expect(() => registryIndexEntrySchema.parse({ ...entry, id: 'owner/repo' })).toThrow()
  })

  it('ignores additive fields without changing known data', () => {
    const parsed = registryIndexEntrySchema.parse({ ...entry, futureField: true })
    expect(parsed.futureField).toBe(true)
  })
})
