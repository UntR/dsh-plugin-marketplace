import { z } from 'zod'
import semver from 'semver'
import type { RegistryIndexEntry } from './types.js'
import { parseMarketIndex } from '../vendor/plugin-market-index/index.js'
import { PLUGIN_CATEGORIES } from './category.js'

// Constrained format1 adapter: exact npm sources with independently inspected archives.
// Git versions and unverified sources remain in the full Registry, never guessed.
const proofSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().regex(/^gh:[0-9]+$/),
  source: z.union([z.object({ type: z.literal('npm') }).strict(), z.object({ type: z.literal('git'), url: z.url(), commit: z.string().regex(/^[0-9a-f]{40}$/) }).strict()]), version: z.string(),
  manifest: z.object({
    name: z.string(), version: z.string(), description: z.string().optional(),
    homepage: z.string().optional(), author: z.unknown().optional(), repository: z.unknown(),
    engines: z.object({ dsh: z.string().min(1) }),
    dsh: z.object({ bundle: z.object({ patch: z.string().min(1) }) }),
    scripts: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  publishTime: z.iso.datetime({ offset: true }), integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/).optional(),
  archiveSha256: z.string().regex(/^[0-9a-f]{64}$/), patchSha256: z.string().regex(/^[0-9a-f]{64}$/),
  verifiedAt: z.number().finite(), verificationLevel: z.literal('metadata-verified'),
  distTags: z.record(z.string(), z.string()),
}).strict()

export function nativeEntry(entry: RegistryIndexEntry, value: unknown, clientVersion?: string, now = Date.now()) {
  const proof = proofSchema.parse(value); const manifest = proof.manifest
  if (clientVersion !== undefined && !semver.valid(clientVersion)) throw new Error('Actual target DSH version must be valid SemVer')
  if (proof.id !== entry.id || manifest.name !== entry.install.packageName || proof.version !== manifest.version
    || proof.version !== entry.install.version || !entry.install.available || entry.install.requiresBuildApproval) {
    throw new Error('Verified identity no longer matches current facts')
  }
  if (proof.verifiedAt * 1000 > now + 30000 || now - proof.verifiedAt * 1000 > 7 * 86400000) throw new Error('Verification proof expired')
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name)
    || manifest.name.length > 214 || manifest.name === 'node_modules' || manifest.name === 'favicon.ico') throw new Error('Invalid package name')
  if (!semver.valid(proof.version) || (proof.source.type === 'npm' && semver.valid(proof.version) !== proof.version) || !manifest.engines.dsh.trim() || !semver.validRange(manifest.engines.dsh)
    || (clientVersion !== undefined && !semver.satisfies(clientVersion, manifest.engines.dsh, { includePrerelease: true }))) throw new Error('Missing or incompatible declared engines.dsh')
  for (const key of ['prepare', 'preinstall', 'install', 'postinstall']) {
    if (manifest.scripts?.[key]) throw new Error('Lifecycle scripts require separate approval')
  }
  const repository = manifest.repository
  const rawUrl = typeof repository === 'string' ? repository
    : repository && typeof repository === 'object' ? (repository as { url?: unknown }).url : undefined
  if (typeof rawUrl !== 'string' || rawUrl.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '').toLowerCase()
    !== entry.repositoryUrl.toLowerCase()) throw new Error('Published repository identity mismatch')
  const published = Math.floor(Date.parse(proof.publishTime) / 1000)
  if (!Number.isSafeInteger(published) || published < 0 || published >= 1e11 || published * 1000 > now) throw new Error('Invalid publish timestamp')
  const distTags: Record<string, string> = {}
  for (const [tag, version] of Object.entries(proof.distTags)) {
    if (version === proof.version && /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(tag) && semver.validRange(tag) === null) distTags[tag] = version
  }
  // Preserve source display metadata. Market-authored AI data is only keywords/category.
  if (manifest.homepage) { const homepage = new URL(manifest.homepage); if (!['http:', 'https:'].includes(homepage.protocol)) throw new Error('Invalid manifest homepage') }
  if (proof.source.type === 'npm' && !proof.integrity) throw new Error('Npm archive integrity required')
  if (proof.source.type === 'git' && proof.source.url !== entry.repositoryUrl) throw new Error('Git source identity mismatch')
  const description = manifest.description?.trim()
  return {
    name: manifest.name,
    description: entry.ai ? { en: description || manifest.name, zh: entry.ai.summaryZh } : description || manifest.name,
    ...(typeof manifest.author === 'object' && manifest.author !== null
      && typeof (manifest.author as { name?: unknown }).name === 'string'
      && (manifest.author as { name: string }).name.trim() ? { author: (manifest.author as { name: string }).name } : {}),
    ...(manifest.homepage && /^https?:\/\//.test(manifest.homepage) ? { homepage: manifest.homepage } : {}),
    repository: { url: entry.repositoryUrl },
    metadata: { category: entry.category ?? 'other', labels: entry.ai ? ['ai-summary'] : [],
      keywords: [...entry.topics, ...(entry.ai?.tags ?? []), ...(entry.ai ? [entry.ai.summaryZh] : [])],
      sortKeys: { stars: entry.stats.stars } },
    'dist-tags': distTags,
    versions: [{ version: proof.version, publishTimestamp: published, source: proof.source, engines: { dsh: manifest.engines.dsh } }],
  }
}

export function nativeIndex(entries: readonly RegistryIndexEntry[], proofs: ReadonlyMap<string, unknown>, clientVersion?: string) {
  if (clientVersion !== undefined && !semver.valid(clientVersion)) throw new Error('Actual target DSH version must be valid SemVer')
  const excluded: Array<{ id: string; reason: string }> = []; const accepted: ReturnType<typeof nativeEntry>[] = []
  const names = new Set<string>()
  for (const entry of [...entries].sort((a, b) => Number(a.state.fork) - Number(b.state.fork) || b.stats.stars - a.stats.stars || a.id.localeCompare(b.id))) {
    try {
      const proof = proofs.get(entry.id)
      if (!proof) throw new Error('No independently verified npm archive')
      const plugin = nativeEntry(entry, proof, clientVersion)
      if (names.has(plugin.name)) throw new Error('Duplicate package identity')
      parseMarketIndex({ format: 1, title: 'Validation', metadata: {
        categories: Object.fromEntries(PLUGIN_CATEGORIES.map(id => [id, { title: id }])),
        labels: { 'ai-summary': { title: 'AI summary' } }, sortKeys: { stars: { title: 'Stars', order: 'desc' } },
      }, plugins: [plugin] }, 'https://untr.github.io/dsh-plugin-marketplace/market-index.json')
      names.add(plugin.name); accepted.push(plugin)
    } catch (error) { excluded.push({ id: entry.id, reason: error instanceof Error ? error.message : 'Invalid proof' }) }
  }
  return {
    index: { format: 1, title: { en: 'DSH Community Plugins', zh: 'DSH 社区插件' },
      description: { en: 'Metadata-verified community packages; installation is not tested.', zh: '已核验元信息的社区包；未进行安装实测。' },
      metadata: { categories: Object.fromEntries(PLUGIN_CATEGORIES.map(id => [id, { title: { en: id } }])),
        labels: { 'ai-summary': { title: { en: 'AI summary', zh: 'AI 中文简介' } } }, sortKeys: { stars: { title: { en: 'GitHub stars', zh: 'GitHub 星数' }, order: 'desc' } } },
      plugins: accepted },
    report: { clientVersion: clientVersion ?? null, accepted: accepted.length, excluded },
  }
}
