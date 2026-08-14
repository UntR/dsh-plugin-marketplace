import { describe, expect, it } from 'vitest'
import { stableStringify } from '../src/stable-json.js'

describe('stableStringify', () => {
  it('sorts object keys recursively while preserving array order', () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] })).toBe(
      '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "list": [\n    2,\n    1\n  ],\n  "z": 1\n}\n',
    )
  })

  it('rejects values JSON cannot represent deterministically', () => {
    expect(() => stableStringify({ invalid: undefined })).toThrow('cannot encode undefined')
    expect(() => stableStringify(Number.NaN)).toThrow('finite numbers')
  })
})
