import { useEffect, useRef, useState } from 'react'
import type { RegistryIndexEntry, RegistryPluginDetail } from '../shared/schema.js'
import type { LocaleKey } from './locales.js'
import { MutationFailure, runMutation } from './mutation.js'

interface Props {
  plugin: RegistryIndexEntry
  t: (key: LocaleKey) => string
  onClose: () => void
  onInstalled: () => void
}

export function InstallDialog({ plugin, t, onClose, onInstalled }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const running = useRef(false)
  const [detail, setDetail] = useState<RegistryPluginDetail | null>(null)
  const [loadingFailed, setLoadingFailed] = useState(false)
  const [allowBuildScripts, setAllowBuildScripts] = useState(false)
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle')
  const [failure, setFailure] = useState<{ message: string; output: string | null } | null>(null)

  useEffect(() => {
    let active = true
    void fetch(`/dsh-marketplace/api/plugin/${encodeURIComponent(plugin.id)}`)
      .then(async response => {
        if (!response.ok) throw new Error(`detail ${response.status}`)
        if (active) setDetail(await response.json() as RegistryPluginDetail)
      })
      .catch(() => { if (active) setLoadingFailed(true) })
    return () => { active = false }
  }, [plugin.id])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !running.current) onClose()
      if (event.key !== 'Tab' || dialog.current === null) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button, a[href], input')]
        .filter(element => !element.hasAttribute('disabled'))
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

  const install = async () => {
    running.current = true
    setStatus('running')
    setFailure(null)
    try {
      await runMutation('install', { pluginId: plugin.id, allowBuildScripts })
      setStatus('success')
      onInstalled()
    } catch (error) {
      setStatus('failed')
      setFailure(error instanceof MutationFailure
        ? { message: error.message, output: error.output }
        : { message: t('operationFailed'), output: null })
    } finally {
      running.current = false
    }
  }

  const requiresApproval = detail?.install.requiresBuildApproval === true
  const installable = detail?.install.available === true
  return (
    <div role="presentation" style={overlayStyle} onMouseDown={event => {
      if (event.target === event.currentTarget && status !== 'running') onClose()
    }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="install-dialog-title" style={dialogStyle}>
        <button ref={close} type="button" aria-label={t('close')} disabled={status === 'running'} onClick={onClose} style={{ float: 'right' }}>×</button>
        <h2 id="install-dialog-title">{t('installPlugin')}</h2>
        <h3>{plugin.install.packageName ?? plugin.name}</h3>
        <p>{plugin.slug}</p>
        {detail === null && !loadingFailed && <p role="status">{t('loading')}</p>}
        {loadingFailed && <p role="alert">{t('unavailable')}</p>}
        {detail !== null && (
          <>
            <dl>
              <dt>{t('source')}</dt><dd>{detail.install.preferred ?? '—'}</dd>
              <dt>{t('package')}</dt><dd>{detail.install.spec ?? '—'}</dd>
            </dl>
            {!detail.install.available && <p role="alert">{detail.install.reason ?? t('installUnavailable')}</p>}
            <p>{t('thirdPartyWarning')}</p>
            {requiresApproval && (
              <label>
                <input type="checkbox" checked={allowBuildScripts} disabled={status === 'running'}
                  onChange={event => setAllowBuildScripts(event.currentTarget.checked)} />
                {t('allowBuildScripts')}
              </label>
            )}
          </>
        )}
        {status === 'success' && <p role="status">{t('installedSuccessfully')} {t('restartRequired')}</p>}
        {failure !== null && (
          <div role="alert">
            <p>{failure.message}</p>
            {failure.output !== null && <details><summary>{t('commandOutput')}</summary><pre>{failure.output}</pre></details>}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1rem' }}>
          <a href={plugin.repositoryUrl} target="_blank" rel="noopener noreferrer">{t('openGitHub')}</a>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={status === 'running'} onClick={onClose}>{status === 'success' ? t('close') : t('cancel')}</button>
            {status !== 'success' && <button type="button"
              disabled={!installable || status === 'running' || (requiresApproval && !allowBuildScripts)}
              onClick={() => void install()}>{status === 'running' ? t('installing') : t('install')}</button>}
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
  background: 'var(--dsh-background, #fff)', color: 'inherit', borderRadius: '0.75rem', padding: '1.25rem',
} as const
