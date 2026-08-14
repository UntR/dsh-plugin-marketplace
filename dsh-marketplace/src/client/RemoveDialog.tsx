import { useEffect, useRef } from 'react'
import type { InstalledPlugin } from '../manager/installed.js'
import type { LocaleKey } from './locales.js'

interface Props {
  plugin: InstalledPlugin
  t: (key: LocaleKey) => string
  onClose: () => void
  onConfirm: () => void
}

export function RemoveDialog({ plugin, t, onClose, onConfirm }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    cancel.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || dialog.current === null) return
      const buttons = [...dialog.current.querySelectorAll<HTMLButtonElement>('button')]
      const first = buttons[0]
      const last = buttons.at(-1)
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
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="remove-dialog-title" style={dialogStyle}>
        <h2 id="remove-dialog-title">{t('removePluginTitle')}</h2>
        <p><strong>{plugin.packageName}</strong></p>
        <p>{plugin.self ? t('selfRemoveConfirm') : t('removeConfirm')}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button ref={cancel} type="button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" onClick={onConfirm}>{plugin.self ? t('removeMarketplace') : t('remove')}</button>
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
  width: 'min(30rem, 100%)', background: 'var(--dsh-background, #fff)', color: 'inherit',
  borderRadius: '0.75rem', padding: '1.25rem',
} as const
