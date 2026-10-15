import { describe, expect, it } from 'vitest'
import { activityFit, assumedTemperature, dayNightFit, daysSince, effectiveSeason, humidityFit, longevityFit, ratingPoints, recommend, rotationPoints, seasonFit, seasonOfMonth, temperatureFit, WEIGHTS } from './engine'
import { profileFor, targetWarmth, warmthIndex } from './activities'
import { explain, humidityWord, temperatureWord } from './explain'
import type { RecContext, RecItem } from './types'

let nextId = 1
const item = (name: string, accords: Record<string, number>, o: Partial<RecItem> = {}): RecItem => ({
  id: nextId++,
  name,
  house: 'H',
  accords: Object.entries(accords).map(([n, strength]) => ({ name: n, strength })),
  notes: [],
  projection: 2.5,
  longevity: 3,
  ...o
})

const summerSeasons = { winter: 5, spring: 30, summer: 100, fall: 20 }
const winterSeasons = { winter: 100, spring: 25, summer: 3, fall: 70 }
const allSeasons = { winter: 60, spring: 70, summer: 70, fall: 70 }

const freshCitrus = () => item('Fresh Citrus', { citrus: 100, aquatic: 60, fresh: 60 }, { seasons: summerSeasons, daynight: { day: 900, night: 100 }, projection: 2, longevity: 2.5 })
const warmVanilla = () => item('Warm Vanilla', { vanilla: 100, amber: 80, sweet: 60, 'warm spicy': 50 }, { seasons: winterSeasons, daynight: { day: 200, night: 800 }, projection: 3, longevity: 4 })
const safeWoody = () => item('Safe Woody', { woody: 100, musky: 70, aromatic: 40 }, { seasons: allSeasons, daynight: { day: 600, night: 400 }, projection: 1.8, longevity: 3 })
const loudOud = () => item('Loud Oud', { oud: 100, amber: 70, smoky: 50 }, { seasons: winterSeasons, daynight: { day: 100, night: 900 }, projection: 3.8, longevity: 4.5 })
const aquaGym = () => item('Aqua Gym', { aquatic: 100, fresh: 80, citrus: 60 }, { seasons: summerSeasons, daynight: { day: 800, night: 200 }, projection: 1.8, longevity: 2 })

const NOW_WINTER = new Date(2026, 0, 15, 19, 0)
const NOW_SUMMER = new Date(2026, 6, 15, 14, 0)
const ctx = (o: Partial<RecContext> = {}): RecContext => ({ activity: 'Casual day', timeOfDay: 'afternoon', weather: { temperatureC: 20, humidity: 50 }, now: NOW_SUMMER, ...o })
const rank = (items: RecItem[], c: RecContext) => recommend(items, c).ranked.map((r) => r.name)
const scoreOf = (items: RecItem[], c: RecContext, name: string) => recommend(items, c).ranked.find((r) => r.name === name)!

describe('weights', () => {
  it('sum to 1', () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })
})

describe('warmth', () => {
  it('rates fresh accords low and cosy accords high', () => {
    expect(warmthIndex(freshCitrus().accords)).toBeLessThan(-0.5)
    expect(warmthIndex(warmVanilla().accords)).toBeGreaterThan(0.5)
    expect(Math.abs(warmthIndex(safeWoody().accords))).toBeLessThan(0.3)
    expect(warmthIndex([])).toBe(0)
  })
  it('targets fresh in the heat and rich in the cold', () => {
    expect(targetWarmth(32)).toBeLessThan(-0.7)
    expect(targetWarmth(-5)).toBeGreaterThan(0.7)
    expect(Math.abs(targetWarmth(15))).toBeLessThan(0.01)
  })
})

describe('temperature', () => {
  it('prefers fresh scents in heat and warm ones in cold', () => {
    expect(temperatureFit(freshCitrus(), 32)).toBeGreaterThan(temperatureFit(warmVanilla(), 32))
    expect(temperatureFit(warmVanilla(), -2)).toBeGreaterThan(temperatureFit(freshCitrus(), -2))
  })
  it('ranks the whole list accordingly', () => {
    const items = [warmVanilla(), freshCitrus(), safeWoody()]
    const hot = rank(items, ctx({ weather: { temperatureC: 33, humidity: 50 }, activity: 'Casual day' }))
    expect(hot.indexOf('Fresh Citrus')).toBeLessThan(hot.indexOf('Warm Vanilla'))
    const cold = rank(items, ctx({ now: NOW_WINTER, timeOfDay: 'evening', weather: { temperatureC: -2, humidity: 50 } }))
    expect(cold.indexOf('Warm Vanilla')).toBeLessThan(cold.indexOf('Fresh Citrus'))
  })
})

