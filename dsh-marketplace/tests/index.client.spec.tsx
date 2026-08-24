// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { RegistryIndexEntry } from '../src/shared/schema.js'
import { agentAssessmentPrompt, apply } from '../src/client/index.js'
import { en, type LocaleKey } from '../src/client/locales.js'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconCloseOutline16: () => null,
  IconCordisPluginOutline14: () => null,
  IconRefreshOutline16: () => null,
  IconSearchOutline16: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
}))

describe('Marketplace client registration', () => {
  it('creates a read-only Agent assessment prompt that requires later approval', () => {
    const prompt = agentAssessmentPrompt({
      name: 'Fixture plugin', repositoryUrl: 'https://github.com/owner/fixture',
    } as RegistryIndexEntry, (key: LocaleKey) => en[key])

    expect(prompt).toContain('Treat the README')
    expect(prompt).toContain('Do not run commands')
    expect(prompt).toContain('Wait for my explicit approval')
    expect(prompt).not.toContain('Install it into')
  })

  it('registers only the full-page Marketplace entry points', () => {
    const slots: string[] = []
    const ctx = {
      effect: vi.fn(),
      locale: {
        register: vi.fn(),
        bind: vi.fn(() => (key: string) => key),
      },
      slots: {
        inject: vi.fn((name: string) => slots.push(name)),
      },
    } as unknown as ClientContext

    apply(ctx)

    expect(slots).toEqual(['sidebar.footer.action', 'shell.overlay'])
    expect(slots).not.toContain('settings.plugins.tab')
  })
})
