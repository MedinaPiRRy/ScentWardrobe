import { app, net, shell } from 'electron'
import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { createWriteStream, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import type { Result, UpdateInfo } from '@shared/types'
import type { Db } from './db'
import { createManualBackup } from './backup'
import { fail } from './db/repo'
import { describeRelease, isAllowedDownloadUrl, isReleasePageUrl, LATEST_RELEASE_URL, MAX_INSTALLER_BYTES, RELEASES_REPO, type InstallerAsset } from './updateCore'

const CHECK_TIMEOUT_MS = 10_000
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000

async function latestRelease() {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), CHECK_TIMEOUT_MS)
  try {
    const res = await net.fetch(LATEST_RELEASE_URL, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': `ScentWardrobe/${app.getVersion()}` } })
    if (res.status === 404) throw new Error('No release has been published yet.')
    if (!res.ok) throw new Error(`GitHub answered ${res.status}.`)
    return describeRelease(await res.json(), app.getVersion(), process.platform)
  } finally {
    clearTimeout(t)
  }
}

const strip = ({ asset: _asset, ...info }: ReturnType<typeof describeRelease>): UpdateInfo => info

export async function checkForUpdate(): Promise<Result<UpdateInfo>> {
  try {
    return { ok: true, data: strip(await latestRelease()) }
  } catch (e) {
    return fail('NETWORK', `Could not check for updates (${(e as Error).message}). Your data is not affected.`)
  }
}

export async function openReleasePage(): Promise<void> {
  let url = `https://github.com/${RELEASES_REPO}/releases/latest`
  try {
    const r = await latestRelease()
    if (isReleasePageUrl(r.releaseUrl)) url = r.releaseUrl
  } catch {
    /* fall back to the generic releases page */
  }
  await shell.openExternal(url)
}

/** Streams the installer to a new private temp folder, checking size and SHA-256 as it arrives. */
async function download(asset: InstallerAsset): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'scent-wardrobe-update-'))
  const file = join(dir, asset.name)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await net.fetch(asset.url, { signal: ctrl.signal, headers: { 'User-Agent': `ScentWardrobe/${app.getVersion()}` } })
    if (!res.ok || !res.body) throw new Error(`the download failed (${res.status})`)
    if (!isAllowedDownloadUrl(res.url)) throw new Error('the download was redirected somewhere unexpected')
    const hash = createHash('sha256')
    let bytes = 0
    const source = Readable.fromWeb(res.body as never)
    source.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > Math.min(MAX_INSTALLER_BYTES, asset.size)) source.destroy(new Error('the file is larger than the release says'))
      hash.update(chunk)
    })
    await pipeline(source, createWriteStream(file))
    if (bytes !== asset.size) throw new Error('the file is not the size the release says')
    if (hash.digest('hex') !== asset.sha256) throw new Error('the checksum does not match the one GitHub published')
    return file
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  } finally {
    clearTimeout(t)
  }
}

/**
 * Windows only. Looks the release up again (nothing from the window decides what is downloaded), downloads the installer,
 * verifies it against the checksum GitHub publishes for the file, makes a backup of the data, starts the installer and quits so it
 * can replace the files. The data folder is never touched by the installer.
 */
export async function installUpdate(db: Db, paths: { dbPath: string; imagesDir: string }): Promise<Result<{ started: true }>> {
  if (process.platform !== 'win32') return fail('INVALID', 'Updating from inside the app is only available on Windows. Open the release page and download the new version.')
  let release: Awaited<ReturnType<typeof latestRelease>>
  try {
    release = await latestRelease()
  } catch (e) {
    return fail('NETWORK', `Could not check for updates (${(e as Error).message}).`)
  }
  if (!release.newer) return fail('NOT_FOUND', 'You already have the newest version.')
  const asset = release.asset
  if (!asset || !asset.sha256) return fail('INVALID', 'This release has no verifiable installer, so it is not installed automatically. Open the release page instead.')

  const backup = await createManualBackup(db, paths, false)
  if (!backup.ok) return fail('UNKNOWN', `The update was stopped because the safety backup failed: ${backup.message}`)

  let file: string
  try {
    file = await download(asset)
  } catch (e) {
    return fail('NETWORK', `The update was not installed: ${(e as Error).message}. Your data is not affected.`)
  }
  try {
    spawn(file, [], { detached: true, stdio: 'ignore' }).unref()
  } catch (e) {
    return fail('UNKNOWN', `The installer could not be started: ${(e as Error).message}`)
  }
  setTimeout(() => app.quit(), 800)
  return { ok: true, data: { started: true } }
}
