// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceTab } from '../src/client/MarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCordisPluginOutline14: () => <span data-testid="plugin-icon" />,
  IconRefreshOutline16: () => <span data-testid="refresh-icon" />,
  IconSearchOutline16: () => <span data-testid="search-icon" />,
}))

const t = (key: LocaleKey) => en[key]
const catalog = {
  registry: {
    revision: `sha256:${'a'.repeat(64)}`,
    generatedAt: '2026-08-14T06:30:00.000Z',
    pluginCount: 1,
    stale: false,
  },
  plugins: [{
    id: 'gh:1', githubDatabaseId: 1, githubNodeId: 'R_1', slug: 'owner/memory', name: 'memory',
    owner: { login: 'owner', avatarUrl: 'https://avatars.example/owner.png' },
    repositoryUrl: 'https://github.com/owner/memory', homepageUrl: 'https://memory.example/',
    description: 'Session memory', coverUrl: 'https://images.example/memory.png', topics: ['dsh-plugin'], language: 'TypeScript', license: 'MIT',
    stats: { stars: 10, forks: 1 }, state: { archived: true, fork: false },
    timestamps: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', pushedAt: null },
    install: { available: false, packageName: null, version: null, requiresBuildApproval: false },
    detailPath: './plugins/1.json',
  }],
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('MarketplaceTab', () => {
  it('loads, searches and opens an accessible detail dialog', async () => {
    const detail = {
      schemaVersion: 1,
      id: 'gh:1',
      github: {
        databaseId: 1, nodeId: 'R_1', slug: 'owner/memory', url: 'https://github.com/owner/memory',
        defaultBranch: 'main', headSha: 'a'.repeat(40), owner: catalog.plugins[0]?.owner,
        description: 'Session memory', homepageUrl: null, topics: ['dsh-plugin'], stars: 10, forks: 1,
        archived: true, fork: false, language: 'TypeScript', license: { spdxId: 'MIT', name: 'MIT License' },
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', pushedAt: null,
        openGraphImageUrl: null,
      },
      presentation: { description: 'Session memory', coverUrl: null },
      readme: { available: true, excerpt: 'README excerpt' },
      package: null,
      bundle: { detected: false, patch: null, patchExists: null },
      scripts: { prepare: false, preinstall: false, install: false, postinstall: false },
      npm: { published: false, latestVersion: null, repositoryMatches: null },
      install: { available: false, preferred: null, spec: null, packageName: null, version: null, requiresBuildApproval: false, reason: 'Unavailable' },
      crawl: { headSha: 'a'.repeat(40), enrichmentStatus: 'ok', enrichedAt: '2026-08-14T06:30:00.000Z' },
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => new Response(
      JSON.stringify(String(url).includes('/plugin/') ? detail : catalog),
      { status: 200 },
    )))
    render(<MarketplaceTab t={t} />)
    expect(screen.getByRole('status').textContent).toContain(en.loading)
    await screen.findByRole('heading', { name: en.marketplace })
    expect(screen.getByText(en.archived)).toBeTruthy()
    const cover = screen.getByRole('img', { name: `memory ${en.cover}` })
    fireEvent.error(cover)
    expect(screen.getByRole('img', { name: `memory ${en.cover}` }).tagName).toBe('DIV')
    fireEvent.change(screen.getByLabelText(en.search), { target: { value: 'missing' } })
    expect(screen.getByText(en.noResults)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en.search), { target: { value: 'memory' } })
    fireEvent.click(screen.getByRole('button', { name: en.details }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-labelledby')).toBe('marketplace-detail-title')
    expect(within(dialog).getByRole('heading', { name: 'memory' })).toBeTruthy()
    expect(await within(dialog).findByText('README excerpt', { selector: 'p' })).toBeTruthy()
    expect(screen.getByRole('link', { name: en.openHomepage }).getAttribute('href')).toBe('https://memory.example/')
    expect(screen.getByText(new RegExp(en.created))).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows an explicit unavailable state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MarketplaceTab t={t} />)
    expect((await screen.findByRole('alert')).textContent).toContain(en.unavailable)
  })

  it('shows stale and fork states, sorts by stars and paginates 48 cards', async () => {
    const plugins = Array.from({ length: 49 }, (_, offset) => {
      const id = offset + 1
      return {
        ...catalog.plugins[0],
        id: `gh:${id}`,
        githubDatabaseId: id,
        githubNodeId: `R_${id}`,
        slug: `owner/plugin-${String(id).padStart(2, '0')}`,
        name: `plugin-${String(id).padStart(2, '0')}`,
        coverUrl: null,
        state: { archived: false, fork: id === 49 },
        stats: { stars: id, forks: 0 },
        detailPath: `./plugins/${id}.json`,
      }
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      registry: { ...catalog.registry, pluginCount: plugins.length, stale: true },
      plugins,
    }), { status: 200 })))
    render(<MarketplaceTab t={t} />)
    await screen.findByRole('heading', { name: en.marketplace })
    expect(screen.getByText(en.cached)).toBeTruthy()
    expect(screen.getByText(en.fork)).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(48)
    fireEvent.change(screen.getByLabelText(en.sort), { target: { value: 'stars' } })
    expect(within(screen.getAllByRole('article')[0]!).getByRole('heading', { name: 'plugin-49' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.next }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText(`${en.page} 2 / 2`)).toBeTruthy()
  })

  it('asks for trust once, then installs by registry identity without exposing an install spec', async () => {
    const installableCatalog = {
      ...catalog,
      plugins: [{
        ...catalog.plugins[0],
        state: { archived: false, fork: false },
        install: { available: true, packageName: 'dsh-memory', version: '1.0.0', requiresBuildApproval: false },
      }],
    }
    const detail = {
      schemaVersion: 1, id: 'gh:1',
      github: {
        databaseId: 1, nodeId: 'R_1', slug: 'owner/memory', url: 'https://github.com/owner/memory',
        defaultBranch: 'main', headSha: 'a'.repeat(40), owner: catalog.plugins[0]?.owner,
        description: 'Session memory', homepageUrl: null, topics: ['dsh-plugin'], stars: 10, forks: 1,
        archived: false, fork: false, language: 'TypeScript', license: null,
        createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', pushedAt: null,
        openGraphImageUrl: null,
      },
      presentation: { description: 'Session memory', coverUrl: null }, readme: { available: true, excerpt: '' },
      package: { status: 'valid', name: 'dsh-memory', version: '1.0.0', type: 'module', main: null },
      bundle: { detected: true, patch: './cordis.patch.yml', patchExists: true },
      scripts: { prepare: false, preinstall: false, install: false, postinstall: false },
      npm: { published: true, latestVersion: '1.0.0', repositoryMatches: true },
      install: { available: true, preferred: 'npm', spec: 'dsh-memory@1.0.0', packageName: 'dsh-memory', version: '1.0.0', requiresBuildApproval: false, reason: null },
      crawl: { headSha: 'a'.repeat(40), enrichmentStatus: 'ok', enrichedAt: '2026-08-14T06:30:00.000Z' },
    }
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') return new Response(JSON.stringify({
        ok: true, plugin: { packageName: 'dsh-memory', version: '1.0.0' }, restartRequired: true, output: 'ok',
      }), { status: 200 })
      return new Response(JSON.stringify(url.includes('/plugin/') ? detail : installableCatalog), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MarketplaceTab t={t} />)
    await screen.findByRole('heading', { name: en.marketplace })
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(en.thirdPartyWarning)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: en.understandAndInstall }))
    await screen.findByText(en.waitingForRestart, { selector: 'button' })
    expect(screen.getByRole('status').textContent).toContain('1')
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[0]).toBe('/dsh-marketplace/api/install')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ pluginId: 'gh:1', allowBuildScripts: false })

    cleanup()
    render(<MarketplaceTab t={t} />)
    await screen.findByRole('heading', { name: en.marketplace })
    fireEvent.click(screen.getByRole('button', { name: en.install }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('routes build-script plugins to guidance instead of attempting installation', async () => {
    const buildCatalog = {
      ...catalog,
      plugins: [{
        ...catalog.plugins[0],
        state: { archived: false, fork: false },
        install: { available: true, packageName: 'dsh-memory', version: '1.0.0', requiresBuildApproval: true },
      }],
    }
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => (
      new Response(JSON.stringify(buildCatalog), { status: 200 })
    ))
    vi.stubGlobal('fetch', fetchMock)
    render(<MarketplaceTab t={t} />)
    await screen.findByRole('heading', { name: en.marketplace })
    fireEvent.click(screen.getByRole('button', { name: en.additionalConfiguration }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(en.buildApprovalUnavailable)).toBeTruthy()
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })
})
