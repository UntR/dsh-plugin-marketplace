import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createRouter } from './http/router.js'
import { RegistryService } from './registry/service.js'
import { resolveRegistryBaseUrl } from './shared/constants.js'

export const inject = ['webServer']

export function apply(ctx: Context): void {
  const registry = new RegistryService({
    baseUrl: resolveRegistryBaseUrl(),
    cacheDir: join(resolveDshHome(), 'cache', 'dsh-marketplace', 'v1'),
  })
  const handler = createRouter(registry)
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: '/dsh-marketplace', handler }),
    'dsh-marketplace: HTTP API',
  )
}

