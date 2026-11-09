import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { registryIndexSchema } from './schema.js'
import { nativeIndex } from './native.js'
import { parseMarketIndex } from '../vendor/plugin-market-index/index.js'
import { stableStringify } from './stable-json.js'
const [registry, proofDir, version, output] = process.argv.slice(2)
if (!registry || !proofDir || !version || !output || process.argv.length !== 6) {
  throw new Error('Usage: native-cli.ts REGISTRY PROOFS ACTUAL_DSH_VERSION OUTPUT_DIRECTORY')
}
const index = registryIndexSchema.parse(JSON.parse(await readFile(join(resolve(registry), 'index.json'), 'utf8')))
const proofs = new Map<string, unknown>()
for (const entry of index.plugins) {
  try { proofs.set(entry.id, JSON.parse(await readFile(join(resolve(proofDir), `${entry.githubDatabaseId}.json`), 'utf8'))) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}
for (const entry of index.plugins) {
  const proof = proofs.get(entry.id) as { source?: { type?: string; commit?: string } } | undefined
  if (proof?.source?.type === 'git') {
    const detail = JSON.parse(await readFile(join(resolve(registry), entry.detailPath), 'utf8'))
    if (proof.source.commit !== detail.github.headSha) proofs.delete(entry.id)
  }
}
const result = nativeIndex(index.plugins, proofs, version === 'auto' ? undefined : version)
parseMarketIndex(result.index, 'https://untr.github.io/dsh-plugin-marketplace/market-index.json')
await mkdir(resolve(output), { recursive: true })
await writeFile(join(resolve(output), 'index.json'), stableStringify(result.index))
await writeFile(join(resolve(output), 'report.json'), stableStringify(result.report))
console.log(JSON.stringify({ accepted: result.report.accepted, excluded: result.report.excluded.length }))
