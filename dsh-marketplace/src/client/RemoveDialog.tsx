import { useEffect, useRef } from 'react'
import type { InstalledPlugin } from '../manager/installed.js'
import type { LocaleKey } from './locales.js'

interface Props {
  plugin: InstalledPlugin
  profile: string
  t: (key: LocaleKey) => string
  onClose: () => void
  onConfirm: () => void
}

export function RemoveDialog({ plugin, profile, t, onClose, onConfirm }: Props) {
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
    <div role="presentation" className="dshm-dialog-overlay" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="remove-dialog-title" className="dshm-dialog">
        <h2 id="remove-dialog-title">{t('removePluginTitle')}</h2>
        <p className="dshm-dialog-plugin"><strong>{plugin.display.name}</strong></p>
        <p>{plugin.self ? t('selfRemoveConfirm') : t('removeConfirm')}</p>
        <p className="dshm-dialog-meta">{t('currentProfile')}: <strong>{profile}</strong></p>
        <div className="dshm-dialog-actions">
          <button ref={cancel} type="button" className="dshm-button" onClick={onClose}>{t('cancel')}</button>
          <button type="button" className="dshm-button dshm-button--danger" onClick={onConfirm}>
            {plugin.self ? t('removeMarketplace') : t('remove')}
          </button>
        </div>
      </div>
    </div>
  )
}
