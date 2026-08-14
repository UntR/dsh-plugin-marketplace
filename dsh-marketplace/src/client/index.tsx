import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { MarketplaceTab, type MarketplaceTabInjected } from './MarketplaceTab.js'
import { InstalledTab, type InstalledTabInjected } from './InstalledTab.js'
import { en, zh, type LocaleKey } from './locales.js'
import {
  MarketplaceFooterAction,
  MarketplaceSurface,
  MarketplaceSurfaceController,
  type MarketplaceFooterActionProps,
  type MarketplaceSurfaceProps,
} from './MarketplaceSurface.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.marketplace': LocaleKey
  }
}

const NS = 'settings.marketplace'
export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-marketplace: dictionaries')
  const t = ctx.locale.bind(NS)
  const surface = new MarketplaceSurfaceController()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'marketplace',
    order: 20,
    locale: NS,
    inject: (): Omit<MarketplaceFooterActionProps, 'wide'> => ({ t, surface }),
  }, MarketplaceFooterAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'marketplace',
    order: 20,
    locale: NS,
    inject: (): MarketplaceSurfaceProps => ({ t, surface }),
  }, MarketplaceSurface))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 20,
    label: () => t('marketplace'),
    locale: NS,
    inject: (): MarketplaceTabInjected => ({ t }),
  }, MarketplaceTab))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'installed',
    order: 30,
    label: () => t('installed'),
    locale: NS,
    inject: (): InstalledTabInjected => ({ t }),
  }, InstalledTab))
}
