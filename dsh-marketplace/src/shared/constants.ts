export const API_PREFIX = '/dsh-marketplace/api'
export const CACHE_TTL_MS = 15 * 60 * 1_000
export const FETCH_TIMEOUT_MS = 10_000

// The release workflow replaces this with the project's public Pages URL.
// Development and mirrors use DSH_MARKETPLACE_REGISTRY_URL.
export const DEFAULT_REGISTRY_BASE_URL = 'https://example.invalid/dsh-plugin-registry/registry/v1'

export function resolveRegistryBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.DSH_MARKETPLACE_REGISTRY_URL?.trim()
  return (configured === undefined || configured === '' ? DEFAULT_REGISTRY_BASE_URL : configured).replace(/\/$/, '')
}

