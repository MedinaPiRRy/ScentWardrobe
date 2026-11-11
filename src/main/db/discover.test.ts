import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { EMPTY_BRIEF } from '@shared/discover/brief'
import { NO_SLIDERS } from '@shared/discover/similar'
import { openDatabase } from '../db'
import { runImport } from '../data/catalog'
import { clearDataset } from '../data/catalog'
import { buildDiscoverIndex, cancelDiscoverIndex, deleteBrief, discoverBrief, discoverForYou, discoverSimilar, discoverStatus, getOverrides, getTaste, ignoreFragrance, invalidateDiscoverIndex, listBriefs, listIgnored, loadDiscoverIndex, saveBrief, setOverride, startDiscoverIndex, unignoreFragrance } from './discover'
import { createFragrance } from './editing'

type Db = ReturnType<typeof openDatabase>

const insertCatalog = (db: Db, rows: { name: string; house: string; accords: [string, number][]; notes?: string[]; conc?: string | null; pop?: number; extra?: object; community?: object }[]) => {
  const ins = db.prepare('INSERT INTO catalog_fragrances (name, house, year, concentration, data, popularity, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const ex = db.prepare('INSERT INTO catalog_extra (catalog_id, extra) VALUES (?, ?)')
  db.transaction(() => {
    rows.forEach((r, i) => {
      const data = { name: r.name, house: r.house, accords: r.accords.map(([name, strength]) => ({ name, strength })), notes: (r.notes ?? []).map((n) => ({ name: n, layer: 'top' })), community: r.community ?? null, imageUrl: null }
      const id = Number(ins.run(r.name, r.house, 2000 + (i % 20), r.conc ?? null, JSON.stringify(data), r.pop ?? 100, `https://www.fragrantica.com/perfume/${r.house}/${r.name.replace(/ /g, '-')}-${1000 + i}.html`).lastInsertRowid)
      ex.run(id, JSON.stringify({ fid: 1000 + i, rating: { a: 4.2, n: 800 }, people: 2000, ...(r.extra ?? {}) }))
    })
  })()
}

const mine = (db: Db, name: string, house: string, accords: [string, number][], to: 'collection' | 'wishlist' | 'garbage' | 'to_try', rating?: number) => {
  const r = createFragrance(
    db,
    { name, house, notes: [], accords: accords.map(([n, s]) => ({ name: n, strength: s })), ...(to === 'wishlist' ? {} : {}) },
    to === 'collection' ? { to, bottle: { type: 'full bottle', sizeMl: 100 } } : to === 'wishlist' ? { to, impression: 'smells good' } : to === 'garbage' ? { to, dislikeNote: 'no' } : { to }
  )
  if (!r.ok) throw new Error(r.message)
  if (rating) db.prepare('UPDATE fragrances SET rating = ? WHERE id = ?').run(rating, r.data.id)
  return r.data.id
}

const dataset = [
  { name: 'Citrus Wood', house: 'Alpha', accords: [['citrus', 100], ['woody', 70]] as [string, number][], pop: 5000 },
  { name: 'Sweet Vanilla', house: 'Alpha', accords: [['sweet', 100], ['vanilla', 90]] as [string, number][], pop: 9000 },
  { name: 'Citrus Mint', house: 'Beta', accords: [['citrus', 90], ['aromatic', 60], ['woody', 30]] as [string, number][], pop: 100, community: { summer: 900, winter: 50, spring: 100, fall: 50 } },
  { name: 'Owned One', house: 'Gamma', accords: [['citrus', 100], ['woody', 80]] as [string, number][], pop: 7000 }
]

describe('building the Discovery index', () => {
  it('builds from the dataset, reports progress and then serves rows', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    expect(discoverStatus(db)).toMatchObject({ datasetCount: 4, indexed: 0, complete: false, building: false })
    const seen: number[] = []
    expect(await buildDiscoverIndex(db, { onProgress: (d) => seen.push(d) })).toBe('done')
    expect(seen.at(-1)).toBe(4)
    expect(discoverStatus(db)).toMatchObject({ indexed: 4, complete: true, withExtras: 4 })
    const index = (await loadDiscoverIndex(db))!
    expect(index.n).toBe(4)
    expect(index.accords(0)).toEqual([{ name: 'citrus', strength: 100 }, { name: 'woody', strength: 70 }])
    expect(discoverStatus(db).loaded).toBe(true)
  })

  it('can be interrupted at any point and resumes without duplicates', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, Array.from({ length: 3200 }, (_, i) => ({ name: `Row ${i}`, house: `H${i % 7}`, accords: [['citrus', 50 + (i % 50)]] as [string, number][] })))
    let first = true
    const r1 = await buildDiscoverIndex(db, {
      onProgress: () => {
        if (first) {
          first = false
          cancelDiscoverIndex(db)
        }
      }
    })
    expect(r1).toBe('cancelled')
    const part = discoverStatus(db)
    expect(part.complete).toBe(false)
    expect(part.indexed).toBeGreaterThan(0)
    expect(part.indexed).toBeLessThan(3200)
    expect(await loadDiscoverIndex(db)).toBeNull()
    expect(await buildDiscoverIndex(db)).toBe('done')
    expect(discoverStatus(db)).toMatchObject({ indexed: 3200, complete: true })
    expect((db.prepare('SELECT count(DISTINCT catalog_id) AS c FROM discover_features').get() as { c: number }).c).toBe(3200)
  })

  it('startDiscoverIndex returns at once and the index appears in the background', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    expect(startDiscoverIndex(db).building).toBe(true)
    for (let i = 0; i < 100 && !discoverStatus(db).complete; i++) await new Promise((r) => setTimeout(r, 10))
    expect(discoverStatus(db)).toMatchObject({ complete: true, building: false })
    // asking again when everything is built does nothing
    expect(startDiscoverIndex(db).building).toBe(false)
  })

  it('is thrown away when the dataset changes and rebuilt on demand', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    await buildDiscoverIndex(db)
    invalidateDiscoverIndex(db)
    expect(discoverStatus(db)).toMatchObject({ indexed: 0, complete: false, loaded: false })
    expect(await loadDiscoverIndex(db)).toBeNull()
    await buildDiscoverIndex(db)
    expect((await loadDiscoverIndex(db))!.n).toBe(4)
    clearDataset(db)
    expect(discoverStatus(db)).toMatchObject({ datasetCount: 0, indexed: 0, complete: false })
  })

  it('an older index (a different version) is rebuilt rather than trusted', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    await buildDiscoverIndex(db)
    db.prepare("UPDATE settings SET value = '0' WHERE key = 'discover.index.version'").run()
    expect(discoverStatus(db)).toMatchObject({ complete: false, stale: true })
    expect(await buildDiscoverIndex(db)).toBe('done')
    expect(discoverStatus(db)).toMatchObject({ complete: true, stale: false, indexed: 4 })
  })

  it('survives a damaged row without stopping the build', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    db.prepare("UPDATE catalog_fragrances SET data = 'not json' WHERE id = 1").run()
    db.prepare("UPDATE catalog_extra SET extra = '{oops' WHERE catalog_id = 2").run()
    expect(await buildDiscoverIndex(db)).toBe('done')
    expect(discoverStatus(db).indexed).toBe(4)
  })
})

