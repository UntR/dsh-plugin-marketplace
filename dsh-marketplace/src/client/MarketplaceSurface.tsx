import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconCloseOutline16,
  IconCordisPluginOutline14,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { InstalledTab } from './InstalledTab.js'
import type { LocaleKey } from './locales.js'
import { MarketplaceStyles } from './marketplaceStyles.js'
import { MarketplaceTab, type AgentInstallHandler } from './MarketplaceTab.js'

export class MarketplaceSurfaceController {
  private opened = false
  private readonly listeners = new Set<() => void>()

  readonly getSnapshot = (): boolean => this.opened
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  readonly open = (): void => this.setOpened(true)
  readonly close = (): void => this.setOpened(false)
  readonly toggle = (): void => this.setOpened(!this.opened)

  private setOpened(opened: boolean): void {
    if (this.opened === opened) return
    this.opened = opened
    for (const listener of this.listeners) listener()
  }
}

interface SurfaceInjected {
  surface: MarketplaceSurfaceController
  t: (key: LocaleKey) => string
}

export type MarketplaceFooterActionProps = SurfaceInjected & { wide: boolean }

export function MarketplaceFooterAction({ surface, t, wide }: MarketplaceFooterActionProps) {
  const opened = useSyncExternalStore(surface.subscribe, surface.getSnapshot)
  const button = (
    <button
      type="button"
      className={`dshm-footer-button${wide ? '' : ' dshm-footer-button--rail'}`}
      aria-label={t('openMarketplace')}
      aria-pressed={opened}
      onClick={surface.toggle}
    >
      <IconCordisPluginOutline14 size={wide ? 14 : 18} />
      {wide && <span>{t('marketplace')}</span>}
    </button>
  )
  return <><MarketplaceStyles />{wide ? button : <Tooltip label={t('marketplace')}>{button}</Tooltip>}</>
}

export type MarketplaceSurfaceProps = SurfaceInjected & { onAgentInstall: AgentInstallHandler }

export function MarketplaceSurface({ surface, t, onAgentInstall }: MarketplaceSurfaceProps) {
  const opened = useSyncExternalStore(surface.subscribe, surface.getSnapshot)
  const [view, setView] = useState<'marketplace' | 'installed'>('marketplace')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!opened) setView('marketplace')
  }, [opened])

  useEffect(() => {
    if (!opened) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') surface.close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [opened, surface])

  useLayoutEffect(() => {
    if (!opened) return undefined
    const overlay = rootRef.current?.closest<HTMLElement>('[data-shell-overlay]')
    const sidebar = overlay?.parentElement?.firstElementChild
    if (!(sidebar instanceof HTMLElement)) return undefined
    const measure = () => setSidebarWidth(Math.round(sidebar.getBoundingClientRect().width))
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(sidebar)
    return () => observer.disconnect()
  }, [opened])

  if (!opened) return null
  return (
    <div ref={rootRef} className="dshm-surface" style={{ left: sidebarWidth }} aria-label={t('marketplace')}>
      <MarketplaceStyles />
      {view === 'marketplace'
        ? <MarketplaceTab t={t} fullPage onAgentInstall={onAgentInstall} headerActions={<>
          <button type="button" className="dshm-button" onClick={() => setView('installed')}>{t('installed')}</button>
          <button type="button" className="dshm-icon-button" aria-label={t('closeMarketplace')} onClick={surface.close}>
            <IconCloseOutline16 size={16} />
          </button>
        </>} />
        : <div className="dshm-page">
          <div className="dshm-installed-shell">
            <header className="dshm-header">
              <div>
                <h1 className="dshm-title">{t('installedPlugins')}</h1>
                <p className="dshm-subtitle">{t('installedSubtitle')}</p>
              </div>
              <div className="dshm-header-actions">
                <button type="button" className="dshm-button" onClick={() => setView('marketplace')}>{t('backToMarketplace')}</button>
                <button type="button" className="dshm-icon-button" aria-label={t('closeMarketplace')} onClick={surface.close}>
                  <IconCloseOutline16 size={16} />
                </button>
              </div>
            </header>
            <div className="dshm-installed-body"><InstalledTab t={t} onBrowse={() => setView('marketplace')} /></div>
          </div>
        </div>}
    </div>
  )
}
