import { z } from 'zod'
import { PLUGIN_CATEGORIES } from './category.js'

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const githubId = z.string().regex(/^gh:[0-9]+$/)
const dateTime = z.iso.datetime({ offset: true })
const nullableUrl = z.url().nullable()
const nonNegativeInteger = z.int().nonnegative()
export const pluginCategorySchema = z.enum(PLUGIN_CATEGORIES)

function aiText(min: number, max: number) {
  return z.string().refine(value => Array.from(value).length >= min && Array.from(value).length <= max,
    `Expected ${min}–${max} Unicode characters`).meta({ minLength: min, maxLength: max })
}
export const aiResultSchema = z.object({
  id: githubId,
  summary_zh: aiText(15, 140),
  category: pluginCategorySchema,
  tags: z.array(aiText(1, 30)).min(2).max(5),
  confidence: z.number().min(0).max(1),
  insufficient_evidence: z.boolean(),
  evidence: z.array(z.object({
    paragraph_id: z.string().min(1), quote: aiText(20, 120), fact: aiText(1, 300),
  }).strict()).min(1).max(3),
  limitations: z.array(aiText(1, 300)).max(5),
}).strict()

export const aiPublicSchema = z.object({
  status: z.literal('approved'),
  summaryZh: aiText(15, 140),
  tags: z.array(aiText(1, 30)).min(2).max(5),
  sourceInputHash: sha256,
  sourceHeadSha: z.string().regex(/^[0-9a-f]{40}$/),
  model: z.string().min(1), promptVersion: z.string().min(1),
  reviewLevel: z.enum(['human-reviewed', 'batch-approved', 'automated']), reviewedAt: dateTime,
  originalDescription: z.string(),
  limitations: z.array(aiText(1, 300)).max(5),
  evidence: aiResultSchema.shape.evidence,
}).strict()

export const registryMetaSchema = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.literal('1'),
  topic: z.literal('dsh-plugin'),
  revision: sha256,
  generatedAt: dateTime,
  pluginCount: nonNegativeInteger,
  indexPath: z.literal('./index.json'),
}).passthrough()

export const registryIndexEntrySchema = z.object({
  id: githubId,
  githubDatabaseId: z.int().positive(),
  githubNodeId: z.string().min(1),
  slug: z.string().regex(/^[^/]+\/[^/]+$/),
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1), avatarUrl: z.url() }).passthrough(),
  repositoryUrl: z.url(),
  homepageUrl: nullableUrl,
  description: z.string(),
  ai: aiPublicSchema.optional(),
  coverUrl: nullableUrl,
  category: pluginCategorySchema.optional(),
  topics: z.array(z.string().min(1)),
  language: z.string().min(1).nullable(),
  license: z.string().min(1).nullable(),
  stats: z.object({ stars: nonNegativeInteger, forks: nonNegativeInteger }).passthrough(),
  state: z.object({ archived: z.boolean(), fork: z.boolean() }).passthrough(),
  timestamps: z.object({
    createdAt: dateTime,
    updatedAt: dateTime,
    pushedAt: dateTime.nullable(),
  }).passthrough(),
  install: z.object({
    available: z.boolean(),
    packageName: z.string().min(1).nullable(),
    version: z.string().min(1).nullable(),
    requiresBuildApproval: z.boolean(),
  }).passthrough(),
  detailHash: sha256.optional(),
  detailPath: z.string().regex(/^\.\/plugins\/[0-9]+\.json$/),
}).passthrough()

export const registryIndexSchema = z.object({
  schemaVersion: z.literal(1),
  revision: sha256,
  plugins: z.array(registryIndexEntrySchema),
}).passthrough()

const packageSchema = z.union([
  z.null(),
  z.object({ status: z.literal('invalid') }).passthrough(),
  z.object({
    status: z.literal('valid'),
    name: z.string().min(1).nullable(),
    version: z.string().min(1).nullable(),
    type: z.string().min(1).nullable(),
    main: z.string().min(1).nullable(),
    exports: z.unknown().optional(),
  }).passthrough(),
])

export const registryPluginDetailSchema = z.object({
  schemaVersion: z.literal(1),
  id: githubId,
  ai: aiPublicSchema.optional(),
  github: z.object({
    databaseId: z.int().positive(),
    nodeId: z.string().min(1),
    slug: z.string().regex(/^[^/]+\/[^/]+$/),
    url: z.url(),
    defaultBranch: z.string().min(1).nullable(),
    headSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    owner: z.object({ login: z.string().min(1), avatarUrl: z.url() }).passthrough(),
    description: z.string().nullable(),
    homepageUrl: nullableUrl,
    topics: z.array(z.string()),
    stars: nonNegativeInteger,
    forks: nonNegativeInteger,
    archived: z.boolean(),
    fork: z.boolean(),
    language: z.string().nullable(),
    license: z.object({ spdxId: z.string().nullable(), name: z.string().nullable() }).nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
    pushedAt: dateTime.nullable(),
    openGraphImageUrl: nullableUrl,
  }).passthrough(),
  presentation: z.object({ description: z.string(), coverUrl: nullableUrl }).passthrough(),
  readme: z.object({ available: z.boolean(), excerpt: z.string() }).passthrough(),
  package: packageSchema,
  bundle: z.object({
    detected: z.boolean(),
    patch: z.string().nullable(),
    patchExists: z.boolean().nullable(),
  }).passthrough(),
  scripts: z.object({
    prepare: z.boolean(),
    preinstall: z.boolean(),
    install: z.boolean(),
    postinstall: z.boolean(),
  }).passthrough(),
  npm: z.object({
    published: z.boolean(),
    latestVersion: z.string().nullable(),
    repositoryMatches: z.boolean().nullable(),
  }).passthrough(),
  install: z.object({
    available: z.boolean(),
    preferred: z.enum(['npm', 'github']).nullable(),
    spec: z.string().nullable(),
    packageName: z.string().nullable(),
    version: z.string().nullable(),
    requiresBuildApproval: z.boolean(),
    reason: z.string().nullable(),
  }).passthrough(),
  crawl: z.object({
    headSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    enrichmentStatus: z.enum(['ok', 'partial', 'stale', 'failed']),
    enrichedAt: dateTime,
  }).passthrough(),
}).passthrough()

export type RegistryMeta = z.infer<typeof registryMetaSchema>
export type RegistryIndex = z.infer<typeof registryIndexSchema>
export type RegistryIndexEntry = z.infer<typeof registryIndexEntrySchema>
export type RegistryPluginDetail = z.infer<typeof registryPluginDetailSchema>
