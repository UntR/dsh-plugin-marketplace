import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { gt, valid } from 'semver'
import type { RegistryService } from '../registry/service.js'
import { CACHE_TTL_MS, FETCH_TIMEOUT_MS } from '../shared/constants.js'
import { MarketplaceError } from '../shared/errors.js'
import type { RegistryIndexEntry } from '../shared/schema.js'
import type { CurrentProfile } from './profile.js'

export type InstalledSourceKind = 'npm' | 'github' | 'local' | 'url'
export type InstalledUpdateStatus = 'available' | 'current' | 'unknown' | 'source'

export interface InstalledPlugin {
  packageName: string
  version: string | null
  dependencySpec: string
  registryId: string | null
  registryVersion: string | null
  registryEntry: RegistryIndexEntry | null
  display: {
    name: string
    description: string | null
    owner: string | null
    coverUrl: string | null
    repositoryUrl: string | null
  }
  source: { kind: InstalledSourceKind }
  update: {
    status: InstalledUpdateStatus
    available: boolean
    latestVersion: string | null
    canUpdate: boolean
  }
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

interface RepositoryInfo {
  url: string | null
  slug: string | null
}

function repositoryInfo(value: unknown): RepositoryInfo {
  let source: string | null = null
  if (typeof value === 'string') source = value
  else if (typeof value === 'object' && value !== null) {
    const url = (value as Record<string, unknown>).url
    if (typeof url === 'string') source = url
  }
  if (source === null) return { url: null, slug: null }
  const normalized = source.trim()
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git(?:#.*)?$/, '')
    .replace(/\/$/, '')
  const slug = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/i.exec(normalized)?.[1]?.toLowerCase() ?? null
  if (slug !== null) return { url: `https://github.com/${slug}`, slug }
  return { url: /^https?:\/\//.test(normalized) ? normalized : null, slug: null }
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

function sourceKind(spec: string): InstalledSourceKind {
  if (npmManaged(spec)) return 'npm'
  if (/^(?:github:|git\+(?:https?|ssh):\/\/github\.com\/|git@github\.com:)/i.test(spec)) return 'github'
  if (/^(?:file:|link:|workspace:|\.\.?[/\\]|[/\\])/.test(spec)) return 'local'
  return 'url'
}

function githubTarget(spec: string): string | null {
  const normalized = spec.trim()
    .replace(/^github:/i, 'https://github.com/')
    .replace(/^git\+/, '')
    .replace(/^ssh:\/\/git@github\.com\//i, 'https://github.com/')
    .replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/^git:\/\/github\.com\//i, 'https://github.com/')
  const match = /^https:\/\/github\.com\/([^/#]+\/[^/#]+?)(?:\.git)?#(.+)$/i.exec(normalized)
  return match === null ? null : `${match[1]?.toLowerCase()}#${match[2]}`
}

function sameGitHubTarget(left: string, right: string): boolean {
  const leftTarget = githubTarget(left)
  return leftTarget !== null && leftTarget === githubTarget(right)
}

export interface InstalledServiceOptions {
  fetch?: typeof globalThis.fetch
  now?: () => number
}

export class InstalledService {
  private restartRequired = false
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly now: () => number
  private readonly npmVersions = new Map<string, { version: string | null; expiresAt: number }>()

  constructor(
    private readonly profile: CurrentProfile,
    private readonly registry: RegistryService,
    options: InstalledServiceOptions = {},
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch
    this.now = options.now ?? Date.now
  }

  get profileName(): string {
    return this.profile.name
  }

  markRestartRequired(): void {
    this.restartRequired = true
  }

  private async latestNpmVersion(packageName: string): Promise<string | null> {
    const cached = this.npmVersions.get(packageName)
    if (cached !== undefined && cached.expiresAt > this.now()) return cached.version
    let version: string | null = null
    try {
      const encoded = packageName.startsWith('@')
        ? `@${encodeURIComponent(packageName.slice(1))}`
        : encodeURIComponent(packageName)
      const response = await this.fetchImpl(`https://registry.npmjs.org/${encoded}/latest`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (response.ok) {
        const value: unknown = await response.json()
        const npmVersion = typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>).version
          : null
        if (typeof npmVersion === 'string') {
          version = npmVersion
        }
      }
    } catch {
      // An unavailable or private registry should not hide locally installed plugins.
    }
    this.npmVersions.set(packageName, { version, expiresAt: this.now() + CACHE_TTL_MS })
    return version
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
    const catalog = await this.registry.getCatalog().catch(() => ({ plugins: [] }))
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
      const repository = repositoryInfo(manifest.repository)
      const match = registryMatch(packageName, repository.slug, catalog.plugins)
      const source = sourceKind(dependencyValue)
      let currentGitHubSource = false
      if (source === 'github' && match !== null) {
        const detail = await this.registry.getPlugin(match.id).catch(() => null)
        currentGitHubSource = detail?.install.available === true
          && detail.install.preferred === 'github'
          && detail.install.spec !== null
          && sameGitHubTarget(dependencyValue, detail.install.spec)
      }
      const latestVersion = source === 'npm'
        ? match?.install.version ?? await this.latestNpmVersion(packageName)
        : null
      const comparable = version !== null && latestVersion !== null
        && valid(version) !== null && valid(latestVersion) !== null
      const available = comparable && gt(latestVersion, version)
      const status: InstalledUpdateStatus = source === 'github'
        ? currentGitHubSource ? 'current' : 'source'
        : source !== 'npm' ? 'source'
        : comparable ? available ? 'available' : 'current' : 'unknown'
      plugins.push({
        packageName,
        version,
        dependencySpec: dependencyValue,
        registryId: match?.id ?? null,
        registryVersion: match?.install.version ?? null,
        registryEntry: match,
        display: {
          name: match?.name ?? (typeof manifest.name === 'string' ? manifest.name : packageName),
          description: match?.description ?? (typeof manifest.description === 'string' ? manifest.description : null),
          owner: match?.owner.login ?? null,
          coverUrl: match?.coverUrl ?? null,
          repositoryUrl: match?.repositoryUrl ?? repository.url,
        },
        source: { kind: source },
        update: {
          status,
          available,
          latestVersion: comparable ? latestVersion : null,
          canUpdate: available || (source === 'github' && !currentGitHubSource),
        },
        self: packageName === 'untr-dsh-marketplace',
      })
    }
    plugins.sort((left, right) => left.packageName.localeCompare(right.packageName, 'en'))
    return { profile: this.profile.name, plugins, restartRequired: this.restartRequired }
  }
}
