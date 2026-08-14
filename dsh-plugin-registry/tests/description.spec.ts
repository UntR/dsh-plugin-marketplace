import { describe, expect, it } from 'vitest'
import { extractReadmeDescription, selectDescription } from '../src/description.js'

describe('README description extraction', () => {
  it('skips headings, badges, images, code, tables and navigation lists', () => {
    const readme = `# Plugin

[![Build](https://img.shields.io/badge/build-ok)](https://example.com)

- [Docs](./docs)

\`\`\`ts
const ignored = true
\`\`\`

This **plugin** keeps [session memory](https://example.com) for DSH.

Second paragraph.`
    expect(extractReadmeDescription(readme)).toBe('This plugin keeps session memory for DSH.')
  })

  it('prefers repository description and truncates by Unicode code point', () => {
    const value = `  ${'😀'.repeat(300)}  `
    expect(Array.from(selectDescription(value, 'fallback')).length).toBe(280)
  })
})

