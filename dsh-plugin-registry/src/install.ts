import { z } from 'zod'
import type { RegistryPluginDetail } from './types.js'

export interface PackageFacts {
  status: 'valid'
  name: string | null
  version: string | null
  type: string | null
  main: string | null
  exports?: unknown
  dshPatch: string | null
  scripts: {
    prepare: boolean
    preinstall: boolean
    install: boolean
    postinstall: boolean
  }
}

export type ParsedPackage = null | { status: 'invalid' } | PackageFacts

export type NpmFacts = RegistryPluginDetail['npm']
export type InstallFacts = RegistryPluginDetail['install']

const npmMetadataSchema = z.object({
  name: z.string().min(1),
  'dist-tags': z.object({ latest: z.string().min(1) }),
  repository: z.union([
    z.string().min(1),
    z.object({ url: z.string().min(1) }),
  ]).optional(),
})

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function parsePackageJson(raw: string | null): ParsedPackage {
  if (raw === null) return null
  let value: unknown
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ''))
  } catch {
    return { status: 'invalid' }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { status: 'invalid' }
  const pkg = value as Record<string, unknown>
  const scripts = typeof pkg.scripts === 'object' && pkg.scripts !== null && !Array.isArray(pkg.scripts)
    ? pkg.scripts as Record<string, unknown>
    : {}
  const dsh = typeof pkg.dsh === 'object' && pkg.dsh !== null && !Array.isArray(pkg.dsh)
    ? pkg.dsh as Record<string, unknown>
    : {}
  const bundle = typeof dsh.bundle === 'object' && dsh.bundle !== null && !Array.isArray(dsh.bundle)
    ? dsh.bundle as Record<string, unknown>
    : {}
  return {
    status: 'valid',
    name: optionalString(pkg.name),
    version: optionalString(pkg.version),
    type: optionalString(pkg.type),
    main: optionalString(pkg.main),
    ...(pkg.exports !== undefined ? { exports: pkg.exports } : {}),
    dshPatch: optionalString(bundle.patch),
    scripts: {
      prepare: typeof scripts.prepare === 'string',
      preinstall: typeof scripts.preinstall === 'string',
      install: typeof scripts.install === 'string',
      postinstall: typeof scripts.postinstall === 'string',
    },
  }
}

function normalizeRepository(value: string): string | null {
  const normalized = value.trim()
    .replace(/^git\+/, '')
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^github:/, 'https://github.com/')
    .replace(/^git:\/\/github\.com\//, 'https://github.com/')
    .replace(/\.git(?:#.*)?$/, '')
    .replace(/\/$/, '')
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/i.exec(normalized)
  return match?.[1]?.toLowerCase() ?? null
}

export function inspectNpmMetadata(value: unknown | null, repositorySlug: string): NpmFacts {
  if (value === null) return { published: false, latestVersion: null, repositoryMatches: null }
  const parsed = npmMetadataSchema.safeParse(value)
  if (!parsed.success) return { published: true, latestVersion: null, repositoryMatches: false }
  const repository = parsed.data.repository
  const repositoryUrl = typeof repository === 'string' ? repository : repository?.url
  return {
    published: true,
    latestVersion: parsed.data['dist-tags'].latest,
    repositoryMatches: repositoryUrl === undefined
      ? false
      : normalizeRepository(repositoryUrl) === repositorySlug.toLowerCase(),
  }
}

function packageEntryPoint(pkg: PackageFacts): string | null {
  if (pkg.main !== null) return pkg.main
  if (typeof pkg.exports === 'string') return pkg.exports
  if (typeof pkg.exports !== 'object' || pkg.exports === null || Array.isArray(pkg.exports)) return null
  const root = (pkg.exports as Record<string, unknown>)['.']
  if (typeof root === 'string') return root
  if (typeof root !== 'object' || root === null || Array.isArray(root)) return null
  const conditions = root as Record<string, unknown>
  for (const key of ['default', 'import', 'require']) {
    if (typeof conditions[key] === 'string') return conditions[key]
  }
  return null
}

export async function inferInstall(options: {
  package: ParsedPackage
  patchExists: boolean | null
  repositorySlug: string
  headSha: string | null
  npmMetadata: unknown | null
  fileExists: (path: string) => Promise<boolean>
}): Promise<{ npm: NpmFacts; install: InstallFacts }> {
  const unavailable = (reason: string, npm: NpmFacts): { npm: NpmFacts; install: InstallFacts } => ({
    npm,
    install: {
      available: false,
      preferred: null,
      spec: null,
      packageName: null,
      version: null,
      requiresBuildApproval: false,
      reason,
    },
  })
  if (options.package === null || options.package.status !== 'valid'
    || options.package.dshPatch === null || options.patchExists !== true) {
    return unavailable('Repository does not expose an installable DSH bundle.', {
      published: false,
      latestVersion: null,
      repositoryMatches: null,
    })
  }
  const pkg = options.package
  const npm = pkg.name === null
    ? { published: false, latestVersion: null, repositoryMatches: null }
    : inspectNpmMetadata(options.npmMetadata, options.repositorySlug)
  const requiresBuildApproval = Object.values(pkg.scripts).some(Boolean)
  if (pkg.name !== null && npm.latestVersion !== null && npm.repositoryMatches === true) {
    return {
      npm,
      install: {
        available: true,
        preferred: 'npm',
        spec: `${pkg.name}@${npm.latestVersion}`,
        packageName: pkg.name,
        version: npm.latestVersion,
        requiresBuildApproval,
        reason: null,
      },
    }
  }
  const entryPoint = packageEntryPoint(pkg)
  const sourceReady = entryPoint !== null && await options.fileExists(entryPoint)
  if (pkg.name !== null && options.headSha !== null && (sourceReady || pkg.scripts.prepare)) {
    return {
      npm,
      install: {
        available: true,
        preferred: 'github',
        spec: `github:${options.repositorySlug}#${options.headSha}`,
        packageName: pkg.name,
        version: pkg.version,
        requiresBuildApproval,
        reason: null,
      },
    }
  }
  return unavailable('Repository does not expose a ready package entry point.', npm)
}
