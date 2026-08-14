import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { RegistryIndexEntry } from '../shared/schema.js'
import { MarketplaceTab, type AgentInstallHandler, type MarketplaceTabInjected } from './MarketplaceTab.js'
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
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'conversation']

function agentInstallPrompt(plugin: RegistryIndexEntry, t: (key: LocaleKey) => string): string {
  return t('agentInstallTask')
    .replace('{name}', plugin.name)
    .replace('{repositoryUrl}', plugin.repositoryUrl)
}

async function openAgentInstallSession(ctx: ClientContext, plugin: RegistryIndexEntry, t: (key: LocaleKey) => string): Promise<void> {
  const workspaces = ctx.workspaces.list.getSnapshot()
  const current = ctx.sessions.list.getSnapshot().current
  const currentWorkspaceId = current === undefined
    ? undefined
    : workspaces.items.find(workspace => workspace.sessionIds.includes(current))?.workspaceId
  const workspaceId = currentWorkspaceId ?? workspaces.recentWorkspaceId
  if (workspaceId === undefined) throw new Error(t('agentInstallNoWorkspace'))

  const sessionId = await ctx.workspaces.connectWorkspace(workspaceId)
  const sessionContext = ctx.sessions.scope(sessionId)
  if (sessionContext === undefined) throw new Error(t('agentInstallSessionFailed'))
  const input = ctx.conversation.input.for(sessionContext)
  input.setDraft(agentInstallPrompt(plugin, t))
  ctx.sessions.open(sessionId)
  input.submit()
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-marketplace: dictionaries')
  const t = ctx.locale.bind(NS)
  const surface = new MarketplaceSurfaceController()
  const onAgentInstall: AgentInstallHandler = async plugin => {
    await openAgentInstallSession(ctx, plugin, t)
    surface.close()
  }
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
    inject: (): MarketplaceSurfaceProps => ({ t, surface, onAgentInstall }),
  }, MarketplaceSurface))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'marketplace',
    order: 20,
    label: () => t('marketplace'),
    locale: NS,
    inject: (): MarketplaceTabInjected => ({ t, onAgentInstall }),
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
