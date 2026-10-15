// Renders build/icon.png (512x512) from an inline SVG using Electron itself, so no image tools are needed.
// Run with: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron')
const { mkdirSync, writeFileSync } = require('fs')
const { join } = require('path')

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2f1a"/><stop offset="1" stop-color="#1a110a"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="22%" r="60%"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".55"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
    <linearGradient id="liquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b24a"/><stop offset="1" stop-color="#b8541c"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/><stop offset=".85" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".3"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6420"/><stop offset=".45" stop-color="#f1d27a"/><stop offset="1" stop-color="#9a6f26"/></linearGradient>
    <linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b57a3f"/><stop offset="1" stop-color="#5b3515"/></linearGradient>
    <clipPath id="body"><path d="M166 236 Q166 214 188 214 H324 Q346 214 346 236 V396 Q346 420 322 420 H190 Q166 420 166 396 Z"/></clipPath>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="104" fill="url(#bg)"/>
  <rect x="16" y="16" width="480" height="480" rx="104" fill="url(#glow)"/>
  <rect x="40" y="418" width="432" height="26" rx="8" fill="url(#plank)"/>
  <ellipse cx="256" cy="432" rx="120" ry="10" fill="#000" opacity=".35"/>
  <rect x="226" y="176" width="60" height="44" fill="#d8d2c6" opacity=".7"/>
  <rect x="214" y="96" width="84" height="84" rx="12" fill="url(#gold)"/>
  <rect x="214" y="96" width="84" height="16" rx="8" fill="#fff" opacity=".25"/>
  <path d="M166 236 Q166 214 188 214 H324 Q346 214 346 236 V396 Q346 420 322 420 H190 Q166 420 166 396 Z" fill="#e8eef0" fill-opacity=".16"/>
  <g clip-path="url(#body)"><rect x="150" y="270" width="210" height="160" fill="url(#liquid)"/><rect x="150" y="270" width="210" height="5" fill="#fff" opacity=".5"/></g>
  <rect x="204" y="306" width="104" height="70" rx="6" fill="#f7f1e4" opacity=".9"/>
  <rect x="220" y="324" width="72" height="7" rx="3" fill="#2b2b2f" opacity=".6"/>
  <rect x="228" y="340" width="56" height="5" rx="2" fill="#2b2b2f" opacity=".35"/>
  <rect x="236" y="354" width="40" height="5" rx="2" fill="#2b2b2f" opacity=".25"/>
  <path d="M166 236 Q166 214 188 214 H324 Q346 214 346 236 V396 Q346 420 322 420 H190 Q166 420 166 396 Z" fill="url(#glass)"/>
  <path d="M166 236 Q166 214 188 214 H324 Q346 214 346 236 V396 Q346 420 322 420 H190 Q166 420 166 396 Z" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="3"/>
  <g fill="#ffe7b0"><path d="M392 120 l7 22 22 7 -22 7 -7 22 -7 -22 -22 -7 22 -7z" opacity=".9"/><path d="M120 150 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z" opacity=".7"/></g>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 512, height: 512, frame: false, transparent: true, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent}</style>${SVG}`))
  await new Promise((r) => setTimeout(r, 400))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const out = join(__dirname, '..', 'build')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'icon.png'), image.toPNG())
  console.log('wrote', join(out, 'icon.png'), image.getSize())
  app.quit()
})
