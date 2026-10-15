import { describe, expect, it } from 'vitest'
import { recommend } from '@shared/recommend'
import { createFragrance } from './editing'
import { openDatabase } from './index'
import { getLocation, recommendCandidates, setLocation } from './recommend'
import { setRating } from './editing'
import { logWear } from './wears'

const NOW = new Date(2026, 4, 15, 18, 0)

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, accords: Record<string, number>, community?: { longevity: number; sillage: number }) => {
    const r = createFragrance(
      db,
      {
        name,
        house: 'H',
        notes: [],
        accords: Object.entries(accords).map(([n, strength]) => ({ name: n, strength })),
        community: community ? { winter: 1, spring: 1, summer: 1, fall: 1, day: 1, night: 1, longevity: community.longevity, sillage: community.sillage } : null
      },
      { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } }
    )
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}

describe('recommendation candidates', () => {
  it('reports rotation: last worn, wears this week and total', () => {
    const { db, mk } = setup()
    const a = mk('A', { woody: 100 })
    logWear(db, { fragranceId: a, wornAt: '2026-05-01 10:00', sprays: 1 })
    logWear(db, { fragranceId: a, wornAt: '2026-05-13 10:00', sprays: 1 })
    logWear(db, { fragranceId: a, wornAt: '2026-05-14 10:00', sprays: 1 })
    const c = recommendCandidates(db, NOW)[0]
    expect(c.lastWornAt).toBe('2026-05-14 10:00')
    expect(c.wearsLast7Days).toBe(2)
    expect(c.wearCount).toBe(3)
  })

  it('counts a wear of a layer combo for each of its fragrances', () => {
    const { db, mk } = setup()
    const a = mk('A', { woody: 100 })
    const b = mk('B', { citrus: 100 })
    mk('C', { vanilla: 100 })
    const combo = Number(db.prepare('INSERT INTO layer_combos (spray_ratio) VALUES (?)').run('1:1').lastInsertRowid)
    db.prepare('INSERT INTO layer_combo_items (combo_id, fragrance_id, position, spray_weight) VALUES (?, ?, 0, 1), (?, ?, 1, 1)').run(combo, a, combo, b)
    logWear(db, { comboId: combo, wornAt: '2026-05-15 08:00', sprays: 2 })
    const by = Object.fromEntries(recommendCandidates(db, NOW).map((x) => [x.name, x]))
    expect(by.A.lastWornAt).toBe('2026-05-15 08:00')
    expect(by.B.lastWornAt).toBe('2026-05-15 08:00')
    expect(by.C.lastWornAt).toBeNull()
    expect(by.C.wearCount).toBe(0)
  })

  it('uses my longevity after two logged durations, else the community figure', () => {
    const { db, mk } = setup()
    const a = mk('A', { woody: 100 }, { longevity: 2, sillage: 2 })
    expect(recommendCandidates(db, NOW)[0].longevity).toBe(2)
    logWear(db, { fragranceId: a, wornAt: '2026-05-01 10:00', sprays: 1, longevityHours: 8 })
    expect(recommendCandidates(db, NOW)[0].longevity).toBe(2) // one duration is not enough
    logWear(db, { fragranceId: a, wornAt: '2026-05-02 10:00', sprays: 1, longevityHours: 8 })
    expect(recommendCandidates(db, NOW)[0].longevity).toBe(4)
  })

  it('carries my rating and has nulls for a brand new fragrance', () => {
    const { db, mk } = setup()
    const a = mk('A', { woody: 100 })
    expect(recommendCandidates(db, NOW)[0]).toMatchObject({ rating: null, lastWornAt: null, wearsLast7Days: 0, longevity: null })
    setRating(db, a, 9)
    expect(recommendCandidates(db, NOW)[0].rating).toBe(9)
  })

  it('feeds the engine end to end: yesterday\'s wear drops a fragrance below an unworn twin', () => {
    const { db, mk } = setup()
    const a = mk('Worn', { woody: 100, musky: 60 })
    mk('Fresh', { woody: 100, musky: 60 })
    logWear(db, { fragranceId: a, wornAt: '2026-05-15 08:00', sprays: 1 })
    const r = recommend(recommendCandidates(db, NOW), { activity: 'Office', timeOfDay: 'evening', weather: { temperatureC: 18, humidity: 50 }, now: NOW })
    expect(r.ranked[0].name).toBe('Fresh')
    expect(r.ranked[1].explanation).toMatch(/already worn today/)
  })
})

describe('saved location', () => {
  it('saves, reads and clears', () => {
    const { db } = setup()
    expect(getLocation(db)).toBeNull()
    setLocation(db, { label: 'Berlin, Germany', latitude: 52.52, longitude: 13.41 })
    expect(getLocation(db)).toEqual({ label: 'Berlin, Germany', latitude: 52.52, longitude: 13.41 })
    setLocation(db, null)
    expect(getLocation(db)).toBeNull()
  })
  it('ignores a corrupted value', () => {
    const { db } = setup()
    db.prepare("INSERT INTO settings (key, value) VALUES ('weather.location', '{oops')").run()
    expect(getLocation(db)).toBeNull()
  })
})
