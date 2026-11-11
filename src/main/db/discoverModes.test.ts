import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { buildDiscoverIndex } from './discover'
import { discoverBudget, discoverCoverage, discoverDupes, discoverLayering } from './discoverModes'
import { addBottle, createFragrance } from './editing'

type Db = ReturnType<typeof openDatabase>

interface Row { name: string; house: string; accords: [string, number][]; pop?: number; extra?: object; community?: object; conc?: string | null }
const insertCatalog = (db: Db, rows: Row[]) => {
  const ins = db.prepare('INSERT INTO catalog_fragrances (name, house, year, concentration, data, popularity, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
  const ex = db.prepare('INSERT INTO catalog_extra (catalog_id, extra) VALUES (?, ?)')
  db.transaction(() => {
    rows.forEach((r, i) => {
      const data = { name: r.name, house: r.house, accords: r.accords.map(([name, strength]) => ({ name, strength })), notes: [], community: r.community ?? null, imageUrl: null }
      const id = Number(ins.run(r.name, r.house, 2010, r.conc ?? null, JSON.stringify(data), r.pop ?? 1000, `https://www.fragrantica.com/perfume/${r.house}/${r.name.replace(/ /g, '-')}-${1000 + i}.html`).lastInsertRowid)
      ex.run(id, JSON.stringify({ fid: 1000 + i, rating: { a: 4.2, n: 800 }, people: 2000, ...(r.extra ?? {}) }))
    })
  })()
}

const mine = (db: Db, name: string, house: string, accords: [string, number][], to: 'collection' | 'wishlist' | 'had' | 'to_try', opts: { rating?: number; price?: number; size?: number } = {}) => {
  const placement =
    to === 'collection' ? ({ to, bottle: { type: 'full bottle', sizeMl: opts.size ?? 100, ...(opts.price ? { price: opts.price } : {}) } } as const)
    : to === 'wishlist' ? ({ to, impression: 'sounds good' } as const)
    : to === 'had' ? ({ to, hadYears: '2019' } as const)
    : ({ to } as const)
  const r = createFragrance(db, { name, house, notes: [], accords: accords.map(([n, s]) => ({ name: n, strength: s })) }, placement as never)
  if (!r.ok) throw new Error(r.message)
  if (opts.rating) db.prepare('UPDATE fragrances SET rating = ? WHERE id = ?').run(opts.rating, r.data.id)
  return r.data.id
}

const wear = (db: Db, id: number, at: string, activity: string | null = null, tod: string | null = null) =>
  db.prepare('INSERT INTO wear_log (fragrance_id, worn_at, sprays, activity, time_of_day) VALUES (?, ?, 4, ?, ?)').run(id, at, activity, tod)

describe('coverage from my collection and my wear log', () => {
  it('works with no dataset and counts what I actually wear', () => {
    const db = openDatabase(':memory:')
    const a = mine(db, 'Fresh One', 'X', [['citrus', 100], ['aquatic', 70]], 'collection')
    mine(db, 'Fresh Two', 'X', [['citrus', 90], ['fresh', 60]], 'collection')
    for (const d of ['2026-01-05', '2026-01-06', '2026-01-07']) wear(db, a, `${d} 09:00`, 'office')
    wear(db, a, '2026-07-10 22:30', 'date night', 'night')
    const { coverage } = discoverCoverage(db)
    expect(coverage.items).toBe(2)
    expect(coverage.wears).toBe(4)
    const winter = coverage.cells.find((c) => c.dimension === 'season' && c.key === 'winter')!
    expect(winter).toMatchObject({ suits: 1, worn: 3, wornBy: 1, status: 'thin' })
    expect(coverage.cells.find((c) => c.dimension === 'family' && c.key === 'sweet')!.status).toBe('missing')
    expect(coverage.cells.find((c) => c.dimension === 'occasion' && c.key === 'office')!.worn).toBe(3)
    expect(coverage.cells.find((c) => c.dimension === 'time' && c.key === 'night')!.worn).toBe(1)
    expect(coverage.summary.length).toBeGreaterThan(0)
  })
  it('a vial-only fragrance counts as owned', () => {
    const db = openDatabase(':memory:')
    const id = mine(db, 'Vial', 'X', [['woody', 100]], 'collection', { size: 5 })
    db.prepare("UPDATE bottles SET type = 'decant' WHERE fragrance_id = ?").run(id)
    expect(discoverCoverage(db).coverage.items).toBe(1)
  })
})

describe('layering partners', () => {
  it('without a dataset ranks my collection and my wishlist with the Layering Lab engine, and links owned pairs to the Lab', async () => {
    const db = openDatabase(':memory:')
    const base = mine(db, 'Base', 'X', [['citrus', 100], ['woody', 60]], 'collection')
    const owned = mine(db, 'Warm Owned', 'X', [['vanilla', 100], ['amber', 80]], 'collection', { rating: 9 })
    const wish = mine(db, 'Warm Wish', 'X', [['vanilla', 100], ['amber', 90]], 'wishlist')
    const r = await discoverLayering(db, { seed: { fragranceId: base } })
    expect(r.base).toMatchObject({ name: 'Base', fragranceId: base })
    const byName = Object.fromEntries(r.cards.map((c) => [c.name, c]))
    expect(byName['Warm Owned'].labIds).toEqual([base, owned])
    expect(byName['Warm Owned'].layer!.score).toBeGreaterThan(0)
    expect(byName['Warm Wish'].labIds).toBeNull()
    // what I own comes before what I only want
    expect(r.cards.findIndex((c) => c.name === 'Warm Owned')).toBeLessThan(r.cards.findIndex((c) => c.name === 'Warm Wish'))
    expect(byName['Warm Wish'].fragranceId).toBe(wish)
    expect(r.cards.map((c) => c.name)).not.toContain('Base')
    expect(byName['Warm Owned'].layer!.reasons.length).toBeGreaterThan(0)
  })

  it('with a dataset it also suggests partners I do not own, scored by the same engine', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, [
      { name: 'Vanilla Amber Out There', house: 'Alpha', accords: [['vanilla', 100], ['amber', 90]] },
      { name: 'More Citrus', house: 'Alpha', accords: [['citrus', 100], ['woody', 50]] }
    ])
    const base = mine(db, 'Base', 'X', [['citrus', 100], ['woody', 60]], 'collection', { rating: 9 })
    mine(db, 'Warm Owned', 'X', [['vanilla', 100], ['amber', 80]], 'collection')
    await buildDiscoverIndex(db)
    const r = await discoverLayering(db, { seed: { fragranceId: base } })
    const names = r.cards.map((c) => c.name)
    expect(names).toContain('Warm Owned')
    const out = r.cards.find((c) => c.name === 'Vanilla Amber Out There')
    expect(out).toBeDefined()
    expect(out!.labIds).toBeNull()
    expect(out!.layer!.verdict).toMatch(/Great|Worth/)
    expect(r.mode).toBe('dataset')
  })

  it('asks for a fragrance first', async () => {
    const db = openDatabase(':memory:')
    expect((await discoverLayering(db, { seed: { fragranceId: 999 } })).message).toMatch(/Pick a fragrance/)
  })
})

