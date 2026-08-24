import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RegistryService } from '../registry/service.js'
import type { InstalledService } from '../manager/installed.js'
import type { MutationManager } from '../manager/mutations.js'
import { API_PREFIX } from '../shared/constants.js'
import { MarketplaceError } from '../shared/errors.js'
import { sendCatalog, sendError, sendJson } from './json.js'
import {
  catalogRefreshRequested,
  installRequestSchema,
  packageRequestSchema,
  readJsonBody,
  requireNoQuery,
  verifySameOrigin,
} from './security.js'

export function createRouter(services: {
  registry: RegistryService
  installed: InstalledService
  mutations: MutationManager
  serverPort: number
}): (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> {
  return async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/catalog`) {
        sendCatalog(request, response, await services.registry.getCatalog(catalogRefreshRequested(url)))
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith(`${API_PREFIX}/plugin/`)) {
        requireNoQuery(url)
        let id: string
        try {
          id = decodeURIComponent(url.pathname.slice(`${API_PREFIX}/plugin/`.length))
        } catch {
          throw new MarketplaceError('invalid-plugin-id', 'Plugin id is invalid.', 400)
        }
        sendJson(response, 200, await services.registry.getPlugin(id))
        return
      }
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/installed`) {
        requireNoQuery(url)
        sendJson(response, 200, await services.installed.list())
        return
      }
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/status`) {
        requireNoQuery(url)
        sendJson(response, 200, { ok: true })
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/install`) {
        requireNoQuery(url)
        verifySameOrigin(request, services.serverPort)
        const body = installRequestSchema.safeParse(await readJsonBody(request))
        if (!body.success) throw new MarketplaceError('invalid-request', 'Install request is invalid.', 400)
        sendJson(response, 200, await services.mutations.install(body.data.pluginId, body.data.allowBuildScripts))
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/update`) {
        requireNoQuery(url)
        verifySameOrigin(request, services.serverPort)
        const body = packageRequestSchema.safeParse(await readJsonBody(request))
        if (!body.success) throw new MarketplaceError('invalid-request', 'Update request is invalid.', 400)
        sendJson(response, 200, await services.mutations.update(body.data.packageName))
        return
      }
      if (request.method === 'POST' && url.pathname === `${API_PREFIX}/remove`) {
        requireNoQuery(url)
        verifySameOrigin(request, services.serverPort)
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