describe('humidity', () => {
  it('penalises heavy fragrances in humid air but not fresh ones', () => {
    expect(humidityFit(warmVanilla(), 90)).toBeLessThan(humidityFit(warmVanilla(), 40))
    expect(humidityFit(warmVanilla(), 90)).toBeLessThan(humidityFit(freshCitrus(), 90))
    expect(humidityFit(freshCitrus(), 95)).toBeGreaterThan(0.9)
    expect(humidityFit(warmVanilla(), 55)).toBe(1)
  })
})

describe('seasons and time of day', () => {
  it('uses the temperature, with the calendar for in-between days', () => {
    expect(effectiveSeason(30, 0)).toBe('summer')
    expect(effectiveSeason(2, 6)).toBe('winter')
    expect(effectiveSeason(14, 3)).toBe('spring')
    expect(effectiveSeason(14, 9)).toBe('fall')
    expect(seasonOfMonth(0)).toBe('winter')
    expect(seasonOfMonth(6)).toBe('summer')
    expect(assumedTemperature(6)).toBeGreaterThan(assumedTemperature(0))
  })
  it('scores community season votes, neutral when missing', () => {
    expect(seasonFit(freshCitrus(), 'summer')!).toBeGreaterThan(0.85)
    expect(seasonFit(freshCitrus(), 'winter')!).toBeLessThan(0.3)
    expect(seasonFit(item('x', {}), 'summer')).toBeNull()
    expect(seasonFit(item('x', {}, { seasons: { winter: 0, spring: 0, summer: 0, fall: 0 } }), 'summer')).toBeNull()
  })
  it('scores day versus night votes', () => {
    expect(dayNightFit(freshCitrus(), 'morning')!).toBeGreaterThan(0.8)
    expect(dayNightFit(freshCitrus(), 'night')!).toBeLessThan(0.2)
    expect(dayNightFit(warmVanilla(), 'night')!).toBeGreaterThan(0.7)
    const evening = dayNightFit(warmVanilla(), 'evening')!
    expect(evening).toBeGreaterThan(dayNightFit(warmVanilla(), 'afternoon')!)
    expect(dayNightFit(item('x', {}), 'night')).toBeNull()
  })
})

describe('activities', () => {
  it('recognises activity names, including custom ones as neutral', () => {
    expect(profileFor('Office / work').key).toBe('office')
    expect(profileFor('Date night').key).toBe('date')
    expect(profileFor('Night out').key).toBe('nightOut')
    expect(profileFor('Gym').key).toBe('gym')
    expect(profileFor('Wedding').key).toBe('wedding')
    expect(profileFor('Formal event').key).toBe('formal')
    expect(profileFor('Staying home').key).toBe('home')
    expect(profileFor('Travel').key).toBe('travel')
    expect(profileFor('Casual day').key).toBe('casual')
    expect(profileFor('Pottery class')?.key).toBe('office') // "class" reads as a work-like setting
    expect(profileFor('Birdwatching').key).toBe('custom')
  })

  it('office favours low projection and safe profiles over loud ones', () => {
    const office = profileFor('Office')
    expect(activityFit(safeWoody(), office).fit).toBeGreaterThan(activityFit(loudOud(), office).fit)
    const items = [loudOud(), safeWoody(), warmVanilla()]
    expect(rank(items, ctx({ activity: 'Office / work', timeOfDay: 'morning', weather: { temperatureC: 15, humidity: 50 } }))[0]).toBe('Safe Woody')
  })

  it('date night favours sweet, warm, moderate projection', () => {
    const items = [freshCitrus(), safeWoody(), warmVanilla()]
    const r = rank(items, ctx({ activity: 'Date night', now: NOW_WINTER, timeOfDay: 'evening', weather: { temperatureC: 5, humidity: 40 } }))
    expect(r[0]).toBe('Warm Vanilla')
  })

  it('gym favours light and fresh', () => {
    const items = [warmVanilla(), loudOud(), aquaGym(), safeWoody()]
    expect(rank(items, ctx({ activity: 'Gym', timeOfDay: 'morning', weather: { temperatureC: 27, humidity: 50 } }))[0]).toBe('Aqua Gym')
  })

  it('night out tolerates high projection that the office would not', () => {
    const night = profileFor('Night out')
    const office = profileFor('Office')
    const o = loudOud()
    expect(activityFit(o, night).projectionFit).toBeGreaterThan(activityFit(o, office).projectionFit)
    expect(activityFit(o, night).fit).toBeGreaterThan(activityFit(o, office).fit)
  })

  it('treats a custom activity neutrally', () => {
    const neutral = profileFor('Birdwatching')
    expect(activityFit(safeWoody(), neutral).accordFit).toBe(0.5)
  })

  it('scores projection by distance from the occasion\'s target', () => {
    const p = profileFor('Office')
    const quiet = item('q', { woody: 100 }, { projection: 1.8 })
    const loud = item('l', { woody: 100 }, { projection: 4 })
    expect(activityFit(quiet, p).projectionFit).toBeGreaterThan(activityFit(loud, p).projectionFit)
  })
})

