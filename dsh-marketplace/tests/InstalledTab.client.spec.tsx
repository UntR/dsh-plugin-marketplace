// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstalledTab } from '../src/client/InstalledTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCordisPluginOutline14: () => <span data-testid="plugin-icon" />,
}))

const t = (key: LocaleKey) => en[key]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InstalledTab', () => {
  it('turns an empty profile into a route back to the Marketplace', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      profile: 'web', restartRequired: false, plugins: [],
    }), { status: 200 })))
    const onBrowse = vi.fn()

    render(<InstalledTab t={t} onBrowse={onBrowse} />)

    await screen.findByRole('heading', { name: en.installed })
    expect(screen.getByRole('heading', { name: en.noneInstalled })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en.browseMarketplace }))
    expect(onBrowse).toHaveBeenCalledOnce()
  })

  it('requires the dedicated confirmation before removing Marketplace itself', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      profile: 'web', restartRequired: false, plugins: [{
        packageName: 'untr-dsh-marketplace', version: '0.1.0', dependencySpec: '0.1.0', registryId: null,
        registryVersion: null, registryEntry: null, source: { kind: 'npm' },
        display: {
          name: 'DSH Marketplace', description: 'A plugin marketplace', owner: null,
          coverUrl: null, repositoryUrl: 'https://github.com/UntR/dsh-plugin-marketplace',
        },
        update: { status: 'current', available: false, latestVersion: '0.1.0', canUpdate: false }, self: true,
      }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<InstalledTab t={t} />)
    await screen.findByRole('heading', { name: en.installed })
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('dshm-dialog')
    expect(within(dialog).getByText(en.selfRemoveConfirm)).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: en.removeMarketplace })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: en.cancel }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('renders known and private states and removes only after confirmation', async () => {
    const state = {
      profile: 'web', restartRequired: true, plugins: [{
        packageName: 'dsh-known', version: '1.0.0', dependencySpec: '1.0.0', registryId: 'gh:1',
        registryVersion: '1.1.0', registryEntry: null, source: { kind: 'npm' },
        display: {
          name: 'Known plugin', description: 'A useful plugin', owner: 'owner', coverUrl: null,
          repositoryUrl: 'https://github.com/owner/known',
        },
        update: { status: 'available', available: true, latestVersion: '1.1.0', canUpdate: true }, self: false,
      }, {
        packageName: 'dsh-private', version: '2.0.0', dependencySpec: 'github:owner/private#abc', registryId: null,
        registryVersion: null, registryEntry: null, source: { kind: 'github' },
        display: {
          name: 'dsh-private', description: null, owner: null, coverUrl: null,
          repositoryUrl: 'https://github.com/owner/private',
        },
        update: { status: 'source', available: false, latestVersion: null, canUpdate: true }, self: false,
      }],
    }
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Response(JSON.stringify(
      init?.method === 'POST'
        ? { ok: true, plugin: { packageName: 'dsh-private', version: '2.0.0' }, restartRequired: true, output: 'ok' }
        : state,
    ), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<InstalledTab t={t} />)
    await screen.findByRole('heading', { name: en.installed })
    expect(screen.getByText('v1.0.0 → v1.1.0')).toBeTruthy()
    expect(screen.getByText(en.sourceGitHub)).toBeTruthy()
    expect(screen.getByText(en.sourceManaged)).toBeTruthy()
    expect(screen.queryByText(en.notInRegistry)).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(en.restartRequired)
    const privateCard = screen.getByRole('heading', { name: 'dsh-private' }).closest('article')
    expect(privateCard).not.toBeNull()
    expect(within(privateCard!).getByRole('button', { name: en.syncSource })).toBeTruthy()
    fireEvent.click(within(privateCard!).getByRole('button', { name: en.remove }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: en.remove }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[0]).toBe('/dsh-marketplace/api/remove')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ packageName: 'dsh-private' })
  })
})
