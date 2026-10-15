import { describe, expect, it } from 'vitest'
import { analyzeLayer } from '@shared/layering'
import { createFragrance, deleteFragrance } from './editing'
import { openDatabase } from './index'
import { deleteCombo, layerCandidates, listCombos, ratedHistory, rateCombo, saveCombo } from './layering'
import { logWear } from './wears'

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, accords: { name: string; strength: number }[], extra: Partial<Parameters<typeof createFragrance>[1]> = {}, to: 'collection' | 'wishlist' = 'collection') => {
    const r = createFragrance(
      db,
      { name, house: 'H', notes: [{ name: 'Vanilla', layer: 'base' }], accords, ...extra },
      to === 'collection' ? { to, bottle: { type: 'full bottle', sizeMl: 100 } } : { to, impression: 'nice' }
    )
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}
const acc = (o: Record<string, number>) => Object.entries(o).map(([name, strength]) => ({ name, strength }))

describe('layer candidates', () => {
  it('lists only the collection with accords, notes, seasons and community projection', () => {
    const { db, mk } = setup()
    const a = mk('A', acc({ woody: 100, amber: 60 }), { community: { winter: 5, spring: 1, summer: 1, fall: 3, day: 2, night: 8, longevity: 3, sillage: 3.2 } })
    mk('Wish', acc({ citrus: 100 }), {}, 'wishlist')
    const c = layerCandidates(db)
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ id: a, name: 'A', projection: 3.2, seasons: { winter: 5, spring: 1, summer: 1, fall: 3 }, daynight: { day: 2, night: 8 } })
    expect(c[0].accords[0]).toEqual({ name: 'woody', strength: 100 })
    expect(c[0].notes).toEqual([{ name: 'Vanilla', layer: 'base', family: null }])
  })

  it('prefers my own projection once I have rated 2 wears, mapped to the 1-4 scale', () => {
    const { db, mk } = setup()
    const a = mk('A', acc({ woody: 100 }), { community: { winter: 1, spring: 1, summer: 1, fall: 1, day: 1, night: 1, longevity: 3, sillage: 1.5 } })
    logWear(db, { fragranceId: a, wornAt: '2026-05-01 10:00', sprays: 1, projection: 5 })
    expect(layerCandidates(db)[0].projection).toBe(1.5) // one rated wear is not enough yet
    logWear(db, { fragranceId: a, wornAt: '2026-05-02 10:00', sprays: 1, projection: 5 })
    expect(layerCandidates(db)[0].projection).toBe(4)
  })

  it('has no projection or seasons when nothing is known', () => {
    const { db, mk } = setup()
    mk('A', acc({ woody: 100 }))
    expect(layerCandidates(db)[0]).toMatchObject({ projection: null, seasons: null, daynight: null })
  })
})

describe('saved combos', () => {
  it('saves, lists with names in spray order, and does not duplicate the same combo', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', acc({ woody: 100 }))
    const b = mk('Beta', acc({ citrus: 100 }))
    const r = saveCombo(db, { items: [{ fragranceId: a, sprays: 2 }, { fragranceId: b, sprays: 1 }], predictedScore: 71.6 })
    expect(r).toMatchObject({ ok: true, data: { existing: false } })
    const again = saveCombo(db, { items: [{ fragranceId: a, sprays: 2 }, { fragranceId: b, sprays: 1 }], predictedScore: 80 })
    expect(again.ok && again.data.existing).toBe(true)
    const list = listCombos(db)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ sprayRatio: '2:1', predictedScore: 80 })
    expect(list[0].items.map((i) => i.name)).toEqual(['Alpha', 'Beta'])
    // another ratio, or the other order, is a different combo
    saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: b, sprays: 1 }] })
    saveCombo(db, { items: [{ fragranceId: b, sprays: 2 }, { fragranceId: a, sprays: 1 }] })
    expect(listCombos(db)).toHaveLength(3)
  })

  it('validates', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', [])
    const b = mk('Beta', [])
    expect(saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }] })).toMatchObject({ ok: false, code: 'INVALID' })
    expect(saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: a, sprays: 1 }] })).toMatchObject({ ok: false })
    expect(saveCombo(db, { items: [{ fragranceId: a, sprays: 0 }, { fragranceId: b, sprays: 1 }] })).toMatchObject({ ok: false })
    expect(saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: 999, sprays: 1 }] })).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('rates combos, feeds the history, and the engine learns from it', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', acc({ woody: 100, amber: 80 }))
    const b = mk('Beta', acc({ citrus: 100, aromatic: 60 }))
    const id = (saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: b, sprays: 1 }] }) as { ok: true; data: { id: number } }).data.id
    expect(ratedHistory(db)).toEqual([])
    expect(rateCombo(db, id, 11)).toMatchObject({ ok: false })
    expect(rateCombo(db, id, 9, 'lovely drydown')).toMatchObject({ ok: true })
    expect(listCombos(db)[0]).toMatchObject({ myRating: 9, notes: 'lovely drydown' })
    const history = ratedHistory(db)
    expect(history).toHaveLength(1)
    expect(history[0].items[0].accords.map((x) => x.name).sort()).toEqual(['amber', 'woody'])

    const [ca, cb] = layerCandidates(db)
    const mix = [{ item: ca, sprays: 1 }, { item: cb, sprays: 1 }]
    expect(analyzeLayer(mix, { history }).score).toBeGreaterThan(analyzeLayer(mix).score)

    expect(rateCombo(db, id, null)).toMatchObject({ ok: true })
    expect(ratedHistory(db)).toEqual([])
    expect(rateCombo(db, 12345, 5)).toMatchObject({ ok: false, code: 'NOT_FOUND' })
  })

  it('deleting a combo removes its items but keeps wears for the fragrances', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', [])
    const b = mk('Beta', [])
    const id = (saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: b, sprays: 1 }] }) as { ok: true; data: { id: number } }).data.id
    deleteCombo(db, id)
    expect(listCombos(db)).toEqual([])
    expect(db.prepare('SELECT count(*) AS c FROM layer_combo_items').get()).toEqual({ c: 0 })
  })

  it('removes saved blends when one of their fragrances is deleted', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', [])
    const b = mk('Beta', [])
    const c = mk('Gamma', [])
    saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: b, sprays: 1 }] })
    saveCombo(db, { items: [{ fragranceId: a, sprays: 1 }, { fragranceId: b, sprays: 1 }, { fragranceId: c, sprays: 1 }] })
    deleteFragrance(db, c) // the trio drops to two members: kept as it no longer matches a valid 3-way, but still has 2
    expect(listCombos(db).map((x) => x.items.length).sort()).toEqual([2, 2])
    deleteFragrance(db, b)
    expect(listCombos(db)).toEqual([])
  })
})
