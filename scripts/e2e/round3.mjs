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

  if (phase(3)) {
    console.log('--- Phase 3: ratings')
    await j('window.api.dev.seedSampleData()')
    await app.reload()
    await app.go('#/')
    await sleep(900)
    const list = await j('window.api.fragrances.list()')
    const coll = list.filter((x) => x.wardrobe === 'collection')
    const target = coll[0]
    const rectOf = (id) => app.ev(`(() => { const el = [...document.querySelectorAll('main [role=button]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(`${target.name} by ${target.house}`)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 - 20 } })()`)
    const ratingOf = async (id) => (await j(`window.api.fragrances.get(${id})`))

    // quick control on hover
    await app.clickStartsWith('My Collection')
    await sleep(400)
    const c = await rectOf()
    await app.mouse('mouseMoved', c.x, c.y)
    await sleep(500)
    check('hovering a bottle shows its rating in the tooltip', /Rated \d+\/10|Not rated yet/.test(await app.text()))
    const strip = await app.ev(`!!document.querySelector('[role=radiogroup][aria-label="Rate ${target.name}"]')`)
    check('hovering a bottle shows the quick rating control', strip === true)
    await app.ev(`document.querySelector('[role=radiogroup][aria-label="Rate ${target.name}"] button[aria-label="8 out of 10"]').click()`)
    await sleep(900)
    let d = await ratingOf(target.id)
    check('clicking 8 on the shelf rates it and records the source', d.rating === 8 && d.ratingHistory[0].source === 'shelf', JSON.stringify(d.ratingHistory[0]))

    // context menu -> Rate...
    await app.mouse('mouseMoved', 5, 5)
    await sleep(300)
    await app.ev(`(() => { const el = [...document.querySelectorAll('main [role=button]')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(`${target.name} by ${target.house}`)}); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 30 })) })()`)
    await sleep(400)
    check('the context menu offers Rate…', await app.clickStartsWith('Rate…'))
    await sleep(500)
    await app.ev(`document.querySelector('[role=dialog] button[aria-label="3 out of 10"]').click()`)
    await sleep(800)
    d = await ratingOf(target.id)
    check('rating from the dialog re-rates it (8 -> 3) and keeps the history', d.rating === 3 && d.ratingHistory.length === 2, JSON.stringify(d.ratingHistory.map((h) => h.rating)))
    await app.key('Escape')
    await sleep(300)

    // rating filter
    await app.ev(`(() => { const s = document.querySelector('select[aria-label="Rating filter"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'low'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await sleep(500)
    const shown = await app.ev(`[...document.querySelectorAll('main [role=button]')].map((e) => e.getAttribute('aria-label'))`)
    check('the rating filter shows only the low-rated bottle', shown.length === 1 && shown[0].startsWith(target.name), JSON.stringify(shown))
    await app.ev(`(() => { const s = document.querySelector('select[aria-label="Rating filter"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'all'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)

    // detail panel: history, and rating from the wear form
    await app.go(`#/?open=${target.id}`)
    await sleep(1200)
    check('the detail view lists my rating over time', (await app.text()).includes('My rating over time') && (await app.text()).includes('3/10'))
    await app.clickText('Log a wear')
    await sleep(900)
    await app.ev(`document.querySelector('[role=dialog]:last-of-type button[aria-label="9 out of 10"]')?.click()`)
    await sleep(200)
    await app.clickText('Log wear', '[role=dialog] button')
    await sleep(1000)
    d = await ratingOf(target.id)
    check('rating from the wear form becomes my rating', d.rating === 9 && d.ratingHistory[0].source === 'wear', `${d.rating} ${d.ratingHistory[0]?.source}`)
    await app.key('Escape')

    // recommendations: the weight shows in "Why?"
    const [a, b] = coll.slice(1, 3)
    await j(`window.api.wardrobe.setRating(${a.id}, 10)`)
    await j(`window.api.wardrobe.setRating(${b.id}, 1)`)
    await app.go('#/recommendations')
    await sleep(1500)
    await app.ev(`[...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Why?').forEach((x) => x.click())`)
    await sleep(500)
    const txt = await app.text()
    check('the Why? breakdown mentions how my rating weighs', /Rated \d+\/10: (favoured|held back|normal)|Not rated yet: treated as neutral/.test(txt))

    // layering: suggested partners show my rating
    await app.go('#/layering')
    await sleep(900)
    await app.ev(`(() => { const s = document.querySelector('select[aria-label="Fragrance to find a partner for"]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '${coll[3].id}'); s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await sleep(800)
    check('layering partners show whether I rated them', /You rated it \d+\/10|Not rated yet/.test(await app.text()))

    // no suggestions for a fresh library
    await app.go('#/')
    await sleep(900)
    check('no rating suggestions for brand new fragrances', (await app.ev(`!document.querySelector('[aria-label="Rating suggestions"]')`)) === true)
  }

  if (phase(4)) {
    console.log('--- Phase 4: Browse')
    // a tiny dataset to search (the real one is far too big to ship)
    const { writeFileSync, mkdtempSync, readdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const csv = join(mkdtempSync(join(tmpdir(), 'scent-e2e-ds-')), 'tiny.csv')
    writeFileSync(csv, 'name,brand,year,accords,notes_top\nBrowse Test Aoud,Dataset House,2019,woody:100|amber:70,Cedar|Vanilla\nOther Thing,Dataset House,2020,citrus:100,Lemon\n')
    const an = await j(`window.api.importer.analyze(${JSON.stringify(csv)})`)
    await j(`window.api.importer.run(${JSON.stringify(csv)}, null, ${JSON.stringify(an.ok ? an.data.suggested : {})}, false)`)
    await j('window.api.dev.seedSampleData()')
    await app.reload()
    const before = { frags: (await j('window.api.fragrances.list()')).length, images: readdirSync(join(app.dir, 'images')).length }
    const searchSel = 'input[aria-label^="Search fragrances"]'

    await app.go('#/browse')
    await sleep(900)
    check('Browse is in the sidebar and opens', (await app.text()).includes('Look up any fragrance without adding it'))
    await app.type(searchSel, 'browse test')
    await sleep(800)
    check('a dataset result appears with its source label', /Dataset/.test(await app.text()) && /Browse Test Aoud/.test(await app.text()))
    await app.clickStartsWith('Browse Test Aoud', 'section[aria-label=Results] button')
    await sleep(900)
    const badge = await app.ev(`document.querySelector('[data-testid=source-badge]')?.textContent`)
    check('the detail view says it comes from the dataset', /dataset/i.test(badge ?? ''), String(badge))
    check('notes, accords and the similar-to-mine section are shown', (await app.text()).includes('Cedar') && (await app.text()).includes('Main accords') && (await app.text()).includes('Similar to what I own'))
    await app.type(searchSel, 'sauvage')
    await sleep(800)
    await app.clickStartsWith('Sauvage', 'section[aria-label=Results] button')
    await sleep(900)
    const libBadge = await app.ev(`document.querySelector('[data-testid=source-badge]')?.textContent`)
    check('a library result is labelled as in my library', /In my library/.test(libBadge ?? ''), String(libBadge) + ' | ' + (await app.ev(`[...document.querySelectorAll('section[aria-label=Results] button')].map((b) => b.textContent.trim()).join(' | ')`)))
    await app.clickText('Close')
    await sleep(300)
    const after = { frags: (await j('window.api.fragrances.list()')).length, images: readdirSync(join(app.dir, 'images')).length }
    check('browsing and closing leaves nothing behind (no rows, no images)', after.frags === before.frags && after.images === before.images, JSON.stringify({ before, after }))

    // add from Browse reuses the add form and its rules
    await app.type(searchSel, 'browse test')
    await sleep(800)
    await app.clickStartsWith('Browse Test Aoud', 'section[aria-label=Results] button')
    await sleep(700)
    await app.clickText('Add to a wardrobe…')
    await sleep(800)
    check('Add to a wardrobe opens the normal add form, prefilled', await app.ev(`[...document.querySelectorAll('[role=dialog] input')].some((i) => i.value === 'Browse Test Aoud')`))
    await app.ev(`(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === 'Wishlist'); b && b.click() })()`)
    await sleep(300)
    await app.clickText('Add fragrance', '[role=dialog] button')
    await sleep(800)
    check('the wishlist rule still applies from Browse', /smells like to you/i.test(await app.text()))
    await app.ev(`(() => { const t = [...document.querySelectorAll('[role=dialog] textarea')].find((x) => /smell/i.test((x.placeholder ?? '') + (x.closest('label')?.textContent ?? '') + (x.closest('div')?.textContent ?? '').slice(0, 200))); if (!t) return false; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, 'warm cedar and vanilla'); t.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
    await app.clickText('Add fragrance', '[role=dialog] button')
    await sleep(1200)
    const list2 = await j('window.api.fragrances.list()')
    check('it was saved only after I confirmed', list2.some((x) => x.name === 'Browse Test Aoud' && x.wardrobe === 'wishlist'))

    // Ctrl+F outside the wardrobes goes to Browse
    await app.go('#/stats')
    await sleep(500)
    await app.key('f', { ctrl: true })
    await sleep(800)
    check('Ctrl+F outside the wardrobes opens Browse', (await app.text()).includes('Look up any fragrance without adding it'))

    // a pasted link: live page, read-only, not saved
    const probe = await j(`window.api.fragrantica.importUrl('https://fragrantica.evil.com/perfume/A/B-1.html')`)
    check('a look-alike link is refused', probe.ok === false)
    await app.type(searchSel, 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html')
    await sleep(500)
    check('a pasted Fragrantica link offers to look the page up', await app.clickText('Look up this page'))
    await sleep(15000)
    const liveBadge = await app.ev(`document.querySelector('[data-testid=source-badge]')?.textContent`)
    check('the live page opens read-only and is labelled as not saved', /Live from Fragrantica \(not saved\)/.test(liveBadge ?? ''), String(liveBadge))
    check('its picture is shown without being stored', (await app.ev(`!!document.querySelector('article img')`)) === true)
    await app.clickText('Close')
    await sleep(300)
    const final = { frags: (await j('window.api.fragrances.list()')).length, images: readdirSync(join(app.dir, 'images')).length }
    check('closing the live page leaves nothing behind', final.frags === before.frags + 1 && final.images === before.images, JSON.stringify({ before, final }))
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
