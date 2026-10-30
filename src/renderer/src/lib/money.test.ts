import { describe, expect, it } from 'vitest'
import { compareBottle, formatMoney, isCurrencyCode, parsePrice } from './money'

describe('compareBottle', () => {
  it('reports savings when I paid less than the market price', () => {
    expect(compareBottle({ price: 80, marketPrice: 100, sizeMl: 100 })).toEqual({ paid: 80, market: 100, saved: 20, savedPercent: 20, paidPerMl: 0.8, marketPerMl: 1 })
  })
  it('reports overpaying as negative', () => {
    const c = compareBottle({ price: 120, marketPrice: 100, sizeMl: 50 })
    expect(c.saved).toBe(-20)
    expect(c.savedPercent).toBe(-20)
  })
  it('needs both prices to compare, but still gives per-ml for either', () => {
    const c = compareBottle({ price: 60, marketPrice: null, sizeMl: 30 })
    expect(c.saved).toBeNull()
    expect(c.savedPercent).toBeNull()
    expect(c.paidPerMl).toBe(2)
    expect(c.marketPerMl).toBeNull()
  })
  it('does not divide by a zero market price', () => {
    expect(compareBottle({ price: 10, marketPrice: 0, sizeMl: 10 }).savedPercent).toBeNull()
  })
})

describe('formatMoney', () => {
  it('uses the chosen currency', () => {
    expect(formatMoney(12.5, 'EUR')).toMatch(/€|EUR/)
    expect(formatMoney(12.5, 'USD')).toMatch(/\$|USD/)
  })
  it('does not throw for an unknown code', () => {
    expect(() => formatMoney(1, 'XXXX')).not.toThrow()
  })
  it('validates codes', () => {
    expect(isCurrencyCode('EUR')).toBe(true)
    expect(isCurrencyCode('eur')).toBe(false)
  })
})

describe('rounding edge cases', () => {
  it('never shows a negative zero', () => {
    expect(formatMoney(-0, 'USD')).not.toMatch(/-/)
    expect(formatMoney(-0.001, 'USD')).not.toMatch(/-/)
    expect(Object.is(compareBottle({ price: 100.001, marketPrice: 100, sizeMl: 50 }).saved, -0)).toBe(false)
    expect(Object.is(compareBottle({ price: 100.001, marketPrice: 100, sizeMl: 50 }).savedPercent, -0)).toBe(false)
  })
  it('handles zero prices and zero sizes', () => {
    const c = compareBottle({ price: 0, marketPrice: 50, sizeMl: 0 })
    expect(c.paidPerMl).toBeNull()
    expect(c.saved).toBe(50)
    expect(compareBottle({ price: 0, marketPrice: 0, sizeMl: 10 })).toMatchObject({ saved: 0, savedPercent: null, paidPerMl: 0 })
  })
})

describe('parsePrice', () => {
  it('reads blank, decimals and decimal commas', () => {
    expect(parsePrice('')).toEqual({ value: null, error: null })
    expect(parsePrice('  ')).toEqual({ value: null, error: null })
    expect(parsePrice('89.9')).toEqual({ value: 89.9, error: null })
    expect(parsePrice('89,90')).toEqual({ value: 89.9, error: null })
    expect(parsePrice('0')).toEqual({ value: 0, error: null })
    expect(parsePrice('10.005').value).toBe(10.01)
  })
  it('rejects anything that is not a plain positive number', () => {
    for (const t of ['abc', '-5', '1e3', '12 euro', '$5', '1.2.3', '--']) expect(parsePrice(t).error, t).toBeTruthy()
  })
})
