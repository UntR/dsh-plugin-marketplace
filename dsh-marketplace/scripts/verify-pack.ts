import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const tarballArgument = process.argv[2]
if (tarballArgument === undefined) throw new Error('Usage: verify-pack <tarball>')
const tarball = resolve(tarballArgument)
const directory = await mkdtemp(join(tmpdir(), 'dsh-marketplace-pack-'))
const required = [
  'package/lib/index.js',
  'package/lib/client.js',
  'package/lib/types/index.d.ts',
  'package/lib/types/client/index.d.ts',
  'package/cordis.patch.yml',
  'package/package.json',
  'package/README.md',
  'package/COMPATIBILITY.md',
  'package/LICENSE',
]

try {
  const listing = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n')
  for (const path of required) {
    if (!listing.includes(path)) throw new Error(`${basename(tarball)} is missing ${path}`)
  }
  execFileSync('tar', ['-xzf', tarball, '-C', directory])
  const manifest = JSON.parse(await readFile(join(directory, 'package', 'package.json'), 'utf8')) as Record<string, unknown>
  const serialized = JSON.stringify(manifest)
  for (const forbidden of ['workspace:', '../../deepseek-harness', '../deepseek-harness']) {
    if (serialized.includes(forbidden)) throw new Error(`Published manifest contains forbidden reference: ${forbidden}`)
  }
  process.stdout.write(`Verified ${basename(tarball)} (${listing.length} files)\n`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
