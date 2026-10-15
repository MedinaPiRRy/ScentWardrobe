import { describe, expect, it } from 'vitest'
import { hoursToLongevityRating, projectionToSillageRating } from './performance'

describe('performance mapping', () => {
  it('maps hours onto the 1-5 longevity scale', () => {
    expect(hoursToLongevityRating(0)).toBe(1)
    expect(hoursToLongevityRating(5)).toBe(3)
    expect(hoursToLongevityRating(6.5)).toBeCloseTo(3.5)
    expect(hoursToLongevityRating(30)).toBe(5)
  })
  it('maps 1-5 projection onto the 1-4 sillage scale', () => {
    expect(projectionToSillageRating(1)).toBe(1)
    expect(projectionToSillageRating(5)).toBe(4)
    expect(projectionToSillageRating(3)).toBeCloseTo(2.5)
  })
})
