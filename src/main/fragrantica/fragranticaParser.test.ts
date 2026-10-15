import { describe, expect, it } from 'vitest'
import { averageRating, EXTRACT_SCRIPT, isFragranticaUrl, normalizeRaw, parseCount, rgbToHex, type RawFragrantica } from './fragranticaParser'

/** Captured from a live fragrantica.com page (Sauvage) when the parser was written. */
const RAW: RawFragrantica = {
  title: 'Sauvage Dior cologne - a fragrance for men 2015',
  url: 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html?utm=x#reviews',
  challenge: false,
  h1: 'Sauvage Dior',
  genderText: 'for men',
  brand: 'Dior',
  image: 'https://fimgs.net/mdimg/perfume-thumbs/375x500.31861.jpg',
  accords: [
    { name: 'amber', width: 70.8025, color: 'rgb(188, 77, 16)' },
    { name: 'fresh spicy', width: 100, color: 'rgb(131, 201, 40)' },
    { name: 'citrus', width: 69.3936, color: 'rgb(249, 255, 82)' }
  ],
  notes: [
    { name: 'Calabrian bergamot', layer: 'top', icon: 'https://fimgs.net/mdimg/sastojci/t.75.jpg' },
    { name: 'Sichuan Pepper', layer: 'heart', icon: 'https://fimgs.net/mdimg/sastojci/t.213.jpg' },
    { name: 'elemi', layer: 'heart', icon: '' },
    { name: 'Ambroxan', layer: 'base', icon: 'https://fimgs.net/mdimg/sastojci/t.563.jpg' }
  ],
  votes: [
    { label: 'winter', count: '10.3k', width: 67.7 },
    { label: 'spring', count: '15.3k', width: 100 },
    { label: 'summer', count: '14.2k', width: 93.2 },
    { label: 'fall', count: '14.1k', width: 92.5 },
    { label: 'day', count: '15.1k', width: 99 },
    { label: 'night', count: '13.8k', width: 90.4 }
  ],
  longevityVotes: [
    { label: 'very weak', count: '535', width: 3 },
    { label: 'weak', count: '943', width: 5 },
    { label: 'moderate', count: '6.7k', width: 33 },
    { label: 'long lasting', count: '10.6k', width: 51 },
    { label: 'eternal', count: '1.8k', width: 9 }
  ],
  sillageVotes: [
    { label: 'intimate', count: '1.3k', width: 6 },
    { label: 'moderate', count: '8.4k', width: 40 },
    { label: 'strong', count: '9k', width: 43 },
    { label: 'enormous', count: '1.8k', width: 9 }
  ],
  perfumers: ['François Demachy', 'François Demachy']
}

describe('helpers', () => {
  it('parses vote counts', () => {
    expect(parseCount('10.3k')).toBe(10300)
    expect(parseCount('1.2m')).toBe(1200000)
    expect(parseCount('845')).toBe(845)
    expect(parseCount('no vote')).toBeNull()
  })
  it('converts rgb to hex', () => {
    expect(rgbToHex('rgb(131, 201, 40)')).toBe('#83c928')
    expect(rgbToHex('#ABCDEF')).toBe('#abcdef')
    expect(rgbToHex('red')).toBeNull()
  })
  it('accepts only fragrantica perfume pages', () => {
    expect(isFragranticaUrl('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html')).toBe(true)
    expect(isFragranticaUrl('https://www.fragrantica.es/perfume/Dior/Sauvage-31861.html')).toBe(true)
    expect(isFragranticaUrl('http://www.fragrantica.com/perfume/Dior/Sauvage-31861.html')).toBe(false)
    expect(isFragranticaUrl('https://evil.com/fragrantica.com/perfume/x.html')).toBe(false)
    expect(isFragranticaUrl('https://www.fragrantica.com/designers/Dior.html')).toBe(false)
    expect(isFragranticaUrl('not a url')).toBe(false)
  })
  it('averages weighted ratings', () => {
    expect(averageRating([{ label: 'weak', count: '1k', width: null }, { label: 'eternal', count: '1k', width: null }], { weak: 2, eternal: 5 })).toBe(3.5)
    expect(averageRating([], { weak: 2 })).toBeNull()
  })
})

describe('normalizeRaw', () => {
  const { input, warnings } = normalizeRaw(RAW)

  it('extracts the basics', () => {
    expect(input).toMatchObject({ name: 'Sauvage', house: 'Dior', year: 2015, gender: 'for men', perfumers: 'François Demachy' })
    expect(input.sourceUrl).toBe('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html')
    expect(input.imageUrl).toContain('375x500.31861.jpg')
  })
  it('sorts accords by strength and keeps their colours', () => {
    expect(input.accords.map((a) => a.name)).toEqual(['fresh spicy', 'amber', 'citrus'])
    expect(input.accords[0]).toEqual({ name: 'fresh spicy', strength: 100, color: '#83c928' })
    expect(input.accords[1].strength).toBe(71)
  })
  it('keeps note layers, title-cases names and carries icons', () => {
    expect(input.notes.map((n) => `${n.layer}:${n.name}`)).toEqual(['top:Calabrian Bergamot', 'heart:Sichuan Pepper', 'heart:Elemi', 'base:Ambroxan'])
    expect(input.notes[0].iconUrl).toContain('t.75.jpg')
    expect(input.notes[2].iconUrl).toBeNull()
  })
  it('builds community data with ratings', () => {
    expect(input.community).toMatchObject({ winter: 10300, spring: 15300, summer: 14200, fall: 14100, day: 15100, night: 13800 })
    expect(input.community!.longevity).toBeCloseTo(3.59, 1)
    expect(input.community!.sillage).toBeCloseTo(2.55, 1)
    expect(warnings).toEqual([])
  })
  it('warns about missing sections instead of failing', () => {
    const r = normalizeRaw({ ...RAW, accords: [], notes: [], votes: [] })
    expect(r.warnings).toHaveLength(3)
    expect(r.input.community).toBeNull()
  })
})

describe('EXTRACT_SCRIPT', () => {
  it('is a syntactically valid expression', () => {
    expect(() => new Function(`return ${EXTRACT_SCRIPT}`)).not.toThrow()
  })
})
