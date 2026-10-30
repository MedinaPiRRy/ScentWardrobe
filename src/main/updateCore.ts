import type { UpdateInfo } from '@shared/types'

/** Where releases are published. The app only ever asks this one repository, and only when the user presses the button. */
export const RELEASES_REPO = 'MedinaPiRRy/ScentWardrobe'
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASES_REPO}/releases/latest`
const RELEASE_PAGE_PREFIX = `https://github.com/${RELEASES_REPO}/`

/** Installers are about 120 MB; anything far beyond that is not ours. */
export const MAX_INSTALLER_BYTES = 500 * 1024 * 1024

const INSTALLER_NAME = /^Scent-Wardrobe-Setup-\d+\.\d+\.\d+\.exe$/

/** "1.2.3" or "v1.2.3" to [1, 2, 3]; null when it is not a plain three-part version (pre-release tags are not offered). */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** Positive when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

/** GitHub release pages and files for this repository only, over https, no credentials or odd ports. */
export function isReleasePageUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password && !u.port && u.href.startsWith(RELEASE_PAGE_PREFIX)
  } catch {
    return false
  }
}

/** Where a release file may be downloaded from: this repository's release downloads, or the CDN GitHub redirects them to. */
export function isAllowedDownloadUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false
    if (u.hostname === 'github.com') return u.pathname.startsWith(`/${RELEASES_REPO}/releases/download/`)
    return u.hostname === 'objects.githubusercontent.com' || u.hostname.endsWith('.githubusercontent.com')
  } catch {
    return false
  }
}

export interface InstallerAsset {
  name: string
  url: string
  size: number
  /** Lower-case hex SHA-256 from GitHub's asset digest, or null when the release has none. */
  sha256: string | null
}

interface RawAsset {
  name?: unknown
  browser_download_url?: unknown
  size?: unknown
  digest?: unknown
}

/** The Windows installer in a release, if there is exactly one that looks like ours. */
export function pickInstaller(assets: unknown): InstallerAsset | null {
  if (!Array.isArray(assets)) return null
  const found = (assets as RawAsset[]).filter((a) => typeof a?.name === 'string' && INSTALLER_NAME.test(a.name))
  if (found.length !== 1) return null
  const a = found[0]
  const url = typeof a.browser_download_url === 'string' ? a.browser_download_url : ''
  const size = typeof a.size === 'number' ? a.size : 0
  if (!isAllowedDownloadUrl(url) || size <= 0 || size > MAX_INSTALLER_BYTES) return null
  const digest = typeof a.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(a.digest) : null
  return { name: a.name as string, url, size, sha256: digest ? digest[1].toLowerCase() : null }
}

/** Turns GitHub's "latest release" answer into what the dialog shows. Throws on an answer that is not a release. */
export function describeRelease(json: unknown, current: string, platform: string): UpdateInfo & { asset: InstallerAsset | null } {
  const r = json as { tag_name?: unknown; body?: unknown; html_url?: unknown; assets?: unknown } | null
  if (!r || typeof r.tag_name !== 'string' || !parseVersion(r.tag_name)) throw new Error('The release information was not in the expected form.')
  const latest = r.tag_name.replace(/^v/, '')
  const asset = platform === 'win32' ? pickInstaller(r.assets) : null
  const page = typeof r.html_url === 'string' && isReleasePageUrl(r.html_url) ? r.html_url : `${RELEASE_PAGE_PREFIX}releases/latest`
  const notes = typeof r.body === 'string' ? r.body.trim().slice(0, 4000) : ''
  return {
    current,
    latest,
    newer: compareVersions(latest, current) > 0,
    notes,
    releaseUrl: page,
    canInstall: !!asset && !!asset.sha256,
    installerName: asset?.name ?? null,
    installerBytes: asset?.size ?? null,
    asset
  }
}
