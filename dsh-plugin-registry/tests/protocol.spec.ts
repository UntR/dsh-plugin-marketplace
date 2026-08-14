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

  it('changes revision when a detail-only fact changes', () => {
    const first = buildRegistryDocuments({
      entries: [entry],
      details: [detail],
      generatedAt: '2026-08-14T06:30:00.000Z',
    })
    const second = buildRegistryDocuments({
      entries: [entry],
      details: [{ ...detail, readme: { ...detail.readme, excerpt: 'Changed excerpt.' } }],
      generatedAt: '2026-08-14T08:30:00.000Z',
      previousMeta: first.meta,
    })
    expect(second.meta.revision).not.toBe(first.meta.revision)
    expect(second.meta.generatedAt).toBe('2026-08-14T08:30:00.000Z')
  })

  it('rejects inconsistent stable identities and detail paths', () => {
    expect(() => buildRegistryDocuments({
      entries: [{ ...entry, id: 'gh:987' }],
      details: [{ ...detail, id: 'gh:987' }],
      generatedAt: '2026-08-14T06:30:00.000Z',
    })).toThrow('stable id mismatch')
    expect(() => buildRegistryDocuments({
      entries: [{ ...entry, detailPath: './plugins/987.json' }],
      details: [detail],
      generatedAt: '2026-08-14T06:30:00.000Z',
    })).toThrow('detail path mismatch')
  })
})