describe('dupes and alternatives', () => {
  const rows: Row[] = [
    { name: 'Original', house: 'Big House', accords: [['citrus', 100], ['woody', 80], ['amber', 50]], extra: { rm: [[1001, 3000, 200]], value: { a: 3.1, n: 1200 } } },
    { name: 'Clone Voted', house: 'Small House', accords: [['citrus', 90], ['woody', 70], ['amber', 40]], extra: { rm: [[1000, 2500, 100]], value: { a: 4.4, n: 900 } } },
    { name: 'Unvoted Lookalike', house: 'Other House', accords: [['citrus', 100], ['woody', 75], ['amber', 55]] },
    { name: 'Nothing Alike', house: 'Third House', accords: [['sweet', 100], ['vanilla', 100]] }
  ]
  it('uses the votes in both directions and shows them, with value votes labelled as opinions', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, rows)
    await buildDiscoverIndex(db)
    expect((db.prepare('SELECT count(*) AS c FROM discover_remind').get() as { c: number }).c).toBe(2)
    const r = await discoverDupes(db, { seed: { catalogId: 1 }, filters: {} })
    expect(r.source).toMatchObject({ name: 'Original', had: false })
    expect(r.hasVotes).toBe(true)
    const names = r.cards.map((c) => c.name)
    expect(names[0]).toBe('Clone Voted')
    expect(names).not.toContain('Original')
    expect(names).not.toContain('Nothing Alike')
    const clone = r.cards[0]
    expect(clone.evidence!.join(' ')).toMatch(/Clone Voted reminds them of Original|Original reminds them of Clone Voted/)
    expect(clone.evidence!.length).toBeGreaterThan(0)
    expect(clone.money!.join(' ')).toMatch(/community value votes: 4\.4\/5 from 900 votes \(the original: 3\.1\/5\)\. These are opinions on value, not a price/)
    const plain = r.cards.find((c) => c.name === 'Unvoted Lookalike')!
    expect(plain.score).toBeLessThan(clone.score)
    expect(plain.reasons.map((x) => x.text).join(' ')).toMatch(/no "smells like" votes link these two/)
  })

  it('leaves out other versions of the same fragrance (same house, same name plus a suffix)', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, [...rows, { name: 'Original Absolu', house: 'Big House', accords: [['citrus', 100], ['woody', 80], ['amber', 50]] }, { name: 'Original', house: 'Other Brand', accords: [['citrus', 100], ['woody', 80], ['amber', 50]] }])
    await buildDiscoverIndex(db)
    const r = await discoverDupes(db, { seed: { catalogId: 1 }, filters: {} })
    const names = r.cards.map((c) => `${c.name} / ${c.house}`)
    expect(names).not.toContain('Original Absolu / Big House')
    expect(names).toContain('Original / Other Brand') // the same name from another house is a real candidate
    expect(r.notes.join(' ')).toMatch(/Another version of Original by Big House is left out/)
  })

  it('says when the dataset has no votes and what to do about it', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, rows)
    db.prepare('DELETE FROM catalog_extra').run()
    await buildDiscoverIndex(db)
    const r = await discoverDupes(db, { seed: { catalogId: 1 }, filters: {} })
    expect(r.hasVotes).toBe(false)
    expect(r.notes.join(' ')).toMatch(/Import the original dump again/)
    expect(r.cards.length).toBeGreaterThan(0)
  })

  it('for something I used to have: a replacement, and an honest note about what the dataset cannot say', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, rows)
    const had = mine(db, 'Original', 'Big House', [['citrus', 100], ['woody', 80]], 'had')
    await buildDiscoverIndex(db)
    const r = await discoverDupes(db, { seed: { fragranceId: had }, filters: {} })
    expect(r.source).toMatchObject({ had: true })
    expect(r.notes.join(' ')).toMatch(/no longer in your collection.*does not say whether it is discontinued/)
    expect(r.cards.map((c) => c.name)).toContain('Clone Voted')
  })

  it('says "cheaper" only from my own prices, and can filter to those', async () => {
    const db = openDatabase(':memory:')
    insertCatalog(db, rows)
    mine(db, 'Original', 'Big House', [['citrus', 100]], 'collection', { price: 200, size: 100 })
    mine(db, 'Clone Voted', 'Small House', [['citrus', 90]], 'wishlist')
    const wid = (db.prepare("SELECT id FROM fragrances WHERE name = 'Clone Voted'").get() as { id: number }).id
    db.prepare("INSERT INTO wardrobe_memberships (fragrance_id, wardrobe) VALUES (?, 'to_try')").run(wid)
    db.prepare("INSERT INTO bottles (fragrance_id, type, size_ml, remaining_ml, price) VALUES (?, 'full bottle', 100, 100, 30)").run(wid)
    await buildDiscoverIndex(db)
    const orig = (db.prepare("SELECT id FROM fragrances WHERE name = 'Original'").get() as { id: number }).id
    const all = await discoverDupes(db, { seed: { fragranceId: orig }, filters: {} })
    const clone = all.cards.find((c) => c.name === 'Clone Voted')!
    expect(clone.money!.join(' ')).toMatch(/my prices: .* \(cheaper\)/)
    const only = await discoverDupes(db, { seed: { fragranceId: orig }, filters: {}, cheaperOnly: true })
    expect(only.cards.map((c) => c.name)).toEqual(['Clone Voted'])
    const lookalike = all.cards.find((c) => c.name === 'Unvoted Lookalike')!
    expect((lookalike.money ?? []).join(' ')).toMatch(/no price on file for this one/)
  })

  it('needs a dataset', async () => {
    const db = openDatabase(':memory:')
    expect((await discoverDupes(db, { seed: { fragranceId: 1 }, filters: {} })).message).toMatch(/Import one/)
  })
})

