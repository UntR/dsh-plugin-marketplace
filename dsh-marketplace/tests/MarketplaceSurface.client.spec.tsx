// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MarketplaceFooterAction,
  MarketplaceSurface,
  MarketplaceSurfaceController,
} from '../src/client/MarketplaceSurface.js'
import { en, zh, type LocaleKey } from '../src/client/locales.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCloseOutline16: () => <span data-testid="close-icon" />,
  IconCordisPluginOutline14: () => <span data-testid="plugin-icon" />,
  IconRefreshOutline16: () => <span data-testid="refresh-icon" />,
  IconSearchOutline16: () => <span data-testid="search-icon" />,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}))

const t = (key: LocaleKey) => en[key]
const zhT = (key: LocaleKey) => zh[key]
const catalog = {
  registry: {
    revision: `sha256:${'a'.repeat(64)}`,
    generatedAt: '2026-08-14T06:30:00.000Z',
    pluginCount: 0,
    stale: false,
  },
  plugins: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MarketplaceSurface', () => {
  it('opens from the sidebar action and closes with Escape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })))
    const surface = new MarketplaceSurfaceController()
    render(<>
      <MarketplaceFooterAction surface={surface} t={t} wide />
      <div data-shell-overlay><MarketplaceSurface surface={surface} t={t} onAgentInstall={vi.fn()} /></div>
    </>)

    const trigger = screen.getByRole('button', { name: en.openMarketplace })
    expect(trigger.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-pressed')).toBe('true')
    expect(await screen.findByRole('heading', { name: en.marketplace })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('heading', { name: en.marketplace })).toBeNull()
  })

  it('follows the translator supplied by the DSH locale service', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })))
    const surface = new MarketplaceSurfaceController()
    surface.open()
    const { rerender } = render(
      <div data-shell-overlay><MarketplaceSurface surface={surface} t={t} onAgentInstall={vi.fn()} /></div>,
    )
    expect(await screen.findByRole('heading', { name: en.marketplace })).toBeTruthy()

    rerender(<div data-shell-overlay><MarketplaceSurface surface={surface} t={zhT} onAgentInstall={vi.fn()} /></div>)
    expect(screen.getByRole('heading', { name: zh.marketplace })).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.installed })).toBeTruthy()
  })

  it('links npm users to GitHub and states the registry boundary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(catalog), { status: 200 })))
    const surface = new MarketplaceSurfaceController()
    surface.open()
    render(<div data-shell-overlay><MarketplaceSurface surface={surface} t={t} onAgentInstall={vi.fn()} /></div>)

    fireEvent.click(await screen.findByRole('button', { name: en.about }))

    expect(screen.getByRole('heading', { name: en.aboutTitle })).toBeTruthy()
    const githubLink = screen.getByRole('link', { name: en.viewOnGitHub })
    expect(githubLink.getAttribute('href')).toBe('https://github.com/UntR/dsh-plugin-marketplace')
    expect(screen.getByText(en.registryBoundaryDescription)).toBeTruthy()
  })
})
