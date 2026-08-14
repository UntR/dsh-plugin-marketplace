import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  registryIndexSchema,
  registryMetaSchema,
  registryPluginDetailSchema,
} from './schema.js'
import type { RegistryDocuments } from './protocol.js'
import type { RegistryMeta, RegistryPluginDetail } from './types.js'

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function loadRegistry(directory: string): Promise<{
  meta?: RegistryMeta
  details: ReadonlyMap<string, RegistryPluginDetail>
}> {
  const [metaRaw, indexRaw] = await Promise.all([
    readOptional(join(directory, 'meta.json')),
    readOptional(join(directory, 'index.json')),
  ])
  if (metaRaw === null && indexRaw === null) return { details: new Map() }
  if (metaRaw === null || indexRaw === null) throw new Error('Existing Registry is incomplete.')
  const meta = registryMetaSchema.parse(JSON.parse(metaRaw))
  const index = registryIndexSchema.parse(JSON.parse(indexRaw))
  if (meta.revision !== index.revision || meta.pluginCount !== index.plugins.length) {
    throw new Error('Existing Registry metadata and index are inconsistent.')
  }
  const details = new Map<string, RegistryPluginDetail>()
  for (const entry of index.plugins) {
    const path = resolve(directory, entry.detailPath)
    if (!path.startsWith(`${resolve(directory)}${process.platform === 'win32' ? '\\' : '/'}`)) {
      throw new Error(`Detail path escapes Registry: ${entry.detailPath}`)
    }
    const raw = await readFile(path, 'utf8')
    const detail = registryPluginDetailSchema.parse(JSON.parse(raw))
    if (detail.id !== entry.id) throw new Error(`Detail id mismatch for ${entry.id}.`)
    details.set(detail.id, detail)
  }
  return { meta, details }
}

export async function replaceRegistry(directory: string, documents: RegistryDocuments): Promise<boolean> {
  const existingRaw = await readOptional(join(directory, 'meta.json'))
  if (existingRaw !== null) {
    const existing = registryMetaSchema.parse(JSON.parse(existingRaw))
    if (existing.revision === documents.meta.revision) return false
  }
  const parent = dirname(directory)
  await mkdir(parent, { recursive: true })
  const staging = await mkdtemp(join(parent, '.registry-v1-'))
  const backup = `${directory}.backup-${process.pid}`
  try {
    await mkdir(join(staging, 'plugins'))
    await Promise.all([
      writeFile(join(staging, 'meta.json'), documents.bytes.meta, 'utf8'),
      writeFile(join(staging, 'index.json'), documents.bytes.index, 'utf8'),
      ...[...documents.bytes.details].map(([id, bytes]) => {
        const databaseId = id.slice('gh:'.length)
        return writeFile(join(staging, 'plugins', `${databaseId}.json`), bytes, 'utf8')
      }),
    ])
    let hadExisting = false
    try {
      await rename(directory, backup)
      hadExisting = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await rename(staging, directory)
    } catch (error) {
      if (hadExisting) await rename(backup, directory)
      throw error
    }
    if (hadExisting) await rm(backup, { recursive: true })
    return true
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

