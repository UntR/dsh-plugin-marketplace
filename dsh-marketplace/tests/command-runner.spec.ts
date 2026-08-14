import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { CommandRunner, type SpawnProcess } from '../src/manager/command-runner.js'

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn()
  return child
}

describe('CommandRunner', () => {
  it('spawns the official CLI with an argument array and shell disabled', async () => {
    const child = childProcess()
    const spawn = vi.fn(() => child) as unknown as SpawnProcess
    const runner = new CommandRunner('/dsh/lib/bin.js', spawn)
    const pending = runner.run(['plugin', '--profile', 'web', 'add', 'dsh-example@0.3.0'])
    child.stdout.write('installed')
    child.emit('close', 0)
    await expect(pending).resolves.toEqual({ output: 'installed' })
    expect(spawn).toHaveBeenCalledWith(process.execPath, [
      '/dsh/lib/bin.js', 'plugin', '--profile', 'web', 'add', 'dsh-example@0.3.0',
    ], expect.objectContaining({ shell: false, windowsHide: true }))
  })

  it('keeps only the final 64 KiB of output', async () => {
    const child = childProcess()
    const runner = new CommandRunner('/dsh/lib/bin.js', vi.fn(() => child) as unknown as SpawnProcess)
    const pending = runner.run(['plugin'])
    child.stderr.write('a'.repeat(70 * 1_024))
    child.emit('close', 1)
    await expect(pending).rejects.toMatchObject({
      code: 'command-failed',
      details: { output: 'a'.repeat(64 * 1_024) },
    })
  })
})

