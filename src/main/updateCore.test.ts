import { describe, expect, it } from 'vitest'
import { compareVersions, describeRelease, isAllowedDownloadUrl, isReleasePageUrl, parseVersion, pickInstaller } from './updateCore'

const SHA = 'a'.repeat(64)
const asset = (over: Record<string, unknown> = {}) => ({
  name: 'Scent-Wardrobe-Setup-1.1.0.exe',
  browser_download_url: 'https://github.com/MedinaPiRRy/ScentWardrobe/releases/download/v1.1.0/Scent-Wardrobe-Setup-1.1.0.exe',
  size: 120_000_000,
  digest: `sha256:${SHA}`,
  ...over
})
const release = (over: Record<string, unknown> = {}) => ({
  tag_name: 'v1.1.0',
  body: 'Ratings steer recommendations.',
  html_url: 'https://github.com/MedinaPiRRy/ScentWardrobe/releases/tag/v1.1.0',
  assets: [asset()],
  ...over
})

describe('versions', () => {
  it('parses plain three-part versions only', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('1.10.0')).toEqual([1, 10, 0])
    expect(parseVersion('1.2')).toBeNull()
    expect(parseVersion('1.2.3-beta.1')).toBeNull()
    expect(parseVersion('latest')).toBeNull()
  })
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0)
  })
})

describe('urls', () => {
  it('accepts only this repository for pages and downloads', () => {
    expect(isReleasePageUrl('https://github.com/MedinaPiRRy/ScentWardrobe/releases/tag/v1.1.0')).toBe(true)
    expect(isReleasePageUrl('https://github.com/someone-else/ScentWardrobe/releases/tag/v1.1.0')).toBe(false)
    expect(isReleasePageUrl('https://github.com.evil.example/MedinaPiRRy/ScentWardrobe/')).toBe(false)
    expect(isReleasePageUrl('http://github.com/MedinaPiRRy/ScentWardrobe/')).toBe(false)
    expect(isAllowedDownloadUrl('https://github.com/MedinaPiRRy/ScentWardrobe/releases/download/v1.1.0/x.exe')).toBe(true)
    expect(isAllowedDownloadUrl('https://release-assets.githubusercontent.com/github-production-release-asset/1/x')).toBe(true)
    expect(isAllowedDownloadUrl('https://github.com/someone-else/ScentWardrobe/releases/download/v1.1.0/x.exe')).toBe(false)
    expect(isAllowedDownloadUrl('https://githubusercontent.com.evil.example/x')).toBe(false)
    expect(isAllowedDownloadUrl('https://user:pw@github.com/MedinaPiRRy/ScentWardrobe/releases/download/v1/x.exe')).toBe(false)
    expect(isAllowedDownloadUrl('http://objects.githubusercontent.com/x')).toBe(false)
    expect(isAllowedDownloadUrl('not a url')).toBe(false)
  })
})

describe('pickInstaller', () => {
  it('returns the one installer with its checksum', () => {
    expect(pickInstaller([asset()])).toMatchObject({ name: 'Scent-Wardrobe-Setup-1.1.0.exe', sha256: SHA })
  })
  it('keeps a missing checksum as null so the release is not installed automatically', () => {
    expect(pickInstaller([asset({ digest: null })])?.sha256).toBeNull()
    expect(pickInstaller([asset({ digest: 'md5:abc' })])?.sha256).toBeNull()
  })
  it('refuses odd names, odd hosts, absurd sizes and ambiguity', () => {
    expect(pickInstaller([asset({ name: 'evil.exe' })])).toBeNull()
    expect(pickInstaller([asset({ browser_download_url: 'https://evil.example/Scent-Wardrobe-Setup-1.1.0.exe' })])).toBeNull()
    expect(pickInstaller([asset({ size: 9e9 })])).toBeNull()
    expect(pickInstaller([asset({ size: 0 })])).toBeNull()
    expect(pickInstaller([asset(), asset({ name: 'Scent-Wardrobe-Setup-1.2.0.exe' })])).toBeNull()
    expect(pickInstaller(undefined)).toBeNull()
  })
})

describe('describeRelease', () => {
  it('says there is a newer version and that it can be installed on Windows', () => {
    const r = describeRelease(release(), '1.0.0', 'win32')
    expect(r).toMatchObject({ current: '1.0.0', latest: '1.1.0', newer: true, canInstall: true, installerName: 'Scent-Wardrobe-Setup-1.1.0.exe' })
    expect(r.notes).toContain('Ratings')
  })
  it('is not newer when the versions match or the app is ahead', () => {
    expect(describeRelease(release(), '1.1.0', 'win32').newer).toBe(false)
    expect(describeRelease(release(), '1.2.0', 'win32').newer).toBe(false)
  })
  it('cannot install on other systems or without a checksum, but still shows the release page', () => {
    expect(describeRelease(release(), '1.0.0', 'darwin').canInstall).toBe(false)
    const none = describeRelease(release({ assets: [asset({ digest: undefined })] }), '1.0.0', 'win32')
    expect(none.canInstall).toBe(false)
    expect(none.releaseUrl).toContain('/releases/tag/v1.1.0')
  })
  it('ignores a release page link that is not on this repository', () => {
    expect(describeRelease(release({ html_url: 'https://evil.example/' }), '1.0.0', 'win32').releaseUrl).toBe('https://github.com/MedinaPiRRy/ScentWardrobe/releases/latest')
  })
  it('rejects an answer that is not a release', () => {
    expect(() => describeRelease({ message: 'Not Found' }, '1.0.0', 'win32')).toThrow()
    expect(() => describeRelease(release({ tag_name: 'nightly' }), '1.0.0', 'win32')).toThrow()
    expect(() => describeRelease(null, '1.0.0', 'win32')).toThrow()
  })
  it('caps very long notes', () => {
    expect(describeRelease(release({ body: 'x'.repeat(50_000) }), '1.0.0', 'win32').notes.length).toBe(4000)
  })
})
