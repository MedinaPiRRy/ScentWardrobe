import { describe, expect, it } from 'vitest'
import { addBottle, createFragrance, updateBottle } from './editing'
import { buildCollectionCsv } from './exportCsv'
import { openDatabase } from './index'
import { getFragrance } from './repo'
import { migrations, runMigrations } from './migrations'
import { computeOverview } from './stats'
import Database from 'better-sqlite3'

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, wardrobe: 'collection' | 'wishlist' = 'collection') => {
    const r = createFragrance(db, { name, house: 'H', notes: [], accords: [] }, wardrobe === 'collection' ? { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } } : { to: 'wishlist', impression: 'nice' })
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}
const bottleId = (db: ReturnType<typeof openDatabase>, f: number) => (db.prepare('SELECT id FROM bottles WHERE fragrance_id = ?').get(f) as { id: number }).id

describe('market prices', () => {
  it('migration 7 adds the columns to an existing database', () => {
    const old = new Database(':memory:')
    runMigrations(old, migrations.filter((m) => m.version <= 6))
    old.prepare("INSERT INTO fragrances (name, house) VALUES ('A', 'B')").run()
    old.prepare("INSERT INTO bottles (fragrance_id, type, size_ml, remaining_ml, price) VALUES (1, 'decant', 10, 10, 25)").run()
    runMigrations(old)
    expect(old.prepare('SELECT price, market_price AS m, market_checked_on AS d, market_source AS s FROM bottles').get()).toEqual({ price: 25, m: null, d: null, s: null })
  })

  it('stores and returns market price, date and source on a bottle', () => {
    const { db, mk } = setup()
    const f = mk('Alpha')
    updateBottle(db, bottleId(db, f), { type: 'full bottle', sizeMl: 100, price: 80, marketPrice: 100, marketCheckedOn: '2026-10-01', marketSource: 'Notino' })
    expect(getFragrance(db, f)!.bottles[0]).toMatchObject({ price: 80, marketPrice: 100, marketCheckedOn: '2026-10-01', marketSource: 'Notino' })
  })

  it('drops date and source when the market price is cleared, and rejects negatives', () => {
    const { db, mk } = setup()
    const f = mk('Alpha')
    const id = bottleId(db, f)
    updateBottle(db, id, { type: 'full bottle', sizeMl: 100, marketPrice: 90, marketCheckedOn: '2026-10-01', marketSource: 'X' })
    updateBottle(db, id, { type: 'full bottle', sizeMl: 100, marketPrice: null, marketCheckedOn: '2026-10-01', marketSource: 'X' })
    expect(getFragrance(db, f)!.bottles[0]).toMatchObject({ marketPrice: null, marketCheckedOn: null, marketSource: null })
    expect(addBottle(db, f, { type: 'decant', sizeMl: 10, marketPrice: -1 }).ok).toBe(false)
  })

  it('compares paid and market in stats, collection only', () => {
    const { db, mk } = setup()
    const a = mk('Deal')
    const b = mk('Rip-off')
    const c = mk('OnlyMarket')
    const w = mk('Wished', 'wishlist')
    updateBottle(db, bottleId(db, a), { type: 'full bottle', sizeMl: 100, price: 80, marketPrice: 100 })
    updateBottle(db, bottleId(db, b), { type: 'full bottle', sizeMl: 50, price: 120, marketPrice: 100 })
    updateBottle(db, bottleId(db, c), { type: 'full bottle', sizeMl: 100, marketPrice: 60 })
    addBottle(db, w, { type: 'full bottle', sizeMl: 50, price: 10, marketPrice: 500 })
    const o = computeOverview(db, new Date(2026, 9, 13))

    expect(o.priceRows.find((r) => r.name === 'Deal')).toMatchObject({ saved: 20, savedPercent: 20, paidPerMl: 0.8, marketPerMl: 1 })
    expect(o.priceRows.find((r) => r.name === 'Rip-off')).toMatchObject({ saved: -20, savedPercent: -20, paidPerMl: 2.4 })
    expect(o.priceRows.find((r) => r.name === 'OnlyMarket')).toMatchObject({ saved: null, savedPercent: null, paidPerMl: null, marketPerMl: 0.6 })
    expect(o.priceRows.some((r) => r.name === 'Wished')).toBe(false)
    expect(o.priceRows[0].name).toBe('Deal') // best deal first
    expect(o.totals.marketValue).toBe(260)
    expect(o.totals.marketPricedBottles).toBe(3)
    expect(o.totals.paidVsMarket).toBe(0) // +20 saved, -20 overpaid
  })

  it('has no comparison when nothing is entered', () => {
    const { db, mk } = setup()
    mk('Plain')
    const o = computeOverview(db)
    expect(o.priceRows).toEqual([])
    expect(o.totals).toMatchObject({ marketValue: 0, marketPricedBottles: 0, paidVsMarket: null })
  })

  it('exports paid and market price to CSV', () => {
    const { db, mk } = setup()
    const f = mk('Alpha')
    updateBottle(db, bottleId(db, f), { type: 'full bottle', sizeMl: 100, price: 80, marketPrice: 100, marketCheckedOn: '2026-10-01', marketSource: 'Notino' })
    const { csv } = buildCollectionCsv(db)
    expect(csv).toContain('Paid,Market price,Market price checked,Market price source')
    expect(csv).toContain('80,100,2026-10-01,Notino')
  })
})
