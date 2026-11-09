import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RegistryService } from '../src/registry/service.js'
import { filterCatalog } from '../src/client/catalog.js'
import { digest, overlayAi, validateRecord } from '../../dsh-plugin-registry/src/ai.js'
import { detail, entry } from '../../dsh-plugin-registry/tests/fixtures/plugin.js'
import { readFile } from 'node:fs/promises'

const record = validateRecord(JSON.parse(await readFile(new URL('../../dsh-plugin-registry/tests/fixtures/ai-record.json', import.meta.url), 'utf8')))
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })

describe('AI catalog refresh', () => {
  it('searches approved tags without changing star ranking', () => {
    const combined = overlayAi(entry, { ...detail, github: { ...detail.github, headSha: 'a'.repeat(40) } }, record)
    expect(filterCatalog([combined.entry], '检索')).toHaveLength(1)
    expect(combined.entry.stats.stars).toBe(entry.stats.stars)
  })
  it('does not reuse old details after revision change, and refuses mixed CDN snapshots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ai-cache-'))
    let currentDetail = detail; let servedDetail = detail; let version = 'a'
    const service = new RegistryService({ baseUrl: 'https://registry.example/v1', cacheDir: join(root, 'cache'), fetch: async url => {
      if (String(url).endsWith('meta.json')) return json({ schemaVersion: 1, registryVersion: '1', topic: 'dsh-plugin', revision: `sha256:${version.repeat(64)}`, generatedAt: '2026-11-09T00:00:00Z', pluginCount: 1, indexPath: './index.json' })
      if (String(url).endsWith('index.json')) return json({ schemaVersion: 1, revision: `sha256:${version.repeat(64)}`, plugins: [{ ...entry, detailHash: digest(currentDetail) }] })
      return json(servedDetail)
    } })
    await expect(service.getPlugin(entry.id)).resolves.toMatchObject({ readme: detail.readme })
    currentDetail = { ...detail, readme: { ...detail.readme, excerpt: 'Changed source and summary conditions.' } }; version = 'b'
    await service.getCatalog(true)
    await expect(service.getPlugin(entry.id)).rejects.toMatchObject({ code: 'registry-invalid' })
    servedDetail = currentDetail
    await expect(service.getPlugin(entry.id)).resolves.toMatchObject({ readme: currentDetail.readme })
  })
})
