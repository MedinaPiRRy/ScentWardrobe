import { describe, expect, it } from 'vitest'
import { addBottle, createFragrance } from './editing'
import { openDatabase } from './index'
import { listWears, logWear, updateWear } from './wears'

function setup() {
  const db = openDatabase(':memory:')
  const r = createFragrance(db, { name: 'A', house: 'H', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } })
  if (!r.ok) throw new Error(r.message)
  return { db, id: r.data.id }
}
const level = (db: ReturnType<typeof openDatabase>, id: number) => (db.prepare('SELECT sum(remaining_ml) AS r FROM bottles WHERE fragrance_id = ?').get(id) as { r: number }).r

describe('editing a wear', () => {
  it('does not hand the sprays back to the bottle when a real wear is edited on a later day', () => {
    const { db, id } = setup()
    const today = new Date(2026, 9, 13, 20, 0)
    const w = logWear(db, { fragranceId: id, wornAt: '2026-10-13 09:00', sprays: 10 }, today)
    if (!w.ok) throw new Error(w.message)
    expect(level(db, id)).toBeCloseTo(99, 5)

    // The next day: add a note (the form sends no backfilled flag).
    const tomorrow = new Date(2026, 9, 14, 9, 0)
    const u = updateWear(db, w.data.id, { fragranceId: id, wornAt: '2026-10-13 09:00', sprays: 10, notes: 'lasted all day' }, tomorrow)
    expect(u.ok).toBe(true)
    expect(level(db, id)).toBeCloseTo(99, 5) // was 100: the bottle was refunded
    expect(listWears(db, { fragranceId: id })[0]).toMatchObject({ backfilled: false, notes: 'lasted all day' })
  })

  it('keeps a diary entry a diary entry when it is edited', () => {
    const { db, id } = setup()
    const w = logWear(db, { fragranceId: id, wornAt: '2026-09-01 12:00', sprays: 8 }, new Date(2026, 9, 13))
    if (!w.ok) throw new Error(w.message)
    expect(level(db, id)).toBe(100)
    updateWear(db, w.data.id, { fragranceId: id, wornAt: '2026-09-01 12:00', sprays: 6 }, new Date(2026, 9, 13))
    expect(level(db, id)).toBe(100)
    expect(listWears(db, { fragranceId: id })[0]).toMatchObject({ backfilled: true, sprays: 6 })
  })

  it('takes a vial first or the big bottle first? the bottle chosen in the form always wins', () => {
    const { db, id } = setup()
    addBottle(db, id, { type: 'decant', sizeMl: 10 })
    const decant = (db.prepare("SELECT id FROM bottles WHERE type = 'decant'").get() as { id: number }).id
    const w = logWear(db, { fragranceId: id, wornAt: '2026-10-13 09:00', sprays: 5, bottleId: decant, backfilled: false }, new Date(2026, 9, 13))
    expect(w.ok).toBe(true)
    expect((db.prepare('SELECT remaining_ml AS r FROM bottles WHERE id = ?').get(decant) as { r: number }).r).toBeCloseTo(9.5, 5)
    expect((db.prepare("SELECT remaining_ml AS r FROM bottles WHERE type = 'full bottle'").get() as { r: number }).r).toBe(100)
  })
})

describe('oversized text from outside', () => {
  it('rejects absurdly long names and note lists but accepts normal and unusual text', () => {
    const db = openDatabase(':memory:')
    const make = (name: string, extra = {}) => createFragrance(db, { name, house: 'H', notes: [], accords: [], ...extra }, { to: 'to_try' })
    expect(make('x'.repeat(5000)).ok).toBe(false)
    expect(make('ok', { description: 'y'.repeat(100_000) }).ok).toBe(false)
    expect(make('ok2', { notes: Array.from({ length: 1000 }, (_, i) => ({ name: `n${i}`, layer: 'top' as const })) }).ok).toBe(false)
    expect(make('Café "Noir" ✓ 😀 O\'Neil <b>').ok).toBe(true)
    expect(make('a'.repeat(300)).ok).toBe(true)
  })
})

describe('updating a bottle', () => {
  it('keeps the level, spray size and status when they are left out', async () => {
    const { updateBottle } = await import('./editing')
    const { db, id } = setup()
    const bottle = db.prepare('SELECT id FROM bottles WHERE fragrance_id = ?').get(id) as { id: number }
    db.prepare("UPDATE bottles SET remaining_ml = 20, ml_per_spray = 0.07, status = 'empty' WHERE id = ?").run(bottle.id)
    expect(updateBottle(db, bottle.id, { type: 'full bottle', sizeMl: 100, price: 50 }).ok).toBe(true)
    expect(db.prepare('SELECT remaining_ml AS r, ml_per_spray AS s, status, price FROM bottles WHERE id = ?').get(bottle.id)).toEqual({ r: 20, s: 0.07, status: 'empty', price: 50 })
    // Shrinking the size never leaves more liquid than the bottle holds.
    updateBottle(db, bottle.id, { type: 'full bottle', sizeMl: 10 })
    expect((db.prepare('SELECT remaining_ml AS r FROM bottles WHERE id = ?').get(bottle.id) as { r: number }).r).toBe(10)
    expect(updateBottle(db, 9999, { type: 'decant', sizeMl: 5 }).ok).toBe(false)
  })
})
