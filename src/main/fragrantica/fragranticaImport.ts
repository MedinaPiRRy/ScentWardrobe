import { BrowserWindow } from 'electron'
import type { FragranticaResult, Result } from '@shared/types'
import { fail } from '../db/repo'
import { EXTRACT_SCRIPT, isFragranticaUrl, normalizeRaw, type RawFragrantica } from './fragranticaParser'

const MIN_GAP_MS = 3000
const PAGE_TIMEOUT_MS = 30_000
const CHALLENGE_TIMEOUT_MS = 120_000
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One request at a time, with a pause between requests, so we behave like someone browsing.
let chain: Promise<unknown> = Promise.resolve()
let lastFinished = 0

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastFinished + MIN_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    try {
      return await task()
    } finally {
      lastFinished = Date.now()
    }
  })
  chain = run.catch(() => undefined)
  return run
}

async function scrape(win: BrowserWindow): Promise<RawFragrantica> {
  const run = () => win.webContents.executeJavaScript(EXTRACT_SCRIPT, true) as Promise<RawFragrantica>

  const deadline = Date.now() + PAGE_TIMEOUT_MS
  let shown = false
  let raw = await run()
  // Wait for the page to render (and for a human check, if the site asks for one).
  while (Date.now() < deadline + (shown ? CHALLENGE_TIMEOUT_MS : 0)) {
    if (raw.challenge && !shown) {
      shown = true
      win.setFocusable(true)
      win.setSkipTaskbar(false)
      win.setTitle('Scent Wardrobe: complete the check to continue')
      win.center()
      win.show()
    }
    if (!raw.challenge && raw.h1 && (raw.accords.length || raw.notes.length)) break
    await sleep(700)
    raw = await run()
  }
  if (shown) {
    win.setPosition(-4000, -4000)
    win.setSkipTaskbar(true)
  }
  if (raw.challenge) throw new Error('CHALLENGE')
  if (!raw.h1) throw new Error('NO_PAGE')

  // Longevity / sillage votes are loaded lazily as the page scrolls.
  await win.webContents.executeJavaScript(
    `(async () => { for (let i = 0; i <= 10; i++) { window.scrollTo(0, document.body.scrollHeight * i / 10); await new Promise(r => setTimeout(r, 200)); } })()`,
    true
  )
  await sleep(700)
  return run()
}

/** Loads one Fragrantica page in a hidden, sandboxed Chromium window and extracts its data. */
export function importFromUrl(rawUrl: string): Promise<Result<FragranticaResult>> {
  const url = rawUrl.trim()
  if (!isFragranticaUrl(url)) {
    return Promise.resolve(fail('INVALID', 'Paste the address of a fragrance page, like https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html'))
  }

  return enqueue(async () => {
    // Rendered but parked far off-screen: a truly hidden window never triggers the page's lazy loading
    // (longevity / sillage votes). It is moved on-screen only if the site asks for a human check.
    const win = new BrowserWindow({
      show: true,
      x: -4000,
      y: -4000,
      width: 1280,
      height: 900,
      skipTaskbar: true,
      focusable: false,
      frame: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:fragrantica', backgroundThrottling: false }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
    try {
      try {
        await Promise.race([win.loadURL(url), sleep(PAGE_TIMEOUT_MS).then(() => Promise.reject(new Error('TIMEOUT')))])
      } catch (e) {
        // Navigation aborts caused by redirects are fine; real failures are not.
        if ((e as Error).message === 'TIMEOUT' || !win.webContents.getURL().startsWith('https://')) throw e
      }
      const raw = await scrape(win)
      const { input, warnings } = normalizeRaw(raw)
      if (!input.name || !input.house) return fail('PARSE', 'The page loaded, but name and house could not be found. Fragrantica may have changed its layout (see the README for how to fix the parser).')
      return { ok: true as const, data: { input, warnings } }
    } catch (e) {
      const m = (e as Error).message
      if (m === 'CHALLENGE') return fail('NETWORK', 'Fragrantica asked for a human check that was not completed. Try again, and solve the check in the window that appears.')
      if (m === 'NO_PAGE') return fail('PARSE', 'The page loaded but did not look like a fragrance page. Check the address.')
      if (m === 'TIMEOUT') return fail('NETWORK', 'Fragrantica took too long to respond. Check your connection and try again.')
      return fail('NETWORK', `Could not load the page: ${m}`)
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  })
}
