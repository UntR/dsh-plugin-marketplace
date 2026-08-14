import { useEffect, useRef, useState } from 'react'
import type { RegistryIndexEntry, RegistryPluginDetail } from '../shared/schema.js'
import type { LocaleKey } from './locales.js'

interface Props {
  plugin: RegistryIndexEntry
  t: (key: LocaleKey) => string
  onClose: () => void
}

export function PluginDetails({ plugin, t, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const [detail, setDetail] = useState<RegistryPluginDetail | null>(null)
  const [failed, setFailed] = useState(false)
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
  return (
    <div role="presentation" style={overlayStyle} onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="marketplace-detail-title" style={dialogStyle}>
        <button ref={close} type="button" aria-label={t('close')} onClick={onClose} style={{ float: 'right' }}>×</button>
        <h2 id="marketplace-detail-title">{plugin.slug}</h2>
        <p>{plugin.description}</p>
        <dl>
          <dt>Stars</dt><dd>{plugin.stats.stars}</dd>
          <dt>Forks</dt><dd>{plugin.stats.forks}</dd>
          <dt>Language</dt><dd>{plugin.language ?? '—'}</dd>
          <dt>License</dt><dd>{plugin.license ?? '—'}</dd>
          <dt>Updated</dt><dd>{new Date(plugin.timestamps.updatedAt).toLocaleString()}</dd>
          <dt>Package</dt><dd>{plugin.install.packageName ?? '—'}</dd>
        </dl>
        {detail !== null && (
          <>
            <p>DSH bundle: {detail.bundle.detected ? 'Detected' : 'Not detected'}</p>
            <p>Install source: {detail.install.preferred ?? '—'}</p>
            <p>{detail.readme.excerpt}</p>
            <p>{detail.github.topics.join(' · ')}</p>
          </>
        )}
        {detail === null && !failed && <p role="status">{t('loading')}</p>}
        {failed && <p role="alert">{t('unavailable')}</p>}
        <a href={plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">{t('openGitHub')}</a>
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
  background: 'var(--dsh-background, #fff)', color: 'inherit', borderRadius: '0.75rem', padding: '1.25rem',
} as const
