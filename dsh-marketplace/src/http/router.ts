import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RegistryService } from '../registry/service.js'
import type { InstalledService } from '../manager/installed.js'
import type { MutationManager } from '../manager/mutations.js'
import { API_PREFIX } from '../shared/constants.js'
import { MarketplaceError } from '../shared/errors.js'
import { sendError, sendJson } from './json.js'
import { installRequestSchema, packageRequestSchema, readJsonBody, verifySameOrigin } from './security.js'

export function createRouter(services: {
  registry: RegistryService
  installed: InstalledService
  mutations: MutationManager
}): (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> {
  return async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/catalog`) {
        sendJson(response, 200, await services.registry.getCatalog(url.searchParams.get('refresh') === '1'))
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith(`${API_PREFIX}/plugin/`)) {
        const id = decodeURIComponent(url.pathname.slice(`${API_PREFIX}/plugin/`.length))
        sendJson(response, 200, await services.registry.getPlugin(id))
        return
      }
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/installed`) {
        sendJson(response, 200, await services.installed.list())
        return
      }
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/status`) {
        sendJson(response, 200, { ok: true })
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/install`) {
        verifySameOrigin(request)
        const body = installRequestSchema.safeParse(await readJsonBody(request))
        if (!body.success) throw new MarketplaceError('invalid-request', 'Install request is invalid.', 400)
        sendJson(response, 200, await services.mutations.install(body.data.pluginId, body.data.allowBuildScripts))
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/update`) {
        verifySameOrigin(request)
        const body = packageRequestSchema.safeParse(await readJsonBody(request))
        if (!body.success) throw new MarketplaceError('invalid-request', 'Update request is invalid.', 400)
        sendJson(response, 200, await services.mutations.update(body.data.packageName))
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/remove`) {
        verifySameOrigin(request)
        const body = packageRequestSchema.safeParse(await readJsonBody(request))
        if (!body.success) throw new MarketplaceError('invalid-request', 'Remove request is invalid.', 400)
        sendJson(response, 200, await services.mutations.remove(body.data.packageName))
        return
      }
      throw new MarketplaceError('invalid-request', 'Route was not found.', 404)
    } catch (error) {
      sendError(response, error)
    }
  }
}
