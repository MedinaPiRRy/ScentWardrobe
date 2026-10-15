import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Where `npm run dist:dir` puts the app on this system. */
export function defaultExe() {
  if (process.platform === 'win32') return join(process.cwd(), 'dist', 'win-unpacked', 'Scent Wardrobe.exe')
  const dir = process.arch === 'arm64' ? 'mac-arm64' : 'mac'
  return join(process.cwd(), 'dist', dir, 'Scent Wardrobe.app', 'Contents', 'MacOS', 'Scent Wardrobe')
}

/** Starts the packaged app with its own empty profile and returns a driver. */
export async function launch(exe, { profile, port = 9333 } = {}) {
  const dir = profile ?? mkdtempSync(join(tmpdir(), 'scent-audit-profile-'))
  const child = spawn(exe, [`--user-data-dir=${dir}`, `--remote-debugging-port=${port}`], { stdio: 'ignore', detached: false })
  let page
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      page = list.find((t) => t.type === 'page' && t.url.startsWith('file://'))
      if (page) break
    } catch {}
  }
  if (!page) throw new Error('app did not start')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const logs = { errors: [], warnings: [], exceptions: [] }
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d)
      pending.delete(d.id)
    } else if (d.method === 'Runtime.consoleAPICalled') {
      const text = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ')
      if (d.params.type === 'error') logs.errors.push(text)
      else if (d.params.type === 'warning') logs.warnings.push(text)
    } else if (d.method === 'Runtime.exceptionThrown') logs.exceptions.push(d.params.exceptionDetails?.exception?.description ?? d.params.exceptionDetails?.text)
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.errors.push(`${d.params.entry.text} ${d.params.entry.url ?? ''}`)
  }
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error('eval failed: ' + (r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text))
    return r.result?.result?.value
  }
  const api = {
    child, dir, logs, send, ev,
    size: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    shot: async (file) => { mkdirSync(dirname(file), { recursive: true }); const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')) },
    go: async (hash) => { await ev(`location.hash = ${JSON.stringify(hash)}`); await sleep(700) },
    reload: async () => { await send('Page.reload'); await sleep(1800) },
    text: () => ev('document.body.innerText'),
    clickText: async (text, sel = 'button, a, [role=tab], [role=radio], [role=menuitem]') =>
      ev(`(() => { const t = ${JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().replace(/\\s+/g, ' ') === t || e.getAttribute('aria-label') === t); if (!el) return false; el.click(); return true })()`),
    clickStartsWith: async (text, sel = 'button, a') =>
      ev(`(() => { const t = ${JSON.stringify(text)}; const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.trim().replace(/\\s+/g, ' ').startsWith(t)); if (!el) return false; el.click(); return true })()`),
    type: (sel, value) => ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`),
    key: async (key, { ctrl = false } = {}) => {
      const mods = ctrl ? 2 : 0
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Escape' ? 27 : key === 'Tab' ? 9 : key === 'Enter' ? 13 : 0, modifiers: mods })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key.length === 1 ? 'Key' + key.toUpperCase() : key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : key === 'Escape' ? 27 : key === 'Tab' ? 9 : key === 'Enter' ? 13 : 0, modifiers: mods })
    },
    mouse: (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }),
    quit: async () => { try { ws.close() } catch {} child.kill(); await sleep(1500) },
    cleanup: () => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }) } catch {} }
  }
  return api
}
