import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RegistryService } from '../registry/service.js'
import { API_PREFIX } from '../shared/constants.js'
import { MarketplaceError } from '../shared/errors.js'
import { sendError, sendJson } from './json.js'

export function createRouter(registry: RegistryService): (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> {
  return async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/catalog`) {
        sendJson(response, 200, await registry.getCatalog(url.searchParams.get('refresh') === '1'))
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith(`${API_PREFIX}/plugin/`)) {
        const id = decodeURIComponent(url.pathname.slice(`${API_PREFIX}/plugin/`.length))
        sendJson(response, 200, await registry.getPlugin(id))
        return
      }
      if (request.method === 'GET' && url.pathname === `${API_PREFIX}/status`) {
        sendJson(response, 200, { ok: true })
        return
      }
      throw new MarketplaceError('invalid-request', 'Route was not found.', 404)
    } catch (error) {
      sendError(response, error)
    }
  }
}

