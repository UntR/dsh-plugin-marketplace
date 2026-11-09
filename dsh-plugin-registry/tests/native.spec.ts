import { describe, expect, it } from 'vitest'
import { nativeEntry, nativeIndex } from '../src/native.js'
import { entry } from './fixtures/plugin.js'
function proof() {
  return { schemaVersion: 1, id: entry.id, source: { type: 'npm' }, version: '0.4.1',
    manifest: { name: 'dsh-memory', version: '0.4.1', description: 'Published manifest description.', repository: 'git+https://github.com/example/dsh-memory.git',
      engines: { dsh: '>=0.2.0 <0.3.0' }, dsh: { bundle: { patch: './bundle.yml' } } },
    publishTime: '2026-11-01T00:00:00Z', integrity: 'sha512-' + 'A'.repeat(86) + '==',
    archiveSha256: 'a'.repeat(64), patchSha256: 'b'.repeat(64), verifiedAt: Date.now() / 1000,
    verificationLevel: 'metadata-verified', distTags: { latest: '0.4.1' } }
}
describe('Constrained native format1 export', () => {
  it('uses exact version, declared engines and source manifest display', () => {
    const result = nativeEntry(entry, proof(), '0.2.1')
    expect(result.versions).toEqual([{ version: '0.4.1', publishTimestamp: 1793491200, source: { type: 'npm' }, engines: { dsh: '>=0.2.0 <0.3.0' } }])
    expect(result.description).toBe('Published manifest description.')
    expect(result['dist-tags']).toEqual({ latest: '0.4.1' })
  })
  it('refuses incompatible hosts, stale proofs and build scripts', () => {
    expect(() => nativeEntry(entry, proof(), '0.3.0')).toThrow('incompatible')
    expect(() => nativeEntry(entry, { ...proof(), verifiedAt: 0 }, '0.2.1')).toThrow('expired')
    const p = proof()
    expect(() => nativeEntry(entry, { ...p, manifest: { ...p.manifest, scripts: { postinstall: 'execute-me' } } }, '0.2.1')).toThrow('Lifecycle')
  })
  it('excludes unverified and duplicate package identities without dropping the full catalog', () => {
    const result = nativeIndex([entry], new Map(), '0.2.1')
    expect(result.index).toMatchObject({ format: 1, plugins: [] })
    expect(result.report.excluded).toHaveLength(1)
    const duplicate = nativeIndex([entry, { ...entry, id: 'gh:2' }], new Map([[entry.id, proof()]]), '0.2.1')
    expect(duplicate.index.plugins).toHaveLength(1)
    expect(duplicate.report.excluded).toHaveLength(1)
  })
  it('exports declared ranges without pinning the source to one client version', () => {
    expect(nativeIndex([entry], new Map([[entry.id, proof()]])).index.plugins).toHaveLength(1)
  })
  it('accepts verified commit-pinned Git sources and rejects blank compatibility', () => {
    const p = proof()
    const git = { ...p, source: { type: 'git', url: entry.repositoryUrl, commit: 'a'.repeat(40) } }
    expect(nativeEntry(entry, git).versions[0]?.source).toEqual(git.source)
    expect(() => nativeEntry(entry, { ...git, manifest: { ...git.manifest, engines: { dsh: ' ' } } })).toThrow()
  })

})
