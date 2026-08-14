import { type ReactNode, useEffect, useMemo, useState } from 'react'
import {
  IconCordisPluginOutline14,
  IconRefreshOutline16,
  IconSearchOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { Catalog } from '../registry/service.js'
import type { RegistryIndexEntry } from '../shared/schema.js'
import type { PluginCategory } from '../shared/category.js'
import {
  catalogCategoryCounts,
  catalogLanguageCounts,
  filterCatalog,
  filterCatalogAvailability,
  filterCatalogCategory,
  sortCatalog,
  type CatalogAvailability,
  type CatalogCategory,
  type CatalogSort,
} from './catalog.js'
import { InstallDialog } from './InstallDialog.js'
import type { LocaleKey } from './locales.js'
import { MarketplaceStyles } from './marketplaceStyles.js'
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
    return <div role="img" aria-label={`${plugin.name} ${t('cover')}`} className="dshm-plugin-cover">
      <IconCordisPluginOutline14 size={24} />
    </div>
  }
  return <div className="dshm-plugin-cover"><img src={plugin.coverUrl} alt={`${plugin.name} ${t('cover')}`}
    onError={() => setFailed(true)} /></div>
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export interface MarketplaceTabInjected {
  t: (key: LocaleKey) => string
  fullPage?: boolean
  headerActions?: ReactNode
}