describe('importing again keeps the extra facts and resets the index', () => {
  const record = (extra: object = {}) => ({
    id: 77001, slug: 'Invented/Thing', url: 'https://www.fragrantica.com/perfume/Invented/Thing-77001.html', name: 'Thing', brand: 'Invented', year: 2020, gender: 'unisex',
    accords: [{ name: 'citrus', strength: 100 }], notes: { tiered: { top: [{ name: 'Lemon', weight: 70 }], middle: [], base: [] }, flat: [] },
    seasons: { winter: 1, spring: 2, summer: 3, autumn: 4 }, daypart: { day: 5, night: 6 }, popularity: { magnitude: 1000 }, ...extra
  })
  const file = (rows: object[]) => {
    const p = join(mkdtempSync(join(tmpdir(), 'scent-')), 'd.jsonl')
    writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')
    return p
  }

  it('fills in rating, note weights and votes for rows an older import left bare', async () => {
    const db = openDatabase(':memory:')
    const bare = file([record()])
    const full = file([record({ rating: { average: 4.4, histogram: [{ bucket: 5, count: 40 }, { bucket: 4, count: 10 }] }, people: 321, popularity: { magnitude: 1000, recent_magnitude: 300 }, relation: { have: 9, had: 1, want: 4 } })])
    const first = await runImport(db, bare, null, {}, false)
    expect(first).toMatchObject({ imported: 1, enriched: 0 })
    expect(db.prepare('SELECT count(*) AS c FROM catalog_extra').get()).toEqual({ c: 1 })
    expect(JSON.parse((db.prepare('SELECT extra FROM catalog_extra').get() as { extra: string }).extra)).toMatchObject({ fid: 77001, nw: { Lemon: 70 } })
    await buildDiscoverIndex(db)
    expect(discoverStatus(db).complete).toBe(true)

    const second = await runImport(db, full, null, {}, false)
    expect(second).toMatchObject({ imported: 0, skipped: 1, enriched: 1 })
    // the dataset changed, so the index starts over
    expect(discoverStatus(db)).toMatchObject({ complete: false, indexed: 0 })
    expect(JSON.parse((db.prepare('SELECT extra FROM catalog_extra').get() as { extra: string }).extra)).toMatchObject({ rating: { a: 4.4, n: 50 }, people: 321, recent: 300, rel: { have: 9, had: 1, want: 4 } })
    await buildDiscoverIndex(db)
    const index = (await loadDiscoverIndex(db))!
    expect(index.rating[0]).toBeCloseTo(4.4)
    expect(index.noteVal[0]).toBe(70)
  })

  it('keeps the extras out of the saved fragrance data', async () => {
    const db = openDatabase(':memory:')
    await runImport(db, file([record({ rating: { average: 4, histogram: [{ bucket: 4, count: 5 }] } })]), null, {}, false)
    expect(JSON.parse((db.prepare('SELECT data FROM catalog_fragrances').get() as { data: string }).data)).not.toHaveProperty('extra')
  })
})

