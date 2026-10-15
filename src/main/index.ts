import { app, BrowserWindow, shell } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { startAutoBackup } from './backup'
import { openDatabase } from './db'
import { registerImageProtocol, registerImageScheme } from './images'
import { registerIpc } from './ipc'
import { loadWindowState, trackWindowState } from './windowState'

registerImageScheme()
app.setAppUserModelId('com.scentwardrobe.app')

// One window only: a second launch just brings the first to the front (two copies would fight over the database).
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0]
  if (w) {
    if (w.isMinimized()) w.restore()
    w.focus()
  }
})

function createWindow(): void {
  const state = loadWindowState()
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    backgroundColor: '#14100d',
    title: 'Scent Wardrobe',
    // The installed app gets its icon from the installer; this is for `npm run dev`.
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (state.maximized) win.maximize()
  trackWindowState(win)
  win.once('ready-to-show', () => win.show())

  // The app window never navigates away or opens new windows; external links go to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  if (!gotLock) return // the other instance owns the database
  const dataDir = app.getPath('userData')
  for (const sub of ['images', 'backups']) mkdirSync(join(dataDir, sub), { recursive: true })
  const dbPath = join(dataDir, 'scent-wardrobe.db')
  registerImageProtocol()
  const db = openDatabase(dbPath)
  registerIpc(db, dbPath)
  startAutoBackup(db, { dbPath, imagesDir: join(dataDir, 'images') })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
