// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstalledTab } from '../src/client/InstalledTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'

const t = (key: LocaleKey) => en[key]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InstalledTab', () => {
  it('requires the dedicated confirmation before removing Marketplace itself', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      profile: 'web', restartRequired: false, plugins: [{
        packageName: 'untr-dsh-marketplace', version: '0.1.0', dependencySpec: '0.1.0', registryId: null,
        registryVersion: null, update: { available: false, latestVersion: null }, self: true,
      }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<InstalledTab t={t} />)
    await screen.findByRole('heading', { name: en.installed })
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    const dialog = screen.getByRole('dialog')
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
        registryVersion: '1.1.0', update: { available: true, latestVersion: '1.1.0' }, self: false,
      }, {
        packageName: 'dsh-private', version: '2.0.0', dependencySpec: 'github:owner/private#abc', registryId: null,
        registryVersion: null, update: { available: false, latestVersion: null }, self: false,
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
    expect(screen.getByText(en.updateAvailable)).toBeTruthy()
    expect(screen.getByText(en.notInRegistry)).toBeTruthy()
    expect(screen.getByText(en.updateUnknown)).toBeTruthy()
    expect(screen.getByText('Registry: 1.1.0')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain(en.restartRequired)
    const privateCard = screen.getByRole('heading', { name: 'dsh-private' }).closest('article')
    expect(privateCard).not.toBeNull()
    fireEvent.click(within(privateCard!).getByRole('button', { name: en.remove }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: en.remove }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(post?.[0]).toBe('/dsh-marketplace/api/remove')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ packageName: 'dsh-private' })
  })
})
