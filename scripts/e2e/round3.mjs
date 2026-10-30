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
