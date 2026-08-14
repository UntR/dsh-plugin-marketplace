import { describe, expect, it } from 'vitest'
import { inferInstall, inspectNpmMetadata, parsePackageJson } from '../src/install.js'

describe('package and install inference', () => {
  it('retains malformed package.json as an invalid fact', () => {
    expect(parsePackageJson('{')).toEqual({ status: 'invalid' })
  })

  it('requires npm repository identity to match GitHub', () => {
    expect(inspectNpmMetadata({
      name: 'dsh-memory',
      'dist-tags': { latest: '0.4.1' },
      repository: { url: 'git+https://github.com/owner/repo.git' },
    }, 'owner/repo')).toEqual({
      published: true,
      latestVersion: '0.4.1',
      repositoryMatches: true,
    })
  })

  it('prefers an exact npm version when identity matches', async () => {
    const pkg = parsePackageJson(JSON.stringify({
      name: 'dsh-memory',
      version: '0.4.0',
      main: './lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const result = await inferInstall({
      package: pkg,
      patchExists: true,
      repositorySlug: 'owner/repo',
      headSha: 'a'.repeat(40),
      npmMetadata: {
        name: 'dsh-memory',
        'dist-tags': { latest: '0.4.1' },
        repository: 'https://github.com/owner/repo',
      },
      fileExists: async () => true,
    })
    expect(result.install).toMatchObject({
      available: true,
      preferred: 'npm',
      spec: 'dsh-memory@0.4.1',
    })
  })

  it('pins a GitHub source install to the full commit', async () => {
    const pkg = parsePackageJson(JSON.stringify({
      name: 'dsh-source',
      version: '0.1.0',
      main: './lib/index.js',
      scripts: { prepare: 'pnpm build' },
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
    const sha = 'b'.repeat(40)
    const result = await inferInstall({
      package: pkg,
      patchExists: true,
      repositorySlug: 'owner/source',
      headSha: sha,
      npmMetadata: null,
      fileExists: async () => false,
    })
    expect(result.install).toMatchObject({
      available: true,
      preferred: 'github',
      spec: `github:owner/source#${sha}`,
      requiresBuildApproval: true,
    })
  })
})

