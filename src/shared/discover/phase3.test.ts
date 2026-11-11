import { describe, expect, it } from 'vitest'
import { budgetVerdict, costFor, priceReference, trialHint } from './budget'
import { approxVotes, compareValue, dupeScore, evidenceStrength } from './dupes'
import { analyzeCoverage, briefForCell, type GapItem } from './gaps'

const wears = (o: Partial<GapItem['wears']> = {}): GapItem['wears'] => ({ total: 0, bySeason: { winter: 0, spring: 0, summer: 0, fall: 0 }, day: 0, night: 0, activities: {}, ...o })
const item = (o: Partial<GapItem> & { name: string }): GapItem => ({ id: Math.floor(Math.random() * 1e6), accords: [], seasons: null, daynight: null, projection: null, longevity: null, wears: wears(), ...o })

describe('coverage of My Collection', () => {
  const summerOnly = (name: string) => item({ name, accords: [{ name: 'citrus', strength: 100 }, { name: 'aquatic', strength: 60 }], seasons: { winter: 5, spring: 100, summer: 900, fall: 40 }, daynight: { day: 900, night: 50 }, projection: 2, longevity: 2.8 })

  it('names the seasons nothing suits, and says what suits the rest', () => {
    const map = analyzeCoverage([summerOnly('A'), summerOnly('B')])
    const cell = (k: string) => map.cells.find((c) => c.dimension === 'season' && c.key === k)!
    expect(cell('summer')).toMatchObject({ status: 'covered', suits: 2 })
    expect(cell('winter')).toMatchObject({ status: 'missing', suits: 0 })
    expect(cell('winter').text).toBe('Nothing in your collection is meant for winter.')
    expect(map.summary.some((t) => /winter/.test(t))).toBe(true)
    expect(briefForCell(cell('winter')).season).toBe('winter')
  })

  it('uses my wear log: wearing something in a season counts even when the votes disagree, and a lone favourite is called out', () => {
    const a = item({ name: 'Lone', seasons: { winter: 0, spring: 0, summer: 1000, fall: 0 }, wears: wears({ total: 8, bySeason: { winter: 8, spring: 0, summer: 0, fall: 0 } }) })
    const map = analyzeCoverage([a])
    const winter = map.cells.find((c) => c.key === 'winter')!
    expect(winter).toMatchObject({ status: 'thin', suits: 1, worn: 8, wornBy: 1 })
    expect(winter.text).toBe('Only Lone suits winter, and it accounts for all 8 of your winter wears.')
    expect(map.wears).toBe(8)
  })

  it('finds missing occasions, families and performance', () => {
    const map = analyzeCoverage([summerOnly('A'), summerOnly('B')])
    const get = (d: string, k: string) => map.cells.find((c) => c.dimension === d && c.key === k)!
    expect(get('occasion', 'gym').status).toBe('covered')
    expect(get('occasion', 'date').status).toBe('missing')
    expect(get('family', 'fresh').status).toBe('covered')
    expect(get('family', 'sweet').status).toBe('missing')
    expect(get('performance', 'room')).toMatchObject({ status: 'missing' })
    expect(get('performance', 'long').status).toBe('missing')
    expect(get('time', 'day').status).toBe('covered')
    expect(get('time', 'night').status).toBe('missing') // only 5% of the votes say night
  })

  it('has a plain answer for an empty collection and for a full one', () => {
    expect(analyzeCoverage([]).summary[0]).toMatch(/nothing in My Collection/i)
    const rich = [
      ...['winter', 'spring', 'summer', 'fall'].flatMap((s) => [1, 2].map((n) => item({ name: `${s}${n}`, seasons: { winter: 0, spring: 0, summer: 0, fall: 0, [s]: 500 } as never, accords: [{ name: 'citrus', strength: 50 }, { name: 'woody', strength: 50 }, { name: 'sweet', strength: 50 }, { name: 'floral', strength: 50 }, { name: 'amber', strength: 50 }], projection: n === 1 ? 1.8 : 3.3, longevity: 4, daynight: { day: 500, night: 500 } })))
    ]
    const map = analyzeCoverage(rich)
    const season = map.cells.filter((c) => c.dimension === 'season')
    expect(season.every((c) => c.status === 'covered')).toBe(true)
  })
})

