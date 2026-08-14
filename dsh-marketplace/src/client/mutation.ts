import type { MutationResult } from '../manager/mutations.js'

export class MutationFailure extends Error {
  constructor(message: string, readonly output: string | null) {
    super(message)
  }
}

function errorValue(value: unknown): { message: string; output: string | null } {
  if (typeof value !== 'object' || value === null) return { message: 'Plugin operation failed.', output: null }
  const error = (value as Record<string, unknown>).error
  if (typeof error !== 'object' || error === null) return { message: 'Plugin operation failed.', output: null }
  const record = error as Record<string, unknown>
  const details = typeof record.details === 'object' && record.details !== null
    ? record.details as Record<string, unknown>
    : null
  return {
    message: typeof record.message === 'string' ? record.message : 'Plugin operation failed.',
    output: typeof details?.output === 'string' ? details.output : null,
  }
}

export async function runMutation(path: 'install' | 'update' | 'remove', body: object): Promise<MutationResult> {
  const response = await fetch(`/dsh-marketplace/api/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const value: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const failure = errorValue(value)
    throw new MutationFailure(failure.message, failure.output)
  }
  if (typeof value !== 'object' || value === null || (value as Record<string, unknown>).ok !== true) {
    throw new MutationFailure('Plugin operation returned an invalid response.', null)
  }
  return value as MutationResult
}
