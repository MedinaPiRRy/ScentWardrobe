import { describe, expect, it } from 'vitest'
import type { WearInput } from '@shared/types'
import { addBottle, createFragrance } from './editing'
import { openDatabase } from './index'
import { getFragrance } from './repo'
import { addActivity, DEFAULT_ACTIVITIES, listActivities, setSetting } from './settings'
import { computeOverview, daysBetween, lastMonths } from './stats'
import { completeFollowUp, deleteWear, dismissFollowUp, isFollowUpDue, listWears, logWear, pendingFollowUps, timeOfDayFor, updateWear } from './wears'

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, size = 100, extra: Record<string, unknown> = {}) => {
    const { price, ...bottle } = extra
    const r = createFragrance(db, { name, house: 'H', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: size, ...bottle } })
    if (!r.ok) throw new Error(r.message)
    if (price != null) db.prepare('UPDATE bottles SET price = ? WHERE fragrance_id = ?').run(price, r.data.id)
    return r.data.id
  }
  return { db, mk }
}
// These tests are about real wears (bottle levels, follow-ups), so they opt out of the "dated in the past = backfilled" default.
const wear = (fragranceId: number, o: Partial<WearInput> = {}): WearInput => ({ fragranceId, wornAt: '2026-05-10 09:30', sprays: 5, backfilled: false, ...o })
const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return (r as unknown as { data: T }).data
}
const remaining = (db: ReturnType<typeof openDatabase>, id: number) => (db.prepare('SELECT remaining_ml AS r FROM bottles WHERE fragrance_id = ?').get(id) as { r: number }).r

describe('time of day', () => {
  it('buckets hours', () => {
    expect([4, 5, 11, 12, 16, 17, 20, 21, 23].map(timeOfDayFor)).toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night'])
  })
})

