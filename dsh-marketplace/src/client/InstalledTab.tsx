import { useEffect, useState } from 'react'
import type { InstalledPlugin, InstalledState } from '../manager/installed.js'
import type { LocaleKey } from './locales.js'
import { MutationFailure, runMutation } from './mutation.js'
import { RemoveDialog } from './RemoveDialog.js'

export interface InstalledTabInjected {
  t: (key: LocaleKey) => string
}

export function InstalledTab({ t }: InstalledTabInjected) {
  const [state, setState] = useState<InstalledState | null>(null)
  const [error, setError] = useState(false)
  const [operation, setOperation] = useState<{ packageName: string; action: 'update' | 'remove' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ message: string; output: string | null } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<InstalledPlugin | null>(null)
  const load = async () => {
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
  if (state === null && !error) return <p role="status">{t('loadingInstalled')}</p>
  if (state === null) return <p role="alert">{t('installedUnavailable')}</p>
  return (
    <section aria-labelledby="installed-heading">
      <h2 id="installed-heading">{t('installed')}</h2>
      <p>{t('currentProfile')}: {state.profile}</p>
      {(state.restartRequired || notice !== null) && <p role="status">{notice} {t('restartRequired')}</p>}
      {failure !== null && <div role="alert">
        <p>{failure.message}</p>
        {failure.output !== null && <details><summary>{t('commandOutput')}</summary><pre>{failure.output}</pre></details>}
      </div>}
      {state.plugins.length === 0 && <p>{t('noneInstalled')}</p>}
      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {state.plugins.map(plugin => (
          <article key={plugin.packageName} style={{ border: '1px solid currentColor', borderRadius: '0.75rem', padding: '1rem' }}>
            <h3>{plugin.packageName}</h3>
            <p>{plugin.version === null ? '—' : `v${plugin.version}`}</p>
            {plugin.registryId === null
              ? <p>{t('notInRegistry')}</p>
              : <p>Registry: {plugin.registryVersion ?? '—'}</p>}
            <p>{plugin.update.available ? t('updateAvailable') : plugin.update.latestVersion === null ? t('updateUnknown') : t('upToDate')}</p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" disabled={operation !== null} onClick={() => void mutate(plugin, 'update')}>
                {operation?.packageName === plugin.packageName && operation.action === 'update' ? t('updating') : t('update')}
              </button>
              <button type="button" disabled={operation !== null} onClick={() => setRemoveTarget(plugin)}>
                {operation?.packageName === plugin.packageName && operation.action === 'remove' ? t('removing') : t('remove')}
              </button>
            </div>
          </article>
        ))}
      </div>
      {removeTarget !== null && <RemoveDialog plugin={removeTarget} t={t}
        onClose={() => setRemoveTarget(null)} onConfirm={() => {
          const plugin = removeTarget
          setRemoveTarget(null)
          void mutate(plugin, 'remove')
        }} />}
    </section>
  )
}
