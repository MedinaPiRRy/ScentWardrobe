import { describe, expect, it } from 'vitest'
import type { WearInput } from '@shared/types'
import { createFragrance, setDefaultSprays } from './editing'
import { openDatabase } from './index'
import { getFragrance, listFragrances } from './repo'
import { recommendCandidates } from './recommend'
import { computeOverview } from './stats'
import { deleteWear, isBackfilled, listWears, listWearsRange, logWear, pendingFollowUps, updateWear } from './wears'

const NOW = new Date(2026, 9, 13, 18, 0) // 13 Oct 2026, 18:00

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string) => {
    const r = createFragrance(db, { name, house: 'H', notes: [], accords: [{ name: 'woody', strength: 80 }] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } })
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}
const level = (db: ReturnType<typeof openDatabase>, id: number) => (db.prepare('SELECT remaining_ml AS r FROM bottles WHERE fragrance_id = ?').get(id) as { r: number }).r
const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return (r as unknown as { data: T }).data
}
const wear = (fragranceId: number, wornAt: string, o: Partial<WearInput> = {}): WearInput => ({ fragranceId, wornAt, sprays: 5, ...o })

describe('backfilled wears', () => {
  it('treats anything dated before today as a diary entry', () => {
    expect(isBackfilled(wear(1, '2026-10-12 23:59'), NOW)).toBe(true)
    expect(isBackfilled(wear(1, '2026-10-13 00:01'), NOW)).toBe(false)
    expect(isBackfilled(wear(1, '2026-10-14 09:00'), NOW)).toBe(false) // planned for tomorrow: not a past entry
    expect(isBackfilled(wear(1, '2020-01-01 09:00', { backfilled: false }), NOW)).toBe(false)
    expect(isBackfilled(wear(1, '2026-10-13 09:00', { backfilled: true }), NOW)).toBe(true)
  })

  it('does not subtract from the bottle, unlike a wear today', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const past = ok<{ id: number }>(logWear(db, wear(f, '2026-09-01 10:00'), NOW))
    expect(level(db, f)).toBe(100)
    expect(db.prepare('SELECT count(*) AS c FROM wear_deductions').get()).toEqual({ c: 0 })
    expect(listWears(db)[0]).toMatchObject({ id: past.id, backfilled: true, bottleId: null, mlUsed: 0 })

    ok(logWear(db, wear(f, '2026-10-13 09:00'), NOW))
    expect(level(db, f)).toBeCloseTo(99.5)
    expect(listWears(db).find((w) => !w.backfilled)).toBeTruthy()
  })

  it('can still take from the bottle when asked, and gives it back on delete', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const id = ok<{ id: number }>(logWear(db, wear(f, '2026-09-01 10:00', { takeFromBottle: true }), NOW)).id
    expect(level(db, f)).toBeCloseTo(99.5)
    expect(listWears(db)[0]).toMatchObject({ backfilled: true, mlUsed: 0.5 })
    ok(deleteWear(db, id))
    expect(level(db, f)).toBe(100)
  })

  it('never triggers the "How long did it last?" prompt', () => {
    const { db, mk } = setup()
    const f = mk('A')
    ok(logWear(db, wear(f, '2026-09-01 10:00'), NOW)) // backfilled, no longevity
    const real = ok<{ id: number }>(logWear(db, wear(f, '2026-10-12 10:00', { backfilled: false }), NOW)) // a real wear yesterday
    expect(pendingFollowUps(db, NOW).map((w) => w.id)).toEqual([real.id])
  })

  it('keeps its own date for rotation instead of counting as worn today', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    ok(logWear(db, wear(a, '2026-10-10 10:00'), NOW)) // three days ago, backfilled
    ok(logWear(db, wear(b, '2025-01-01 10:00'), NOW)) // long ago
    const by = Object.fromEntries(recommendCandidates(db, NOW).map((c) => [c.name, c]))
    expect(by.A.lastWornAt).toBe('2026-10-10 10:00')
    expect(by.A.wearsLast7Days).toBe(1)
    expect(by.B.lastWornAt).toBe('2025-01-01 10:00')
    expect(by.B.wearsLast7Days).toBe(0)
  })

  it('counts in the diary totals but not in bottle usage', () => {
    const { db, mk } = setup()
    const f = mk('A')
    ok(logWear(db, wear(f, '2026-09-05 10:00'), NOW))
    ok(logWear(db, wear(f, '2026-09-06 10:00'), NOW))
    const o = computeOverview(db, NOW)
    expect(o.totals.wears).toBe(2)
    expect(o.mostWorn[0]).toMatchObject({ name: 'A', value: 2 })
    const sep = o.perMonth.find((m) => m.month === '2026-09')!
    expect(sep).toMatchObject({ wears: 2, mlUsed: 0 })
    expect(o.totals.mlRemaining).toBe(100)
  })

  it('changes with the date when a wear is edited', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const id = ok<{ id: number }>(logWear(db, wear(f, '2026-10-13 09:00'), NOW)).id
    expect(level(db, f)).toBeCloseTo(99.5)
    ok(updateWear(db, id, wear(f, '2026-10-01 09:00'), NOW)) // moved into the past
    expect(level(db, f)).toBe(100)
    expect(listWears(db)[0].backfilled).toBe(true)
    ok(updateWear(db, id, wear(f, '2026-10-13 09:00'), NOW)) // and back to today
    expect(level(db, f)).toBeCloseTo(99.5)
    expect(listWears(db)[0].backfilled).toBe(false)
  })
})

