import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CACHE_TTL_MS, FETCH_TIMEOUT_MS } from '../shared/constants.js'
import { MarketplaceError } from '../shared/errors.js'
import { silentLogger, type MarketplaceLogger } from '../shared/logging.js'
import { classifyPluginCategory, type PluginCategory } from '../shared/category.js'
import {
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
  type RegistryIndex,
  type RegistryIndexEntry,
  type RegistryMeta,
  type RegistryPluginDetail,
} from '../shared/schema.js'

interface Snapshot {
  meta: RegistryMeta
  index: RegistryIndex
}

export interface Catalog {
  registry: {
    revision: string
    generatedAt: string
    pluginCount: number
    stale: boolean
  }
  plugins: Array<RegistryIndexEntry & { category: PluginCategory }>
}

export interface RegistryServiceOptions {
  baseUrl: string
  cacheDir: string
  fetch?: typeof globalThis.fetch
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  logger?: MarketplaceLogger
}

async function readSnapshot(cacheDir: string): Promise<Snapshot | null> {
  try {
    const [metaRaw, indexRaw] = await Promise.all([
      readFile(join(cacheDir, 'meta.json'), 'utf8'),
      readFile(join(cacheDir, 'index.json'), 'utf8'),
    ])
    const meta = registryMetaSchema.parse(JSON.parse(metaRaw))
    const index = registryIndexSchema.parse(JSON.parse(indexRaw))
    if (meta.revision !== index.revision || meta.pluginCount !== index.plugins.length) return null
    return { meta, index }
  } catch {
    return null
  }
}

async function replaceSnapshot(cacheDir: string, snapshot: Snapshot): Promise<void> {
  const parent = dirname(cacheDir)
  await mkdir(parent, { recursive: true })
  const staging = await mkdtemp(join(parent, '.marketplace-cache-'))
  const backup = `${cacheDir}.backup-${process.pid}`
  try {
    await writeFile(join(staging, 'meta.json'), `${JSON.stringify(snapshot.meta, undefined, 2)}\n`, 'utf8')
    await writeFile(join(staging, 'index.json'), `${JSON.stringify(snapshot.index, undefined, 2)}\n`, 'utf8')
    let hadExisting = false
    try {
      await rename(cacheDir, backup)
      hadExisting = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await rename(staging, cacheDir)
    } catch (error) {
      if (hadExisting) await rename(backup, cacheDir)
      throw error
    }
    if (hadExisting) await rm(backup, { recursive: true })
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export class RegistryService {
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly now: () => number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly logger: MarketplaceLogger
  private memory: Snapshot | null = null
  private memoryStale = false
  private expiresAt = 0

  constructor(private readonly options: RegistryServiceOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.now = options.now ?? Date.now
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
    this.logger = options.logger ?? silentLogger
  }

  private async fetchJson(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.options.baseUrl}/${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Registry request failed with ${response.status}.`)
    return response.json()
  }

  private catalog(snapshot: Snapshot, stale: boolean): Catalog {
    return {
      registry: {
        revision: snapshot.meta.revision,
        generatedAt: snapshot.meta.generatedAt,
        pluginCount: snapshot.meta.pluginCount,
        stale,
      },
      plugins: snapshot.index.plugins.map(plugin => ({
        ...plugin,
        category: plugin.category ?? classifyPluginCategory(plugin),
      })),
    }
  }

  async getCatalog(refresh = false): Promise<Catalog> {
    if (!refresh && this.memory !== null && this.now() < this.expiresAt) {
      return this.catalog(this.memory, this.memoryStale)
    }
    const local = this.memory ?? await readSnapshot(this.options.cacheDir)
    this.logger.info('Refreshing plugin registry metadata.')
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const metaValue = await this.fetchJson('meta.json')
        if (typeof metaValue === 'object' && metaValue !== null
          && typeof (metaValue as Record<string, unknown>).schemaVersion === 'number'
          && (metaValue as Record<string, unknown>).schemaVersion as number > 1) {
          throw new MarketplaceError(
            'registry-version-unsupported',
            'Plugin registry schema version is not supported.',
            502,
          )
        }
        const metaResult = registryMetaSchema.safeParse(metaValue)
        if (!metaResult.success) throw new MarketplaceError('registry-invalid', 'Plugin registry metadata is invalid.', 502)
        if (local?.meta.revision === metaResult.data.revision) {
          this.memory = local
          this.memoryStale = false
          this.expiresAt = this.now() + CACHE_TTL_MS
          return this.catalog(local, false)
        }
        const indexResult = registryIndexSchema.safeParse(await this.fetchJson('index.json'))
        if (!indexResult.success) throw new MarketplaceError('registry-invalid', 'Plugin registry index is invalid.', 502)
        if (indexResult.data.revision !== metaResult.data.revision
          || indexResult.data.plugins.length !== metaResult.data.pluginCount) {
          if (attempt === 0) {
            await this.sleep(100)
            continue
          }
          throw new MarketplaceError('registry-invalid', 'Plugin registry revision is inconsistent.', 502)
        }
        const snapshot = { meta: metaResult.data, index: indexResult.data }
        await replaceSnapshot(this.options.cacheDir, snapshot)
        this.logger.info(
          'Plugin registry revision changed from %s to %s.',
          local?.meta.revision ?? 'none',
          snapshot.meta.revision,
        )
        this.memory = snapshot
        this.memoryStale = false
        this.expiresAt = this.now() + CACHE_TTL_MS
        return this.catalog(snapshot, false)
      }
      throw new MarketplaceError('registry-invalid', 'Plugin registry revision is inconsistent.', 502)
    } catch (error) {
      if (local !== null) {
        this.logger.warn(
          'Plugin registry refresh failed; using the last-good cache (%s).',
          error instanceof MarketplaceError ? error.code : 'registry-unavailable',
        )
        this.memory = local
        this.memoryStale = true
        this.expiresAt = this.now() + CACHE_TTL_MS
        return this.catalog(local, true)
      }
      if (error instanceof MarketplaceError) throw error
      throw new MarketplaceError('registry-unavailable', 'Plugin registry is currently unavailable.', 502)
    }
  }

  async getPlugin(id: string): Promise<RegistryPluginDetail> {
    if (!/^gh:[0-9]+$/.test(id)) {
      throw new MarketplaceError('invalid-plugin-id', 'Plugin id is invalid.', 400)
    }
    const catalog = await this.getCatalog()
    const entry = catalog.plugins.find(plugin => plugin.id === id)
    if (entry === undefined) throw new MarketplaceError('plugin-not-found', 'Plugin was not found.', 404)
    const cachedPath = join(this.options.cacheDir, entry.detailPath.replace(/^\.\//, ''))
    try {
      const cached = registryPluginDetailSchema.parse(JSON.parse(await readFile(cachedPath, 'utf8')))
      if (cached.id === id) return cached
    } catch {
      // A missing or invalid detail cache is fetched again below.
    }
    const detailResult = registryPluginDetailSchema.safeParse(await this.fetchJson(entry.detailPath.replace(/^\.\//, '')))
    if (!detailResult.success || detailResult.data.id !== id) {
      throw new MarketplaceError('registry-invalid', 'Plugin registry detail is invalid.', 502)
    }
    await mkdir(dirname(cachedPath), { recursive: true })
    const temporary = `${cachedPath}.tmp-${process.pid}`
    await writeFile(temporary, `${JSON.stringify(detailResult.data, undefined, 2)}\n`, 'utf8')
    await rename(temporary, cachedPath)
    return detailResult.data
  }
}
