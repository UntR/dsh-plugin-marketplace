import { describe, expect, it } from 'vitest'
import { buildRegistryDocuments } from '../src/protocol.js'
import { detail, entry } from './fixtures/plugin.js'

describe('Registry protocol builder', () => {
  it('produces byte-identical documents and preserves generatedAt on a no-op', () => {
    const first = buildRegistryDocuments({
      entries: [entry],
      details: [detail],
      generatedAt: '2026-08-14T06:30:00.000Z',
    })
    const second = buildRegistryDocuments({
      entries: [entry],
      details: [detail],
      generatedAt: '2026-08-14T08:30:00.000Z',
      previousMeta: first.meta,
    })
    expect(second.meta.generatedAt).toBe(first.meta.generatedAt)
    expect(second.meta.revision).toBe(first.meta.revision)
    expect(second.bytes).toEqual(first.bytes)
  })

  it('checks index and detail integrity', () => {
    expect(() => buildRegistryDocuments({
      entries: [entry],
      details: [],
      generatedAt: '2026-08-14T06:30:00.000Z',
    })).toThrow('1 index entries but 0 detail files')
  })
})
