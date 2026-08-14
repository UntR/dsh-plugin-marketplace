import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createRouter } from './http/router.js'
import { InstalledService } from './manager/installed.js'
import { CommandRunner } from './manager/command-runner.js'
import { MutationManager } from './manager/mutations.js'
import { resolveCurrentProfile } from './manager/profile.js'
import { RegistryService } from './registry/service.js'
import { resolveRegistryBaseUrl } from './shared/constants.js'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  const dshHome = resolveDshHome()
  const logger = ctx.logger('dsh-marketplace')
  const registry = new RegistryService({
    baseUrl: resolveRegistryBaseUrl(),
    cacheDir: join(dshHome, 'cache', 'dsh-marketplace', 'v1'),
    logger,
  })
  const installed = new InstalledService(resolveCurrentProfile(ctx.baseUrl, dshHome), registry)
  const mutations = new MutationManager(registry, installed, new CommandRunner(), logger)
  const handler = createRouter({ registry, installed, mutations })
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dsh-marketplace', handler }),
    'dsh-marketplace: HTTP API',
  )
}
