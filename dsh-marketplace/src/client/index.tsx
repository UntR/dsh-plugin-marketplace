import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { MarketplaceTab, type MarketplaceTabInjected } from './MarketplaceTab.js'
import { en, zh, type LocaleKey } from './locales.js'

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
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 20,
    label: () => t('marketplace'),
    locale: NS,
    inject: (): MarketplaceTabInjected => ({ t }),
  }, MarketplaceTab))
}

