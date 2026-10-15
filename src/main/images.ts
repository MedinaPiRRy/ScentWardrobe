import { app, dialog, nativeImage, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { appendFileSync, existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { basename, join } from 'path'
import type { FragranceInput } from '@shared/types'
import { removeLightBackground, swapRedBlue, trimTransparent } from './imageProcessing'
import { isAllowedImageUrl } from './security'

const MAX_BYTES = 12 * 1024 * 1024
const MAX_HEIGHT = 900
const SCHEME = 'scentimg'

export const imagesDir = () => join(app.getPath('userData'), 'images')

/** Must run before the app is ready. */
export function registerImageScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export async function readImageDataUrl(file: string): Promise<string | null> {
  const name = basename(file)
  const full = join(imagesDir(), name)
  if (!name) return null
  try {
    return `data:image/png;base64,${(await readWithRetry(full)).toString('base64')}`
  } catch (e) {
    logImageError(name, e as Error)
    return null
  }
}

export function reportImageFailure(file: string, detail: string): void {
  logImageError(basename(String(file)), new Error(`renderer: ${String(detail).slice(0, 200)}`))
}

/**
 * Reads a cached picture. Windows can refuse a read for a moment (a virus scanner checking a file that was just
 * written or that the app has just been reinstalled over), and fs.existsSync reports that as "missing", so the file is
 * simply tried again for a few seconds instead of being checked first.
 */
async function readWithRetry(full: string, attempts = 40): Promise<Buffer> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await readFile(full)
    } catch (e) {
      last = e
      if ((e as NodeJS.ErrnoException).code === 'ENOENT' && i >= 3) break
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  throw last
}

/** Kept so a picture that will not load can be diagnosed later (userData/image-errors.log, trimmed when large). */
function logImageError(file: string, e: Error): void {
  try {
    const log = join(app.getPath('userData'), 'image-errors.log')
    if (existsSync(log) && statSync(log).size > 100_000) unlinkSync(log)
    appendFileSync(log, `${new Date().toISOString()} ${file} ${(e as NodeJS.ErrnoException).code ?? ''} ${e.message}
`)
  } catch {
    /* ignore */
  }
}

/** Serves cached images as scentimg://img/<file>. Only plain file names inside the images folder are served. */
export function registerImageProtocol(): void {
  protocol.handle(SCHEME, (req) => {
    let file = ''
    try {
      file = basename(decodeURIComponent(new URL(req.url).pathname))
    } catch {
      return new Response('Bad request', { status: 400 })
    }
    const full = join(imagesDir(), file)
    if (!file) return new Response('Not found', { status: 404 })
    // Read the file directly, and retry briefly when it is locked (a virus scanner can hold a file open for a moment).
    return readWithRetry(full).then(
      (bytes) => new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png', 'cache-control': 'no-cache' } }),
      (e: Error) => {
        logImageError(file, e)
        return new Response('Unavailable', { status: 503 })
      }
    )
  })
}

/** Decodes, optionally removes a plain light background, trims, shrinks and returns PNG bytes. */
export function processImage(buf: Buffer, removeBackground: boolean): { png: Buffer; backgroundRemoved: boolean } {
  let img = nativeImage.createFromBuffer(buf)
  if (img.isEmpty()) throw new Error('That file is not an image the app can read.')
  const size = img.getSize()
  if (size.height > MAX_HEIGHT) img = img.resize({ height: MAX_HEIGHT, quality: 'best' })
  if (!removeBackground) return { png: img.toPNG(), backgroundRemoved: false }

  const { width, height } = img.getSize()
  const rgba = { data: swapRedBlue(new Uint8Array(img.toBitmap())), width, height }
  const cut = removeLightBackground(rgba)
  if (!cut.removed) return { png: img.toPNG(), backgroundRemoved: false }
  const trimmed = trimTransparent(cut)
  const out = nativeImage.createFromBitmap(Buffer.from(swapRedBlue(trimmed.data)), { width: trimmed.width, height: trimmed.height })
  return { png: out.toPNG(), backgroundRemoved: true }
}

function save(png: Buffer, key: string): string {
  const name = `${createHash('sha1').update(key).digest('hex').slice(0, 16)}.png`
  writeFileSync(join(imagesDir(), name), png)
  return name
}

/** Downloads once; returns the cached file name. Existing files are reused. */
export async function cacheRemoteImage(url: string, removeBackground = true): Promise<string> {
  const key = `${url}|${removeBackground}`
  const name = `${createHash('sha1').update(key).digest('hex').slice(0, 16)}.png`
  if (existsSync(join(imagesDir(), name))) return name

  // The address can come from a web page, so only https pictures from Fragrantica's own hosts are fetched.
  if (!isAllowedImageUrl(url)) throw new Error('That picture is not on a site the app downloads from.')
  const res = await net.fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Scent-Wardrobe/0.1', Referer: 'https://www.fragrantica.com/' },
    signal: AbortSignal.timeout(20_000)
  })
  if (res.url && !isAllowedImageUrl(res.url)) throw new Error('The picture was redirected to a site the app does not download from.')
  if (!res.ok) throw new Error(`Image download failed (${res.status}).`)
  if (Number(res.headers.get('content-length') ?? 0) > MAX_BYTES) throw new Error('Image is too large.')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_BYTES) throw new Error('Image is too large.')
  return save(processImage(bytes, removeBackground).png, key)
}

/** Reads a user-chosen file, processes it and stores it. */
export function importLocalImage(path: string, removeBackground: boolean): string {
  const buf = readFileSync(path)
  if (buf.length > MAX_BYTES) throw new Error('Image is too large (limit 12 MB).')
  return save(processImage(buf, removeBackground).png, `${path}|${buf.length}|${Date.now()}`)
}

export async function pickImageFile(): Promise<string | null> {
  const r = await dialog.showOpenDialog({
    title: 'Choose a photo of your bottle',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }]
  })
  return r.canceled ? null : r.filePaths[0]
}

/**
 * Turns remote URLs on a fragrance input into cached local files. Failures are non-fatal: the fragrance is
 * still saved, it just keeps the generated bottle. Returns warnings for anything that failed.
 */
export async function resolveRemoteImages(input: FragranceInput): Promise<string[]> {
  const warnings: string[] = []
  if (input.imageUrl && !input.imagePath) {
    try {
      input.imagePath = await cacheRemoteImage(input.imageUrl, true)
    } catch (e) {
      warnings.push(`Bottle image: ${(e as Error).message}`)
    }
  }
  for (const n of input.notes) {
    if (n.iconUrl && !n.iconPath) {
      try {
        n.iconPath = await cacheRemoteImage(n.iconUrl, true)
      } catch {
        /* note icons are optional */
      }
    }
  }
  return warnings
}
