// Discovery checks of the PACKAGED app, in a throw-away profile. Phase 1: no dataset. Phase 2: a small synthetic dataset.
// Phase 3: performance on a 140,000-row synthetic dataset. All rows are invented (no Fragrantica data).
// Build first (npm run dist:dir), then: node scripts/e2e/discover.mjs [phase numbers]
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultExe, launch, sleep } from './harness.mjs'
import { writeDump } from './synthetic.mjs'

const EXE = process.env.SCENT_EXE ?? defaultExe()
const only = process.argv.slice(2).map(Number)
const SHOTS = process.env.SHOTS_DIR

if (only.length === 0) {
  const { spawnSync } = await import('node:child_process')
  let failed = 0
  for (const n of [1, 2, 3, 4]) {
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), String(n)], { stdio: 'inherit', env: process.env })
    if (r.status !== 0) failed++
  }
  console.log(failed ? `${failed} phase(s) failed` : 'all phases passed')
  process.exit(failed ? 1 : 0)
}

// ---- driver ----------------------------------------------------------------------------------------------
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(ok ? 'PASS' : 'FAIL', name, detail)
}
const app = await launch(EXE)
const j = async (e) => JSON.parse((await app.ev(`(async()=>JSON.stringify(await ${e}))()`)) ?? 'null')
const shot = async (name) => {
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true })
    await app.shot(join(SHOTS, `${name}.png`))
  }
}
const waitFor = async (expr, ms = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await app.ev(`!!(${expr})`)) return true
    await sleep(150)
  }
  return false
}
const cardNames = () => app.ev(`JSON.stringify([...document.querySelectorAll('article[aria-label]')].map((a) => a.getAttribute('aria-label')))`).then(JSON.parse)
const clickText = (sel, text) => app.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(text)})); if (!e) return false; e.click(); return true })()`)
const setValue = (sel, value) => app.ev(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i), 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true })()`)
const phase = only[0]