describe('budget and trying first', () => {
  it('compares a budget with my own price per ml and suggests samples of wishlist fragrances that have none', async () => {
    const db = openDatabase(':memory:')
    mine(db, 'Owned A', 'X', [['citrus', 100]], 'collection', { price: 100, size: 100 })
    mine(db, 'Owned B', 'X', [['woody', 100]], 'collection', { price: 150, size: 100 })
    const noVial = mine(db, 'Wish No Vial', 'X', [['citrus', 90]], 'wishlist')
    const hasVial = mine(db, 'Wish Has Vial', 'X', [['woody', 90]], 'wishlist')
    addBottle(db, hasVial, { type: 'decant', sizeMl: 5, remainingMl: 5 } as never)
    const r = await discoverBudget(db, { budget: 130, sizeMl: 100 })
    expect(r.reference).toMatchObject({ n: 2, basis: 'paid' })
    expect(r.estimate).toMatchObject({ sizeMl: 100, mid: 125 })
    expect(r.verdict.label).toBe('typical')
    expect(r.trial.map((c) => c.name)).toEqual(['Wish No Vial'])
    expect(r.trial[0].fragranceId).toBe(noVial)
    expect(r.trial[0].trial).toMatch(/no sample or decant of it yet.*about USD 125/)
  })
  it('says what is missing when there are no prices or nothing to try', async () => {
    const db = openDatabase(':memory:')
    mine(db, 'Owned A', 'X', [['citrus', 100]], 'collection')
    const r = await discoverBudget(db, { budget: 100, sizeMl: 50 })
    expect(r.estimate).toBeNull()
    expect(r.verdict.text).toMatch(/not entered prices/)
    expect(r.message).toMatch(/already has a sample|are empty/)
  })
})
