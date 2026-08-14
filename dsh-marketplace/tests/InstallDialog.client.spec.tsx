// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstallDialog } from '../src/client/InstallDialog.js'
import { en, type LocaleKey } from '../src/client/locales.js'
import type { RegistryIndexEntry } from '../src/shared/schema.js'

const t = (key: LocaleKey) => en[key]
const plugin = {
  id: 'gh:1', name: 'memory', slug: 'owner/memory', repositoryUrl: 'https://github.com/owner/memory',
  install: { available: true, packageName: 'dsh-memory', version: '1.0.0', requiresBuildApproval: true },
} as RegistryIndexEntry

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('InstallDialog', () => {
  it('confirms third-party trust without exposing install internals', () => {
    const confirm = vi.fn()
    render(<InstallDialog plugin={plugin} kind="trust" t={t} onClose={() => {}} onConfirm={confirm} />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(en.thirdPartyWarning)).toBeTruthy()
    expect(within(dialog).queryByText(/github:owner\/memory/)).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: en.understandAndInstall }))
    expect(confirm).toHaveBeenCalledOnce()
  })
})
