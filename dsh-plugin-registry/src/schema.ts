import { z } from 'zod'

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/)
const githubId = z.string().regex(/^gh:[0-9]+$/)
const dateTime = z.iso.datetime({ offset: true })
const nullableUrl = z.url().nullable()
const nonNegativeInteger = z.int().nonnegative()

const ownerSchema = z.object({
  login: z.string().min(1),
  avatarUrl: z.url(),
}).passthrough()

const installSummarySchema = z.object({
  available: z.boolean(),
  packageName: z.string().min(1).nullable(),
  version: z.string().min(1).nullable(),
  requiresBuildApproval: z.boolean(),
}).passthrough()

export const registryIndexEntrySchema = z.object({
  id: githubId,
  githubDatabaseId: z.int().positive(),
  githubNodeId: z.string().min(1),
  slug: z.string().regex(/^[^/]+\/[^/]+$/),
  name: z.string().min(1),
  owner: ownerSchema,
  repositoryUrl: z.url(),
  homepageUrl: nullableUrl,
  description: z.string(),
  coverUrl: nullableUrl,
  topics: z.array(z.string().min(1)),
  language: z.string().min(1).nullable(),
  license: z.string().min(1).nullable(),
  stats: z.object({
    stars: nonNegativeInteger,
    forks: nonNegativeInteger,
  }).passthrough(),
  state: z.object({
    archived: z.boolean(),
    fork: z.boolean(),
  }).passthrough(),
  timestamps: z.object({
    createdAt: dateTime,
    updatedAt: dateTime,
    pushedAt: dateTime.nullable(),
  }).passthrough(),
  install: installSummarySchema,
  detailPath: z.string().regex(/^\.\/plugins\/[0-9]+\.json$/),
}).passthrough()

export const registryMetaSchema = z.object({
  schemaVersion: z.literal(1),
  registryVersion: z.literal('1'),
  topic: z.literal('dsh-plugin'),
  revision: sha256,
  generatedAt: dateTime,
  pluginCount: nonNegativeInteger,
  indexPath: z.literal('./index.json'),
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

const installDetailSchema = z.object({
  available: z.boolean(),
  preferred: z.enum(['npm', 'github']).nullable(),
  spec: z.string().min(1).nullable(),
  packageName: z.string().min(1).nullable(),
  version: z.string().min(1).nullable(),
  requiresBuildApproval: z.boolean(),
  reason: z.string().min(1).nullable(),
}).passthrough()

export const registryPluginDetailSchema = z.object({
  schemaVersion: z.literal(1),
  id: githubId,
  github: z.object({
    databaseId: z.int().positive(),
    nodeId: z.string().min(1),
    slug: z.string().regex(/^[^/]+\/[^/]+$/),
    url: z.url(),
    defaultBranch: z.string().min(1).nullable(),
    headSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    owner: ownerSchema,
    description: z.string().nullable(),
    homepageUrl: nullableUrl,
    topics: z.array(z.string().min(1)),
    stars: nonNegativeInteger,
    forks: nonNegativeInteger,
    archived: z.boolean(),
    fork: z.boolean(),
    language: z.string().min(1).nullable(),
    license: z.object({
      spdxId: z.string().min(1).nullable(),
      name: z.string().min(1).nullable(),
    }).nullable(),
    createdAt: dateTime,
    updatedAt: dateTime,
    pushedAt: dateTime.nullable(),
    openGraphImageUrl: nullableUrl,
  }).passthrough(),
  presentation: z.object({
    description: z.string(),
    coverUrl: nullableUrl,
  }).passthrough(),
  readme: z.object({
    available: z.boolean(),
    excerpt: z.string(),
  }).passthrough(),
  package: packageSchema,
  bundle: z.object({
    detected: z.boolean(),
    patch: z.string().min(1).nullable(),
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
    latestVersion: z.string().min(1).nullable(),
    repositoryMatches: z.boolean().nullable(),
  }).passthrough(),
  install: installDetailSchema,
  crawl: z.object({
    headSha: z.string().regex(/^[0-9a-f]{40}$/).nullable(),
    enrichmentStatus: z.enum(['ok', 'partial', 'stale', 'failed']),
    enrichedAt: dateTime,
  }).passthrough(),
}).passthrough()