describe('longevity', () => {
  it('matters more for long events', () => {
    const shortLived = item('s', { woody: 100 }, { longevity: 1.5 })
    const longLasting = item('l', { woody: 100 }, { longevity: 4.5 })
    expect(longevityFit(shortLived, 0.8)!).toBeLessThan(longevityFit(longLasting, 0.8)!)
    expect(longevityFit(shortLived, 0.2)!).toBeGreaterThan(longevityFit(shortLived, 0.8)!)
    expect(longevityFit(item('x', {}, { longevity: null }), 0.8)).toBeNull()
    expect(longevityFit(longLasting, 0.8)).toBe(1)
  })
})

describe('rotation', () => {
  it('penalises recently worn fragrances and slightly rewards neglected ones', () => {
    expect(rotationPoints(0)).toBeLessThan(rotationPoints(1))
    expect(rotationPoints(1)).toBeLessThan(rotationPoints(3))
    expect(rotationPoints(3)).toBeLessThan(rotationPoints(4))
    expect(rotationPoints(4)).toBe(0)
    expect(rotationPoints(20)).toBeGreaterThan(0)
    expect(rotationPoints(40)).toBeGreaterThan(rotationPoints(20))
    expect(rotationPoints(null)).toBeGreaterThan(0)
    expect(rotationPoints(5, 3)).toBeLessThan(0) // worn a lot this week
  })
  it('moves a worn-today fragrance below an otherwise identical fresh one', () => {
    const base = { woody: 100, musky: 60 }
    const worn = item('Worn Today', base, { lastWornAt: '2026-07-15 08:00', wearsLast7Days: 1 })
    const fresh = item('Untouched', base, { lastWornAt: '2026-06-10 08:00' })
    const r = rank([worn, fresh], ctx())
    expect(r[0]).toBe('Untouched')
    expect(scoreOf([worn, fresh], ctx(), 'Untouched').score - scoreOf([worn, fresh], ctx(), 'Worn Today').score).toBeGreaterThan(10)
  })
  it('counts days between dates in local time', () => {
    expect(daysSince('2026-07-05 23:30', NOW_SUMMER)).toBe(10)
    expect(daysSince('2026-07-15 01:00', NOW_SUMMER)).toBe(0)
    expect(daysSince(null, NOW_SUMMER)).toBeNull()
    expect(daysSince('garbage', NOW_SUMMER)).toBeNull()
  })
})

describe('rating tiebreak', () => {
  it('only nudges, by at most 2 points', () => {
    expect(ratingPoints(10)).toBe(2)
    expect(ratingPoints(1)).toBe(-2)
    expect(ratingPoints(null)).toBe(0)
    const a = item('Loved', { woody: 100 }, { rating: 10 })
    const b = item('Meh', { woody: 100 }, { rating: 3 })
    const r = recommend([b, a], ctx())
    expect(r.ranked[0].name).toBe('Loved')
    expect(r.ranked[0].score - r.ranked[1].score).toBeLessThanOrEqual(4)
  })
})

