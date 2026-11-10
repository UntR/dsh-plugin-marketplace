import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { GitHubClient } from './github.js'
import { formatSyncSummary, syncRegistry } from './sync.js'
import { loadCheckpoints, saveCheckpoint, clearCheckpoints } from './sync-checkpoint.js'
import { SyncPaused } from './sync-pause.js'

const token = process.env.REGISTRY_GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN
if (token === undefined || token.trim() === '') {
  throw new Error('Set REGISTRY_GITHUB_TOKEN, GH_TOKEN, or GITHUB_TOKEN to sync the Registry.')
}

const checkpointDirectory = resolve(import.meta.dirname, '../../registry-sync-state/v1')
const checkpoints = await loadCheckpoints(checkpointDirectory)
const seconds = Number(process.env.REGISTRY_SYNC_SECONDS ?? '1200')
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1200) throw new Error('REGISTRY_SYNC_SECONDS must be 1-1200')
const client = new GitHubClient({ token, maxDurationMs: seconds * 1000, maxRequests: 2500 })
let completed = 0
try {
  const summary = await syncRegistry({
    directory: resolve(import.meta.dirname, '../registry/v1'),
    graphql: client.graphql,
    enrichment: client,
    checkpoints,
    onDetail: async detail => {
      await saveCheckpoint(checkpointDirectory, detail)
      completed += 1
      if (completed % 100 === 0) process.stdout.write(`Checkpointed ${completed} repositories\n`)
    },
    allowLargeRemoval: process.env.REGISTRY_ALLOW_LARGE_REMOVAL === '1',
  })
  if (process.env.REGISTRY_SYNC_MANIFEST) await writeFile(resolve(process.env.REGISTRY_SYNC_MANIFEST), JSON.stringify(summary, undefined, 2) + '\n')
  await clearCheckpoints(checkpointDirectory)
  process.stdout.write(`${formatSyncSummary(summary)}\n`)
} catch (error) {
  if (!(error instanceof SyncPaused)) throw error
  process.stdout.write(`${error.message}; checkpointed=${completed}; published Registry preserved.\n`)
}
