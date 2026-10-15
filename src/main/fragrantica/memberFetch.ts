import { BrowserWindow } from 'electron'
import type { Result } from '@shared/types'
import { fail } from '../db/repo'
import { enqueue, sleep } from './fragranticaImport'
import { MEMBER_EXTRACT_SCRIPT, type RawMember } from './memberParser'

const PAGE_TIMEOUT_MS = 30_000
/** How long to wait for the person to log in or pass a check in the visible window. */
const HUMAN_TIMEOUT_MS = 180_000

export const isUsername = (u: string): boolean => /^[A-Za-z0-9_.-]{2,40}$/.test(u)

/**
 * Reads the public wardrobe of one Fragrantica member (https://www.fragrantica.com/@name, "Wardrobe" tab).
 * The window uses the same persistent session as the page importer, so a login made in it is remembered; this code
 * never sees or stores a password. The window stays off-screen unless the page asks for a check or a login.
 */
export function fetchMemberWardrobe(username: string): Promise<Result<RawMember>> {
  const name = username.trim().replace(/^@/, '')
  if (!isUsername(name)) return Promise.resolve(fail('INVALID', 'Enter a Fragrantica username, like your_username.'))

  return enqueue(async () => {
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
    let shown = false
    const reveal = (title: string) => {
      if (shown) return
      shown = true
      win.setFocusable(true)
      win.setSkipTaskbar(false)
      win.setTitle(title)
      win.setSize(1100, 800)
      win.center()
      win.show()
    }
    const read = () => win.webContents.executeJavaScript(MEMBER_EXTRACT_SCRIPT, true) as Promise<RawMember>

    try {
      try {
        await Promise.race([win.loadURL(`https://www.fragrantica.com/@${encodeURIComponent(name)}#wardrobe`), sleep(PAGE_TIMEOUT_MS).then(() => Promise.reject(new Error('TIMEOUT')))])
      } catch (e) {
        if ((e as Error).message === 'TIMEOUT' || !win.webContents.getURL().startsWith('https://')) throw e
      }

      const start = Date.now()
      let raw = await read()
      for (;;) {
        const waited = Date.now() - start
        if (raw.challenge) reveal('Scent Wardrobe: complete the check to continue')
        else if (waited > PAGE_TIMEOUT_MS / 2 && raw.sections.length === 0) reveal('Scent Wardrobe: log in to Fragrantica if the wardrobe is hidden')
        if (raw.sections.length > 0 && !raw.challenge) break
        if (waited > (shown ? HUMAN_TIMEOUT_MS : PAGE_TIMEOUT_MS)) break
        await sleep(800)
        raw = await read()
      }
      if (raw.challenge) return fail('NETWORK', 'Fragrantica asked for a human check that was not completed. Try again and solve the check in the window that appears.')
      if (raw.sections.length === 0) {
        return fail(
          'PARSE',
          raw.hasProfile
            ? 'The profile loaded, but no wardrobe lists could be read. They may be private, or Fragrantica changed its layout. You can paste links or load a CSV instead.'
            : 'No Fragrantica profile was found with that username.'
        )
      }
      // Cards fill in as the page settles; read once more so a list is not caught half-loaded.
      await sleep(1200)
      return { ok: true as const, data: await read() }
    } catch (e) {
      const m = (e as Error).message
      return fail('NETWORK', m === 'TIMEOUT' ? 'Fragrantica took too long to respond. Check your connection and try again.' : `Could not load the profile: ${m}`)
    } finally {
      if (!win.isDestroyed()) win.destroy()
    }
  })
}