describe('logging a wear', () => {
  it('subtracts sprays x ml-per-spray from the bottle and records everything', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const id = ok<{ id: number }>(logWear(db, wear(f, { activity: 'Gym', temperatureC: 21, humidity: 40, weather: 'Clear', projection: 3, longevityHours: 6, compliments: 2, notes: 'nice' }))).id
    expect(remaining(db, f)).toBeCloseTo(99.5)
    const [w] = listWears(db)
    expect(w).toMatchObject({ id, title: 'A', sprays: 5, activity: 'Gym', temperatureC: 21, weather: 'Clear', projection: 3, longevityHours: 6, compliments: 2, timeOfDay: 'morning' })
    expect(w.mlUsed).toBeCloseTo(0.5)
    expect(w.bottleId).not.toBeNull()
  })

  it('uses the chosen bottle and the bottle\'s own ml per spray', () => {
    const { db, mk } = setup()
    const f = mk('A')
    ok(addBottle(db, f, { type: 'decant', sizeMl: 10, mlPerSpray: 0.2 }))
    const decant = getFragrance(db, f)!.bottles[1]
    ok(logWear(db, wear(f, { bottleId: decant.id, sprays: 4 })))
    expect(getFragrance(db, f)!.bottles[1].remainingMl).toBeCloseTo(9.2)
    expect(getFragrance(db, f)!.bottles[0].remainingMl).toBe(100)
  })

  it('never goes below zero, marks the bottle empty, and a delete brings it back', () => {
    const { db, mk } = setup()
    const f = mk('A', 2, { remainingMl: 0.3 })
    const id = ok<{ id: number }>(logWear(db, wear(f, { sprays: 10 }))).id
    const b = getFragrance(db, f)!.bottles[0]
    expect(b.remainingMl).toBe(0)
    expect(b.status).toBe('empty')
    ok(deleteWear(db, id))
    const after = getFragrance(db, f)!.bottles[0]
    expect(after.remainingMl).toBeCloseTo(0.3)
    expect(after.status).toBe('active')
  })

  it('warns once, when a wear takes the bottle under the threshold', () => {
    const { db, mk } = setup()
    const f = mk('A', 10, { remainingMl: 1.8 }) // 18 %
    const first = ok<{ warnings: { percent: number; wearsLeft: number }[] }>(logWear(db, wear(f, { sprays: 4 }))) // -> 1.4 ml = 14 %
    expect(first.warnings).toHaveLength(1)
    expect(first.warnings[0]).toMatchObject({ percent: 14 })
    expect(first.warnings[0].wearsLeft).toBe(3) // 1.4 ml / (4 sprays x 0.1)
    const second = ok<{ warnings: unknown[] }>(logWear(db, wear(f, { sprays: 1 })))
    expect(second.warnings).toHaveLength(0)
  })

  it('respects a custom low-level threshold', () => {
    const { db, mk } = setup()
    setSetting(db, 'bottle.lowThreshold', '0.5')
    const f = mk('A', 10, { remainingMl: 5.2 })
    expect(ok<{ warnings: unknown[] }>(logWear(db, wear(f, { sprays: 4 }))).warnings).toHaveLength(1)
  })

  it('continues from a manual correction of the level', () => {
    const { db, mk } = setup()
    const f = mk('A')
    ok(logWear(db, wear(f)))
    db.prepare('UPDATE bottles SET remaining_ml = 60 WHERE fragrance_id = ?').run(f) // I measured it
    ok(logWear(db, wear(f)))
    expect(remaining(db, f)).toBeCloseTo(59.5)
  })

  it('allows wearing something with no bottle', () => {
    const { db } = setup()
    const r = createFragrance(db, { name: 'Sample', house: 'H', notes: [], accords: [] }, { to: 'to_try' })
    const { id } = ok<{ id: number }>(r)
    ok(logWear(db, wear(id)))
    expect(listWears(db)).toHaveLength(1)
  })

  it('validates input', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const bad = (o: Partial<WearInput>) => logWear(db, wear(f, o))
    expect(bad({ sprays: -1 })).toMatchObject({ ok: false, code: 'INVALID' })
    expect(bad({ sprays: 1.5 })).toMatchObject({ ok: false })
    expect(bad({ projection: 6 })).toMatchObject({ ok: false })
    expect(bad({ longevityHours: -2 })).toMatchObject({ ok: false })
    expect(bad({ wornAt: 'yesterday' })).toMatchObject({ ok: false })
    expect(bad({ humidity: 140 })).toMatchObject({ ok: false })
    expect(logWear(db, { wornAt: '2026-05-10 09:30', sprays: 1 })).toMatchObject({ ok: false })
    expect(logWear(db, wear(9999))).toMatchObject({ ok: false, code: 'NOT_FOUND' })
    const other = mk('B')
    const otherBottle = getFragrance(db, other)!.bottles[0].id
    expect(bad({ bottleId: otherBottle })).toMatchObject({ ok: false, code: 'INVALID' })
    expect(remaining(db, f)).toBe(100) // failed wears change nothing
    expect(listWears(db)).toHaveLength(0)
  })
})

describe('editing and deleting wears', () => {
  it('re-applies the difference when sprays change', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const id = ok<{ id: number }>(logWear(db, wear(f, { sprays: 5 }))).id
    ok(updateWear(db, id, wear(f, { sprays: 10, notes: 'more' })))
    expect(remaining(db, f)).toBeCloseTo(99)
    expect(listWears(db)[0]).toMatchObject({ sprays: 10, notes: 'more' })
    ok(deleteWear(db, id))
    expect(remaining(db, f)).toBeCloseTo(100)
    expect(listWears(db)).toHaveLength(0)
  })
  it('refuses to move a wear to another fragrance', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    const id = ok<{ id: number }>(logWear(db, wear(a))).id
    expect(updateWear(db, id, wear(b))).toMatchObject({ ok: false, code: 'INVALID' })
  })
})

