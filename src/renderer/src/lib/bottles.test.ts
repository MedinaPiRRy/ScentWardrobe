import { describe, expect, it } from 'vitest'
import type { Bottle } from '@shared/types'
import { bottleStats, formatMl } from './bottles'

const bottle = (o: Partial<Bottle>): Bottle => ({
  id: 1, fragranceId: 1, type: 'full bottle', sizeMl: 100, remainingMl: 50, mlPerSpray: 0.1, purchaseDate: null,
  price: null, boughtAt: null, batchCode: null, openedDate: null, status: 'active', marketPrice: null, marketCheckedOn: null, marketSource: null, ...o
})

describe('bottleStats', () => {
  it('estimates wears left from average sprays', () => {
    expect(bottleStats(bottle({ remainingMl: 50 }), 5)).toEqual({ percent: 50, low: false, wearsLeft: 100 })
  })
  it('falls back to 4 sprays when nothing is logged', () => {
    expect(bottleStats(bottle({ remainingMl: 40 }), null).wearsLeft).toBe(100)
  })
  it('flags low bottles below the threshold, not at it', () => {
    expect(bottleStats(bottle({ remainingMl: 14 }), 4).low).toBe(true)
    expect(bottleStats(bottle({ remainingMl: 15 }), 4).low).toBe(false)
    expect(bottleStats(bottle({ remainingMl: 10 }), 4, 0.05).low).toBe(false)
  })
  it('ignores inactive bottles', () => {
    expect(bottleStats(bottle({ status: 'empty', remainingMl: 0 }), 4)).toEqual({ percent: 0, low: false, wearsLeft: null })
  })
})

describe('formatMl', () => {
  it('trims noise', () => {
    expect(formatMl(10)).toBe('10 ml')
    expect(formatMl(7.25)).toBe('7.3 ml')
  })
})
