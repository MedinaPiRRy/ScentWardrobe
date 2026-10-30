import { describe, expect, it } from 'vitest'
import { similarity, similarOwned } from './similar'

const woody = { accords: [{ name: 'woody', strength: 100 }, { name: 'amber', strength: 60 }], notes: [{ name: 'Cedar' }, { name: 'Vanilla' }] }
const fresh = { accords: [{ name: 'citrus', strength: 100 }, { name: 'aquatic', strength: 70 }], notes: [{ name: 'Lemon' }] }

describe('similarity', () => {
  it('is 1 for the same profile and 0 for nothing in common', () => {
    expect(similarity(woody, woody)).toBeCloseTo(1, 5)
    expect(similarity(woody, fresh)).toBe(0)
  })
  it('ignores case and uses what is available when notes or accords are missing', () => {
    expect(similarity({ accords: [{ name: 'WOODY', strength: 50 }], notes: [] }, { accords: [{ name: 'woody', strength: 90 }], notes: [{ name: 'x' }] })).toBeCloseTo(1, 5)
    expect(similarity({ accords: [], notes: [] }, woody)).toBe(0)
  })
  it('is higher for a closer match', () => {
    const near = { accords: [{ name: 'woody', strength: 90 }, { name: 'amber', strength: 30 }, { name: 'spicy', strength: 40 }], notes: [{ name: 'cedar' }] }
    const far = { accords: [{ name: 'woody', strength: 20 }, { name: 'citrus', strength: 100 }], notes: [{ name: 'lemon' }] }
    expect(similarity(woody, near)).toBeGreaterThan(similarity(woody, far))
  })
})

describe('similarOwned', () => {
  const owned = [
    { id: 1, name: 'Woody Twin', ...woody },
    { id: 2, name: 'Citrus', ...fresh },
    { id: 3, name: 'Half', accords: [{ name: 'woody', strength: 100 }, { name: 'citrus', strength: 100 }], notes: [{ name: 'Cedar' }] }
  ]
  it('lists the closest first, with what they share, and drops weak and identical-id matches', () => {
    const out = similarOwned({ id: 99, ...woody }, owned)
    expect(out.map((h) => h.item.name)).toEqual(['Woody Twin', 'Half'])
    expect(out[0].percent).toBe(100)
    expect(out[0].sharedAccords).toEqual(['woody', 'amber'])
    expect(out[0].sharedNotes).toEqual(['Cedar', 'Vanilla'])
    expect(similarOwned({ id: 1, ...woody }, owned).some((h) => h.item.id === 1)).toBe(false)
  })
  it('respects the limit and returns nothing when nothing is close', () => {
    expect(similarOwned(woody, owned, 1)).toHaveLength(1)
    expect(similarOwned({ accords: [{ name: 'gourmand', strength: 100 }], notes: [] }, owned)).toEqual([])
  })
})