describe('For you', () => {
  it('says what is missing when the library is empty, with or without a dataset', async () => {
    const db = openDatabase(':memory:')
    expect((await discoverForYou(db)).message).toMatch(/Add some fragrances/)
    insertCatalog(db, dataset)
    expect((await discoverForYou(db)).message).toMatch(/Add some fragrances/)
  })

  it('without a dataset it ranks what is on my wishlist and to-try list, never what I own or put in the bin', async () => {
    const db = openDatabase(':memory:')
    mine(db, 'Mine A', 'X', [['citrus', 100], ['woody', 80]], 'collection', 9)
    const w1 = mine(db, 'Wish Close', 'X', [['citrus', 90], ['woody', 50]], 'wishlist')
    mine(db, 'Wish Far', 'X', [['sweet', 100], ['vanilla', 100]], 'to_try')
    mine(db, 'Bin', 'X', [['citrus', 100]], 'garbage')
    const r = await discoverForYou(db)
    expect(r.mode).toBe('library')
    expect(r.cards[0]).toMatchObject({ source: 'library', fragranceId: w1, name: 'Wish Close' })
    expect(r.cards[0].reasons[0].text).toBe('shares citrus and woody with Mine A')
    expect(r.cards.map((c) => c.name)).not.toContain('Mine A')
    expect(r.cards.map((c) => c.name)).not.toContain('Bin')
  })

  it('with a dataset it suggests what I do not own, explains why, and remembers "not interested"', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    mine(db, 'Owned One', 'Gamma', [['citrus', 100], ['woody', 80]], 'collection', 9)
    mine(db, 'Citrus Mint', 'Beta', [['aromatic', 100]], 'garbage')
    expect((await discoverForYou(db)).message).toMatch(/needs to prepare/)
    await buildDiscoverIndex(db)
    const r = await discoverForYou(db)
    expect(r.mode).toBe('dataset')
    const names = r.cards.map((c) => c.name)
    expect(names).not.toContain('Owned One')
    expect(names).not.toContain('Citrus Mint')
    expect(names[0]).toMatch(/Citrus/)
    expect(r.cards[0].reasons.map((x) => x.text).join(' ')).toMatch(/shares citrus and woody with Owned One/)
    expect(r.hidden).toMatchObject({ owned: 1, garbage: 1 })
    expect(r.ms).toBeLessThan(300)

    const top = r.cards[0]
    ignoreFragrance(db, { name: top.name, house: top.house, concentration: top.concentration })
    expect((await discoverForYou(db)).cards.map((c) => c.name)).not.toContain(top.name)
    expect(listIgnored(db)).toHaveLength(1)
    const showAll = await discoverForYou(db, { hide: { owned: false, garbage: false, wishlist: false, toTry: false, had: false, ignored: false } })
    expect(showAll.cards.map((c) => c.name)).toContain(top.name)
    expect(showAll.cards.find((c) => c.name === 'Owned One')!.inWardrobes).toEqual(['collection'])
    unignoreFragrance(db, listIgnored(db)[0].key)
    expect((await discoverForYou(db)).cards.map((c) => c.name)).toContain(top.name)
  })

  it('links a suggestion to the fragrance in my library when it is already there (wishlist)', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    mine(db, 'Owned One', 'Gamma', [['citrus', 100], ['woody', 80]], 'collection', 9)
    const wid = mine(db, 'Citrus Mint', 'Beta', [['citrus', 90]], 'wishlist')
    await buildDiscoverIndex(db)
    const card = (await discoverForYou(db)).cards.find((c) => c.name === 'Citrus Mint')!
    expect(card).toMatchObject({ fragranceId: wid, inWardrobes: ['wishlist'] })
    const hidden = await discoverForYou(db, { hide: { owned: true, garbage: true, wishlist: true, toTry: false, had: false, ignored: true } })
    expect(hidden.cards.map((c) => c.name)).not.toContain('Citrus Mint')
  })
})

