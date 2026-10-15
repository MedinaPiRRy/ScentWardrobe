import { describe, expect, it } from 'vitest'
import { cleanName, mapRow, parseAccords, parseNotes, prettify, suggestMapping } from './mapping'
import { detectDelimiter, parseCsvRows } from './sources'

describe('csv parsing', () => {
  it('handles quotes, escaped quotes, newlines and CRLF', () => {
    const rows = [...parseCsvRows('a,b,c\r\n1,"x, y","say ""hi"""\r\n2,"line1\nline2",z\r\n', ',')]
    expect(rows).toEqual([['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'line1\nline2', 'z']])
  })
  it('detects semicolon and tab delimiters', () => {
    expect(detectDelimiter('url;Perfume;Brand')).toBe(';')
    expect(detectDelimiter('a\tb\tc')).toBe('\t')
    expect(detectDelimiter('"a;b",c,d')).toBe(',')
  })
})

describe('suggestMapping', () => {
  it('maps the typical Kaggle Fragrantica columns', () => {
    const cols = ['url', 'Perfume', 'Brand', 'Country', 'Gender', 'Rating Value', 'Year', 'Top', 'Middle', 'Base', 'Perfumer1', 'Perfumer2', 'mainaccord1', 'mainaccord2', 'mainaccord3']
    const m = suggestMapping(cols)
    expect(m.name).toEqual(['Perfume'])
    expect(m.house).toEqual(['Brand'])
    expect(m.sourceUrl).toEqual(['url'])
    expect(m.year).toEqual(['Year'])
    expect(m.notesTop).toEqual(['Top'])
    expect(m.notesHeart).toEqual(['Middle'])
    expect(m.notesBase).toEqual(['Base'])
    expect(m.perfumers).toEqual(['Perfumer1', 'Perfumer2'])
    expect(m.accords).toEqual(['mainaccord1', 'mainaccord2', 'mainaccord3'])
  })
})

describe('name cleaning', () => {
  it('prettifies slugs', () => {
    expect(prettify('tihota-indult')).toBe('Tihota Indult')
    expect(prettify('Black Opium')).toBe('Black Opium')
  })
  it('strips gender, house and concentration', () => {
    expect(cleanName('Sauvage Eau de Parfum Dior for men', 'Dior')).toEqual({ name: 'Sauvage', concentration: 'EDP' })
    expect(cleanName('tihota-indult', 'Indult')).toEqual({ name: 'Tihota', concentration: null })
    expect(cleanName('Parfum', 'X')).toEqual({ name: 'Parfum', concentration: null }) // nothing left, keep it
  })
})

describe('notes and accords', () => {
  it('splits and title-cases notes', () => {
    expect(parseNotes('bergamot, black pepper,  Vetiver ,bergamot')).toEqual(['Bergamot', 'Black Pepper', 'Vetiver'])
    expect(parseNotes('["Rose","Oud"]')).toEqual(['Rose', 'Oud'])
    expect(parseNotes('')).toEqual([])
  })
  it('gives ordered accord lists descending strengths', () => {
    expect(parseAccords(['woody', 'citrus', '', 'amber'])).toEqual([
      { name: 'woody', strength: 100 },
      { name: 'citrus', strength: 86 },
      { name: 'amber', strength: 72 }
    ])
  })
  it('reads JSON accords with strengths', () => {
    expect(parseAccords(['{"woody": 100, "citrus": 55.4}'])).toEqual([
      { name: 'woody', strength: 100 },
      { name: 'citrus', strength: 55 }
    ])
    expect(parseAccords(['[{"name":"vanilla","strength":90}]'])).toEqual([{ name: 'vanilla', strength: 90 }])
  })
  it('scales 0-1 strengths to 0-100', () => {
    expect(parseAccords(['{"a": 1, "b": 0.5}'])).toEqual([{ name: 'a', strength: 100 }, { name: 'b', strength: 50 }])
  })
})

describe('mapRow', () => {
  const mapping = suggestMapping(['Perfume', 'Brand', 'Gender', 'Year', 'Top', 'Middle', 'Base', 'Perfumer1', 'Perfumer2', 'mainaccord1', 'mainaccord2', 'url'])
  it('maps a full row', () => {
    const e = mapRow(
      { Perfume: 'sauvage-dior', Brand: 'dior', Gender: 'for men', Year: '2015.0', Top: 'Bergamot, Pepper', Middle: 'Lavender', Base: 'Ambroxan', Perfumer1: 'francois-demachy', Perfumer2: 'Unknown', mainaccord1: 'fresh spicy', mainaccord2: 'amber', url: 'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html' },
      mapping
    )!
    expect(e.name).toBe('Sauvage')
    expect(e.house).toBe('Dior')
    expect(e.gender).toBe('for men')
    expect(e.year).toBe(2015)
    expect(e.perfumers).toBe('Francois Demachy')
    expect(e.notes).toEqual([
      { name: 'Bergamot', layer: 'top' }, { name: 'Pepper', layer: 'top' }, { name: 'Lavender', layer: 'heart' }, { name: 'Ambroxan', layer: 'base' }
    ])
    expect(e.accords.map((a) => a.name)).toEqual(['fresh spicy', 'amber'])
    expect(e.sourceUrl).toContain('fragrantica')
  })
  it('skips rows without a name or house', () => {
    expect(mapRow({ Perfume: '', Brand: 'x' }, mapping)).toBeNull()
    expect(mapRow({ Perfume: 'x', Brand: '' }, mapping)).toBeNull()
  })
})
