import { mkdtemp, readFile, readdir } from 'node:fs/promises'
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
const plugin = {
  id: 'gh:1', githubDatabaseId: 1, githubNodeId: 'R_1', slug: 'owner/plugin', name: 'plugin',
  owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner.png' },
  repositoryUrl: 'https://github.com/owner/plugin', homepageUrl: null, description: '', coverUrl: null,
  topics: ['dsh-plugin'], language: null, license: null, stats: { stars: 0, forks: 0 },
  state: { archived: false, fork: false },
  timestamps: {
    createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', pushedAt: null,
  },
  install: { available: false, packageName: null, version: null, requiresBuildApproval: false },
  detailPath: './plugins/1.json',
}

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

  it('coalesces concurrent cold refreshes into one atomic cache update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    const fetch = vi.fn(async (url: string | URL | Request) => {
      await gate
      return String(url).endsWith('meta.json') ? json(meta) : json(index)
    })
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch,
    })

    const first = service.getCatalog(true)
    const second = service.getCatalog(true)
    release?.()

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ registry: expect.objectContaining({ revision }) }),
      expect.objectContaining({ registry: expect.objectContaining({ revision }) }),
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(await readdir(root)).toEqual(['v1'])
  })

  it('revalidates after TTL expiry and manual refresh without replacing an unchanged revision', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const fetch = vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json') ? json(meta) : json(index))
    let now = 0
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch,
      now: () => now,
    })
    await service.getCatalog()
    now = 15 * 60 * 1_000 + 1
    await service.getCatalog()
    await service.getCatalog(true)
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'https://registry.example/v1/meta.json',
      'https://registry.example/v1/index.json',
      'https://registry.example/v1/meta.json',
      'https://registry.example/v1/meta.json',
    ])
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
    const logger = { info: vi.fn(), warn: vi.fn() }
    const offline = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir,
      fetch: vi.fn(async () => { throw new Error('offline') }),
      logger,
    })
    await expect(offline.getCatalog(true)).resolves.toMatchObject({ registry: { stale: true } })
    await expect(offline.getCatalog()).resolves.toMatchObject({ registry: { stale: true } })
    expect(JSON.parse(await readFile(join(cacheDir, 'meta.json'), 'utf8'))).toMatchObject({ revision })
    expect(logger.warn).toHaveBeenCalledWith(
      'Plugin registry refresh failed; using the last-good cache (%s).',
      'registry-unavailable',
    )
  })

  it('keeps last-good disk data when remote metadata is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const cacheDir = join(root, 'v1')
    await new RegistryService({
      baseUrl: 'https://registry.example/v1', cacheDir,
      fetch: vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json') ? json(meta) : json(index)),
    }).getCatalog()
    const invalid = new RegistryService({
      baseUrl: 'https://registry.example/v1', cacheDir,
      fetch: vi.fn(async () => json({ ...meta, pluginCount: -1 })),
    })
    await expect(invalid.getCatalog(true)).resolves.toMatchObject({ registry: { revision, stale: true } })
    expect(JSON.parse(await readFile(join(cacheDir, 'meta.json'), 'utf8'))).toEqual(meta)
  })

  it('rejects an invalid lazy detail without writing it into cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const cacheDir = join(root, 'v1')
    const metaWithPlugin = { ...meta, pluginCount: 1 }
    const indexWithPlugin = { ...index, plugins: [plugin] }
    const fetch = vi.fn(async (url: string | URL | Request) => {
      const path = String(url)
      if (path.endsWith('meta.json')) return json(metaWithPlugin)
      if (path.endsWith('index.json')) return json(indexWithPlugin)
      return json({ schemaVersion: 1, id: 'gh:1' })
    })
    const service = new RegistryService({ baseUrl: 'https://registry.example/v1', cacheDir, fetch })
    await service.getCatalog()
    await expect(service.getPlugin('gh:1')).rejects.toMatchObject({ code: 'registry-invalid' })
    await expect(readFile(join(cacheDir, 'plugins', '1.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('adds a deterministic category when a v1 Registry index does not provide one', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const metaWithPlugin = { ...meta, pluginCount: 1 }
    const memoryPlugin = { ...plugin, name: 'memory', slug: 'owner/memory', description: 'Session memory' }
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch: vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json')
        ? json(metaWithPlugin)
        : json({ ...index, plugins: [memoryPlugin] })),
    })
    await expect(service.getCatalog()).resolves.toMatchObject({
      plugins: [expect.objectContaining({ category: 'knowledge-memory' })],
    })
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

  it('rejects an invalid index when there is no last-good cache', async () => {
    const root = await mkdtemp(join(tmpdir(), 'marketplace-cache-'))
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'missing'),
      fetch: vi.fn(async (url: string | URL | Request) => String(url).endsWith('meta.json')
        ? json(meta)
        : json({ ...index, plugins: 'invalid' })),
    })
    await expect(service.getCatalog()).rejects.toMatchObject({ code: 'registry-invalid' })
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
    const logger = { info: vi.fn(), warn: vi.fn() }
    const service = new RegistryService({
      baseUrl: 'https://registry.example/v1',
      cacheDir: join(root, 'v1'),
      fetch,
      sleep,
      logger,
    })
    await expect(service.getCatalog()).resolves.toMatchObject({ registry: { revision: nextRevision } })
    expect(sleep).toHaveBeenCalledWith(100)
    expect(logger.info).toHaveBeenCalledWith(
      'Plugin registry revision changed from %s to %s.',
      'none',
      nextRevision,
    )
    expect(await readdir(root)).toEqual(['v1'])
    expect(JSON.parse(await readFile(join(root, 'v1', 'index.json'), 'utf8'))).toMatchObject({ revision: nextRevision })
  })
})