describe('result shape', () => {
  const items = [freshCitrus(), warmVanilla(), safeWoody(), loudOud(), aquaGym()]
  it('returns bounded scores, a full breakdown, and the top 3 first', () => {
    const r = recommend(items, ctx())
    expect(r.picks).toHaveLength(3)
    expect(r.ranked).toHaveLength(5)
    for (const x of r.ranked) {
      expect(x.score).toBeGreaterThanOrEqual(0)
      expect(x.score).toBeLessThanOrEqual(100)
      expect(x.breakdown.map((b) => b.key)).toEqual(expect.arrayContaining(['season', 'daynight', 'temperature', 'humidity', 'activity', 'longevity', 'rotation']))
    }
    expect(r.picks[0].name).toBe(r.ranked[0].name)
    const scores = r.ranked.map((x) => x.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })
  it('lets the breakdown add up to the score', () => {
    const x = recommend(items, ctx()).ranked[0]
    expect(Math.abs(x.breakdown.reduce((s, b) => s + b.points, 0) - x.score)).toBeLessThanOrEqual(1.5)
  })
  it('uses neutral values where data is missing and says what it assumed', () => {
    const bare = item('Bare', { woody: 100 }, { seasons: null, daynight: null, longevity: null })
    const r = recommend([bare], ctx({ weather: null }))
    expect(r.assumptions.join(' ')).toMatch(/temperature/)
    expect(r.assumptions.join(' ')).toMatch(/humidity/)
    expect(r.ranked[0].breakdown.find((b) => b.key === 'season')!.fit).toBe(0.5)
    expect(recommend([bare], ctx()).assumptions).toEqual([])
  })
  it('handles an empty collection and a single fragrance', () => {
    expect(recommend([], ctx())).toMatchObject({ picks: [], ranked: [], combo: null })
    const one = recommend([safeWoody()], ctx())
    expect(one.picks).toHaveLength(1)
    expect(one.combo).toBeNull()
  })
  it('skips near-identical twins when choosing the top 3', () => {
    const a = item('A', { woody: 100, amber: 60 })
    const twin = item('A Twin', { woody: 98, amber: 62 })
    const other = item('Other', { citrus: 100, aromatic: 60 })
    const another = item('Another', { vanilla: 100, sweet: 70 })
    const names = recommend([a, twin, other, another], ctx()).picks.map((p) => p.name)
    expect(names).toHaveLength(3)
    expect(names.includes('A') && names.includes('A Twin')).toBe(false)
  })
  it('fills the picks up with twins when there are not enough distinct fragrances', () => {
    const a = item('A', { woody: 100, amber: 60 })
    const twin = item('A Twin', { woody: 100, amber: 60 })
    expect(recommend([a, twin], ctx()).picks).toHaveLength(2)
  })
})

describe('explanations', () => {
  it('follows the "Cold and dry evening, date night: ..." pattern', () => {
    const v = { ...warmVanilla(), projection: 2.4 }
    v.lastWornAt = '2026-01-06 20:00'
    const c = ctx({ activity: 'Date night', timeOfDay: 'evening', now: NOW_WINTER, weather: { temperatureC: 2, humidity: 25 } })
    const r = recommend([v], c).ranked[0]
    expect(r.explanation).toMatch(/^Cold and dry evening, date night: warm vanilla-amber profile, moderate projection, not worn in 9 days\.$/)
  })
  it('describes projection and rotation in plain words', () => {
    const e = (o: Partial<RecItem>) => explain({ ...safeWoody(), ...o }, { breakdown: [] }, ctx(), 20, 50, false)
    expect(e({ projection: 1.2 })).toMatch(/soft projection/)
    expect(e({ projection: 3.6 })).toMatch(/strong projection/)
    expect(e({ lastWornAt: null })).toMatch(/not worn yet/)
    expect(e({ lastWornAt: '2026-07-15 08:00' })).toMatch(/already worn today/)
    expect(e({ lastWornAt: '2026-07-14 08:00' })).toMatch(/worn yesterday/)
    expect(e({ lastWornAt: '2026-07-12 08:00' })).toMatch(/worn 3 days ago/)
  })
  it('leaves the temperature out when it was assumed', () => {
    const c = ctx({ weather: null, timeOfDay: 'night', activity: 'Gym' })
    expect(recommend([safeWoody()], c).ranked[0].explanation).toMatch(/^Night, gym: /)
  })
  it('names a clear compromise', () => {
    const o = loudOud()
    const r = recommend([o], ctx({ timeOfDay: 'morning', weather: { temperatureC: 33, humidity: 80 } })).ranked[0]
    expect(r.explanation).toMatch(/compromise/)
  })
  it('words for temperature and humidity', () => {
    expect([35, 26, 20, 10, 3, -5].map(temperatureWord)).toEqual(['Hot', 'Warm', 'Mild', 'Cool', 'Cold', 'Freezing'])
    expect([80, 50, 20].map(humidityWord)).toEqual(['humid', null, 'dry'])
  })
})

describe('layering suggestion', () => {
  it('suggests a pair of today\'s leaders that also work together', () => {
    const items = [warmVanilla(), safeWoody(), freshCitrus(), loudOud()]
    const r = recommend(items, ctx({ now: NOW_WINTER, timeOfDay: 'evening', activity: 'Date night', weather: { temperatureC: 3, humidity: 50 } }))
    expect(r.combo).not.toBeNull()
    expect(r.combo!.ids).toHaveLength(2)
    expect(r.combo!.layerScore).toBeGreaterThanOrEqual(58)
    expect(r.combo!.description.length).toBeGreaterThan(20)
    expect(r.ranked.slice(0, 6).map((x) => x.id)).toEqual(expect.arrayContaining(r.combo!.ids))
  })
  it('suggests nothing when every pair clashes or is redundant', () => {
    const a = item('A', { aquatic: 100, fresh: 60 })
    const b = item('B', { coffee: 100, vanilla: 80, sweet: 70 })
    expect(recommend([a, b], ctx()).combo).toBeNull()
    const twinA = item('T1', { woody: 100, amber: 60 })
    const twinB = item('T2', { woody: 99, amber: 61 })
    expect(recommend([twinA, twinB], ctx()).combo).toBeNull()
  })
})
