import { app, screen, type BrowserWindow } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface State {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const DEFAULT: State = { width: 1360, height: 840 }
const file = () => join(app.getPath('userData'), 'window-state.json')

export function loadWindowState(): State {
  try {
    if (!existsSync(file())) return DEFAULT
    const s = { ...DEFAULT, ...(JSON.parse(readFileSync(file(), 'utf8')) as State) }
    // Drop the saved position if that display is no longer attached.
    if (s.x !== undefined && s.y !== undefined) {
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea
        return s.x! >= b.x - 50 && s.y! >= b.y - 50 && s.x! < b.x + b.width && s.y! < b.y + b.height
      })
      if (!visible) return { width: s.width, height: s.height }
    }
    return s
  } catch {
    return DEFAULT
  }
}

function persist(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  const maximized = win.isMaximized()
  const bounds = win.getNormalBounds()
  try {
    writeFileSync(file(), JSON.stringify({ ...bounds, maximized }))
  } catch {
    /* non-fatal */
  }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined
  const save = () => {
    clearTimeout(timer)
    timer = setTimeout(() => persist(win), 400)
  }
  win.on('resize', save)
  win.on('move', save)
  win.on('maximize', save)
  win.on('unmaximize', save)
  win.on('close', () => {
    clearTimeout(timer)
    persist(win)
  })
}
