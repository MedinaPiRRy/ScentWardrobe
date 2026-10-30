import { describe, expect, it } from 'vitest'
import { createFragrance, setRating } from './editing'
import { openDatabase } from './index'
import { dismissRatingSuggestion, listRatingSuggestions, ratingFacts } from './ratings'
import { getFragrance } from './repo'
import { logWear } from './wears'

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, to: 'collection' | 'to_try' = 'collection') => {
    const r = createFragrance(db, { name, house: 'H', notes: [], accords: [] }, to === 'collection' ? { to, bottle: { type: 'full bottle', sizeMl: 100 } } : { to })
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}

describe('rating history', () => {
  it('remembers each change, newest first, with where it came from', () => {
    const { db, mk } = setup()
    const f = mk('A')
    expect(setRating(db, f, 6, 'detail').ok).toBe(true)
    expect(setRating(db, f, 8, 'shelf').ok).toBe(true)
    expect(setRating(db, f, null, 'detail').ok).toBe(true)
    const d = getFragrance(db, f)!
    expect(d.rating).toBeNull()
    expect(d.ratingHistory.map((h) => [h.rating, h.source])).toEqual([[null, 'detail'], [8, 'shelf'], [6, 'detail']])
  })
  it('does not record a rating that did not change', () => {
    const { db, mk } = setup()
    const f = mk('A')
    setRating(db, f, 7)
    setRating(db, f, 7)
    setRating(db, f, 7, 'shelf')
    expect(getFragrance(db, f)!.ratingHistory).toHaveLength(1)
  })
  it('refuses bad values and unknown fragrances without recording anything', () => {
    const { db, mk } = setup()
    const f = mk('A')
    for (const r of [0, 11, 5.5, Number.NaN]) expect(setRating(db, f, r).ok, String(r)).toBe(false)
    expect(setRating(db, 9999, 5).ok).toBe(false)
    expect(getFragrance(db, f)!.ratingHistory).toEqual([])
  })
  it('is kept when the fragrance moves wardrobe, and removed with the fragrance', () => {
    const { db, mk } = setup()
    const f = mk('A', 'to_try')
    setRating(db, f, 9)
    db.prepare("UPDATE wardrobe_items SET wardrobe = 'collection' WHERE fragrance_id = ?").run(f)
    expect(getFragrance(db, f)!.ratingHistory).toHaveLength(1)
    db.prepare('DELETE FROM wardrobe_items WHERE fragrance_id = ?').run(f)
    db.prepare('DELETE FROM fragrances WHERE id = ?').run(f)
    expect((db.prepare('SELECT count(*) AS c FROM rating_history').get() as { c: number }).c).toBe(0)
  })
})

describe('rating from the wear form', () => {
  it('updates my rating (history source "wear") when a new wear carries one', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const w = logWear(db, { fragranceId: f, wornAt: '2026-10-10 09:00', sprays: 4, rating: 9 })
    expect(w.ok).toBe(true)
    const d = getFragrance(db, f)!
    expect(d.rating).toBe(9)
    expect(d.ratingHistory[0]).toMatchObject({ rating: 9, source: 'wear' })
  })
  it('leaves the rating alone when the wear has none, and refuses an invalid one without logging the wear', () => {
    const { db, mk } = setup()
    const f = mk('A')
    setRating(db, f, 4)
    logWear(db, { fragranceId: f, wornAt: '2026-10-10 09:00', sprays: 4 })
    expect(getFragrance(db, f)!.rating).toBe(4)
    const bad = logWear(db, { fragranceId: f, wornAt: '2026-10-11 09:00', sprays: 4, rating: 42 })
    expect(bad.ok).toBe(false)
    expect((db.prepare('SELECT count(*) AS c FROM wear_log').get() as { c: number }).c).toBe(1)
  })
})

describe('re-rating suggestions from the database', () => {
  const now = new Date(2026, 9, 30)
  const age = (db: ReturnType<typeof openDatabase>, id: number, days: number) => db.prepare("UPDATE wardrobe_items SET added_at = datetime('now', ?) WHERE fragrance_id = ?").run(`-${days} days`, id)

  it('suggests an unrated fragrance that is worn a lot, only for My Collection', () => {
    const { db, mk } = setup()
    const f = mk('Worn')
    const t = mk('Elsewhere', 'to_try')
    age(db, f, 200)
    age(db, t, 200)
    for (let i = 0; i < 6; i++) logWear(db, { fragranceId: f, wornAt: `2026-10-${String(10 + i).padStart(2, '0')} 09:00`, sprays: 4 })
    const s = listRatingSuggestions(db, now)
    expect(s.map((x) => x.name)).toEqual(['Worn'])
    expect(ratingFacts(db, now).find((x) => x.id === f)).toMatchObject({ wearsTotal: 6, rating: null })
  })
  it('stays hidden after a dismissal, and comes back after three months', () => {
    const { db, mk } = setup()
    const f = mk('Worn')
    age(db, f, 300)
    for (let i = 0; i < 6; i++) logWear(db, { fragranceId: f, wornAt: `2026-10-${String(10 + i).padStart(2, '0')} 09:00`, sprays: 4 })
    expect(listRatingSuggestions(db, now)).toHaveLength(1)
    dismissRatingSuggestion(db, f, now)
    expect(listRatingSuggestions(db, now)).toHaveLength(0)
    expect(listRatingSuggestions(db, new Date(2026, 11, 20))).toHaveLength(0)
    expect(listRatingSuggestions(db, new Date(2027, 1, 5))).toHaveLength(1)
  })
  it('does not nag about a fragrance that was just added', () => {
    const { db, mk } = setup()
    const f = mk('New')
    for (let i = 0; i < 6; i++) logWear(db, { fragranceId: f, wornAt: `2026-10-${String(10 + i).padStart(2, '0')} 09:00`, sprays: 4 })
    expect(listRatingSuggestions(db, now)).toEqual([])
  })
})

describe('CSV export of ratings', () => {
  it('has the rating and the day it last changed', async () => {
    const { buildCollectionCsv } = await import('./exportCsv')
    const { db, mk } = setup()
    const f = mk('Rated')
    setRating(db, f, 8)
    const { csv } = buildCollectionCsv(db)
    expect(csv.split('\r\n')[0]).toMatch(/My rating \(1-10\).*Rating last changed$/)
    const row = csv.split('\r\n')[1]
    expect(row).toMatch(/,8,/)
    expect(row.endsWith(`,${new Date().toISOString().slice(0, 4)}`) || /\d{4}-\d{2}-\d{2}$/.test(row)).toBe(true)
  })
})