describe('wears in a date range', () => {
  it('is inclusive of both ends, oldest first, and lists the members of a blend', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    const combo = Number(db.prepare('INSERT INTO layer_combos (spray_ratio) VALUES (?)').run('1:1').lastInsertRowid)
    db.prepare('INSERT INTO layer_combo_items (combo_id, fragrance_id, position, spray_weight) VALUES (?, ?, 0, 1), (?, ?, 1, 1)').run(combo, a, combo, b)
    ok(logWear(db, wear(a, '2026-09-30 23:30'), NOW))
    ok(logWear(db, wear(a, '2026-10-01 08:00'), NOW))
    ok(logWear(db, { comboId: combo, wornAt: '2026-10-01 19:00', sprays: 4 }, NOW))
    ok(logWear(db, wear(b, '2026-10-31 22:00'), NOW))
    ok(logWear(db, wear(b, '2026-11-01 00:10'), NOW))
    const r = listWearsRange(db, '2026-10-01', '2026-10-31')
    expect(r.map((w) => w.wornAt)).toEqual(['2026-10-01 08:00', '2026-10-01 19:00', '2026-10-31 22:00'])
    expect(r.map((w) => w.memberIds)).toEqual([[a], [a, b], [b]])
    expect(r[1].title).toBe('A + B')
    expect(listWearsRange(db, '2027-01-01', '2027-12-31')).toEqual([])
  })
})

describe('usual sprays', () => {
  it('stores, shows and clears a default per fragrance', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    expect(listFragrances(db).every((f) => f.defaultSprays === null)).toBe(true)
    ok(setDefaultSprays(db, [{ fragranceId: a, sprays: 6 }, { fragranceId: b, sprays: 2 }]))
    expect(getFragrance(db, a)!.defaultSprays).toBe(6)
    expect(listFragrances(db).find((f) => f.id === b)!.defaultSprays).toBe(2)
    ok(setDefaultSprays(db, [{ fragranceId: a, sprays: null }]))
    expect(getFragrance(db, a)!.defaultSprays).toBeNull()
  })

  it('rejects bad numbers and changes nothing', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    ok(setDefaultSprays(db, [{ fragranceId: a, sprays: 3 }]))
    for (const bad of [0, 61, 2.5, -1]) {
      expect(setDefaultSprays(db, [{ fragranceId: b, sprays: 5 }, { fragranceId: a, sprays: bad }])).toMatchObject({ ok: false, code: 'INVALID' })
    }
    expect(getFragrance(db, a)!.defaultSprays).toBe(3)
    expect(getFragrance(db, b)!.defaultSprays).toBeNull()
  })
})
