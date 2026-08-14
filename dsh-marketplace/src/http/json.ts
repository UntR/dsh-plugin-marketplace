import type { ServerResponse } from 'node:http'
import { MarketplaceError } from '../shared/errors.js'

export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(`${JSON.stringify(value)}\n`)
}

export function sendError(response: ServerResponse, error: unknown): void {
  const resolved = error instanceof MarketplaceError
    ? error
    : new MarketplaceError('internal', 'An internal error occurred.', 500)
  sendJson(response, resolved.status, {
    error: {
      code: resolved.code,
      message: resolved.message,
      ...(resolved.details === undefined ? {} : { details: resolved.details }),
    },
  })
}

