import { describe, expect, it } from 'vitest'
import { classifyPluginCategory } from '../src/category.js'

describe('plugin category classification', () => {
  it('uses factual repository signals with deterministic priority', () => {
    expect(classifyPluginCategory({
      name: 'dsh-memory', slug: 'owner/dsh-memory', description: 'Persistent session memory', topics: ['dsh-plugin'],
    })).toBe('knowledge-memory')
    expect(classifyPluginCategory({
      name: 'dsh-theme', slug: 'owner/dsh-theme', description: 'Web UI skin', topics: ['dsh-plugin'],
    })).toBe('interface-personalization')
    expect(classifyPluginCategory({
      name: 'secure-agent', slug: 'owner/secure-agent', description: 'Agent workflow', topics: ['security'],
    })).toBe('security-operations')
  })

  it('keeps generic repositories in the explicit fallback category', () => {
    expect(classifyPluginCategory({
      name: 'fixture', slug: 'owner/fixture', description: 'A fixture plugin', topics: ['dsh-plugin'],
    })).toBe('other')
  })
})
