import { describe, expect, it } from 'vitest'
import type { FragranceSummary } from '@shared/types'
import { arrayMove, bottleHeightPx, filterFragrances, fillLevel, isRackItem, shelfBottle, sortFragrances } from './shelf'

const make = (o: Partial<FragranceSummary>): FragranceSummary => ({
  id: 1, name: 'A', house: 'H', year: null, concentration: null, imagePath: null, wardrobe: 'collection',
  shelfPosition: 0, rating: null, topAccords: [], activeBottleCount: 0, bottles: [], desiredSizeMl: null,
  wearCount: 0, lastWornAt: null, seasons: [], accordNames: [], noteNames: [], isSample: false, dislikeNote: null, hadYears: null, hadMemory: null, hadReason: null, importedPending: false, defaultSprays: null, isForeign: false, ...o
})

describe('bottle sizing', () => {
  it('grows with size and stays within bounds', () => {
    expect(bottleHeightPx(2)).toBe(84)
    expect(bottleHeightPx(200)).toBe(176)
    expect(bottleHeightPx(10)).toBeLessThan(bottleHeightPx(100))
    expect(bottleHeightPx(1000)).toBe(176)
  })
  it('computes fill level and clamps', () => {
    expect(fillLevel({ type: 'full bottle', sizeMl: 100, remainingMl: 25 })).toBe(0.25)
    expect(fillLevel({ type: 'full bottle', sizeMl: 100, remainingMl: 150 })).toBe(1)
  })
})

describe('shelf placement', () => {
  const full = { type: 'full bottle' as const, sizeMl: 100, remainingMl: 100 }
  const decant = { type: 'decant' as const, sizeMl: 10, remainingMl: 5 }
  it('puts decant-only items on the rack, not those that also have a full bottle', () => {
    expect(isRackItem(make({ bottles: [decant] }))).toBe(true)
    expect(isRackItem(make({ bottles: [full, decant] }))).toBe(false)
    expect(isRackItem(make({ bottles: [] }))).toBe(false)
  })
  it('draws the largest bottle, or a nominal one without bottles', () => {
    expect(shelfBottle(make({ bottles: [full, decant] })).sizeMl).toBe(100)
    expect(shelfBottle(make({ desiredSizeMl: 50 })).sizeMl).toBe(50)
  })
})

describe('filter and sort', () => {
  const a = make({ id: 1, name: 'Sauvage', house: 'Dior', accordNames: ['woody'], noteNames: ['Vetiver'], seasons: ['summer'], wearCount: 3, lastWornAt: '2026-01-02', rating: 8, shelfPosition: 2 })
  const b = make({ id: 2, name: 'Aventus', house: 'Creed', accordNames: ['fruity'], noteNames: ['Birch'], seasons: ['winter'], wearCount: 9, lastWornAt: '2026-03-01', rating: 9, shelfPosition: 1 })
  const c = make({ id: 3, name: 'Zed', house: 'Acme', shelfPosition: 0 })
  const all = [a, b, c]

  it('searches name, house, accord and note', () => {
    expect(filterFragrances(all, 'dior', 'all')).toEqual([a])
    expect(filterFragrances(all, 'fruity', 'all')).toEqual([b])
    expect(filterFragrances(all, 'vetiver', 'all')).toEqual([a])
    expect(filterFragrances(all, 'creed birch', 'all')).toEqual([b])
    expect(filterFragrances(all, '', 'all')).toHaveLength(3)
  })
  it('filters by season', () => {
    expect(filterFragrances(all, '', 'winter')).toEqual([b])
  })
  it('sorts by each key', () => {
    const ids = (k: Parameters<typeof sortFragrances>[1]) => sortFragrances(all, k).map((f) => f.id)
    expect(ids('shelf')).toEqual([3, 2, 1])
    expect(ids('house')).toEqual([3, 2, 1])
    expect(ids('name')).toEqual([2, 1, 3])
    expect(ids('rating')).toEqual([2, 1, 3])
    expect(ids('mostWorn')).toEqual([2, 1, 3])
    expect(ids('lastWorn')).toEqual([2, 1, 3])
    expect(ids('season')).toEqual([2, 1, 3])
  })
})

describe('arrayMove', () => {
  it('moves without mutating', () => {
    const src = [1, 2, 3, 4]
    expect(arrayMove(src, 0, 2)).toEqual([2, 3, 1, 4])
    expect(src).toEqual([1, 2, 3, 4])
  })
})
