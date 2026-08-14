import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { RegistryService } from '../src/registry/service.js'

const revision = `sha256:${'a'.repeat(64)}`
const meta = {
  schemaVersion: 1,
  registryVersion: '1',
  topic: 'dsh-plugin',
  revision,
  generatedAt: '2026-08-14T06:30:00.000Z',
  pluginCount: 0,
  indexPath: './index.json',
}
const index = { schemaVersion: 1, revision, plugins: [] }

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('RegistryService', () => {
  it('downloads once and serves a memory cache within the TTL', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const fetch = vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json') ? json(meta) : json(index))
    let now = 0
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch,
      now: () => now,
    })
    await expect(service.getCatalog()).resolves.toMatchObject({ registry: { stale: false, pluginCount: 0 } })
    now += 1_000
    await service.getCatalog()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('uses last-good disk data when refresh fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const cacheDir = join(root, 'v1')
    const first = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir,
      fetch: vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json') ? json(meta) : json(index)),
    })
    await first.getCatalog()
    const offline = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir,
      fetch: vi.fn(async () => { throw new Error('offline') }),
    })
    await expect(offline.getCatalog(true)).resolves.toMatchObject({ registry: { stale: true } })
    await expect(offline.getCatalog()).resolves.toMatchObject({ registry: { stale: true } })
    expect(JSON.parse(await readFile(join(cacheDir, 'meta.json'), 'utf8'))).toMatchObject({ revision })
  })

  it('reports an unsupported future schema distinctly', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'missing'),
      fetch: vi.fn(async () => json({ ...meta, schemaVersion: 2 })),
    })
    await expect(service.getCatalog()).rejects.toMatchObject({ code: 'registry-version-unsupported' })
  })

  it('returns registry-unavailable when remote and disk are absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'missing'),
      fetch: vi.fn(async () => { throw new Error('offline') }),
    })
    await expect(service.getCatalog()).rejects.toMatchObject({ code: 'registry-unavailable', status: 502 })
  })

  it('retries one inconsistent revision before replacing cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const nextRevision = `sha256:${'b'.repeat(64)}`
    const responses = [
      json({ ...meta, revision: nextRevision }),
      json(index),
      json({ ...meta, revision: nextRevision }),
      json({ ...index, revision: nextRevision }),
    ]
    const fetch = vi.fn(async () => responses.shift() ?? json(index))
    const sleep = vi.fn(async () => {})
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch,
      sleep,
    })
    await expect(service.getCatalog()).resolves.toMatchObject({ registry: { revision: nextRevision } })
    expect(sleep).toHaveBeenCalledWith(100)
  })
})
