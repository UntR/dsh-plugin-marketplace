import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { resolveCurrentProfile } from '../src/manager/profile.js'

describe('current profile resolution', () => {
  it('accepts only an immediate directory under DSH_HOME/profiles', () => {
    const home = '/tmp/dsh-home'
    expect(resolveCurrentProfile(`${pathToFileURL('/tmp/dsh-home/profiles/web').href}/`, home)).toEqual({
      name: 'web',
      directory: '/tmp/dsh-home/profiles/web',
    })
    expect(() => resolveCurrentProfile(`${pathToFileURL('/tmp/outside').href}/`, home)).toThrow('not a valid profile')
    expect(() => resolveCurrentProfile(`${pathToFileURL('/tmp/dsh-home/profiles/group/web').href}/`, home)).toThrow()
  })
})

