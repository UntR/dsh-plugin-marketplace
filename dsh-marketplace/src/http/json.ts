import { gzipSync } from 'node:zlib'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Catalog } from '../registry/service.js'
import { MarketplaceError } from '../shared/errors.js'

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  options: {
    acceptEncoding?: string
    cacheControl?: string
    etag?: string
    varyAcceptEncoding?: boolean
  } = {},
): void {
  const body = Buffer.from(`${JSON.stringify(value)}\n`)
  const compressed = body.length >= 1_024 && options.acceptEncoding?.split(',').some(value => {
    const [encoding, ...parameters] = value.split(';').map(part => part.trim())
    if (encoding !== 'gzip' && encoding !== '*') return false
    const quality = parameters.find(parameter => parameter.startsWith('q='))
    return quality === undefined || Number(quality.slice(2)) > 0
  }) === true
  const output = compressed ? gzipSync(body) : body
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': options.cacheControl ?? 'no-store',
    'content-length': String(output.length),
    ...(compressed ? { 'content-encoding': 'gzip' } : {}),
    ...(options.varyAcceptEncoding === true ? { vary: 'accept-encoding' } : {}),
    ...(options.etag === undefined ? {} : { etag: options.etag }),
  })
  response.end(output)
}

export function sendCatalog(
  request: Pick<IncomingMessage, 'headers'>,
  response: ServerResponse,
  catalog: Catalog,
): void {
  const etag = `W/"${catalog.registry.revision}-${catalog.registry.stale ? 'stale' : 'fresh'}"`
  const cacheControl = 'private, max-age=0, must-revalidate'
  if (request.headers['if-none-match']?.split(',').some(value => value.trim() === etag) === true) {
    response.writeHead(304, { 'cache-control': cacheControl, etag, vary: 'accept-encoding' })
    response.end()
    return
  }
  sendJson(response, 200, catalog, {
    cacheControl,
    etag,
    varyAcceptEncoding: true,
    ...(request.headers['accept-encoding'] === undefined
      ? {}
      : { acceptEncoding: request.headers['accept-encoding'] }),
  })
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