describe('my taste profile edits', () => {
  it('saves love/mute/avoid, applies them and can take them back', () => {
    const db = openDatabase(':memory:')
    mine(db, 'Mine A', 'X', [['citrus', 100]], 'collection', 9)
    expect(getTaste(db).taste.accords[0].name).toBe('citrus')
    const r = setOverride(db, 'accord', 'Citrus', 'avoid')
    expect(r.ok && r.data.taste.accords.find((a) => a.name === 'citrus')).toMatchObject({ override: 'avoid', weight: 0 })
    expect(getOverrides(db).accords).toEqual({ citrus: 'avoid' })
    const back = setOverride(db, 'accord', 'citrus', null)
    expect(back.ok && back.data.taste.accords[0].override).toBeUndefined()
    expect(setOverride(db, 'accord', '  ', 'love').ok).toBe(false)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('discover.profile', 'garbage')").run()
    expect(getOverrides(db)).toEqual({ accords: {}, notes: {} })
  })
})

describe('More like these and briefs through the database', () => {
  it('finds the seeds neighbours and applies the sliders', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    mine(db, 'Owned One', 'Gamma', [['citrus', 100], ['woody', 80]], 'collection', 9)
    await buildDiscoverIndex(db)
    const r = await discoverSimilar(db, { seeds: [{ catalogId: 1 }], sliders: { ...NO_SLIDERS, sweet: -1 }, filters: {} })
    expect(r.seeds).toEqual([{ name: 'Citrus Wood', house: 'Alpha' }])
    expect(r.cards.map((c) => c.name)).not.toContain('Citrus Wood')
    expect(r.cards[0].reasons[0].text).toMatch(/with Citrus Wood/)
    expect(r.before.length).toBeGreaterThan(0)
    const none = await discoverSimilar(db, { seeds: [], sliders: NO_SLIDERS, filters: {} })
    expect(none.message).toMatch(/Pick at least one/)
  })

  it('runs a brief and saves, lists and deletes it by name', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, dataset)
    await buildDiscoverIndex(db)
    const r = await discoverBrief(db, { brief: { ...EMPTY_BRIEF, season: 'summer', wantAccords: ['citrus'], avoidAccords: ['sweet'] }, filters: {} })
    expect(r.mode).toBe('dataset')
    expect(r.cards[0].name).toBe('Citrus Mint')
    expect(r.cards[0].criteria!.find((c) => c.key === 'season')?.status).toBe('met')
    expect(r.excluded).toBe(1)
    const saved = saveBrief(db, ' Summer office ', { ...EMPTY_BRIEF, season: 'summer' })
    expect(saved.ok && saved.data[0]).toMatchObject({ name: 'Summer office', brief: { season: 'summer' } })
    expect(saveBrief(db, 'Summer office', { ...EMPTY_BRIEF, season: 'winter' }).ok).toBe(true)
    expect(listBriefs(db)).toHaveLength(1)
    expect(listBriefs(db)[0].brief.season).toBe('winter')
    expect(saveBrief(db, '  ', EMPTY_BRIEF).ok).toBe(false)
    const del = deleteBrief(db, listBriefs(db)[0].id)
    expect(del.ok && del.data).toEqual([])
  })
})
