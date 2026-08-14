import { describe, expect, it, vi } from 'vitest'
import type { RegistryService } from '../src/registry/service.js'
import type { CommandRunner } from '../src/manager/command-runner.js'
import type { InstalledService } from '../src/manager/installed.js'
import { MutationManager } from '../src/manager/mutations.js'

describe('MutationManager', () => {
  it('serializes all plugin mutations with one mutex', async () => {
    let release: (() => void) | undefined
    const runner = {
      run: vi.fn(() => new Promise<{ output: string }>(resolve => { release = () => resolve({ output: 'ok' }) })),
    } as unknown as CommandRunner
    const registry = { getPlugin: async () => ({
      install: {
        available: true, spec: 'dsh-example@1.0.0', packageName: 'dsh-example', version: '1.0.0',
        requiresBuildApproval: false, reason: null,
      },
    }) } as unknown as RegistryService
    const installed = { profileName: 'web', markRestartRequired: vi.fn() } as unknown as InstalledService
    const manager = new MutationManager(registry, installed, runner)
    const first = manager.install('gh:1', false)
    await expect(manager.install('gh:2', false)).rejects.toMatchObject({ code: 'operation-in-progress', status: 409 })
    release?.()
    await expect(first).resolves.toMatchObject({ ok: true, restartRequired: true })
  })

  it('does not run build scripts even when browser approval is present', async () => {
    const registry = { getPlugin: async () => ({
      install: {
        available: true, spec: 'github:owner/repo#abc', packageName: 'dsh-source', version: '1.0.0',
        requiresBuildApproval: true, reason: null,
      },
    }) } as unknown as RegistryService
    const runner = { run: vi.fn() } as unknown as CommandRunner
    const installed = { profileName: 'web', markRestartRequired: vi.fn() } as unknown as InstalledService
    await expect(new MutationManager(registry, installed, runner).install('gh:1', true))
      .rejects.toMatchObject({ code: 'build-approval-required' })
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('logs mutation lifecycle without command output', async () => {
    const registry = { getPlugin: async () => ({
      install: {
        available: true, spec: 'dsh-example@1.0.0', packageName: 'dsh-example', version: '1.0.0',
        requiresBuildApproval: false, reason: null,
      },
    }) } as unknown as RegistryService
    const runner = { run: vi.fn(async () => ({ output: 'secret command output' })) } as unknown as CommandRunner
    const installed = { profileName: 'web', markRestartRequired: vi.fn() } as unknown as InstalledService
    const logger = { info: vi.fn(), warn: vi.fn() }

    await new MutationManager(registry, installed, runner, logger).install('gh:1', false)

    expect(logger.info).toHaveBeenNthCalledWith(1, 'Plugin %s started for %s.', 'install', 'gh:1')
    expect(logger.info).toHaveBeenNthCalledWith(2, 'Plugin %s succeeded for %s.', 'install', 'gh:1')
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret command output')
  })
})
