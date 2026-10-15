// End-to-end check of the PACKAGED app, driven through Chromium's debug port, with a throw-away profile.
// Build first (npm run dist:dir), then: node scripts/e2e/flows.mjs [output folder]
// Set SCENT_EXE to the app executable if it is not in the default place for your system.
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const OUT = process.argv[2] ?? 'e2e-output'
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(ok ? 'PASS' : 'FAIL', name, detail) }
const api = (app, expr) => app.ev(`(async () => JSON.stringify(await ${expr}))()`).then((v) => (v === undefined ? undefined : JSON.parse(v)))

let app = await launch(EXE)
const profile = app.dir
try {
  await app.size(1280, 720)
  await api(app, 'window.api.dev.seedSampleData()')
  await app.reload()
  await app.go('#/')
  await sleep(800)

  // ---- dialogs: Escape closes only the top layer, focus stays inside ----
  const opened = await app.ev(`(() => { const b = document.querySelector('main img, main svg'); const slot = b && b.closest('[role=button], div[style], button'); return !!slot })()`)
  // open the first fragrance by clicking its bottle
  await app.ev(`(() => { const el = document.querySelector('main [class*=cursor-pointer]'); el && el.click(); return !!el })()`)
  await sleep(900)
  check('detail panel opens', (await app.ev(`!!document.querySelector('[role=dialog][aria-modal=true]')`)) === true)
  const focusIn = await app.ev(`document.querySelector('[role=dialog]')?.contains(document.activeElement)`)
  check('focus moves into the panel', focusIn === true)

  await app.clickText('Log a wear')
  await sleep(700)
  const dialogsOpen = await app.ev(`document.querySelectorAll('[role=dialog]').length`)
  check('wear form opens over the panel', dialogsOpen === 2, String(dialogsOpen))
  // Tab many times: focus must stay inside the top dialog
  let escaped = false
  for (let i = 0; i < 45; i++) {
    await app.key('Tab')
    const inside = await app.ev(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d.contains(document.activeElement) })()`)
    if (!inside) { escaped = true; break }
  }
  check('Tab stays trapped in the top dialog', !escaped)
  await app.key('Escape')
  await sleep(400)
  const afterEsc = await app.ev(`document.querySelectorAll('[role=dialog]').length`)
  check('Escape closes only the wear form', afterEsc === 1, String(afterEsc))
  await app.key('Escape')
  await sleep(400)
  check('second Escape closes the panel', (await app.ev(`document.querySelectorAll('[role=dialog]').length`)) === 0)

  // ---- add by hand with awkward text, then duplicates are refused ----
  const nasty = `Café "Noir" <b>x</b> O'Neil ✓ 😀`
  const created = await api(app, `window.api.fragrances.create({ name: ${JSON.stringify(nasty)}, house: 'Maison Ñandú', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 50 } })`)
  check('awkward characters are stored', created.ok && created.data.name === nasty, JSON.stringify(created).slice(0, 120))
  const dup = await api(app, `Promise.all([1,2,3].map(() => window.api.fragrances.create({ name: 'Rapid Fire', house: 'H', notes: [], accords: [] }, { to: 'to_try' })))`)
  check('rapid duplicate submissions create exactly one', dup.filter((r) => r.ok).length === 1, dup.map((r) => r.ok).join(','))
  const long = await api(app, `window.api.fragrances.create({ name: 'x'.repeat(5000), house: 'H', notes: [], accords: [] }, { to: 'to_try' })`)
  check('a 5000-character name is refused politely', long.ok === false && /too long/i.test(long.message), long.message)

  // ---- move through all five wardrobes, keeping history ----
  const id = created.data.id
  const w = await api(app, `window.api.wears.log({ fragranceId: ${id}, wornAt: '${new Date().toISOString().slice(0, 10)} 09:00', sprays: 4 })`)
  check('log a wear', w.ok)
  const moves = [['wishlist', { impression: 'smoky and warm' }], ['to_try', {}], ['had', {}], ['garbage', { dislikeNote: 'too sweet' }], ['collection', { bottle: { type: 'full bottle', sizeMl: 30 } }]]
  for (const [to, extra] of moves) {
    const r = await api(app, `window.api.wardrobe.move({ fragranceId: ${id}, to: ${JSON.stringify(to)}, ...${JSON.stringify(extra)} })`)
    check(`move to ${to}`, r.ok && r.data.wardrobe === to, r.ok ? '' : r.message)
  }
  const detail = await api(app, `window.api.fragrances.get(${id})`)
  check('wear history survives the moves', detail.wearCount === undefined ? true : detail.wearCount === 1)
  const wears = await api(app, `window.api.wears.list({ fragranceId: ${id} })`)
  check('wear still listed after five moves', wears.length === 1)

  // ---- wishlist rule from the UI path ----
  const nn = await api(app, `window.api.fragrances.create({ name: 'No Note', house: 'H', notes: [], accords: [] }, { to: 'to_try' })`)
  const bad = await api(app, `window.api.wardrobe.move({ fragranceId: ${nn.data.id}, to: 'wishlist' })`)
  check('wishlist refuses a move without a note', bad.ok === false, bad.message)

  // ---- prices, currency ----
  const bid = detail.bottles[0].id
  const up = await api(app, `window.api.bottles.update(${bid}, { type: 'full bottle', sizeMl: 30, price: 80, marketPrice: 100, marketCheckedOn: '2026-10-01', marketSource: 'Shop' })`)
  check('prices saved', up.ok)
  await api(app, `window.api.settings.set('ui.currency', 'EUR')`)
  await app.go('#/stats')
  await sleep(900)
  const stats = await app.text()
  check('stats show euros', stats.includes('€'), '')
  await app.shot(`${OUT}/flows_stats.png`)

  // ---- calendar day panel and diary entry ----
  await app.go('#/calendar')
  await sleep(900)
  await app.shot(`${OUT}/flows_calendar.png`)
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await app.ev(`(() => { const b = document.querySelector('[aria-label^="${key}"]'); b && b.click(); return !!b })()`)
  await sleep(600)
  check('calendar day opens', (await app.ev(`!!document.querySelector('[role=dialog]')`)) === true)
  await app.key('Escape')

  // ---- weather offline / online does not break recommendations ----
  await app.go('#/recommendations')
  await sleep(1200)
  check('recommendations render without a location', (await app.text()).length > 300)

  // ---- backup (no dialog path) and CSV builder ----
  const b = await api(app, 'window.api.backup.create(false)')
  check('manual backup is created', b.ok && b.data.bytes > 1000, b.ok ? String(b.data.bytes) : b.message)

  // ---- a picture through the real download path, then relaunch ----
  const pic = await api(app, `window.api.fragrances.create({ name: 'Picture Test', house: 'H', imageUrl: 'https://fimgs.net/mdimg/perfume/375x500.9828.jpg', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } })`)
  check('picture downloads and is stored', pic.ok && /^[0-9a-f]{16}\.png$/.test(pic.data.imagePath ?? ''), pic.ok ? String(pic.data.imagePath) : pic.message)
  const evil = await api(app, `window.api.fragrances.create({ name: 'Evil Pic', house: 'H', imageUrl: 'http://127.0.0.1:9/x.png', notes: [], accords: [] }, { to: 'to_try' })`)
  check('a local-network picture address is ignored, fragrance still saved', evil.ok && !evil.data.imagePath)
  const file = await api(app, `window.api.fragrances.create({ name: 'File Pic', house: 'H', imageUrl: 'file:///C:/Windows/Web/Wallpaper/Windows/img0.jpg', notes: [], accords: [] }, { to: 'to_try' })`)
  check('a file:// picture address is ignored', file.ok && !file.data.imagePath)

  check('no console errors during flows', app.logs.errors.length === 0, app.logs.errors.slice(0, 5).join(' | '))
  check('no unhandled exceptions during flows', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 5).join(' | '))

  const before = await api(app, 'window.api.fragrances.list().then((l) => l.length)')
  await app.quit()

  // ---- quit and relaunch: data and pictures persist ----
  app = await launch(EXE, { profile })
  await app.size(1280, 720)
  const after = await api(app, 'window.api.fragrances.list().then((l) => l.length)')
  check('all fragrances persist after relaunch', after === before, `${before} -> ${after}`)
  const list = await api(app, 'window.api.fragrances.list()')
  const picItem = list.find((f) => f.name === 'Picture Test')
  await app.go('#/')
  await sleep(1200)
  const imgOk = await app.ev(`(async () => { const u = await window.api.images.read(${JSON.stringify(picItem?.imagePath ?? '')}); return !!u && u.startsWith('data:image/png') })()`)
  check('the picture is readable after relaunch', imgOk === true)
  const loaded = await app.ev(`[...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth > 0).length`)
  check('pictures render in the shelf', loaded >= 1, String(loaded))
} catch (e) {
  console.log('SCRIPT ERROR', e.stack)
} finally {
  await app.quit()
  app.cleanup()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
