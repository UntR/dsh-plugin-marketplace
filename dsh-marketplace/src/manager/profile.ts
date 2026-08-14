import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MarketplaceError } from '../shared/errors.js'

export interface CurrentProfile {
  name: string
  directory: string
}

export function resolveCurrentProfile(baseUrl: string | undefined, dshHome: string): CurrentProfile {
  if (baseUrl === undefined) {
    throw new MarketplaceError('internal', 'DSH runtime did not provide a profile base URL.', 500)
  }
  const directory = resolve(fileURLToPath(baseUrl))
  const profilesRoot = resolve(dshHome, 'profiles')
  const name = relative(profilesRoot, directory)
  if (name === '' || name === '.' || name === '..' || name.startsWith(`..${sep}`)
    || name.includes('/') || name.includes('\\')) {
    throw new MarketplaceError('internal', 'DSH runtime directory is not a valid profile.', 500)
  }
  return { name, directory }
}

