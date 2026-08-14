import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { MarketplaceError } from '../shared/errors.js'

const OUTPUT_LIMIT = 64 * 1_024
const COMMAND_TIMEOUT_MS = 5 * 60 * 1_000

export type SpawnProcess = typeof spawn

export function resolveDshCliPath(argv: readonly string[] = process.argv): string {
  const current = argv[1]
  if (current !== undefined && existsSync(current) && current.endsWith(`${join('lib', 'bin.js')}`)) return current
  const packagePath = createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(packagePath), 'lib', 'bin.js')
}

function appendTail(buffer: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>): Buffer<ArrayBufferLike> {
  const combined = Buffer.concat([buffer, chunk])
  return combined.length <= OUTPUT_LIMIT ? combined : combined.subarray(combined.length - OUTPUT_LIMIT)
}

export interface CommandResult {
  output: string
}

export class CommandRunner {
  constructor(
    private readonly cliPath = resolveDshCliPath(),
    private readonly spawnProcess: SpawnProcess = spawn,
    private readonly timeoutMs = COMMAND_TIMEOUT_MS,
  ) {}

  run(args: readonly string[]): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(process.execPath, [this.cliPath, ...args], {
        shell: false,
        windowsHide: true,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output: Buffer<ArrayBufferLike> = Buffer.alloc(0)
      let settled = false
      let timer: NodeJS.Timeout | undefined
      const finish = (callback: () => void) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        callback()
      }
      child.stdout.on('data', (chunk: Buffer) => { output = appendTail(output, chunk) })
      child.stderr.on('data', (chunk: Buffer) => { output = appendTail(output, chunk) })
      child.once('error', error => finish(() => reject(new MarketplaceError(
        'command-failed',
        `Unable to start DSH CLI: ${error.message}`,
        500,
      ))))
      child.once('close', code => finish(() => {
        const text = output.toString('utf8')
        if (code === 0) resolve({ output: text })
        else reject(new MarketplaceError('command-failed', 'DSH plugin command failed.', 500, { output: text }))
      }))
      timer = setTimeout(() => {
        child.kill()
        finish(() => reject(new MarketplaceError('command-timeout', 'DSH plugin command timed out.', 504, {
          output: output.toString('utf8'),
        })))
      }, this.timeoutMs)
    })
  }
}
