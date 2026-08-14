import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import { MarketplaceError } from '../shared/errors.js'

const MAX_BODY_BYTES = 64 * 1_024

export const installRequestSchema = z.object({
  pluginId: z.string().regex(/^gh:[0-9]+$/),
  allowBuildScripts: z.boolean(),
}).strict()

export const packageRequestSchema = z.object({
  packageName: z.string().max(214).regex(/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i),
}).strict()

export function requireNoQuery(url: URL): void {
  if ([...url.searchParams].length !== 0) {
    throw new MarketplaceError('invalid-request', 'This route does not accept query parameters.', 400)
  }
}

export function catalogRefreshRequested(url: URL): boolean {
  const parameters = [...url.searchParams]
  if (parameters.length === 0) return false
  if (parameters.length !== 1 || parameters[0]?.[0] !== 'refresh' || parameters[0][1] !== '1') {
    throw new MarketplaceError('invalid-request', 'Catalog query parameters are invalid.', 400)
  }
  return true
}

export function verifySameOrigin(
  request: Pick<IncomingMessage, 'headers'> & Partial<Pick<IncomingMessage, 'socket'>>,
): void {
  const origin = request.headers.origin
  if (origin === undefined) return
  const host = request.headers.host
  let originUrl: URL
  try {
    originUrl = new URL(origin)
  } catch {
    throw new MarketplaceError('cross-origin-request', 'Mutation origin is invalid.', 403)
  }
  const protocol = (request.socket as { encrypted?: boolean } | undefined)?.encrypted === true ? 'https:' : 'http:'
  if (host === undefined || originUrl.host !== host || originUrl.protocol !== protocol) {
    throw new MarketplaceError('cross-origin-request', 'Cross-origin mutation was rejected.', 403)
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
    throw new MarketplaceError('invalid-request', 'Content-Type must be application/json.', 415)
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunkValue of request) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new MarketplaceError('invalid-request', 'Request body is too large.', 413)
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new MarketplaceError('invalid-request', 'Request body must contain valid JSON.', 400)
  }
}
