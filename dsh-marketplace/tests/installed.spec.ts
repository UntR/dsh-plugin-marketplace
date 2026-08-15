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
      name: 'dsh-known', version: '1.0.0', description: 'Known plugin',
      repository: 'https://github.com/owner/known.git',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await installFixture(profile, 'dsh-private', {
      name: 'dsh-private', version: '2.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    await installFixture(profile, 'library', { name: 'library', version: '1.0.0' })
    const registry = {
      getCatalog: async () => ({
        registry: { revision: 'x', generatedAt: 'x', pluginCount: 1, stale: false },
        plugins: [{
          id: 'gh:1', slug: 'owner/known', name: 'Known', description: 'Registry description',
          coverUrl: 'https://example.com/cover.png', repositoryUrl: 'https://github.com/owner/known',
          owner: { login: 'owner', avatarUrl: 'https://example.com/avatar.png' },
          install: { packageName: 'dsh-known', version: '1.1.0' },
        }],
      }),
    } as unknown as RegistryService
    const state = await new InstalledService({ name: 'web', directory: profile }, registry).list()
    expect(state.plugins.map(plugin => plugin.packageName)).toEqual(['dsh-known', 'dsh-private'])
    expect(state.plugins[0]).toMatchObject({
      registryId: 'gh:1',
      source: { kind: 'npm' },
      display: {
        name: 'Known', description: 'Registry description', owner: 'owner',
        coverUrl: 'https://example.com/cover.png', repositoryUrl: 'https://github.com/owner/known',
      },
      update: { status: 'available', available: true, latestVersion: '1.1.0', canUpdate: true },
    })
    expect(state.plugins[1]).toMatchObject({
      registryId: null,
      source: { kind: 'github' },
      display: { name: 'dsh-private' },
      update: { status: 'source', available: false, latestVersion: null, canUpdate: true },
    })
  })

  it('checks npm for an unmatched public package instead of treating Registry membership as update status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-installed-'))
    const profile = join(root, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    await writeFile(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'dsh-public': '1.0.0' } }))
    await installFixture(profile, 'dsh-public', {
      name: 'dsh-public', version: '1.0.0', description: 'Public plugin',
      repository: { url: 'git+https://github.com/owner/public.git' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    })
    const registry = {
      getCatalog: async () => ({ registry: { revision: 'x' }, plugins: [] }),
    } as unknown as RegistryService
    const fetch = async (input: string | URL | Request) => {
      expect(String(input)).toBe('https://registry.npmjs.org/dsh-public/latest')
      return new Response(JSON.stringify({ version: '1.2.0' }), { status: 200 })
    }

    const state = await new InstalledService({ name: 'web', directory: profile }, registry, { fetch }).list()

    expect(state.plugins[0]).toMatchObject({
      registryId: null,
      source: { kind: 'npm' },
      display: { description: 'Public plugin', repositoryUrl: 'https://github.com/owner/public' },
      update: { status: 'available', available: true, latestVersion: '1.2.0', canUpdate: true },
    })
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
        plugins: [{
          id: 'gh:1', slug: 'owner/known', name: 'dsh-known', description: '', coverUrl: null,
          repositoryUrl: 'https://github.com/owner/known',
          owner: { login: 'owner', avatarUrl: 'https://example.com/avatar.png' },
          install: { packageName: 'dsh-known', version: '2.0.0' },
        }],
      }),
    } as unknown as RegistryService
    const state = await new InstalledService({ name: 'web', directory: profile }, registry).list()
    expect(state.plugins[0]?.update).toEqual({
      status: 'source', available: false, latestVersion: null, canUpdate: true,
    })
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
