import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { searchLocal } from '../data/catalog'
import { addBottle, addForeignFragrance, createFragrance } from './editing'
import { openDatabase } from './index'
import { layerCandidates } from './layering'
import { migrations, runMigrations } from './migrations'
import { recommendCandidates } from './recommend'
import { getFragrance, listFragrances, moveToWardrobe } from './repo'
import { computeOverview } from './stats'
import { listWearsRange, logWear } from './wears'

describe('foreign fragrances (worn, not owned)', () => {
  it('migration 8 adds the flag to an existing database', () => {
    const old = new Database(':memory:')
    runMigrations(old, migrations.filter((m) => m.version <= 7))
    old.prepare("INSERT INTO fragrances (name, house) VALUES ('A', 'B')").run()
    runMigrations(old)
    expect(old.prepare('SELECT is_foreign AS f FROM fragrances').get()).toEqual({ f: 0 })
  })

  it('has no wardrobe, is marked, and can be worn and shown in the calendar', () => {
    const db = openDatabase(':memory:')
    const r = addForeignFragrance(db, { name: 'Carlisle', house: 'Parfums de Marly', notes: [], accords: [] })
    if (!r.ok) throw new Error(r.message)
    expect(r.data).toMatchObject({ wardrobe: null, isForeign: true })
    const w = logWear(db, { fragranceId: r.data.id, wornAt: '2026-10-11 19:00', sprays: 8 })
    expect(w.ok).toBe(true)
    const day = listWearsRange(db, '2026-10-11', '2026-10-11')
    expect(day).toHaveLength(1)
    expect(day[0].backfilled).toBe(true)
    expect(listFragrances(db, { wardrobe: 'collection' })).toEqual([])
    expect(listFragrances(db)[0].isForeign).toBe(true)
  })

  it('stays out of recommendations, layering and collection stats', () => {
    const db = openDatabase(':memory:')
    createFragrance(db, { name: 'Mine', house: 'H', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } })
    const f = addForeignFragrance(db, { name: 'Theirs', house: 'H', notes: [], accords: [] })
    if (!f.ok) throw new Error(f.message)
    logWear(db, { fragranceId: f.data.id, wornAt: '2026-10-11 19:00', sprays: 8 })
    expect(recommendCandidates(db).map((c) => c.name)).toEqual(['Mine'])
    expect(layerCandidates(db).map((c) => c.name)).toEqual(['Mine'])
    const o = computeOverview(db, new Date(2026, 9, 13))
    expect(o.totals.collectionCount).toBe(1)
    expect(o.mostWorn).toEqual([])
    expect(o.neglected.map((n) => n.name)).toEqual(['Mine'])
  })

  it('reuses the fragrance when the same name and house are added again, and can be searched', () => {
    const db = openDatabase(':memory:')
    const a = addForeignFragrance(db, { name: 'Carlisle', house: 'Parfums de Marly', notes: [], accords: [] })
    const b = addForeignFragrance(db, { name: 'carlisle', house: 'parfums de marly', notes: [], accords: [] })
    if (!a.ok || !b.ok) throw new Error('add failed')
    expect(b.data.id).toBe(a.data.id)
    expect(searchLocal(db, 'carlisle')[0]).toMatchObject({ source: 'mine', id: a.data.id, wardrobe: null })
  })

  it('is no longer foreign once moved into a wardrobe', () => {
    const db = openDatabase(':memory:')
    const f = addForeignFragrance(db, { name: 'Theirs', house: 'H', notes: [], accords: [] })
    if (!f.ok) throw new Error(f.message)
    const m = moveToWardrobe(db, { fragranceId: f.data.id, to: 'to_try' })
    expect(m.ok).toBe(true)
    expect(getFragrance(db, f.data.id)).toMatchObject({ isForeign: false, wardrobe: 'to_try' })
  })

  it('needs a name and a house', () => {
    const db = openDatabase(':memory:')
    expect(addForeignFragrance(db, { name: '', house: 'H', notes: [], accords: [] }).ok).toBe(false)
    expect(addForeignFragrance(db, { name: 'X', house: ' ', notes: [], accords: [] }).ok).toBe(false)
  })
})

describe('a wanted fragrance I also hold a vial of', () => {
  it('stays on the wishlist while owning a sample, and the sample is not counted as collection', () => {
    const db = openDatabase(':memory:')
    const r = createFragrance(db, { name: 'Oud Satin Mood', house: 'MFK', notes: [], accords: [] }, { to: 'wishlist', impression: 'warm oud' })
    if (!r.ok) throw new Error(r.message)
    expect(addBottle(db, r.data.id, { type: 'sample', sizeMl: 2, remainingMl: 1 }).ok).toBe(true)
    const f = getFragrance(db, r.data.id)!
    expect(f.wardrobe).toBe('wishlist')
    expect(f.bottles).toHaveLength(1)
    expect(listFragrances(db, { wardrobe: 'wishlist' })[0]).toMatchObject({ activeBottleCount: 1 })
    expect(computeOverview(db).totals).toMatchObject({ collectionCount: 0, mlOwned: 0 })
  })
})
