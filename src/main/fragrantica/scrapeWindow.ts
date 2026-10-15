import { BrowserWindow } from 'electron'

/**
 * The window that loads Fragrantica pages. It is rendered but invisible (parked off-screen and fully transparent): a
 * truly hidden window never triggers the page's lazy loading, and macOS will not keep a window off-screen, so the
 * transparency is what keeps it unseen there. It is only revealed when the site asks for a human check or a login.
 *
 * The page is untrusted web content: sandboxed, no preload, no Node, no permissions, no pop-ups, and it can only
 * navigate to https addresses.
 */
export function createScrapeWindow(): BrowserWindow {
  const win = new BrowserWindow({
    show: true,
    x: -4000,
    y: -4000,
    width: 1280,
    height: 900,
    skipTaskbar: true,
    focusable: false,
    frame: false,
    opacity: 0,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, partition: 'persist:fragrantica', backgroundThrottling: false }
  })
  win.setIgnoreMouseEvents(true)
  const wc = win.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  const httpsOnly = (e: { preventDefault(): void }, url: string) => {
    if (!url.startsWith('https://')) e.preventDefault()
  }
  wc.on('will-navigate', httpsOnly)
  wc.on('will-redirect', httpsOnly)
  wc.on('will-attach-webview', (e) => e.preventDefault())
  wc.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))
  wc.session.setPermissionCheckHandler(() => false)
  return win
}

export function revealScrapeWindow(win: BrowserWindow, title: string, size?: { width: number; height: number }): void {
  win.setIgnoreMouseEvents(false)
  win.setFocusable(true)
  win.setSkipTaskbar(false)
  win.setTitle(title)
  if (size) win.setSize(size.width, size.height)
  win.setOpacity(1)
  win.center()
  win.show()
}

export function parkScrapeWindow(win: BrowserWindow): void {
  win.setOpacity(0)
  win.setPosition(-4000, -4000)
  win.setSkipTaskbar(true)
  win.setIgnoreMouseEvents(true)
}
