import { useEffect, useState } from 'react'
import { IconCordisPluginOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InstalledPlugin, InstalledSourceKind, InstalledState } from '../manager/installed.js'
import type { LocaleKey } from './locales.js'
import { MutationFailure, runMutation } from './mutation.js'
import { RemoveDialog } from './RemoveDialog.js'

export interface InstalledTabInjected {
  t: (key: LocaleKey) => string
  onBrowse?: () => void
}

function InstalledCover({ plugin, t }: { plugin: InstalledPlugin; t: (key: LocaleKey) => string }) {
  const [failed, setFailed] = useState(false)
  if (plugin.display.coverUrl === null || failed) {
    return <div role="img" aria-label={`${plugin.display.name} ${t('cover')}`} className="dshm-plugin-cover">
      <IconCordisPluginOutline14 size={24} />
    </div>
  }
  return <div className="dshm-plugin-cover"><img src={plugin.display.coverUrl}
    alt={`${plugin.display.name} ${t('cover')}`} onError={() => setFailed(true)} /></div>
}

function sourceLabel(kind: InstalledSourceKind, t: (key: LocaleKey) => string): string {
  const labels: Record<InstalledSourceKind, LocaleKey> = {
    npm: 'sourceNpm',
    github: 'sourceGitHub',
    local: 'sourceLocal',
    url: 'sourceUrl',
  }
  return t(labels[kind])
}

function updateLabel(plugin: InstalledPlugin, t: (key: LocaleKey) => string): string {
  if (plugin.update.status === 'available') {
    return `v${plugin.version ?? '—'} → v${plugin.update.latestVersion ?? '—'}`
  }
  if (plugin.update.status === 'current') return t('upToDate')
  if (plugin.update.status === 'source') return t('sourceManaged')
  return t('updateUnknown')
}

export function InstalledTab({ t, onBrowse }: InstalledTabInjected) {
  const [state, setState] = useState<InstalledState | null>(null)
  const [error, setError] = useState(false)
  const [operation, setOperation] = useState<{ packageName: string; action: 'update' | 'remove' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string; output: string | null } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<InstalledPlugin | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const load = async () => {
    setError(false)
    const response = await fetch('/dsh-marketplace/api/installed')
    if (!response.ok) throw new Error(`installed ${response.status}`)
    setState(await response.json() as InstalledState)
  }
  useEffect(() => {
    void load().catch(() => setError(true))
  }, [])
  const mutate = async (plugin: InstalledPlugin, action: 'update' | 'remove') => {
    setOperation({ packageName: plugin.packageName, action })
    setFailure(null)
    try {
      await runMutation(action, { packageName: plugin.packageName })
      setNotice(action === 'update' ? t('updatedSuccessfully') : t('removedSuccessfully'))
      await load()
    } catch (caught) {
      setFailure(caught instanceof MutationFailure
        ? { message: caught.message, output: caught.output }
        : { message: t('operationFailed'), output: null })
    } finally {
      setOperation(null)
    }
  }
  if (state === null && !error) return <p className="dshm-empty" role="status">{t('loadingInstalled')}</p>
  if (state === null) return <div className="dshm-empty">
    <p role="alert">{t('installedUnavailable')}</p>
    <button type="button" className="dshm-button" onClick={() => void load().catch(() => setError(true))}>{t('retry')}</button>
  </div>
  return (
    <section aria-labelledby="installed-heading">
      <h2 id="installed-heading" className="dshm-visually-hidden">{t('installed')}</h2>
      <div className="dshm-installed-intro">
        <p><strong>{state.profile}</strong> {t('profileLabel')} · {state.plugins.length} {t('installedCount')}</p>
        <p>{t('managedPluginsOnly')}</p>
      </div>
      {(state.restartRequired || notice !== null) && <div className="dshm-notice dshm-installed-notice" role="status">
        {notice !== null && <strong>{notice}</strong>}
        <span>{t('restartRequired')}</span>
      </div>}
      {failure !== null && <div className="dshm-alert" role="alert">
        <p>{failure.message}</p>
        {failure.output !== null && <details><summary>{t('commandOutput')}</summary><pre>{failure.output}</pre></details>}
      </div>}
      {state.plugins.length === 0
        ? <div className="dshm-empty dshm-installed-empty">
          <h3>{t('noneInstalled')}</h3>
          <p>{t('noneInstalledHint')}</p>
          {onBrowse !== undefined && <button type="button" className="dshm-button" onClick={onBrowse}>{t('browseMarketplace')}</button>}
        </div>
        : <div className="dshm-list dshm-installed-list">
          {state.plugins.map(plugin => {
            const detailsOpen = expanded === plugin.packageName
            const busy = operation?.packageName === plugin.packageName
            const updateAction = plugin.source.kind === 'github' ? t('syncSource') : t('update')
            return <article key={plugin.packageName} className="dshm-plugin-row dshm-installed-row">
              <InstalledCover plugin={plugin} t={t} />
              <div className="dshm-plugin-main">
                <div className="dshm-plugin-title-line">
                  <h3 className="dshm-plugin-title">{plugin.display.name}</h3>
                  {plugin.display.owner !== null && <span className="dshm-plugin-owner">by {plugin.display.owner}</span>}
                </div>
                <p className="dshm-plugin-description">{plugin.display.description ?? plugin.packageName}</p>
                <div className="dshm-plugin-meta">
                  <span>v{plugin.version ?? '—'}</span>
                  <span>{sourceLabel(plugin.source.kind, t)}</span>
                  {plugin.self && <span>{t('marketplace')}</span>}
                </div>
              </div>
              <div className="dshm-installed-state" data-status={plugin.update.status}>
                <span className="dshm-installed-status-dot" aria-hidden="true" />
                <span>{updateLabel(plugin, t)}</span>
              </div>
              <div className="dshm-plugin-actions dshm-installed-actions">
                {plugin.update.canUpdate && <button type="button" className="dshm-install-button"
                  disabled={operation !== null} onClick={() => void mutate(plugin, 'update')}>
                  {busy && operation?.action === 'update' ? t('updating') : updateAction}
                </button>}
                <button type="button" className="dshm-details-button" aria-expanded={detailsOpen}
                  onClick={() => setExpanded(detailsOpen ? null : plugin.packageName)}>{t('details')}</button>
                <button type="button" className="dshm-details-button dshm-remove-button" disabled={operation !== null}
                  onClick={() => setRemoveTarget(plugin)}>
                  {busy && operation?.action === 'remove' ? t('removing') : t('remove')}
                </button>
              </div>
              {detailsOpen && <div className="dshm-installed-details">
                <dl>
                  <div><dt>{t('package')}</dt><dd><code>{plugin.packageName}</code></dd></div>
                  <div><dt>{t('source')}</dt><dd><code>{plugin.dependencySpec}</code></dd></div>
                </dl>
                {plugin.display.repositoryUrl !== null && <a href={plugin.display.repositoryUrl} target="_blank" rel="noopener noreferrer">
                  {t('openRepository')}
                </a>}
              </div>}
            </article>
          })}
        </div>}
      {removeTarget !== null && <RemoveDialog plugin={removeTarget} profile={state.profile} t={t}
        onClose={() => setRemoveTarget(null)} onConfirm={() => {
          const plugin = removeTarget
          setRemoveTarget(null)
          void mutate(plugin, 'remove')
        }} />}
    </section>
  )
}
