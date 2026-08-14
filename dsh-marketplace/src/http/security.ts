import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import { MarketplaceError } from '../shared/errors.js'

const MAX_BODY_BYTES = 64 * 1_024

export const installRequestSchema = z.object({
  pluginId: z.string().regex(/^gh:[0-9]+$/),
  allowBuildScripts: z.boolean(),
}).strict()

export const packageRequestSchema = z.object({
  packageName: z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i),
}).strict()

export function verifySameOrigin(request: Pick<IncomingMessage, 'headers'>): void {
  const origin = request.headers.origin
  if (origin === undefined) return
  const host = request.headers.host
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new MarketplaceError('cross-origin-request', 'Mutation origin is invalid.', 403)
  }
  if (host === undefined || originHost !== host) {
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

