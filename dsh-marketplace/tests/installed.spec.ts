import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { InstalledService } from '../src/manager/installed.js'
import type { RegistryService } from '../src/registry/service.js'

async function installFixture(profile: string, name: string, manifest: object): Promise<void> {
  const directory = join(profile, 'node_modules', name)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'package.json'), JSON.stringify(manifest))
}

describe('InstalledService', () => {
  it('lists registry and non-registry bundles while excluding plain dependencies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-installed-'))
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({
      dependencies: {
        'dsh-known': '1.0.0',
        'dsh-private': 'github:owner/private#abc',
        library: '1.0.0',
      },
    }))
    await installFixture(profile, 'dsh-known', {
      name: 'dsh-known', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await installFixture(profile, 'dsh-private', {
      name: 'dsh-private', version: '2.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await installFixture(profile, 'library', { name: 'library', version: '1.0.0' })
    const registry = {
      getCatalog: async () => ({
        registry: { revision: 'x', generatedAt: 'x', pluginCount: 1, stale: false },
        plugins: [{ id: 'gh:1', slug: 'owner/known', install: { packageName: 'dsh-known', version: '1.1.0' } }],
      }),
    } as unknown as RegistryService
    const state = await new InstalledService({ name: 'web', directory: profile }, registry).list()
    expect(state.plugins.map(plugin => plugin.packageName)).toEqual(['dsh-known', 'dsh-private'])
    expect(state.plugins[0]).toMatchObject({ registryId: 'gh:1', update: { available: true, latestVersion: '1.1.0' } })
    expect(state.plugins[1]).toMatchObject({ registryId: null, update: { available: false, latestVersion: null } })
  })

  it('does not infer a GitHub commit update from Registry timestamps or versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-installed-'))
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-known': 'github:owner/known#abc' } }))
    await installFixture(profile, 'dsh-known', {
      name: 'dsh-known', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    const registry = {
      getCatalog: async () => ({
        registry: { revision: 'x', generatedAt: 'x', pluginCount: 1, stale: false },
        plugins: [{ id: 'gh:1', slug: 'owner/known', install: { packageName: 'dsh-known', version: '2.0.0' } }],
      }),
    } as unknown as RegistryService
    const state = await new InstalledService({ name: 'web', directory: profile }, registry).list()
    expect(state.plugins[0]?.update).toEqual({ available: false, latestVersion: null })
  })

  it('recognizes the renamed publication package as Marketplace itself', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-installed-'))
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'untr-dsh-marketplace': '0.1.0' } }))
    await installFixture(profile, 'untr-dsh-marketplace', {
      name: 'untr-dsh-marketplace', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    const registry = {
      getCatalog: async () => ({
        registry: { revision: 'x', generatedAt: 'x', pluginCount: 0, stale: false },
        plugins: [],
      }),
    } as unknown as RegistryService
    const state = await new InstalledService({ name: 'web', directory: profile }, registry).list()
    expect(state.plugins[0]).toMatchObject({ packageName: 'untr-dsh-marketplace', self: true })
  })
})
