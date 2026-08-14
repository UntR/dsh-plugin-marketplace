function canonicalize(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Stable JSON only supports finite numbers.')
    return value
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Stable JSON cannot encode ${typeof value}.`)
  }
  if (seen.has(value)) throw new TypeError('Stable JSON cannot encode circular values.')
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map(item => canonicalize(item, seen))
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record).sort().map(key => [key, canonicalize(record[key], seen)]),
    )
  } finally {
    seen.delete(value)
  }
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value, new WeakSet()), undefined, 2)}\n`
}

