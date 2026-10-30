import { describe, expect, it } from 'vitest'
import { describeRatingWeight, effectiveRatingWeight, overdueFactor, ratingSuggestions, ratingWeight, type RatingFacts } from './rating'

describe('rating weight curve', () => {
  it('holds 1-3 back, keeps 4-6 normal and favours 7-10', () => {
    expect([1, 2, 3].every((r) => ratingWeight(r) < 0.7)).toBe(true)
    expect(ratingWeight(5)).toBe(1)
    expect([4, 5, 6].every((r) => ratingWeight(r) >= 0.9 && ratingWeight(r) <= 1.05)).toBe(true)
    expect([7, 8, 9, 10].every((r) => ratingWeight(r) > 1.1)).toBe(true)
    expect(ratingWeight(10)).toBe(1.25)
  })
  it('never decreases as the rating goes up, and never drops below the floor', () => {
    for (let r = 2; r <= 10; r++) expect(ratingWeight(r)).toBeGreaterThanOrEqual(ratingWeight(r - 1))
    expect(Math.min(...Array.from({ length: 10 }, (_, i) => ratingWeight(i + 1)))).toBeGreaterThanOrEqual(0.5)
  })
  it('treats unrated and nonsense as neutral', () => {
    for (const r of [null, undefined, Number.NaN]) expect(ratingWeight(r as number | null)).toBe(1)
    expect(ratingWeight(0)).toBe(ratingWeight(1))
    expect(ratingWeight(99)).toBe(ratingWeight(10))
    expect(ratingWeight(6.4)).toBe(ratingWeight(6))
  })
})

describe('nothing is forgotten', () => {
  it('a low-rated bottle regains normal weight when it has not been worn for a long time', () => {
    expect(effectiveRatingWeight(2, 0)).toBe(0.6)
    expect(effectiveRatingWeight(2, 21)).toBe(0.6)
    expect(effectiveRatingWeight(2, 55)).toBeGreaterThan(0.6)
    expect(effectiveRatingWeight(2, 55)).toBeLessThan(1)
    expect(effectiveRatingWeight(2, 90)).toBe(1)
    expect(effectiveRatingWeight(1, 400)).toBe(1)
  })
  it('only the penalty fades: a favourite keeps its boost', () => {
    expect(effectiveRatingWeight(9, 0)).toBe(1.22)
    expect(effectiveRatingWeight(9, 200)).toBe(1.22)
  })
  it('a never-worn low-rated bottle is halfway back', () => {
    expect(overdueFactor(null)).toBe(0.5)
    expect(effectiveRatingWeight(1, null)).toBeCloseTo(0.775, 3)
  })
  it('overdue grows steadily between 21 and 90 days', () => {
    expect(overdueFactor(0)).toBe(0)
    expect(overdueFactor(55.5)).toBeCloseTo(0.5, 2)
    expect(overdueFactor(500)).toBe(1)
  })
})

describe('words for the breakdown', () => {
  it('names unrated, neutral, favoured and held back', () => {
    expect(describeRatingWeight(null, 1)).toMatch(/not rated yet/i)
    expect(describeRatingWeight(5, 1)).toMatch(/normal/)
    expect(describeRatingWeight(9, 1.22)).toMatch(/favoured/)
    expect(describeRatingWeight(2, 0.6)).toMatch(/held back/)
  })
})

describe('re-rating suggestions', () => {
  const now = new Date(2026, 9, 30)
  const f = (o: Partial<RatingFacts>): RatingFacts => ({ id: 1, name: 'A', house: 'H', rating: 6, lastRatedAt: '2026-09-01', wearsLast90Days: 2, wearsTotal: 10, daysSinceWorn: 5, daysOwned: 400, ...o })
  it('suggests nothing for a recent, consistent rating', () => expect(ratingSuggestions([f({})], now)).toEqual([]))
  it('notices a fragrance worn a lot that was never rated', () => {
    expect(ratingSuggestions([f({ rating: null, lastRatedAt: null, wearsTotal: 12 })], now)[0].reason).toMatch(/never rated/)
  })
  it('notices a low rating that does not match how often it is worn', () => {
    expect(ratingSuggestions([f({ rating: 3, wearsLast90Days: 9 })], now)[0].reason).toMatch(/rated it 3\/10 but wore it 9 times/)
  })
  it('notices a high rating that has been left on the shelf', () => {
    expect(ratingSuggestions([f({ rating: 9, daysSinceWorn: 200 })], now)[0].reason).toMatch(/have not worn it for 200 days/)
    expect(ratingSuggestions([f({ rating: 9, daysSinceWorn: null })], now)[0].reason).toMatch(/never worn/)
  })
  it('notices a rating that is more than a year old', () => {
    expect(ratingSuggestions([f({ lastRatedAt: '2025-06-01' })], now)[0].reason).toMatch(/months ago/)
  })
  it('leaves new additions alone, ranks the most telling first and limits the list', () => {
    const many = [f({ id: 1, name: 'Old', lastRatedAt: '2024-01-01' }), f({ id: 2, name: 'Mismatch', rating: 2, wearsLast90Days: 12 }), f({ id: 3, name: 'Fresh', rating: 2, wearsLast90Days: 12, daysOwned: 5 }), f({ id: 4, name: 'Unrated', rating: null, lastRatedAt: null, wearsTotal: 8 }), f({ id: 5, name: 'Fifth', lastRatedAt: '2024-02-01' })]
    const s = ratingSuggestions(many, now, 3)
    expect(s).toHaveLength(3)
    expect(s[0].name).toBe('Mismatch')
    expect(s.some((x) => x.name === 'Fresh')).toBe(false)
  })
})
