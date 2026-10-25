import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { releaseCanUpdate, validatedFeed } from '../scripts/prepare-update-feed.mjs'

const signature = readFileSync('tests/fixtures/updater/update-fixture.bin.sig', 'utf8').trim()
const url =
  'https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/download/v99.0.0/test.exe'
const release = {
  draft: false,
  tag_name: 'v99.0.0',
  assets: [{ name: 'test.exe', browser_download_url: url }]
}
const manifest = { version: '99.0.0', platforms: { 'windows-x86_64': { url, signature } } }
describe('native release feed publication', () => {
  it('excludes manual prereleases before their absent signature manifest is fetched', () => {
    expect(releaseCanUpdate({ ...release, prerelease: true }, { version: '2.0.0' })).toBe(false)
    expect(
      releaseCanUpdate({ ...release, tag_name: 'v99.0.0-alpha.1' }, { version: '2.0.0' })
    ).toBe(false)
    expect(releaseCanUpdate(release, { version: '2.0.0' })).toBe(true)
    expect(releaseCanUpdate(release, { version: '100.0.0' })).toBe(false)
    expect(() => releaseCanUpdate({ ...release, draft: true })).toThrow()
    expect(() => releaseCanUpdate({ ...release, tag_name: 'invalid' })).toThrow()
  })
  it('accepts a matching published release and its version-bound signature', () => {
    expect(validatedFeed(release, manifest, { version: '2.0.0-alpha.10' })).toEqual(manifest)
  })
  it('does not replace a newer channel with an older edited release', () => {
    expect(validatedFeed(release, manifest, { version: '100.0.0' })).toBeNull()
  })
  it('keeps stable clients off experimental releases while allowing stable upgrades', () => {
    expect(
      validatedFeed({ ...release, prerelease: true }, manifest, { version: '2.0.0' })
    ).toBeNull()
    expect(
      validatedFeed(
        { ...release, tag_name: 'v99.0.0-alpha.1' },
        { ...manifest, version: '99.0.0-alpha.1' },
        { version: '2.0.0' }
      )
    ).toBeNull()
    expect(validatedFeed(release, manifest, { version: '2.0.0' })).toEqual(manifest)
  })
  it('rejects drafts, mismatched versions, unsigned payloads and unrelated assets', () => {
    expect(() => validatedFeed({ ...release, draft: true }, manifest)).toThrow()
    expect(() => validatedFeed(release, { ...manifest, version: '99.0.1' })).toThrow()
    expect(() =>
      validatedFeed(release, { ...manifest, platforms: { test: { url, signature: '' } } })
    ).toThrow()
    expect(() =>
      validatedFeed(release, {
        ...manifest,
        platforms: { test: { url: 'https://example.com/app.exe', signature } }
      })
    ).toThrow()
  })
})
