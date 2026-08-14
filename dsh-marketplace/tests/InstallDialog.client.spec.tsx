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
  it('requires an explicit checkbox before enabling an install with build scripts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      install: {
        available: true, preferred: 'github', spec: 'github:owner/memory#abc', packageName: 'dsh-memory',
        version: '1.0.0', requiresBuildApproval: true, reason: null,
      },
    }), { status: 200 })))
    render(<InstallDialog plugin={plugin} t={t} onClose={() => {}} onInstalled={() => {}} />)
    const dialog = screen.getByRole('dialog')
    const checkbox = await within(dialog).findByRole('checkbox', { name: en.allowBuildScripts })
    const install = within(dialog).getByRole('button', { name: en.install })
    expect(install.hasAttribute('disabled')).toBe(true)
    fireEvent.click(checkbox)
    expect(install.hasAttribute('disabled')).toBe(false)
  })
})
