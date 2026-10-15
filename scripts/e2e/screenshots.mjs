// End-to-end check of the PACKAGED app, driven through Chromium's debug port, with a throw-away profile.
// Build first (npm run dist:dir), then: node scripts/e2e/screenshots.mjs docs/screenshots
// Set SCENT_EXE to the app executable if it is not in the default place for your system.
// Takes the README screenshots from a throw-away profile that contains ONLY the built-in sample data.
import { mkdirSync } from 'node:fs'
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const OUT = process.argv[2] ?? 'e2e-output'
mkdirSync(OUT, { recursive: true })
const app = await launch(EXE)
const j = async (e) => JSON.parse(await app.ev(`(async()=>JSON.stringify(await ${e}))()`))
const setSelect = (sel, value) => app.ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(value)}); s.dispatchEvent(new Event('change', { bubbles: true })); return !!s })()`)
try {
  await j('window.api.dev.seedSampleData()')
  const list = await j('window.api.fragrances.list()')
  const byName = (n) => list.find((f) => f.name === n)
  // a couple of decants and a sample, so the drawer has something in it
  for (const [n, type, size, rem] of [['Sauvage', 'decant', 10, 7.5], ['Santal 33', 'sample', 2, 1], ['Black Opium', 'decant', 5, 5]]) {
    const f = byName(n)
    if (f) await j(`window.api.bottles.add(${f.id}, { type: ${JSON.stringify(type)}, sizeMl: ${size}, remainingMl: ${rem}, mlPerSpray: 0.1 })`)
  }
  await app.size(1280, 720)
  await j('window.api.settings.set("ui.theme","dark")')
  await app.reload()

  const shot = async (name, top = 0) => { await sleep(700); await app.ev(`document.querySelector('main')?.scrollTo(0, ${top})`); await sleep(250); await app.shot(`${OUT}/${name}.png`) }
  await app.ev(`localStorage.setItem('drawer.open', '0')`)
  await app.go('#/'); await shot('shelf-dark')

  await app.ev(`localStorage.setItem('drawer.open', '1')`)
  await app.reload(); await app.go('#/')
  await shot('drawer', 99999)

  for (const [tab, file] of [['Wishlist', 'wishlist'], ['Had', 'had'], ['Garbage Perfumes', 'garbage']]) {
    await app.clickStartsWith(tab)
    await shot(file)
  }
  await app.clickStartsWith('My Collection')
  await sleep(500)
  // detail panel
  await app.ev(`document.querySelector('main [class*=cursor-pointer]')?.click()`)
  await sleep(900)
  await app.shot(`${OUT}/detail.png`)
  await app.key('Escape')

  await app.go('#/layering')
  await sleep(800)
  const opts = await app.ev(`[...document.querySelectorAll('main select option')].map((o) => o.value + '|' + o.textContent).slice(0, 4).join(',')`)
  const id = byName('Bleu de Chanel')?.id
  await setSelect('main select', String(id))
  await sleep(900)
  await shot('layering', 180)

  await app.go('#/recommendations'); await shot('recommendations')
  await app.go('#/calendar'); await shot('calendar')
  await app.go('#/stats'); await shot('stats')
  await app.go('#/settings'); await shot('settings')

  await j('window.api.settings.set("ui.theme","light")')
  await app.reload(); await app.go('#/')
  await shot('shelf-light')
  await app.go('#/calendar'); await shot('calendar-light')
  console.log('done; select options sample:', opts)
} finally { await app.quit(); app.cleanup() }