describe('layer combos', () => {
  it('splits sprays across the layers by weight', () => {
    const { db, mk } = setup()
    const a = mk('A')
    const b = mk('B')
    const combo = Number(db.prepare('INSERT INTO layer_combos (spray_ratio) VALUES (?)').run('2:1').lastInsertRowid)
    db.prepare('INSERT INTO layer_combo_items (combo_id, fragrance_id, position, spray_weight) VALUES (?, ?, 0, 2), (?, ?, 1, 1)').run(combo, a, combo, b)
    const id = ok<{ id: number }>(logWear(db, { comboId: combo, wornAt: '2026-05-10 19:00', sprays: 6, backfilled: false })).id
    expect(remaining(db, a)).toBeCloseTo(99.6) // 4 sprays
    expect(remaining(db, b)).toBeCloseTo(99.8) // 2 sprays
    const [w] = listWears(db)
    expect(w.title).toBe('A + B')
    expect(w.comboId).toBe(combo)
    ok(deleteWear(db, id))
    expect(remaining(db, a)).toBe(100)
    expect(remaining(db, b)).toBe(100)
  })
})

describe('follow-ups', () => {
  const at = (iso: string) => new Date(iso)
  it('is due after the day is over, or after 8 pm on the day', () => {
    expect(isFollowUpDue('2026-05-10 09:30', at('2026-05-10T15:00:00'))).toBe(false)
    expect(isFollowUpDue('2026-05-10 09:30', at('2026-05-10T20:00:00'))).toBe(true)
    expect(isFollowUpDue('2026-05-10 09:30', at('2026-05-11T08:00:00'))).toBe(true)
    expect(isFollowUpDue('2026-05-11 09:30', at('2026-05-10T23:00:00'))).toBe(false)
  })

  it('lists wears with no longevity, until answered or skipped', () => {
    const { db, mk } = setup()
    const f = mk('A')
    const a = ok<{ id: number }>(logWear(db, wear(f, { wornAt: '2026-05-09 10:00' }))).id
    const b = ok<{ id: number }>(logWear(db, wear(f, { wornAt: '2026-05-09 12:00' }))).id
    ok(logWear(db, wear(f, { wornAt: '2026-05-09 13:00', longevityHours: 5 }))) // already answered
    const now = at('2026-05-10T09:00:00')
    expect(pendingFollowUps(db, now).map((w) => w.id)).toEqual([a, b])
    ok(completeFollowUp(db, a, { longevityHours: 7, projection: 4 }))
    ok(dismissFollowUp(db, b))
    expect(pendingFollowUps(db, now)).toEqual([])
    expect(listWears(db).find((w) => w.id === a)).toMatchObject({ longevityHours: 7, projection: 4 })
    expect(completeFollowUp(db, a, { longevityHours: 99 })).toMatchObject({ ok: false })
  })
})

describe('performance in the detail view', () => {
  it('summarises compliments and longevity by season and weather', () => {
    const { db, mk } = setup()
    const f = mk('A')
    ok(logWear(db, wear(f, { wornAt: '2026-01-10 10:00', longevityHours: 8, weather: 'Snow', compliments: 1 })))
    ok(logWear(db, wear(f, { wornAt: '2026-01-20 10:00', longevityHours: 6, weather: 'snow', compliments: 2 })))
    ok(logWear(db, wear(f, { wornAt: '2026-07-04 10:00', longevityHours: 3, weather: 'Clear' })))
    const p = getFragrance(db, f)!.performance
    expect(p.compliments).toBe(3)
    expect(p.longevityBySeason).toEqual([{ label: 'winter', avg: 7, wears: 2 }, { label: 'summer', avg: 3, wears: 1 }])
    expect(p.longevityByWeather).toEqual([{ label: 'snow', avg: 7, wears: 2 }, { label: 'clear', avg: 3, wears: 1 }])
  })
})

describe('activities', () => {
  it('keeps the defaults and adds custom ones once', () => {
    const { db } = setup()
    expect(listActivities(db)).toEqual(DEFAULT_ACTIVITIES)
    ok(addActivity(db, 'Hiking'))
    ok(addActivity(db, 'hiking'))
    expect(listActivities(db)).toEqual([...DEFAULT_ACTIVITIES, 'Hiking'])
    expect(addActivity(db, '  ')).toMatchObject({ ok: false })
  })
})

