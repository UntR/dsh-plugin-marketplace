import { useEffect, useRef } from 'react'
import type { RegistryIndexEntry } from '../shared/schema.js'
import type { LocaleKey } from './locales.js'

interface Props {
  plugin: RegistryIndexEntry
  kind: 'trust' | 'build' | 'agent'
  t: (key: LocaleKey) => string
  onClose: () => void
  onConfirm?: () => void
}

export function InstallDialog({ plugin, kind, t, onClose, onConfirm }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || dialog.current === null) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button, a[href]')]
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
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="install-dialog-title" style={dialogStyle}>
        <button ref={close} type="button" aria-label={t('close')} onClick={onClose} style={{ float: 'right' }}>×</button>
        <h2 id="install-dialog-title">{kind === 'trust'
          ? t('allowThirdPartyPlugins')
          : kind === 'agent' ? t('agentInstallTitle') : t('additionalConfiguration')}</h2>
        <h3>{plugin.install.packageName ?? plugin.name}</h3>
        <p>{kind === 'trust'
          ? t('thirdPartyWarning')
          : kind === 'agent' ? t('agentInstallWarning') : t('buildApprovalUnavailable')}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
          <a href={plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">{t('openGitHub')}</a>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onClose}>{kind === 'build' ? t('close') : t('cancel')}</button>
            {kind !== 'build' && <button type="button" onClick={onConfirm}>
              {kind === 'agent' ? t('startAgentInstall') : t('understandAndInstall')}
            </button>}
          </div>
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
