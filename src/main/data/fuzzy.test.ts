import { describe, expect, it } from 'vitest'
import { editDistance, normalize, prepare, score, tokens } from './fuzzy'

const s = (q: string, name: string, house = '') => score(tokens(q), prepare(name, house))

describe('normalize', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalize("Acqua di Giò — L'Eau")).toBe('acqua di gio l eau')
    expect(normalize('Dolce&Gabbana')).toBe('dolce and gabbana')
  })
})

describe('editDistance', () => {
  it('computes small distances and bails out early', () => {
    expect(editDistance('sauvage', 'sauvage', 2)).toBe(0)
    expect(editDistance('sauvage', 'sauvaje', 2)).toBe(1)
    expect(editDistance('abc', 'xyzxyz', 2)).toBeGreaterThan(2)
  })
})

describe('score', () => {
  it('matches exact, prefix and substring tokens', () => {
    expect(s('sauvage', 'Sauvage', 'Dior')).toBeGreaterThan(1)
    expect(s('sauv', 'Sauvage', 'Dior')).toBeGreaterThan(0.8)
    expect(s('opium', 'Black Opium', 'Yves Saint Laurent')).toBeGreaterThan(0.9)
  })
  it('matches across name and house', () => {
    expect(s('dior sauvage', 'Sauvage', 'Dior')).toBeGreaterThan(0.9)
  })
  it('tolerates typos in longer words', () => {
    expect(s('sauvaje', 'Sauvage', 'Dior')).toBeGreaterThan(0)
    expect(s('baccarat rouge', 'Baccarat Rouge 540', 'Maison Francis Kurkdjian')).toBeGreaterThan(0.8)
    expect(s('bacarat', 'Baccarat Rouge 540', 'MFK')).toBeGreaterThan(0)
  })
  it('requires every token to match', () => {
    expect(s('sauvage chanel', 'Sauvage', 'Dior')).toBe(0)
    expect(s('xyz', 'Sauvage', 'Dior')).toBe(0)
  })
  it('does not fuzzy-match very short words', () => {
    expect(s('abc', 'Aventus', 'Creed')).toBe(0)
  })
  it('ranks an exact name above a longer name', () => {
    expect(s('aventus', 'Aventus', 'Creed')).toBeGreaterThan(s('aventus', 'Aventus For Her', 'Creed'))
  })
})
