// Round 3 checks of the PACKAGED app (price entry, weather default, ratings, browse, memberships).
// Build first (npm run dist:dir), then: node scripts/e2e/round3.mjs [phase numbers, e.g. 1 2]
import { defaultExe, launch, sleep } from './harness.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const only = process.argv.slice(2).map(Number)
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(ok ? 'PASS' : 'FAIL', name, detail) }
const app = await launch(EXE)
const j = async (e) => JSON.parse((await app.ev(`(async()=>JSON.stringify(await ${e}))()`)) ?? 'null')
const fill = (label, value) => app.ev(`(() => { const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); const i = l && (l.querySelector('input, textarea, select') ?? document.getElementById(l.htmlFor)); if (!i) return false; const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const phase = (n) => only.length === 0 || only.includes(n)

try {
  await app.size(1280, 720)

  if (phase(1)) {
    console.log('--- Phase 1: price paid')
    await app.go('#/?add=1')
    await sleep(700)
    await app.clickText('Enter manually')
    await sleep(500)
    check('price fields are in the Add fragrance form', (await app.text()).includes('Price paid') && (await app.text()).includes('Purchase date'))
    await fill('Name', 'Price Test')
    await fill('House', 'E2E')
    await fill('Price paid', 'abc')
    await app.clickText('Add fragrance', '[role=dialog] button')
    await sleep(600)
    check('a non-numeric price is refused with a message', /number/i.test(await app.text()) && (await j('window.api.fragrances.list()')).length === 0)
    await fill('Price paid', '89,90')
    await fill('Where bought', 'Corner Shop')
    await fill('Purchase date', '2026-10-01')
    await app.clickText('Add fragrance', '[role=dialog] button')
    await sleep(1000)
    const list = await j('window.api.fragrances.list()')
    const f = list.find((x) => x.name === 'Price Test')
    const d = f && (await j(`window.api.fragrances.get(${f.id})`))
    check('price, shop and date are saved on the bottle', d?.bottles[0]?.price === 89.9 && d.bottles[0].boughtAt === 'Corner Shop' && d.bottles[0].purchaseDate === '2026-10-01', JSON.stringify(d?.bottles[0]))

    // a bottle without a price (like an imported placeholder) offers "Add price"
    const p = await j(`window.api.fragrances.create({ name: 'No Price', house: 'E2E', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } })`)
    await app.go(`#/?open=${p.data.id}`)
    await sleep(1200)
    check('a bottle without a price shows an Add price prompt', await app.clickText('Add price'))
    await sleep(500)
    const focused = await app.ev(`document.activeElement?.placeholder`)
    check('the price field is focused', focused === 'e.g. 89.90', String(focused))
    await app.ev(`(() => { const i = document.activeElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '55'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    await app.clickText('Save bottle')
    await sleep(900)
    const d2 = await j(`window.api.fragrances.get(${p.data.id})`)
    check('the price is saved from the prompt', d2.bottles[0].price === 55)
    check('the detail view shows what was paid', (await app.text()).includes('Paid'))
    // a decant has its own price
    const dc = await j(`window.api.bottles.add(${p.data.id}, { type: 'decant', sizeMl: 10, price: 18 })`)
    const d3 = await j(`window.api.fragrances.get(${p.data.id})`)
    check('a decant keeps its own price', dc.ok && d3.bottles.find((b) => b.type === 'decant')?.price === 18)
  }

  if (phase(2)) {
    console.log('--- Phase 2: live weather in the wear form')
    await j('window.api.dev.seedSampleData()')
    await app.reload()
    const list = await j('window.api.fragrances.list()')
    const f = list.find((x) => x.wardrobe === 'collection')
    const openForm = async () => {
      await app.go(`#/?open=${f.id}`)
      await sleep(1100)
      await app.clickText('Log a wear')
      await sleep(900)
    }
    const closeAll = async () => { await app.key('Escape'); await sleep(250); await app.key('Escape'); await sleep(300) }
    const weatherFields = () => app.ev(`({ label: !!document.querySelector('[data-testid=live-weather-label]'), temp: document.querySelector('[aria-label^="Temperature in"]')?.value, ph: document.querySelector('[aria-label^="Temperature in"]')?.placeholder, hum: document.querySelector('[aria-label="Humidity in percent"]')?.value, cond: document.querySelector('[aria-label="Conditions"]')?.value })`)

    // no location: silent, fields empty, logging still works
    await openForm()
    let w = await weatherFields()
    check('no saved location: fields stay empty and the form still opens', !w.label && w.temp === '' && (await app.ev(`!!document.querySelector('[role=dialog][aria-label^="Log a wear"]')`)), JSON.stringify(w))
    await closeAll()

    // a broken location (the service refuses it): still silent
    await j(`window.api.weather.setLocation({ label: 'Nowhere', latitude: 999, longitude: 999 })`)
    await openForm()
    w = await weatherFields()
    check('a failed lookup stays silent', !w.label && w.temp === '', JSON.stringify(w))
    await closeAll()

    // a real location
    await j(`window.api.weather.setLocation({ label: 'London', latitude: 51.5072, longitude: -0.1276 })`)
    const probe = await j('window.api.weather.current()')
    if (!probe.ok) {
      console.log('SKIP live weather checks (service not reachable):', probe.message)
    } else {
      await openForm()
      await sleep(1500)
      w = await weatherFields()
      check('today: temperature, humidity and conditions are filled in', w.temp !== '' && w.hum !== '' && w.cond !== '' && w.label, JSON.stringify(w))
      check('the temperature box is in Celsius by default', w.ph === '°C')
      await app.ev(`(() => { const i = document.querySelector('[aria-label^="Temperature in"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '3'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await sleep(200)
      w = await weatherFields()
      check('editing a field removes the "from live weather" label and keeps my value', !w.label && w.temp === '3', JSON.stringify(w))
      await closeAll()

      // a second open uses the cache (no second request)
      const t0 = Date.now()
      await j('window.api.weather.current()')
      check('a repeated lookup is answered from the cache', Date.now() - t0 < 150, `${Date.now() - t0} ms`)

      // Fahrenheit
      await j(`window.api.settings.set('units.temp', 'F')`)
      await openForm()
      await sleep(1500)
      w = await weatherFields()
      const c = (await j('window.api.weather.current()')).data.temperatureC
      check('Fahrenheit people see Fahrenheit', w.ph === '°F' && Math.abs(Number(w.temp) - (c * 9 / 5 + 32)) <= 1, JSON.stringify(w))
      // saving stores Celsius
      await app.clickText('Log wear', '[role=dialog] button')
      await sleep(1000)
      const wears = await j(`window.api.wears.list({ fragranceId: ${f.id}, limit: 1 })`)
      check('the wear is stored in Celsius', Math.abs(wears[0].temperatureC - c) <= 0.6, `${wears[0]?.temperatureC} vs ${c}`)
      await j(`window.api.settings.set('units.temp', 'C')`)
    }

    // a past day from the calendar never looks anything up
    const yesterday = new Date(Date.now() - 86400000)
    const key = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
    await app.go('#/calendar')
    await sleep(900)
    await app.ev(`document.querySelector('[aria-label^="${key}"]')?.click()`)
    await sleep(600)
    await app.ev(`(() => { const s = document.querySelector('select[aria-label="What did you wear?"]'); const o = [...s.options].find((x) => x.value.startsWith('f')); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, o.value); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await app.clickText('Log a wear', '[role=dialog] button')
    await sleep(1500)
    w = await weatherFields()
    check('a past day gets no live weather', !w.label && w.temp === '', JSON.stringify(w))
  }

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
