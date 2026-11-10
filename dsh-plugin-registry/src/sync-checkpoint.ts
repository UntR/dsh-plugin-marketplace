import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { registryPluginDetailSchema } from './schema.js'
import type { RegistryPluginDetail } from './types.js'

export async function loadCheckpoints(directory: string): Promise<Map<string, RegistryPluginDetail>> {
  await mkdir(directory, { recursive: true })
  const result = new Map<string, RegistryPluginDetail>()
  for (const name of await readdir(directory)) {
    if (!/^[0-9]+\.json$/.test(name)) continue
    const raw = JSON.parse(await readFile(join(directory, name), 'utf8')) as { version: number; detail: unknown }
    if (raw.version !== 1) throw new Error('Unsupported sync checkpoint version')
    const detail = registryPluginDetailSchema.parse(raw.detail)
    if (detail.id !== `gh:${name.slice(0, -5)}` || detail.crawl.enrichmentStatus !== 'ok') {
      throw new Error('Invalid sync checkpoint identity or status')
    }
    result.set(detail.id, detail)
  }
  return result
}

export async function saveCheckpoint(directory: string, detail: RegistryPluginDetail): Promise<void> {
  if (!/^gh:[0-9]+$/.test(detail.id)) throw new Error('Invalid checkpoint identity')
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${detail.id.slice(3)}.json`)
  await writeFile(`${path}.tmp`, JSON.stringify({ version: 1, detail }) + '\n')
  await rename(`${path}.tmp`, path)
}

export async function clearCheckpoints(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true })
}
