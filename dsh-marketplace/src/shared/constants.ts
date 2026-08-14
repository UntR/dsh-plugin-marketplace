export const API_PREFIX = '/dsh-marketplace/api'
export const CACHE_TTL_MS = 15 * 60 * 1_000
export const FETCH_TIMEOUT_MS = 10_000

// Replace this after assigning the public Pages repository.
// Development and mirrors can use DSH_MARKETPLACE_REGISTRY_URL immediately.
export const DEFAULT_REGISTRY_BASE_URL = 'https://example.invalid/dsh-plugin-registry/registry/v1'

export function resolveRegistryBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DSH_MARKETPLACE_REGISTRY_URL?.trim()
  const value = configured === undefined || configured === '' ? DEFAULT_REGISTRY_BASE_URL : configured
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('DSH_MARKETPLACE_REGISTRY_URL must be an absolute URL.')
  }
  const localHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('DSH_MARKETPLACE_REGISTRY_URL must use HTTPS, except on localhost.')
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('DSH_MARKETPLACE_REGISTRY_URL cannot contain credentials, query parameters, or a fragment.')
  }
  return url.toString().replace(/\/$/, '')
}
