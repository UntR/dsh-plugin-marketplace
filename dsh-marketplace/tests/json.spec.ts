import { gunzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { sendCatalog } from '../src/http/json.js'

function response() {
  return { writeHead: vi.fn(), end: vi.fn() }
}

describe('catalog HTTP response', () => {
  it('compresses large catalogs and emits a revalidation ETag', () => {
    const target = response()
    const catalog = {
      registry: {
        revision: `sha256:${'a'.repeat(64)}`,
        generatedAt: '2026-08-24T00:00:00.000Z',
        pluginCount: 1,
        stale: false,
      },
      plugins: [{ description: 'x'.repeat(2_000) }],
    }

    sendCatalog({ headers: { 'accept-encoding': 'br, gzip' } }, target as never, catalog as never)

    expect(target.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'cache-control': 'private, max-age=0, must-revalidate',
      'content-encoding': 'gzip',
      etag: `W/"${catalog.registry.revision}-fresh"`,
      vary: 'accept-encoding',
    }))
    const output = target.end.mock.calls[0]?.[0] as Buffer
    expect(JSON.parse(gunzipSync(output).toString('utf8'))).toEqual(catalog)
  })

  it('returns 304 when the catalog ETag is unchanged', () => {
    const target = response()
    const revision = `sha256:${'b'.repeat(64)}`
    sendCatalog({ headers: { 'if-none-match': `W/"${revision}-stale"` } }, target as never, {
      registry: { revision, generatedAt: '2026-08-24T00:00:00.000Z', pluginCount: 0, stale: true },
      plugins: [],
    })

    expect(target.writeHead).toHaveBeenCalledWith(304, expect.objectContaining({
      etag: `W/"${revision}-stale"`,
    }))
    expect(target.end).toHaveBeenCalledWith()
  })

  it('does not gzip a response when the client rejects gzip', () => {
    const target = response()
    sendCatalog({ headers: { 'accept-encoding': 'gzip;q=0, identity' } }, target as never, {
      registry: {
        revision: `sha256:${'c'.repeat(64)}`,
        generatedAt: '2026-08-24T00:00:00.000Z',
        pluginCount: 1,
        stale: false,
      },
      plugins: [{ description: 'x'.repeat(2_000) }],
    } as never)

    expect(target.writeHead).toHaveBeenCalledWith(200, expect.not.objectContaining({
      'content-encoding': 'gzip',
    }))
  })
})
