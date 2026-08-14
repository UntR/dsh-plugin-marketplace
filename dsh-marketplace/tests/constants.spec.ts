import { describe, expect, it } from 'vitest'
import { resolveRegistryBaseUrl } from '../src/shared/constants.js'

describe('Registry URL configuration', () => {
  it('accepts HTTPS and local HTTP while normalizing a trailing slash', () => {
    expect(resolveRegistryBaseUrl({ DSH_MARKETPLACE_REGISTRY_URL: 'https://registry.example/v1/' }))
      .toBe('https://registry.example/v1')
    expect(resolveRegistryBaseUrl({ DSH_MARKETPLACE_REGISTRY_URL: 'http://127.0.0.1:43892/v1' }))
      .toBe('http://127.0.0.1:43892/v1')
  })

  it('rejects unsafe schemes and URL capabilities', () => {
    expect(() => resolveRegistryBaseUrl({ DSH_MARKETPLACE_REGISTRY_URL: 'http://registry.example/v1' }))
      .toThrow('HTTPS')
    expect(() => resolveRegistryBaseUrl({ DSH_MARKETPLACE_REGISTRY_URL: 'file:///tmp/registry' }))
      .toThrow('HTTPS')
    expect(() => resolveRegistryBaseUrl({ DSH_MARKETPLACE_REGISTRY_URL: 'https://token@registry.example/v1' }))
      .toThrow('credentials')
  })
})
