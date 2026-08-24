import { resolve } from 'node:path'
import { GitHubClient } from './github.js'
import { formatSyncSummary, syncRegistry } from './sync.js'

const token = process.env.REGISTRY_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
if (token === undefined || token.trim() === '') {
  throw new Error('Set REGISTRY_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN to sync the Registry.')
}

const client = new GitHubClient({ token })
const summary = await syncRegistry({
  directory: resolve(import.meta.dirname, '../registry/v1'),
  graphql: client.graphql,
  enrichment: client,
  allowLargeRemoval: process.env.REGISTRY_ALLOW_LARGE_REMOVAL === '1',
})
process.stdout.write(`${formatSyncSummary(summary)}\n`)
