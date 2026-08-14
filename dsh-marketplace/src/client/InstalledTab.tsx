import { useEffect, useState } from 'react'
import type { InstalledState } from '../manager/installed.js'
import type { LocaleKey } from './locales.js'

export interface InstalledTabInjected {
  t: (key: LocaleKey) => string
}

export function InstalledTab({ t }: InstalledTabInjected) {
  const [state, setState] = useState<InstalledState | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    void fetch('/dsh-marketplace/api/installed')
      .then(async response => {
        if (!response.ok) throw new Error(`installed ${response.status}`)
        setState(await response.json() as InstalledState)
      })
      .catch(() => setError(true))
  }, [])
  if (state === null && !error) return <p role="status">{t('loadingInstalled')}</p>
  if (state === null) return <p role="alert">{t('installedUnavailable')}</p>
  return (
    <section aria-labelledby="installed-heading">
      <h2 id="installed-heading">{t('installed')}</h2>
      <p>{t('currentProfile')}: {state.profile}</p>
      {state.restartRequired && <p role="status">{t('restartRequired')}</p>}
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
              <button type="button">{t('update')}</button>
              <button type="button">{t('remove')}</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