describe('dupe evidence', () => {
  it('grows with agreement and numbers, and is zero without net agreement', () => {
    expect(evidenceStrength(5000, 500)).toBeGreaterThan(evidenceStrength(50, 5))
    expect(evidenceStrength(100, 90)).toBeLessThan(evidenceStrength(100, 5))
    expect(evidenceStrength(10, 10)).toBe(0)
    expect(evidenceStrength(0, 0)).toBe(0)
  })
  it('scores profile alone below a clone and with votes above it', () => {
    expect(dupeScore(1, null)).toBe(80)
    expect(dupeScore(0.9, evidenceStrength(4000, 300))).toBeGreaterThan(dupeScore(0.9, null))
    expect(dupeScore(0.2, 0.9)).toBeGreaterThan(dupeScore(0.2, null))
  })
  it('marks 1,000 or more votes as approximate', () => {
    expect(approxVotes(1200)).toBe('about 1,200 people')
    expect(approxVotes(40)).toBe('40 people')
    expect(approxVotes(1)).toBe('1 person')
  })
  it('only says cheaper when both prices are mine; value votes are quoted as opinions', () => {
    const mine = (perMl: number | null) => ({ perMl })
    const bothMine = compareValue({ mine: mine(0.5), valueAvg: null, valueN: null }, { mine: mine(2), valueAvg: null, valueN: null }, 'CAD')
    expect(bothMine.cheaper).toBe(true)
    expect(bothMine.lines[0]).toMatch(/CAD 0\.50\/ml against CAD 2\.00\/ml \(cheaper\)/)
    const votes = compareValue({ mine: mine(null), valueAvg: 4.2, valueN: 900 }, { mine: mine(2), valueAvg: 3.1, valueN: 1200 }, 'CAD')
    expect(votes.cheaper).toBeNull()
    expect(votes.lines.join(' ')).toMatch(/community value votes: 4\.2\/5 from 900 votes \(the original: 3\.1\/5\)\. These are opinions on value, not a price/)
    expect(votes.lines.join(' ')).toMatch(/you paid CAD 2\.00\/ml for the original; there is no price on file/)
    expect(compareValue({ mine: mine(null), valueAvg: 4.2, valueN: 5 }, { mine: mine(null), valueAvg: null, valueN: null }, 'CAD').lines).toEqual([])
  })
})

describe('budget and trying first', () => {
  const full = (sizeMl: number, price: number | null, marketPrice: number | null = null) => ({ type: 'full bottle', sizeMl, price, marketPrice })
  it('takes the price per ml from full bottles of 30 ml or more, from what I paid', () => {
    const ref = priceReference([full(100, 100), full(50, 100), full(100, 50), full(75, 150), { type: 'decant', sizeMl: 10, price: 100, marketPrice: null }, full(10, 100)])
    expect(ref).toMatchObject({ n: 4, basis: 'paid' })
    expect(ref.mid).toBeCloseTo(1.5, 1) // 0.5, 1, 2, 2 per ml -> median 1.5
    expect(ref.low).toBeLessThanOrEqual(ref.mid)
    expect(ref.high).toBeGreaterThanOrEqual(ref.mid)
  })
  it('falls back to market prices, and to nothing', () => {
    expect(priceReference([full(100, null, 120)])).toMatchObject({ n: 1, basis: 'market', mid: 1.2 })
    expect(priceReference([full(100, null, null)])).toMatchObject({ n: 0, basis: 'none' })
    expect(costFor(priceReference([]), 100)).toBeNull()
  })
  it('compares a budget with what that size usually costs me, and says plainly when there is nothing to compare', () => {
    const est = costFor(priceReference([full(100, 100), full(100, 150), full(100, 200), full(100, 300)]), 100)!
    expect(est.mid).toBe(175)
    expect(budgetVerdict(400, est).label).toBe('comfortable')
    expect(budgetVerdict(180, est).label).toBe('typical')
    expect(budgetVerdict(150, est).label).toBe('tight')
    expect(budgetVerdict(20, est).label).toBe('below')
    expect(budgetVerdict(100, null).text).toMatch(/not entered prices/)
  })
  it('the trial hint never invents a decant price', () => {
    expect(trialHint(100, null, 'CAD')).toBe('You have no sample or decant of it yet: try it on skin first, for much less than a full bottle.')
    expect(trialHint(100, { sizeMl: 100, low: 90, mid: 120, high: 150 }, 'CAD')).toMatch(/a 100 ml bottle is about CAD 120\./)
  })
})
