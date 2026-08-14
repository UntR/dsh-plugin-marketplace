import { describe, expect, it } from 'vitest'
import { classifyPluginCategory } from '../src/shared/category.js'

describe('Marketplace legacy category fallback', () => {
  it('matches the Registry build classifier for old category-less indexes', () => {
    expect(classifyPluginCategory({
      name: 'dsh-memory', slug: 'owner/dsh-memory', description: 'Persistent session memory', topics: ['dsh-plugin'],
    })).toBe('knowledge-memory')
    expect(classifyPluginCategory({
      name: 'secure-agent', slug: 'owner/secure-agent', description: 'Agent workflow', topics: ['security'],
    })).toBe('security-operations')
  })
})
