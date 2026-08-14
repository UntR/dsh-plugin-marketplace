// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MarketplaceTab } from '../src/client/MarketplaceTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'

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
    repositoryUrl: 'https://github.com/owner/memory', homepageUrl: null,
    description: 'Session memory', coverUrl: null, topics: ['dsh-plugin'], language: 'TypeScript', license: 'MIT',
    stats: { stars: 10, forks: 1 }, state: { archived: true, fork: false },
    timestamps: { createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', pushedAt: null },
    install: { available: false, packageName: null, version: null, requiresBuildApproval: false },
    detailPath: './plugins/1.json',
  }],
}

afterEach(() => vi.unstubAllGlobals())

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
    fireEvent.change(screen.getByLabelText(en.search), { target: { value: 'missing' } })
    expect(screen.getByText(en.noResults)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(en.search), { target: { value: 'memory' } })
    fireEvent.click(screen.getByRole('button', { name: en.details }))
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('marketplace-detail-title')
    expect(screen.getByRole('heading', { name: 'owner/memory' })).toBeTruthy()
    expect(await screen.findByText('README excerpt')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows an explicit unavailable state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<MarketplaceTab t={t} />)
    expect((await screen.findByRole('alert')).textContent).toContain(en.unavailable)
  })
})