export function MarketplaceTab({ t, fullPage = false, headerActions }: MarketplaceTabInjected) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('stars')
  const [category, setCategory] = useState<CatalogCategory>('all')
  const [availability, setAvailability] = useState<CatalogAvailability>(fullPage ? 'installable' : 'all')
  const [language, setLanguage] = useState('all')
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
  useEffect(() => { setPage(1) }, [query, sort, category, availability, language])

  const searched = useMemo(() => filterCatalog(catalog?.plugins ?? [], query), [catalog, query])
  const available = useMemo(() => filterCatalogAvailability(searched, availability), [availability, searched])
  const categoryCounts = useMemo(() => catalogCategoryCounts(available), [available])
  const categorized = useMemo(() => filterCatalogCategory(available, category), [available, category])
  const languageCounts = useMemo(() => catalogLanguageCounts(categorized), [categorized])
  const plugins = useMemo(() => {
    const byLanguage = language === 'all' ? categorized : categorized.filter(plugin => plugin.language === language)
    return sortCatalog(byLanguage, sort)
  }, [categorized, language, sort])
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

  const clearFilters = () => {
    setCategory('all')
    setAvailability(fullPage ? 'installable' : 'all')
    setLanguage('all')
    setSort('stars')
  }

  if (catalog === null && !error) return <p role="status">{t('loading')}</p>
  if (catalog === null) return <p role="alert">{t('unavailable')}</p>
  const Heading = fullPage ? 'h1' : 'h2'
  const availabilityOptions: ReadonlyArray<readonly [CatalogAvailability, LocaleKey]> = [
    ['all', 'allPlugins'],
    ['installable', 'installableOnly'],
    ['configuration', 'configurationOnly'],
    ['unavailable', 'unavailableOnly'],
  ]
  const categoryOptions: ReadonlyArray<readonly [PluginCategory, LocaleKey]> = [
    ['agents-automation', 'categoryAgentsAutomation'],
    ['coding-development', 'categoryCodingDevelopment'],
    ['search-research', 'categorySearchResearch'],
    ['knowledge-memory', 'categoryKnowledgeMemory'],
    ['files-data', 'categoryFilesData'],
    ['media-creation', 'categoryMediaCreation'],
    ['communication-integrations', 'categoryCommunicationIntegrations'],
    ['interface-personalization', 'categoryInterfacePersonalization'],
    ['security-operations', 'categorySecurityOperations'],
    ['other', 'categoryOther'],
  ]

  return (
    <section className={`dshm-page${fullPage ? '' : ' dshm-page--embedded'}`} aria-labelledby="marketplace-heading">
      <MarketplaceStyles />
      <header className="dshm-header">
        <div>
          <Heading id="marketplace-heading" className="dshm-title">{t('marketplace')}</Heading>
          <p className="dshm-subtitle">{t('marketplaceSubtitle')}</p>
        </div>
        {headerActions !== undefined && <div className="dshm-header-actions">{headerActions}</div>}
      </header>
      {changeCount > 0 && <p className="dshm-notice" role="status">{t('changesPendingRestart').replace('{count}', String(changeCount))}</p>}
      {catalog.registry.stale && <p className="dshm-notice" role="status">{t('cached')}</p>}
      {error && <p className="dshm-alert" role="alert">{t('unavailable')}</p>}
      <form className="dshm-search" role="search" onSubmit={event => event.preventDefault()}>
        <IconSearchOutline16 size={16} />
        <label className="dshm-visually-hidden" htmlFor="dshm-market-search">{t('search')}</label>
        <input id="dshm-market-search" aria-label={t('search')} value={query} placeholder={t('searchPlaceholder')}
          onChange={event => setQuery(event.currentTarget.value)} />
        <button type="submit" className="dshm-button">{t('searchAction')}</button>
      </form>
      <div className={`dshm-layout${fullPage ? '' : ' dshm-layout--embedded'}`}>
        {fullPage && <aside className="dshm-filters" aria-label={t('filters')}>
          <div className="dshm-filter-heading">
            <h2>{t('filters')}</h2>
            <button type="button" className="dshm-clear" onClick={clearFilters}>{t('clearFilters')}</button>
          </div>
          <fieldset className="dshm-category-filter">
            <legend>{t('categories')}</legend>
            <div className="dshm-filter-options">
              <label className="dshm-filter-option">
                <input type="radio" name="market-category" value="all" checked={category === 'all'}
                  onChange={() => setCategory('all')} />
                <span>{t('allCategories')}</span><span className="dshm-filter-count">{available.length}</span>
              </label>
              {categoryOptions.map(([value, label]) => <label key={value} className="dshm-filter-option">
                <input type="radio" name="market-category" value={value} checked={category === value}
                  onChange={() => setCategory(value)} />
                <span>{t(label)}</span><span className="dshm-filter-count">{categoryCounts[value]}</span>
              </label>)}
            </div>
          </fieldset>
          <div className="dshm-filter-select-row">
            <label htmlFor="dshm-market-availability">{t('availability')}</label>
            <select id="dshm-market-availability" className="dshm-filter-select" value={availability}
              onChange={event => setAvailability(event.currentTarget.value as CatalogAvailability)}>
              {availabilityOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </div>
          <details className="dshm-more-filters">
            <summary>{t('moreFilters')}{language !== 'all' && <span>{language}</span>}</summary>
            <div className="dshm-more-filters-body">
              <label htmlFor="dshm-market-language">{t('languages')}</label>
              <select id="dshm-market-language" className="dshm-filter-select" value={language}
                onChange={event => setLanguage(event.currentTarget.value)}>
                <option value="all">{t('allLanguages')}</option>
                {languageCounts.map(([value, count]) => <option key={value} value={value}>{value} · {count}</option>)}
              </select>
            </div>
          </details>
        </aside>}
        <div className="dshm-results">
          <div className="dshm-results-toolbar">
            <span className="dshm-result-count">{plugins.length} {t('results')}</span>
            <div className="dshm-results-controls">
              <label className="dshm-visually-hidden" htmlFor="dshm-market-sort">{t('sort')}</label>
              <select id="dshm-market-sort" className="dshm-select" aria-label={t('sort')} value={sort}
                onChange={event => setSort(event.currentTarget.value as CatalogSort)}>
                <option value="stars">{t('starsSort')}</option>
                <option value="updated">{t('updatedSort')}</option>
                <option value="pushed">{t('pushedSort')}</option>
                <option value="name">{t('nameSort')}</option>
              </select>
              <button type="button" className="dshm-icon-button" aria-label={t('refresh')} onClick={() => void load(true)}>
                <IconRefreshOutline16 size={16} />
              </button>
            </div>
          </div>
          {visible.length === 0
            ? <p className="dshm-empty">{t('noResults')}</p>
            : <div className="dshm-list">
              {visible.map(plugin => (
                <article key={plugin.id} className="dshm-plugin-row">
                  <CatalogCover plugin={plugin} t={t} />
                  <div className="dshm-plugin-main">
                    <div className="dshm-plugin-title-line">
                      <h3 className="dshm-plugin-title">{plugin.name}</h3>
                      <span className="dshm-plugin-owner">by {plugin.owner.login}</span>
                    </div>
                    <p className="dshm-plugin-description">{plugin.description}</p>
                    <div className="dshm-plugin-meta">
                      <span>{plugin.language ?? '—'}</span>
                      <span>{plugin.license ?? '—'}</span>
                      {plugin.state.archived && <span>{t('archived')}</span>}
                      {plugin.state.fork && <span>{t('fork')}</span>}
                    </div>
                  </div>
                  <div className="dshm-plugin-state">
                    <span>★ {plugin.stats.stars}</span>
                    <span>{t('lastUpdated')} {dateLabel(plugin.timestamps.updatedAt)}</span>
                  </div>
                  <div className="dshm-plugin-actions">
                    <button type="button" className="dshm-install-button"
                      disabled={!plugin.install.available || installingId !== null || installedIds.has(plugin.id)}
                      onClick={() => requestInstall(plugin)}
                      aria-describedby={!plugin.install.available ? `reason-${plugin.githubDatabaseId}` : undefined}>
                      {installLabel(plugin)}
                    </button>
                    <button type="button" className="dshm-details-button" onClick={() => setSelected(plugin)}>{t('details')}</button>
                    {!plugin.install.available && <span id={`reason-${plugin.githubDatabaseId}`} className="dshm-visually-hidden">
                      {t('installUnavailable')}; {t('details')}
                    </span>}
                  </div>
                  {failure?.pluginId === plugin.id && <div className="dshm-alert" role="alert">
                    <p>{failure.message}</p>
                    {failure.output !== null && <details><summary>{t('commandOutput')}</summary><pre>{failure.output}</pre></details>}
                  </div>}
                </article>
              ))}
            </div>}
          <nav aria-label="Pagination" className="dshm-pagination">
            <button type="button" className="dshm-button" disabled={page === 1}
              onClick={() => setPage(value => Math.max(1, value - 1))}>{t('previous')}</button>
            <span>{t('page')} {page} / {pageCount}</span>
            <button type="button" className="dshm-button" disabled={page === pageCount}
              onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{t('next')}</button>
          </nav>
        </div>
      </div>
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
