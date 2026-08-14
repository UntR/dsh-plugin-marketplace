import { useEffect, useRef, useState } from 'react'
import type { RegistryIndexEntry, RegistryPluginDetail } from '../shared/schema.js'
import type { LocaleKey } from './locales.js'

interface Props {
  plugin: RegistryIndexEntry
  t: (key: LocaleKey) => string
  onClose: () => void
  onInstall: () => void
}

export function PluginDetails({ plugin, t, onClose, onInstall }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [detail, setDetail] = useState<RegistryPluginDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [coverFailed, setCoverFailed] = useState(false)
  useEffect(() => {
    let active = true
    void fetch(`/dsh-marketplace/api/plugin/${encodeURIComponent(plugin.id)}`)
      .then(async response => {
        if (!response.ok) throw new Error(`detail ${response.status}`)
        if (active) setDetail(await response.json() as RegistryPluginDetail)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [plugin.id])
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || dialog.current === null) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button, a[href]')]
        .filter(element => !element.hasAttribute('disabled'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [onClose])
  const coverUrl = detail?.presentation.coverUrl ?? plugin.coverUrl
  const formatDate = (value: string | null) => value === null ? '—' : new Date(value).toLocaleString()
  return (
    <div role="presentation" style={overlayStyle} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="marketplace-detail-title" style={dialogStyle}>
        <button ref={close} type="button" aria-label={t('close')} onClick={onClose} style={{ float: 'right' }}>×</button>
        {coverUrl !== null && !coverFailed
          ? <img src={coverUrl} alt={`${plugin.name} ${t('cover')}`} onError={() => setCoverFailed(true)}
            style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover', borderRadius: '0.5rem' }} />
          : <div role="img" aria-label={`${plugin.name} ${t('cover')}`} style={coverPlaceholderStyle} />}
        <h2 id="marketplace-detail-title">{plugin.name}</h2>
        <p>{t('owner')}: {plugin.owner.login} · {plugin.slug}</p>
        <p>{plugin.description}</p>
        <dl>
          <dt>{t('stars')}</dt><dd>{plugin.stats.stars}</dd>
          <dt>{t('forks')}</dt><dd>{plugin.stats.forks}</dd>
          <dt>{t('language')}</dt><dd>{plugin.language ?? '—'}</dd>
          <dt>{t('license')}</dt><dd>{plugin.license ?? '—'}</dd>
          <dt>{t('created')}</dt><dd>{formatDate(plugin.timestamps.createdAt)}</dd>
          <dt>{t('updated')}</dt><dd>{formatDate(plugin.timestamps.updatedAt)}</dd>
          <dt>{t('pushed')}</dt><dd>{formatDate(plugin.timestamps.pushedAt)}</dd>
          <dt>{t('package')}</dt><dd>{plugin.install.packageName ?? '—'}</dd>
          <dt>{t('version')}</dt><dd>{plugin.install.version ?? '—'}</dd>
        </dl>
        {detail !== null && (
          <>
            <p>{t('dshBundle')}: {detail.bundle.detected ? t('detected') : t('notDetected')}</p>
            <p>{t('installSource')}: {detail.install.preferred ?? '—'}</p>
            {!detail.install.available && <p role="status">{detail.install.reason ?? t('installUnavailable')}</p>}
            <h3>{t('readme')}</h3>
            <p>{detail.readme.excerpt || '—'}</p>
            <h3>{t('topics')}</h3>
            <p>{detail.github.topics.join(' · ') || '—'}</p>
          </>
        )}
        {detail === null && !failed && <p role="status">{t('loading')}</p>}
        {failed && <p role="alert">{t('unavailable')}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <a href={plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">{t('openGitHub')}</a>
            {plugin.homepageUrl !== null && <a href={plugin.homepageUrl} target="_blank" rel="noopener noreferrer">{t('openHomepage')}</a>}
          </div>
          <button type="button" disabled={detail === null} onClick={onInstall}>
            {detail?.install.available === false ? t('installViaAgent') : t('install')}
          </button>
        </div>
      </div>
    </div>
  )
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.55)', display: 'grid',
  placeItems: 'center', padding: '1rem', zIndex: 1000,
} as const

const dialogStyle = {
  width: 'min(40rem, 100%)', maxHeight: '85vh', overflow: 'auto',
  background: 'var(--dsw-alias-bg-layer-2)', color: 'inherit', borderRadius: '0.75rem', padding: '1.25rem',
} as const

const coverPlaceholderStyle = {
  width: '100%', aspectRatio: '16 / 9', borderRadius: '0.5rem',
  background: 'linear-gradient(135deg, #255, #69a)',
} as const
