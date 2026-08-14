import { useEffect, useMemo, useState } from 'react'
import type { Catalog } from '../registry/service.js'
import type { RegistryIndexEntry } from '../shared/schema.js'
import { filterCatalog, sortCatalog, type CatalogSort } from './catalog.js'
import { InstallDialog } from './InstallDialog.js'
import type { LocaleKey } from './locales.js'
import { MutationFailure, runMutation } from './mutation.js'
import { PluginDetails } from './PluginDetails.js'

const PAGE_SIZE = 48
const INSTALL_TRUST_KEY = 'dsh-marketplace:third-party-install-confirmed:v1'

function storedTrust(): boolean {
  try {
    return localStorage.getItem(INSTALL_TRUST_KEY) === 'true'
  } catch {
    return false
  }
}

function rememberTrust(): void {
  try {
    localStorage.setItem(INSTALL_TRUST_KEY, 'true')
  } catch {
    // The current page can still retain the confirmation in memory.
  }
}

function CatalogCover({ plugin, t }: { plugin: RegistryIndexEntry; t: (key: LocaleKey) => string }) {
  const [failed, setFailed] = useState(false)
  if (plugin.coverUrl === null || failed) {
    return <div role="img" aria-label={`${plugin.name} ${t('cover')}`} style={catalogCoverStyle} />
  }
  return <img src={plugin.coverUrl} alt={`${plugin.name} ${t('cover')}`} onError={() => setFailed(true)}
    style={{ ...catalogCoverStyle, objectFit: 'cover' }} />
}

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
  const [prompt, setPrompt] = useState<{ plugin: RegistryIndexEntry; kind: 'trust' | 'build' } | null>(null)
  const [trusted, setTrusted] = useState(storedTrust)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installedIds, setInstalledIds] = useState<ReadonlySet<string>>(() => new Set())
  const [failure, setFailure] = useState<{ pluginId: string; message: string; output: string | null } | null>(null)
  const [changeCount, setChangeCount] = useState(0)

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

  const install = async (plugin: RegistryIndexEntry) => {
    setInstallingId(plugin.id)
    setFailure(null)
    try {
      await runMutation('install', { pluginId: plugin.id, allowBuildScripts: false })
      setInstalledIds(current => new Set(current).add(plugin.id))
      setChangeCount(count => count + 1)
    } catch (error) {
      setFailure(error instanceof MutationFailure
        ? { pluginId: plugin.id, message: error.message, output: error.output }
        : { pluginId: plugin.id, message: t('operationFailed'), output: null })
    } finally {
      setInstallingId(null)
    }
  }

  const requestInstall = (plugin: RegistryIndexEntry) => {
    if (plugin.install.requiresBuildApproval) {
      setPrompt({ plugin, kind: 'build' })
    } else if (!trusted) {
      setPrompt({ plugin, kind: 'trust' })
    } else {
      void install(plugin)
    }
  }

  const installLabel = (plugin: RegistryIndexEntry): string => {
    if (!plugin.install.available) return t('installUnavailable')
    if (plugin.install.requiresBuildApproval) return t('additionalConfiguration')
    if (installingId === plugin.id) return t('installing')
    if (installedIds.has(plugin.id)) return t('waitingForRestart')
    if (failure?.pluginId === plugin.id) return t('retry')
    return t('install')
  }

  if (catalog === null && !error) return <p role="status">{t('loading')}</p>
  if (catalog === null) return <p role="alert">{t('unavailable')}</p>
  return (
    <section aria-labelledby="marketplace-heading">
      <h2 id="marketplace-heading">{t('marketplace')}</h2>
      {changeCount > 0 && <p role="status">{t('changesPendingRestart').replace('{count}', String(changeCount))}</p>}
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
            <CatalogCover plugin={plugin} t={t} />
            <div style={{ padding: '0.85rem' }}>
              <h3>{plugin.name}</h3>
              <p>{plugin.owner.login}</p>
              <p style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{plugin.description}</p>
              <p>{plugin.language ?? '—'} · {plugin.license ?? '—'} · ★ {plugin.stats.stars}</p>
              <p>{plugin.state.archived && <span>{t('archived')} </span>}{plugin.state.fork && <span>{t('fork')}</span>}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <button type="button" onClick={() => setSelected(plugin)}>{t('details')}</button>
                <button type="button" disabled={!plugin.install.available || installingId !== null || installedIds.has(plugin.id)}
                  onClick={() => requestInstall(plugin)}
                  aria-describedby={!plugin.install.available ? `reason-${plugin.githubDatabaseId}` : undefined}>
                  {installLabel(plugin)}
                </button>
                {!plugin.install.available && <span id={`reason-${plugin.githubDatabaseId}`} style={visuallyHidden}>
                  {t('installUnavailable')}; {t('details')}
                </span>}
              </div>
              {failure?.pluginId === plugin.id && <div role="alert">
                <p>{failure.message}</p>
                {failure.output !== null && <details><summary>{t('commandOutput')}</summary><pre>{failure.output}</pre></details>}
              </div>}
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
        onInstall={() => { setSelected(null); requestInstall(selected) }} />}
      {prompt !== null && <InstallDialog plugin={prompt.plugin} kind={prompt.kind} t={t}
        onClose={() => setPrompt(null)} onConfirm={() => {
          const plugin = prompt.plugin
          rememberTrust()
          setTrusted(true)
          setPrompt(null)
          void install(plugin)
        }} />}
    </section>
  )
}

const visuallyHidden = {
  position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px',
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
} as const

const catalogCoverStyle = {
  display: 'block', width: '100%', aspectRatio: '16 / 9', background: 'linear-gradient(135deg, #255, #69a)',
} as const
