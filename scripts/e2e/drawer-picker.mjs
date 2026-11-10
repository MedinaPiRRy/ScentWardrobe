// Checks of the PACKAGED app: dragging vials in the drawer to rearrange them, and the searchable "What did you wear?" picker.
// Build first (npm run dist:dir), then: node scripts/e2e/drawer-picker.mjs. Uses a throw-away profile with sample data only.
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, detail) }
const app = await launch(EXE)
const j = async (e) => JSON.parse((await app.ev(`(async()=>JSON.stringify(await ${e}))()`)) ?? 'null')
const mouse = (type, x, y) => app.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 })

try {
  await j('window.api.dev.seedSampleData()')
  const list = await j('window.api.fragrances.list()')
  for (const [n, type, size] of [['Sauvage', 'decant', 10], ['Santal 33', 'sample', 2], ['Black Opium', 'decant', 5], ['Bleu de Chanel', 'decant', 10]]) {
    const f = list.find((x) => x.name === n)
    if (f) await j(`window.api.bottles.add(${f.id}, { type: ${JSON.stringify(type)}, sizeMl: ${size}, remainingMl: ${size}, mlPerSpray: 0.1 })`)
  }
  await app.size(1280, 720)
  await app.ev(`localStorage.setItem('drawer.open', '1')`)
  await app.reload()
  await app.go('#/')
  await sleep(800)

  // ---- drawer ----
  const drawerCards = () => app.ev(`(() => { const d = document.querySelector('[aria-label="Drawer for decants, samples and minis"]'); return JSON.stringify([...d.querySelectorAll('[aria-roledescription="sortable"]')].map((e) => { const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') ?? '', x: r.x + r.width / 2, y: r.y + r.height / 2 } })) })()`).then(JSON.parse)
  const before = await drawerCards()
  check('the drawer shows several vials', before.length >= 3, before.map((c) => c.name).join(', '))
  const names = (cs) => cs.map((c) => c.name)

  const first = before[0]
  const last = before[before.length - 1]
  await mouse('mouseMoved', first.x, first.y)
  await mouse('mousePressed', first.x, first.y)
  for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', first.x + ((last.x - first.x) * i) / 12, first.y + ((last.y - first.y) * i) / 12); await sleep(30) }
  await mouse('mouseReleased', last.x, last.y)
  await sleep(700)
  const after = await drawerCards()
  check('dragging a vial moves it', names(after)[names(after).length - 1] === names(before)[0] && names(after).join() !== names(before).join(), `${names(before).join(' > ')}  =>  ${names(after).join(' > ')}`)
  check('a drag does not open the vial', (await app.ev(`!!document.querySelector('[role=dialog]')`)) === false)
  const saved = await j(`window.api.settings.get('drawer.order')`)
  check('the new order is saved', typeof saved === 'string' && JSON.parse(saved).length === after.length, saved)
  await app.reload()
  await app.go('#/')
  await sleep(800)
  const reloaded = await drawerCards()
  check('the order survives a restart of the page', names(reloaded).join('|') === names(after).join('|'), names(reloaded).join(' > '))

  // searching turns dragging off and does not lose the saved order
  await app.type('input[placeholder^="Search"]', 'sauv')
  await sleep(500)
  await app.type('input[placeholder^="Search"]', '')
  await sleep(500)
  check('the saved order is kept after a search', names(await drawerCards()).join('|') === names(after).join('|'))

  // ---- calendar picker ----
  await app.go('#/calendar')
  await sleep(900)
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  await app.ev(`document.querySelector('[aria-label^="${key}"]')?.click()`)
  await sleep(600)
  const opts = () => app.ev(`JSON.stringify([...document.querySelectorAll('[role=dialog] [role=option]')].map((o) => o.innerText.replace(/\\s+/g, ' ')))`).then(JSON.parse)
  const combo = `[role=dialog] [role=combobox]`
  check('the picker is a searchable combobox', (await app.ev(`!!document.querySelector('${combo}')`)) === true)
  await app.ev(`document.querySelector('${combo}').focus()`)
  await sleep(300)
  const all = await opts()
  check('focusing it lists everything', all.length >= 10, String(all.length))
  check('decants are tagged', all.some((o) => /decant|sample/.test(o)), all.filter((o) => /decant|sample/.test(o)).join(' | '))
  await app.type(combo, 'sauv')
  await sleep(300)
  const some = await opts()
  check('typing narrows the list', some.length > 0 && some.length < all.length && some.every((o) => /sauv/i.test(o)), some.join(' | '))
  await app.type(combo, 'dior sauv')
  await sleep(300)
  check('house and name words can be combined', (await opts()).length >= 1)
  await app.type(combo, 'zzzzzz')
  await sleep(300)
  check('no match says so', /Nothing matches/.test(await app.text()))
  await app.type(combo, 'sauv')
  await sleep(300)
  await app.key('ArrowDown')
  await app.key('Enter')
  await sleep(300)
  const chosen = await app.ev(`document.querySelector('${combo}').value`)
  check('arrow keys and Enter choose', /sauv/i.test(chosen), chosen)
  check('Log a wear is enabled once chosen', (await app.ev(`![...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Log a wear').disabled`)) === true)
  await app.key('ArrowDown')
  await sleep(200)
  check('arrow down reopens the list', (await opts()).length > 0)
  await app.key('Escape')
  await sleep(300)
  check('Escape closes the list first, not the day panel', (await app.ev(`!!document.querySelector('[role=dialog]')`)) === true && (await opts()).length === 0)
  await app.ev(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Log a wear').click()`)
  await sleep(900)
  check('the wear form opens for the chosen fragrance', /Sprays|Log a wear/i.test(await app.text()) && (await app.ev(`document.querySelectorAll('[role=dialog]').length`)) >= 1)

  check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 3).join(' | '))
  check('no unhandled exceptions', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 3).join(' | '))
} catch (e) {
  console.log('SCRIPT ERROR', e.stack)
  results.push({ name: 'script ran', ok: false })
} finally {
  await app.quit()
  app.cleanup()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