describe('overview stats', () => {
  const now = new Date(2026, 4, 15, 12, 0) // 15 May 2026

  it('has sensible empty values', () => {
    const { db } = setup()
    const o = computeOverview(db, now)
    expect(o.totals).toMatchObject({ collectionCount: 0, wears: 0, mlOwned: 0, totalSpent: 0, avgCostPerWear: null })
    expect(o.perMonth).toHaveLength(12)
    expect(o.perMonth[11].month).toBe('2026-05')
    expect(o.mostWorn).toEqual([])
  })

  it('computes leaderboards, neglected bottles, monthly usage and costs', () => {
    const { db, mk } = setup()
    const a = mk('Alpha', 100, { price: 90 })
    const b = mk('Bravo', 50)
    const c = mk('Charlie', 10, { price: 20 })
    // Alpha: 3 wears, Bravo: 1 wear (a month ago), Charlie never worn
    ok(logWear(db, wear(a, { wornAt: '2026-05-14 10:00', sprays: 10, longevityHours: 8, projection: 4, compliments: 2 })))
    ok(logWear(db, wear(a, { wornAt: '2026-05-02 10:00', sprays: 10, longevityHours: 6, projection: 2 })))
    ok(logWear(db, wear(a, { wornAt: '2026-04-20 10:00', sprays: 10 })))
    ok(logWear(db, wear(b, { wornAt: '2026-04-10 10:00', sprays: 4, longevityHours: 3, projection: 5 })))
    const o = computeOverview(db, now)

    expect(o.totals).toMatchObject({ collectionCount: 3, wears: 4, wearsLast30Days: 3, mlOwned: 160, totalSpent: 110 })
    expect(o.totals.mlRemaining).toBeCloseTo(160 - 3 - 0.4)
    expect(o.mostWorn.map((r) => [r.name, r.value])).toEqual([['Alpha', 3], ['Bravo', 1]])
    expect(o.neglected.map((n) => [n.name, n.daysSinceWorn])).toEqual([['Charlie', null], ['Bravo', 35], ['Alpha', 1]])
    // leaderboards need at least 2 rated wears
    expect(o.leaderboards.longevity).toEqual([{ id: a, name: 'Alpha', house: 'H', value: 7, wears: 3 }])
    expect(o.leaderboards.projection[0]).toMatchObject({ name: 'Alpha', value: 3 })
    expect(o.leaderboards.compliments).toEqual([{ id: a, name: 'Alpha', house: 'H', value: 2, wears: 3 }])
    const may = o.perMonth.find((m) => m.month === '2026-05')!
    const apr = o.perMonth.find((m) => m.month === '2026-04')!
    expect(may).toMatchObject({ wears: 2, mlUsed: 2 })
    expect(apr).toMatchObject({ wears: 2, mlUsed: 1.4 })
    // cost per wear: Alpha 90 / 3 = 30; Charlie has a price but no wears
    expect(o.costPerWear).toEqual([
      { id: a, name: 'Alpha', house: 'H', spent: 90, wears: 3, costPerWear: 30 },
      { id: c, name: 'Charlie', house: 'H', spent: 20, wears: 0, costPerWear: null }
    ])
    expect(o.totals.avgCostPerWear).toBe(30)
  })

  it('lists low bottles', () => {
    const { db, mk } = setup()
    mk('Low', 100, { remainingMl: 10 })
    mk('Fine', 100)
    const o = computeOverview(db, now)
    expect(o.lowBottles).toHaveLength(1)
    expect(o.lowBottles[0]).toMatchObject({ name: 'Low', percent: 10, wearsLeft: 25 })
  })
})

describe('helpers', () => {
  it('lists the last months and counts days', () => {
    expect(lastMonths(new Date(2026, 1, 10), 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
    expect(daysBetween('2026-05-01 23:00', new Date(2026, 4, 15, 1, 0))).toBe(14)
  })
})
