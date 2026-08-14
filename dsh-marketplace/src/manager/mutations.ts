import type { RegistryService } from '../registry/service.js'
import { MarketplaceError } from '../shared/errors.js'
import type { CommandRunner } from './command-runner.js'
import type { InstalledService } from './installed.js'

export interface MutationResult {
  ok: true
  plugin: { packageName: string; version: string | null }
  restartRequired: true
  output: string
}

export class MutationManager {
  private busy = false

  constructor(
    private readonly registry: RegistryService,
    private readonly installed: InstalledService,
    private readonly runner: CommandRunner,
  ) {}

  private async exclusive(operation: () => Promise<MutationResult>): Promise<MutationResult> {
    if (this.busy) throw new MarketplaceError('operation-in-progress', 'Another plugin operation is in progress.', 409)
    this.busy = true
    try {
      const result = await operation()
      this.installed.markRestartRequired()
      return result
    } finally {
      this.busy = false
    }
  }

  install(pluginId: string, allowBuildScripts: boolean): Promise<MutationResult> {
    return this.exclusive(async () => {
      const detail = await this.registry.getPlugin(pluginId)
      if (!detail.install.available || detail.install.spec === null || detail.install.packageName === null) {
        throw new MarketplaceError('plugin-not-installable', detail.install.reason ?? 'Plugin cannot be installed automatically.', 409)
      }
      if (detail.install.requiresBuildApproval) {
        const approval = allowBuildScripts ? 'was granted in the dialog' : 'is required'
        throw new MarketplaceError(
          'build-approval-required',
          `Build approval ${approval}, but the current DSH release requires manual allowBuilds configuration in the profile pnpm-workspace.yaml.`,
          409,
        )
      }
      const command = await this.runner.run([
        'plugin', '--profile', this.installed.profileName, 'add', detail.install.spec,
      ])
      return {
        ok: true,
        plugin: { packageName: detail.install.packageName, version: detail.install.version },
        restartRequired: true,
        output: command.output,
      }
    })
  }

  update(packageName: string): Promise<MutationResult> {
    return this.exclusive(async () => {
      const state = await this.installed.list()
      const plugin = state.plugins.find(item => item.packageName === packageName)
      if (plugin === undefined) throw new MarketplaceError('unknown-installed-plugin', 'Installed plugin was not found.', 404)
      let args: string[] = ['plugin', '--profile', this.installed.profileName, 'update', packageName]
      let version: string | null = null
      if (plugin.registryId !== null) {
        const detail = await this.registry.getPlugin(plugin.registryId)
        if (detail.install.available && detail.install.spec !== null) {
          if (detail.install.requiresBuildApproval) {
            throw new MarketplaceError(
              'build-approval-required',
              'This update requires manual allowBuilds configuration in the profile pnpm-workspace.yaml.',
              409,
            )
          }
          args = ['plugin', '--profile', this.installed.profileName, 'add', detail.install.spec]
          version = detail.install.version
        }
      }
      const command = await this.runner.run(args)
      return {
        ok: true,
        plugin: { packageName, version },
        restartRequired: true,
        output: command.output,
      }
    })
  }

  remove(packageName: string): Promise<MutationResult> {
    return this.exclusive(async () => {
      const state = await this.installed.list()
      const plugin = state.plugins.find(item => item.packageName === packageName)
      if (plugin === undefined) throw new MarketplaceError('unknown-installed-plugin', 'Installed plugin was not found.', 404)
      const command = await this.runner.run([
        'plugin', '--profile', this.installed.profileName, 'remove', packageName,
      ])
      return {
        ok: true,
        plugin: { packageName, version: plugin.version },
        restartRequired: true,
        output: command.output,
      }
    })
  }
}

