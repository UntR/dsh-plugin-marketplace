import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { installRequestSchema, readJsonBody, verifySameOrigin } from '../src/http/security.js'

describe('mutation HTTP security', () => {
  it('rejects cross-origin requests', () => {
    expect(() => verifySameOrigin({ headers: { host: '127.0.0.1:3080', origin: 'https://evil.example' } }))
      .toThrow('Cross-origin')
    expect(() => verifySameOrigin({ headers: { host: '127.0.0.1:3080', origin: 'http://127.0.0.1:3080' } }))
      .not.toThrow()
  })

  it('strictly rejects raw command and install spec fields', () => {
    expect(installRequestSchema.safeParse({
      pluginId: 'gh:123',
      allowBuildScripts: false,
      installSpec: 'evil',
    }).success).toBe(false)
    expect(installRequestSchema.safeParse({
      pluginId: 'gh:123; rm -rf /',
      allowBuildScripts: false,
    }).success).toBe(false)
  })

  it('requires JSON and enforces the body limit', async () => {
    const valid = Readable.from(['{"pluginId":"gh:1"}']) as unknown as Parameters<typeof readJsonBody>[0]
    valid.headers = { 'content-type': 'application/json' }
    await expect(readJsonBody(valid)).resolves.toEqual({ pluginId: 'gh:1' })
    const large = Readable.from(['x'.repeat(64 * 1_024 + 1)]) as unknown as Parameters<typeof readJsonBody>[0]
    large.headers = { 'content-type': 'application/json' }
    await expect(readJsonBody(large)).rejects.toMatchObject({ status: 413 })
  })
})