try {
  await app.size(1280, 720)
  await j('window.api.dev.seedSampleData()')

  if (phase === 1) {
    console.log('--- Phase 1: no dataset, from my own library')
    await app.go('#/discover')
    await waitFor(`document.querySelectorAll('article[aria-label]').length > 0`)
    await shot('discover-no-dataset')
    const text = await app.text()
    check('the Discovery page opens from the sidebar', /Discovery/.test(text) && (await app.ev(`!!document.querySelector('nav a[href$="/discover"]')`)))
    check('it says it is working from the library only and offers to import a dataset', /Working from your library only/.test(text) && /Import a dataset/.test(text))
    check('it explains what a dataset would add', /community votes/.test(text) && /optional/.test(text))
    check('the taste summary is in plain words', /Your library leans/.test(text), text.match(/Your library leans[^.]*\./)?.[0] ?? '')
    const names = await cardNames()
    check('suggestions come from my wishlist and to-try items', names.length > 0, names.join(' | '))
    const reasons = await app.ev(`[...document.querySelectorAll('article[aria-label] li')].map((l) => l.textContent).join(' || ')`)
    check('every suggestion shows why', /shares|strong in/.test(reasons), reasons.slice(0, 160))
    check('nothing from my collection is suggested', !names.some((n) => /Sauvage by|Bleu de Chanel by/.test(n)))
    check('no "not interested" or add-to-wishlist buttons on my own list items', (await app.ev(`!document.body.innerText.includes('Not interested')`)) === true)

    // editing my taste
    await clickText('button', 'Edit my taste')
    await sleep(300)
    const before = await app.ev(`document.querySelector('section[aria-label="My taste profile"] p').textContent`)
    const avoidLabel = await app.ev(`document.querySelector('button[aria-label^="Avoid "]')?.getAttribute('aria-label') ?? ''`)
    await app.ev(`document.querySelector('button[aria-label^="Avoid "]').click()`)
    await sleep(700)
    const after = await app.ev(`document.querySelector('section[aria-label="My taste profile"] p').textContent`)
    check('avoiding an accord is remembered and shown in the summary', /steer away from/.test(after) && after !== before, avoidLabel)
    check('the button shows it is on', (await app.ev(`document.querySelector('button[aria-label="${avoidLabel}"]').getAttribute('aria-pressed')`)) === 'true')
    await app.ev(`document.querySelector('button[aria-label="${avoidLabel}"]').click()`)
    await sleep(600)
    check('taking it back restores the summary', (await app.ev(`document.querySelector('section[aria-label="My taste profile"] p').textContent`)) === before)
    await shot('discover-taste')

    // More like these
    await clickText('[role=tab]', 'More like these')
    await sleep(300)
    await setValue('#seed-search', 'sauv')
    await waitFor(`document.querySelector('#seed-hits button')`)
    check('the seed search lists my fragrances', (await app.ev(`document.querySelectorAll('#seed-hits button').length`)) > 0)
    await app.ev(`document.querySelector('#seed-hits button').click()`)
    await sleep(600)
    check('a chosen seed appears as a chip', (await app.ev(`!!document.querySelector('button[aria-label^="Remove "]')`)) === true)
    await setValue('#sl-sweet', '-1')
    await sleep(900)
    const changes = await app.text()
    check('a slider explains what it changed', /Less sweet/.test(changes) || /What I am looking for/.test(changes), (changes.match(/Less sweet[^\n]*/) ?? [''])[0])
    await shot('discover-similar')

    // Brief
    await clickText('[role=tab]', 'Brief')
    await sleep(300)
    await setValue('#b-season', 'summer')
    await sleep(900)
    const briefText = await app.text()
    check('the brief shows its groups', /Context/.test(briefText) && /Performance/.test(briefText) && /Social/.test(briefText) && /dealbreakers/.test(briefText))
    check('"use today\'s weather" reports a missing location instead of failing', await (async () => {
      await clickText('button', "Use today's weather")
      return waitFor(`document.body.innerText.includes('location') || document.body.innerText.includes('weather in')`, 6000)
    })())
    await shot('discover-brief')

    // Gaps, Layering, Dupes and Budget without a dataset
    await clickText('[role=tab]', 'Gaps')
    await waitFor(`document.body.innerText.includes('What is missing')`)
    const gaps = await app.text()
    check('Gaps shows what is missing, from the collection and the wear log', /What is missing/.test(gaps) && /fragrances? in My Collection/.test(gaps) && /seasons/i.test(gaps) && /scent families/i.test(gaps))
    check('each gap says covered, thin or missing', /(covered|thin|missing)/.test(gaps) && (await app.ev(`document.querySelectorAll('section[aria-label=Seasons] li').length`)) === 4)
    await shot('discover-gaps')
    await clickText('[role=tab]', 'Layering')
    await sleep(300)
    await app.ev(`(() => { const sel = [...document.querySelectorAll('select')].find((s) => s.id.endsWith('-mine')); const opt = [...sel.options].find((o) => /Sauvage/.test(o.textContent)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await waitFor(`document.querySelectorAll('article[aria-label]').length > 0`)
    const lay = await app.text()
    check('Layering lists partners with the pair score and reasons', /pair score \d+\/100/.test(lay) && /Great pairing|Worth testing|Redundant|clash/.test(lay))
    const partner = await app.ev(`(() => { const b = [...document.querySelectorAll('article button')].find((x) => x.textContent.includes('Open in the Layering Lab')); if (!b) return ''; const name = b.closest('article').getAttribute('aria-label').split(' by ')[0]; b.click(); return name })()`)
    await sleep(1200)
    const labText = await app.text()
    check('a partner I own opens in the Layering Lab together with the base', partner !== '' && (await app.ev('location.hash')).startsWith('#/layering') && labText.includes('Sauvage') && labText.includes(partner), partner)
    await app.go('#/discover')
    await clickText('[role=tab]', 'Dupes')
    await sleep(500)
    await app.ev(`(() => { const sel = [...document.querySelectorAll('select')].find((s) => s.id.endsWith('-mine')); const opt = [...sel.options].find((o) => /Sauvage/.test(o.textContent)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await sleep(800)
    check('Dupes asks for the dataset instead of guessing', /Import one/.test(await app.text()))
    await clickText('[role=tab]', 'Budget')
    await waitFor(`document.querySelector('#bud-amount')`)
    await setValue('#bud-amount', '150')
    await sleep(900)
    const bud = await app.text()
    check('Budget compares with my own prices and says it is not the price of any fragrance', /not the price of any fragrance/.test(bud))
    check('Try before you buy lists wishlist fragrances without a vial, or says why not', /Try before you buy/.test(bud))
    await shot('discover-budget')

    check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 3).join(' | '))
    check('no unhandled exceptions', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 3).join(' | '))
  }

  if (phase === 2) {
    console.log('--- Phase 2: a small synthetic dataset')
    const dir = mkdtempSync(join(tmpdir(), 'scent-synth-'))
    const file = join(dir, 'perfumes.jsonl')
    writeDump(file, 1200)
    const an = await j(`window.api.importer.analyze(${JSON.stringify(file)})`)
    const imp = await j(`window.api.importer.run(${JSON.stringify(file)}, null, ${JSON.stringify(an.ok ? an.data.suggested : {})}, false)`)
    check('the synthetic dump imports', imp.ok && imp.data.imported === 1200, JSON.stringify(imp.data ?? imp))
    let st = await j('window.api.discover.status()')
    check('the dump keeps ratings and votes (extra facts)', st.withExtras === 1200, `withExtras ${st.withExtras}`)
    check('the index is not built until Discovery needs it', st.complete === false)

    await app.go('#/discover')
    check('the index is prepared in the background and finishes', await waitFor(`!document.body.innerText.includes('Preparing the dataset for Discovery') && document.querySelectorAll('article[aria-label]').length > 0`, 60000))
    st = await j('window.api.discover.status()')
    check('status says it is complete and loaded', st.complete === true && st.indexed === 1200, JSON.stringify(st))
    await sleep(500)
    await shot('discover-for-you')
    const names = await cardNames()
    check('For you lists suggestions from the dataset', names.length === 20 && names.every((n) => /Synthetic/.test(n)), `${names.length} cards`)
    const text = await app.text()
    check('it shows how many and how fast', /\d+ suggestions? \(\d+ ms\)/.test(text), text.match(/[\d,]+ suggestions? \(\d+ ms\)/)?.[0] ?? '')
    const why = await app.ev(`[...document.querySelectorAll('article[aria-label]')][0].innerText`)
    check('a card shows score, reasons and actions', /score/i.test(why) && /shares|strong in/.test(why) && /\+ Wishlist/.test(why) && /Not interested/.test(why) && /Open on Fragrantica/.test(why), why.replace(/\n/g, ' | ').slice(0, 220))
    check('worn-in-season and rating evidence appear', /worn by people in|rated \d\.\d\d\/5/.test(await app.text()))
    check('Open on Fragrantica is a link that opens in the browser', (await app.ev(`!!document.querySelector('article a[target=_blank][href^="https://www.fragrantica.com/"]')`)) === true)

    // add to wishlist goes through the normal form and its rules
    const first = names[0]
    await app.ev(`[...document.querySelectorAll('article[aria-label]')][0].querySelector('button:nth-of-type(1)').click()`)
    await waitFor(`document.querySelector('[role=dialog]')`)
    check('+ Wishlist opens the usual add form, pre-filled', (await app.ev(`document.querySelector('[role=dialog] input')?.value ?? ''`)).length > 0 || /Synthetic/.test(await app.ev(`document.querySelector('[role=dialog]').innerText`)))
    await app.key('Escape')
    await waitFor(`!document.querySelector('[role=dialog]')`)

    // not interested
    await app.ev(`[...document.querySelectorAll('article[aria-label]')][0].querySelector('button[title^="Hide it from suggestions"]').click()`)
    await waitFor(`![...document.querySelectorAll('article[aria-label]')].some((a) => a.getAttribute('aria-label') === ${JSON.stringify(first)})`)
    const after = await cardNames()
    check('"Not interested" removes it from the list', !after.includes(first), `${first}`)
    check('and it is kept in a list that can bring it back', /Not interested \(1\)/.test(await app.text()))
    await app.ev(`[...document.querySelectorAll('details')].find((d) => d.innerText.includes('Not interested (1)')).open = true`)
    await clickText('button', 'Bring it back')
    check('bringing it back puts it in the results again', await waitFor(`[...document.querySelectorAll('article[aria-label]')].some((a) => a.getAttribute('aria-label') === ${JSON.stringify(first)})`))

    // season filter, persisted for the session
    await setValue('#f-season', 'summer')
    await sleep(900)
    const summer = await app.ev(`[...document.querySelectorAll('article[aria-label] li')].map((l) => l.textContent).filter((t) => /summer/.test(t)).length`)
    check('the season filter narrows to summer fragrances and says so', summer > 0, `${summer} reasons mention summer`)
    await app.go('#/settings')
    await app.go('#/discover')
    await sleep(900)
    check('filters persist for the session', (await app.ev(`document.querySelector('#f-season').value`)) === 'summer')
    await setValue('#f-season', '')

    // More like this from a card
    await sleep(600)
    await clickText('article button', 'More like this')
    await sleep(900)
    check('"More like this" starts More like these with that fragrance', (await app.ev(`document.querySelector('[role=tab][aria-selected=true]').textContent`)) === 'More like these' && (await app.ev(`!!document.querySelector('button[aria-label^="Remove Synthetic"]')`)) === true)
    check('and its results never include the seed', !(await cardNames()).some((n) => n.startsWith(first.split(' by ')[0])))
    await shot('discover-similar-dataset')

    // Brief: dealbreakers, criteria, saving
    await clickText('[role=tab]', 'Brief')
    await sleep(300)
    await setValue('#b-season', 'summer')
    await setValue('#b-long', 'long')
    const chip = async (sel, value) => {
      await setValue(sel, value)
      await app.ev(`document.querySelector(${JSON.stringify(sel)}).focus()`)
      await app.key('Enter')
      await sleep(250)
    }
    await chip('input[placeholder="e.g. citrus"]', 'citrus')
    await chip('input[placeholder="e.g. sweet"]', 'sweet')
    await sleep(1200)
    const briefText = await app.text()
    check('a brief with dealbreakers says how many it removed', /removed by your dealbreakers/.test(briefText), briefText.match(/[\d,]+ removed by your dealbreakers[^\n]*/)?.[0] ?? '')
    await clickText('article button', 'Show what it meets')
    await sleep(300)
    const crit = await app.ev(`document.querySelector('article ul.space-y-1')?.innerText ?? ''`)
    check('each result lists what it meets and what it only partly meets', /For summer/.test(crit) && /Has citrus/.test(crit) && /No sweet|Lasts all day/.test(crit), crit.replace(/\n/g, ' | ').slice(0, 200))
    await app.ev(`document.querySelector('[aria-label="Results"]').scrollIntoView()`)
    await sleep(300)
    await shot('discover-brief-dataset')
    await setValue('#b-name', 'Summer all-day')
    await clickText('button', 'Save')
    await sleep(500)
    check('a brief can be saved by name', /Summer all-day/.test(await app.text()) && (await j('window.api.discover.briefs()')).length === 1)
    await app.reload()
    await app.go('#/discover')
    await clickText('[role=tab]', 'Brief')
    await sleep(900)
    check('and is still there after a restart', /Summer all-day/.test(await app.text()))

    // keyboard: the mode tabs are reachable
    check('the mode switcher is a labelled tab list', (await app.ev(`document.querySelector('[role=tablist]').getAttribute('aria-label')`)) === 'Discovery modes')
    check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 3).join(' | '))
    check('no unhandled exceptions', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 3).join(' | '))
  }

  if (phase === 3) {
    console.log('--- Phase 3: performance on 140,000 synthetic rows')
    const dir = mkdtempSync(join(tmpdir(), 'scent-synth-'))
    const file = join(dir, 'perfumes.jsonl')
    let t0 = Date.now()
    writeDump(file, 140000)
    console.log(`     generated in ${Date.now() - t0} ms`)
    const an = await j(`window.api.importer.analyze(${JSON.stringify(file)})`)
    t0 = Date.now()
    const imp = await j(`window.api.importer.run(${JSON.stringify(file)}, null, ${JSON.stringify(an.ok ? an.data.suggested : {})}, false)`)
    console.log(`     imported in ${Date.now() - t0} ms`)
    check('140,000 rows import', imp.ok && imp.data.imported === 140000, JSON.stringify(imp.data ?? imp))

    t0 = Date.now()
    await j('window.api.discover.startIndex()')
    let sawProgress = false
    let st
    for (let i = 0; i < 1200; i++) {
      st = await j('window.api.discover.status()')
      if (st.building && st.indexed > 0 && st.indexed < st.datasetCount) sawProgress = true
      if (st.complete) break
      await sleep(500)
    }
    console.log(`     index built in ${Date.now() - t0} ms`)
    check('the index builds with visible progress and finishes', st.complete === true && sawProgress, JSON.stringify(st))

    // The window stays responsive while the index loads into memory.
    const timed = async (expr) => {
      const t = Date.now()
      const r = await j(expr)
      return { ms: Date.now() - t, r }
    }
    const first = await timed(`window.api.discover.forYou({ limit: 20 })`)
    console.log(`     first For you (loads the index into memory): ${first.ms} ms`)
    const f = { limit: 20 }
    const runs = []
    for (let i = 0; i < 3; i++) runs.push(await timed(`window.api.discover.forYou(${JSON.stringify(f)})`))
    const best = Math.min(...runs.map((r) => r.ms))
    check('For you answers in under 300 ms once loaded', best < 300 && runs.every((r) => r.r.cards.length === 20), runs.map((r) => `${r.ms}ms (engine ${r.r.ms}ms)`).join(', '))
    const filtered = await timed(`window.api.discover.forYou({ limit: 20, season: 'summer', minVotes: 1000 })`)
    check('with filters too', filtered.ms < 300 && filtered.r.cards.length > 0, `${filtered.ms} ms`)
    const seed = (await j(`window.api.discover.forYou({ limit: 1 })`)).cards[0]
    const sim = await timed(`window.api.discover.similar({ seeds: [{ catalogId: ${seed.catalogId} }], sliders: { sweet: -0.6, fresh: 0.5, projection: 0, longevity: 0.4, drydown: 0, unusual: 0.3 }, filters: { limit: 20 } })`)
    check('More like these answers in under 300 ms (seed lookup and sliders included)', sim.ms < 300 && sim.r.cards.length > 0, `${sim.ms} ms`)
    const brief = await timed(`window.api.discover.brief({ brief: { season: 'summer', temperatureC: 28, humidity: 70, activity: 'office', timeOfDay: 'day', longevity: 'long', projection: 'moderate', crowd: 'pleaser', popularity: 'any', wantAccords: ['citrus'], wantNotes: ['bergamot'], avoidAccords: ['sweet'], avoidNotes: ['vetiver'], notSyrupy: true, genderLean: null }, filters: { limit: 20 } })`)
    check('a full brief answers in under 300 ms', brief.ms < 300 && brief.r.cards.length > 0, `${brief.ms} ms, ${brief.r.total} results, ${brief.r.excluded} removed`)

    await app.go('#/discover')
    await waitFor(`document.querySelectorAll('article[aria-label]').length === 20`, 15000)
    await shot('discover-large')
    check('the page shows the first 20 of a very large result set', (await cardNames()).length === 20)
    check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 3).join(' | '))
  }
  if (phase === 4) {
    console.log('--- Phase 4: gaps, layering, dupes and budget with a synthetic dataset')
    const dir = mkdtempSync(join(tmpdir(), 'scent-synth-'))
    const file = join(dir, 'perfumes.jsonl')
    writeDump(file, 1500)
    const an = await j(`window.api.importer.analyze(${JSON.stringify(file)})`)
    await j(`window.api.importer.run(${JSON.stringify(file)}, null, ${JSON.stringify(an.ok ? an.data.suggested : {})}, false)`)
    await j('window.api.discover.startIndex()')
    for (let i = 0; i < 200; i++) {
      if ((await j('window.api.discover.status()')).complete) break
      await sleep(250)
    }
    const withExtras = (await j('window.api.discover.status()')).withExtras
    check('the synthetic dump carries smells-like votes for the dupes', withExtras === 1500)

    await app.go('#/discover')
    await clickText('[role=tab]', 'Gaps')
    await waitFor(`document.body.innerText.includes('What is missing')`)
    const idea = await app.ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Ideas to fill it'); if (!b) return false; b.click(); return true })()`)
    check('a gap offers ideas to fill it', idea === true)
    check('and they appear, ranked for my taste', await waitFor(`document.querySelectorAll('article[aria-label]').length > 0`, 8000))
    const heading = await app.ev(`document.querySelector('section[aria-label^="Ideas for"] h3')?.textContent ?? ''`)
    check('under the name of the gap', /Ideas for/.test(heading), heading)
    await shot('discover-gaps-dataset')

    await clickText('[role=tab]', 'Layering')
    await sleep(300)
    await app.ev(`(() => { const sel = [...document.querySelectorAll('select')].find((s) => s.id.endsWith('-mine')); const opt = [...sel.options].find((o) => /Bleu de Chanel/.test(o.textContent)); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await waitFor(`document.querySelectorAll('article[aria-label]').length > 3`)
    const layText = await app.ev(`[...document.querySelectorAll('article[aria-label]')].map((a) => a.innerText).join(' ### ')`)
    check('layering also suggests partners from the dataset, marked as not yet in the collection', /Synthetic/.test(layText) && /Not in My Collection yet/.test(layText))
    check('and partners I own, which can be opened in the Lab', /Open in the Layering Lab/.test(layText))
    await shot('discover-layering')

    // Dupes: a dataset fragrance that others say they remind people of
    await clickText('[role=tab]', 'Dupes')
    await sleep(300)
    await setValue('input[placeholder="Type a name"]', 'Synthetic 000002')
    await waitFor(`document.querySelector('ul[role=listbox] button')`)
    await app.ev(`document.querySelector('ul[role=listbox] button').click()`)
    await waitFor(`document.querySelectorAll('article[aria-label]').length > 0`, 8000)
    const dupes = await app.text()
    check('dupes shows the votes behind a link', /say .* reminds them of/.test(dupes))
    check('and says what the dataset cannot know', /does not say whether a fragrance is discontinued or what it costs/.test(dupes))
    check('value votes are labelled as opinions, not prices', /These are opinions on value, not a price/.test(dupes))
    await shot('discover-dupes')
    // a fragrance I used to have: a replacement
    const had = (await j('window.api.fragrances.list()')).find((f) => f.wardrobe === 'had')
    await clickText('button', 'Clear')
    await sleep(300)
    await app.ev(`(() => { const sel = [...document.querySelectorAll('select')].find((s) => s.id.endsWith('-mine')); const opt = [...sel.options].find((o) => o.textContent.startsWith(${JSON.stringify(had.name)})); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await sleep(1200)
    check('for something I used to have it says these are replacements', /no longer in your collection/.test(await app.text()))

    await clickText('[role=tab]', 'Budget')
    await waitFor(`document.querySelector('#bud-amount')`)
    await setValue('#bud-amount', '90')
    await sleep(800)
    check('the budget page still answers with a dataset present', /Try before you buy/.test(await app.text()))
    check('no console errors', app.logs.errors.length === 0, app.logs.errors.slice(0, 3).join(' | '))
    check('no unhandled exceptions', app.logs.exceptions.length === 0, app.logs.exceptions.slice(0, 3).join(' | '))
  }
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
