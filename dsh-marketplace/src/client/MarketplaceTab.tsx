import { useEffect, useMemo, useState } from 'react'
import type { Catalog } from '../registry/service.js'
import type { RegistryIndexEntry } from '../shared/schema.js'
import { filterCatalog, sortCatalog, type CatalogSort } from './catalog.js'
import { InstallDialog } from './InstallDialog.js'
import type { LocaleKey } from './locales.js'
import { PluginDetails } from './PluginDetails.js'

const PAGE_SIZE = 48

export interface MarketplaceTabInjected {
  t: (key: LocaleKey) => string
}

export function MarketplaceTab({ t }: MarketplaceTabInjected) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('name')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<RegistryIndexEntry | null>(null)
  const [installTarget, setInstallTarget] = useState<RegistryIndexEntry | null>(null)
  const [restartRequired, setRestartRequired] = useState(false)

  const load = async (refresh = false) => {
    setError(false)
    try {
      const response = await fetch(`/dsh-marketplace/api/catalog${refresh ? '?refresh=1' : ''}`)
      if (!response.ok) throw new Error(`catalog ${response.status}`)
      setCatalog(await response.json() as Catalog)
    } catch {
      setError(true)
    }
  }
  useEffect(() => { void load() }, [])
  useEffect(() => { setPage(1) }, [query, sort])
  const plugins = useMemo(
    () => sortCatalog(filterCatalog(catalog?.plugins ?? [], query), sort),
    [catalog, query, sort],
  )
  const pageCount = Math.max(1, Math.ceil(plugins.length / PAGE_SIZE))
  const visible = plugins.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (catalog === null && !error) return <p role="status">{t('loading')}</p>
  if (catalog === null) return <p role="alert">{t('unavailable')}</p>
  return (
    <section aria-labelledby="marketplace-heading">
      <h2 id="marketplace-heading">{t('marketplace')}</h2>
      {restartRequired && <p role="status">{t('restartRequired')}</p>}
      <p>{catalog.registry.pluginCount} {t('plugins')} · {new Date(catalog.registry.generatedAt).toLocaleString()}</p>
      {catalog.registry.stale && <p role="status">{t('cached')}</p>}
      {error && <p role="alert">{t('unavailable')}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBlock: '1rem' }}>
        <label>
          <span style={visuallyHidden}>{t('search')}</span>
          <input aria-label={t('search')} value={query} placeholder={t('searchPlaceholder')}
            onChange={event => setQuery(event.currentTarget.value)} />
        </label>
        <label>
          <span style={visuallyHidden}>{t('sort')}</span>
          <select aria-label={t('sort')} value={sort} onChange={event => setSort(event.currentTarget.value as CatalogSort)}>
            <option value="name">{t('nameSort')}</option>
            <option value="updated">{t('updatedSort')}</option>
            <option value="pushed">{t('pushedSort')}</option>
            <option value="stars">{t('starsSort')}</option>
          </select>
        </label>
        <button type="button" onClick={() => void load(true)}>{t('refresh')}</button>
      </div>
      {visible.length === 0 && <p>{t('noResults')}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))', gap: '1rem' }}>
        {visible.map(plugin => (
          <article key={plugin.id} style={{ border: '1px solid currentColor', borderRadius: '0.75rem', overflow: 'hidden' }}>
            {plugin.coverUrl === null
              ? <div role="img" aria-label={`${plugin.name} ${t('cover')}`} style={{ aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #255, #69a)' }} />
              : <img src={plugin.coverUrl} alt={`${plugin.name} ${t('cover')}`} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />}
            <div style={{ padding: '0.85rem' }}>
              <h3>{plugin.name}</h3>
              <p>{plugin.owner.login}</p>
              <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{plugin.description}</p>
              <p>{plugin.language ?? '—'} · {plugin.license ?? '—'} · ★ {plugin.stats.stars}</p>
              <p>{plugin.state.archived && <span>{t('archived')} </span>}{plugin.state.fork && <span>{t('fork')}</span>}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <button type="button" onClick={() => setSelected(plugin)}>{t('details')}</button>
                <button type="button" disabled={!plugin.install.available}
                  onClick={() => setInstallTarget(plugin)}
                  aria-describedby={!plugin.install.available ? `reason-${plugin.githubDatabaseId}` : undefined}>
                  {plugin.install.available ? t('install') : t('installUnavailable')}
                </button>
                {!plugin.install.available && <span id={`reason-${plugin.githubDatabaseId}`} style={visuallyHidden}>{t('installUnavailable')}</span>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <nav aria-label="Pagination" style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginBlock: '1rem' }}>
        <button type="button" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>{t('previous')}</button>
        <span>{t('page')} {page} / {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{t('next')}</button>
      </nav>
      {selected !== null && <PluginDetails plugin={selected} t={t} onClose={() => setSelected(null)}
        onInstall={() => { setSelected(null); setInstallTarget(selected) }} />}
      {installTarget !== null && <InstallDialog plugin={installTarget} t={t}
        onClose={() => setInstallTarget(null)} onInstalled={() => setRestartRequired(true)} />}
    </section>
  )
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
} as const
