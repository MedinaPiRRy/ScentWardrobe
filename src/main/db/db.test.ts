import { describe, expect, it } from 'vitest'
import { openDatabase } from './index'
import { currentVersion, migrations } from './migrations'
import { getFragrance, listFragrances, moveToWardrobe } from './repo'
import { clearSampleData, SAMPLE_FRAGRANCES, seedSampleData } from './seed'

const fresh = () => openDatabase(':memory:')

describe('migrations', () => {
  it('apply cleanly and record the version', () => {
    const db = fresh()
    expect(currentVersion(db)).toBe(migrations[migrations.length - 1].version)
  })
})

describe('seed', () => {
  it('adds all sample fragrances, is idempotent, and can be cleared', () => {
    const db = fresh()
    expect(seedSampleData(db)).toBe(SAMPLE_FRAGRANCES.length)
    expect(seedSampleData(db)).toBe(0)
    expect(listFragrances(db)).toHaveLength(SAMPLE_FRAGRANCES.length)
    expect(clearSampleData(db)).toBe(SAMPLE_FRAGRANCES.length)
    expect(listFragrances(db)).toHaveLength(0)
  })

  it('places fragrances in all three wardrobes', () => {
    const db = fresh()
    seedSampleData(db)
    for (const w of ['collection', 'wishlist', 'to_try'] as const) {
      expect(listFragrances(db, { wardrobe: w }).length).toBeGreaterThan(0)
    }
  })

  it('returns full detail with layered notes, accords and bottles', () => {
    const db = fresh()
    seedSampleData(db)
    const sauvage = listFragrances(db).find((f) => f.name === 'Sauvage')!
    const d = getFragrance(db, sauvage.id)!
    expect(d.notes.some((n) => n.layer === 'top')).toBe(true)
    expect(d.accords[0].strength).toBe(100)
    expect(d.bottles[0].remainingMl).toBeCloseTo(60)
  })
})

describe('wishlist rule', () => {
  const setup = () => {
    const db = fresh()
    seedSampleData(db)
    const toTry = listFragrances(db, { wardrobe: 'to_try' })[0]
    return { db, toTry }
  }

  it('rejects the wishlist without an impression (API)', () => {
    const { db, toTry } = setup()
    const r = moveToWardrobe(db, { fragranceId: toTry.id, to: 'wishlist' })
    expect(r).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    const r2 = moveToWardrobe(db, { fragranceId: toTry.id, to: 'wishlist', impression: '   ' })
    expect(r2).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    expect(getFragrance(db, toTry.id)!.wardrobe).toBe('to_try')
  })

  it('accepts the wishlist with an impression, and keeps it after a move', () => {
    const { db, toTry } = setup()
    const r = moveToWardrobe(db, { fragranceId: toTry.id, to: 'wishlist', impression: 'Warm and boozy.' })
    expect(r.ok && r.data.wardrobe).toBe('wishlist')
    const back = moveToWardrobe(db, { fragranceId: toTry.id, to: 'to_try' })
    expect(back.ok).toBe(true)
    expect(getFragrance(db, toTry.id)!.impression).toBe('Warm and boozy.')
  })

  it('is enforced by the database too', () => {
    const { db, toTry } = setup()
    expect(() => db.prepare("UPDATE wardrobe_items SET wardrobe='wishlist' WHERE fragrance_id=?").run(toTry.id)).toThrow(
      /WISHLIST_IMPRESSION_REQUIRED/
    )
  })

  it('stops the impression being blanked while wishlisted', () => {
    const { db } = setup()
    const w = listFragrances(db, { wardrobe: 'wishlist' })[0]
    expect(() => db.prepare("UPDATE smell_impression SET text='' WHERE fragrance_id=?").run(w.id)).toThrow(
      /WISHLIST_IMPRESSION_REQUIRED/
    )
  })
})

describe('moving to the collection', () => {
  it('requires a bottle the first time, then keeps history on later moves', () => {
    const db = fresh()
    seedSampleData(db)
    const id = listFragrances(db, { wardrobe: 'to_try' })[0].id
    expect(moveToWardrobe(db, { fragranceId: id, to: 'collection' })).toMatchObject({ ok: false, code: 'BOTTLE_REQUIRED' })

    const ok = moveToWardrobe(db, { fragranceId: id, to: 'collection', bottle: { type: 'full bottle', sizeMl: 75 } })
    expect(ok.ok && ok.data.activeBottleCount).toBe(1)
    expect(getFragrance(db, id)!.bottles[0].remainingMl).toBe(75)

    db.prepare('INSERT INTO personal_notes (fragrance_id, text) VALUES (?, ?)').run(id, 'first impressions')
    moveToWardrobe(db, { fragranceId: id, to: 'to_try' })
    moveToWardrobe(db, { fragranceId: id, to: 'collection' }) // bottle already exists
    const d = getFragrance(db, id)!
    expect(d.journal).toHaveLength(1)
    expect(d.bottles).toHaveLength(1)
  })
})
