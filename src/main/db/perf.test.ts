import { describe, expect, it } from 'vitest'
import { searchLocal } from '../data/catalog'
import { createFragrance } from './editing'
import { openDatabase } from './index'
import { listFragrances } from './repo'
import { computeOverview } from './stats'
import { listWearsRange, logWear } from './wears'
import { buildCollectionCsv } from './exportCsv'
import { recommendCandidates } from './recommend'

/** A library far bigger than a real one (400 fragrances, 6000 wears) must stay fast. Limits are generous to avoid flakiness. */
describe('large library', () => {
  const db = openDatabase(':memory:')
  const ids: number[] = []
  for (let i = 0; i < 400; i++) {
    const r = createFragrance(
      db,
      { name: `Fragrance ${i}`, house: `House ${i % 40}`, notes: [{ name: `note ${i % 30}`, layer: 'top' }, { name: `base ${i % 20}`, layer: 'base' }], accords: [{ name: `accord ${i % 12}`, strength: 80 }] },
      { to: i % 3 === 0 ? 'to_try' : 'collection', bottle: { type: 'full bottle', sizeMl: 100 } }
    )
    if (!r.ok) throw new Error(r.message)
    ids.push(r.data.id)
  }
  db.transaction(() => {
    for (let i = 0; i < 6000; i++) {
      const day = 1 + (i % 28)
      const month = 1 + (i % 12)
      logWear(db, { fragranceId: ids[i % ids.length], wornAt: `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} 09:${String(i % 60).padStart(2, '0')}`, sprays: 4, backfilled: true })
    }
  })()

  const time = (label: string, fn: () => unknown, limitMs: number) => {
    const t = performance.now()
    fn()
    const ms = performance.now() - t
    expect(ms, label).toBeLessThan(limitMs)
  }

  it('lists, searches, summarises and exports quickly', () => {
    time('list all', () => listFragrances(db), 1500)
    time('stats overview', () => computeOverview(db), 1500)
    time('one year of wears', () => listWearsRange(db, '2025-01-01', '2025-12-31'), 1500)
    time('search', () => searchLocal(db, 'fragrance 12 house'), 500)
    time('csv', () => buildCollectionCsv(db), 3000)
    time('recommend candidates', () => recommendCandidates(db), 1500)
  })
})
