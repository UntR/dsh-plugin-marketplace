// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstalledTab } from '../src/client/InstalledTab.js'
import { en, type LocaleKey } from '../src/client/locales.js'

const t = (key: LocaleKey) => en[key]

afterEach(() => vi.unstubAllGlobals())

describe('InstalledTab', () => {
  it('requires the dedicated confirmation before removing Marketplace itself', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      profile: 'web', restartRequired: false, plugins: [{
        packageName: 'dsh-marketplace', version: '0.1.0', dependencySpec: '0.1.0', registryId: null,
        registryVersion: null, update: { available: false, latestVersion: null }, self: true,
      }],
    }), { status: 200 }))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('confirm', confirm)
    render(<InstalledTab t={t} />)
    await screen.findByRole('heading', { name: en.installed })
    fireEvent.click(screen.getByRole('button', { name: en.remove }))
    expect(confirm).toHaveBeenCalledWith(en.selfRemoveConfirm)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
