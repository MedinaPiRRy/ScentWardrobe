// Contrast (WCAG AA) and layout pass over the new Round 3 screens, in both themes and at both minimum sizes.
// Drives the PACKAGED app with a throw-away profile and sample data only. Build first (npm run dist:dir).
// node scripts/e2e/a11y.mjs [outDir]
import { mkdirSync } from 'node:fs'
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const OUT = process.argv[2] ?? 'e2e-output/a11y'
mkdirSync(OUT, { recursive: true })
const app = await launch(EXE)
const j = async (e) => JSON.parse(await app.ev(`(async()=>JSON.stringify(await ${e}))()`))

// Runs inside the page: every visible text element's contrast against its effective background, plus overflow.
const AUDIT = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 } }
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 })
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) }
  const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) { if (getComputedStyle(e).backgroundImage !== 'none') return null; const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break } } let base = { r: 255, g: 255, b: 255, a: 1 }; if (!stack.length || stack[stack.length - 1].a < 1) { const bb = parse(getComputedStyle(document.body).backgroundColor); if (bb && bb.a > 0) base = bb } for (let i = stack.length - 1; i >= 0; i--) base = over(stack[i], base); return base }
  const out = []
  const seen = new Set()
  for (const el of document.querySelectorAll('body *')) {
    const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length)
    if (!direct) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue
    let op = 1; for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity)
    const fg0 = parse(cs.color); if (!fg0) continue
    const bg = bgOf(el); if (!bg) continue
    const fg = over({ ...fg0, a: fg0.a * op }, bg)
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700
    const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5
    if (ratio + 0.01 < need) {
      const t = el.textContent.trim().slice(0, 40)
      const key = t + '|' + ratio.toFixed(2)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ text: t, ratio: Number(ratio.toFixed(2)), need, px, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60) })
    }
  }
  const de = document.documentElement
  const m = document.querySelector('main')
  const clipped = [...document.querySelectorAll('button, [role=tab], a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) }).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30))
  return { contrast: out, pageOverflowX: de.scrollWidth > innerWidth + 1, mainOverflowX: m ? m.scrollWidth > m.clientWidth + 1 : false, offscreen: clipped }
})()`

let bad = 0
const report = (label, r) => {
  const n = r.contrast.length + (r.pageOverflowX ? 1 : 0) + (r.mainOverflowX ? 1 : 0) + r.offscreen.length
  bad += n
  console.log(`${n ? 'FAIL' : 'ok  '} ${label}`)
  for (const c of r.contrast) console.log(`       contrast ${c.ratio} < ${c.need}: "${c.text}" <${c.tag}> ${c.px}px ${c.cls}`)
  if (r.pageOverflowX) console.log('       page scrolls sideways')
  if (r.mainOverflowX) console.log('       main scrolls sideways')
  if (r.offscreen.length) console.log('       outside the window: ' + r.offscreen.join(', '))
}

try {
  await j('window.api.dev.seedSampleData()')
  const list = await j('window.api.fragrances.list()')
  const sauvage = list.find((f) => f.name === 'Sauvage') ?? list[0]
  await j(`window.api.fragrances.rate ? window.api.fragrances.rate(${sauvage.id}, 8, null) : null`).catch(() => null)
  const sizes = [[1280, 720], [1100, 640]]
  for (const theme of ['dark', 'light']) {
    await j(`window.api.settings.set("ui.theme", ${JSON.stringify(theme)})`)
    for (const [w, h] of sizes) {
      await app.size(w, h)
      await app.reload()
      const tag = `${theme} ${w}x${h}`
      const snap = async (name, label) => { await sleep(700); await app.shot(`${OUT}/${theme}-${w}-${name}.png`); report(`${tag} ${label}`, await j(AUDIT)) }

      await app.go('#/'); await snap('shelf', 'shelf')
      // rating strip on hover
      await app.ev(`(() => { const c = document.querySelector('main [class*=cursor-pointer]'); c?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); c?.focus?.() })()`)
      await snap('shelf-hover', 'shelf with a card focused')
      for (const tab of ['Wishlist', 'To Try', 'Had', 'Garbage Perfumes']) { await app.clickStartsWith(tab); await snap('tab-' + tab.replace(/\W/g, ''), 'tab ' + tab) }
      await app.clickStartsWith('My Collection'); await sleep(400)
      // context menu
      await app.ev(`(() => { const c = document.querySelector('main [class*=cursor-pointer]'); const r = c.getBoundingClientRect(); c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 20, clientY: r.top + 20 })) })()`)
      await snap('context-menu', 'context menu'); await app.key('Escape')
      // detail
      await app.ev(`document.querySelector('main [class*=cursor-pointer]')?.click()`)
      await sleep(900); await snap('detail', 'detail panel')
      await app.ev(`document.querySelector('[role=dialog], aside')?.scrollTo?.(0, 99999)`)
      await snap('detail-bottom', 'detail panel scrolled'); await app.key('Escape')
      await app.go('#/browse'); await snap('browse', 'Browse')
      await app.ev(`(() => { const i = document.querySelector('main input'); if (i) { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, 'sauv'); i.dispatchEvent(new Event('input', { bubbles: true })) } })()`)
      await sleep(900); await snap('browse-results', 'Browse with results')
      await app.go('#/'); await app.clickStartsWith('⟳'); await sleep(3500); await snap('update-dialog', 'update dialog'); await app.key('Escape')
      for (const [hash, name] of [['#/recommendations', 'recommendations'], ['#/layering', 'layering'], ['#/calendar', 'calendar'], ['#/stats', 'stats'], ['#/settings', 'settings']]) { await app.go(hash); await snap(name, name) }
    }
  }
  console.log(bad ? `\n${bad} problem(s)` : '\nall clean')
} finally {
  await app.quit()
}
process.exit(bad ? 1 : 0)
