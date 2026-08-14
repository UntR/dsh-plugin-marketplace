import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { gt, valid } from 'semver'
import type { RegistryService } from '../registry/service.js'
import { MarketplaceError } from '../shared/errors.js'
import type { RegistryIndexEntry } from '../shared/schema.js'
import type { CurrentProfile } from './profile.js'

export interface InstalledPlugin {
  packageName: string
  version: string | null
  dependencySpec: string
  registryId: string | null
  registryVersion: string | null
  update: { available: boolean; latestVersion: string | null }
  self: boolean
}

export interface InstalledState {
  profile: string
  plugins: InstalledPlugin[]
  restartRequired: boolean
}

function packageDirectory(profileDirectory: string, packageName: string): string | null {
  const resolver = createRequire(join(profileDirectory, 'package.json'))
  for (const searchPath of resolver.resolve.paths(packageName) ?? []) {
    const candidate = join(searchPath, packageName)
    if (existsSync(join(candidate, 'package.json'))) return candidate
  }
  return null
}

function normalizeRepository(value: unknown): string | null {
  let source: string | null = null
  if (typeof value === 'string') source = value
  else if (typeof value === 'object' && value !== null) {
    const url = (value as Record<string, unknown>).url
    if (typeof url === 'string') source = url
  }
  if (source === null) return null
  const normalized = source.trim()
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git(?:#.*)?$/, '')
    .replace(/\/$/, '')
  return /^https:\/\/github\.com\/([^/]+\/[^/]+)$/i.exec(normalized)?.[1]?.toLowerCase() ?? null
}

function registryMatch(
  packageName: string,
  repositorySlug: string | null,
  plugins: readonly RegistryIndexEntry[],
): RegistryIndexEntry | null {
  return plugins.find(plugin => plugin.install.packageName === packageName)
    ?? (repositorySlug === null ? null : plugins.find(plugin => plugin.slug.toLowerCase() === repositorySlug) ?? null)
}

function npmManaged(spec: string): boolean {
  return !/^(?:github:|git\+|git:|https?:|file:|link:|workspace:|\.\.?[/\\])/.test(spec)
}

export class InstalledService {
  private restartRequired = false

  constructor(
    private readonly profile: CurrentProfile,
    private readonly registry: RegistryService,
  ) {}

  get profileName(): string {
    return this.profile.name
  }

  markRestartRequired(): void {
    this.restartRequired = true
  }

  async list(): Promise<InstalledState> {
    let profileValue: unknown
    try {
      profileValue = JSON.parse(await readFile(join(this.profile.directory, 'package.json'), 'utf8'))
    } catch (error) {
      throw new MarketplaceError('internal', `Unable to read profile manifest: ${String(error)}`, 500)
    }
    if (typeof profileValue !== 'object' || profileValue === null || Array.isArray(profileValue)) {
      throw new MarketplaceError('internal', 'Profile manifest is invalid.', 500)
    }
    const dependenciesValue = (profileValue as Record<string, unknown>).dependencies
    const dependencies = typeof dependenciesValue === 'object' && dependenciesValue !== null && !Array.isArray(dependenciesValue)
      ? dependenciesValue as Record<string, unknown>
      : {}
    const catalog = await this.registry.getCatalog()
    const plugins: InstalledPlugin[] = []
    for (const [packageName, dependencyValue] of Object.entries(dependencies)) {
      if (typeof dependencyValue !== 'string') continue
      const directory = packageDirectory(this.profile.directory, packageName)
      if (directory === null) continue
      let packageValue: unknown
      try {
        packageValue = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
      } catch {
        continue
      }
      if (typeof packageValue !== 'object' || packageValue === null || Array.isArray(packageValue)) continue
      const manifest = packageValue as Record<string, unknown>
      const dsh = typeof manifest.dsh === 'object' && manifest.dsh !== null && !Array.isArray(manifest.dsh)
        ? manifest.dsh as Record<string, unknown>
        : null
      const bundle = dsh !== null && typeof dsh.bundle === 'object' && dsh.bundle !== null && !Array.isArray(dsh.bundle)
        ? dsh.bundle as Record<string, unknown>
        : null
      if (typeof bundle?.patch !== 'string') continue
      const version = typeof manifest.version === 'string' ? manifest.version : null
      const match = registryMatch(packageName, normalizeRepository(manifest.repository), catalog.plugins)
      const latestVersion = match?.install.version ?? null
      const comparable = version !== null && latestVersion !== null && npmManaged(dependencyValue)
        && valid(version) !== null && valid(latestVersion) !== null
      plugins.push({
        packageName,
        version,
        dependencySpec: dependencyValue,
        registryId: match?.id ?? null,
        registryVersion: latestVersion,
        update: {
          available: comparable && gt(latestVersion, version),
          latestVersion: comparable ? latestVersion : null,
        },
        self: packageName === 'dsh-marketplace',
      })
    }
    plugins.sort((left, right) => left.packageName.localeCompare(right.packageName, 'en'))
    return { profile: this.profile.name, plugins, restartRequired: this.restartRequired }
  }
}
