import { describe, expect, it } from 'vitest'
import type { WearEntry } from '@shared/types'
import { dateKey, fragrancesOfDay, groupByDay, heatLevel, monthGrid, monthRange, shiftMonth, usageCounts, weekdayNames } from './calendar'

const wear = (id: number, wornAt: string, memberIds: number[]): WearEntry => ({
  id, fragranceId: memberIds.length === 1 ? memberIds[0] : null, comboId: memberIds.length > 1 ? 1 : null, title: 't', house: null, bottleId: null, wornAt,
  timeOfDay: null, sprays: 4, activity: null, temperatureC: null, humidity: null, weather: null, projection: null, longevityHours: null, compliments: 0, notes: null,
  mlUsed: 0, backfilled: false, memberIds
})

describe('month grid', () => {
  it('lays out October 2026 starting on Monday', () => {
    const g = monthGrid(2026, 9)
    expect(g).toHaveLength(5)
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(g[0][0]).toEqual({ date: '2026-09-28', day: 28, inMonth: false }) // 1 Oct 2026 is a Thursday
    expect(g[0][3]).toEqual({ date: '2026-10-01', day: 1, inMonth: true })
    expect(g[4][6]).toEqual({ date: '2026-11-01', day: 1, inMonth: false })
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31)
  })
  it('supports Sunday starts, leap years and months that need six weeks', () => {
    expect(monthGrid(2026, 9, 0)[0][0].date).toBe('2026-09-27')
    expect(monthGrid(2024, 1).flat().filter((c) => c.inMonth)).toHaveLength(29)
    expect(monthGrid(2021, 1)).toHaveLength(4) // Feb 2021 starts on a Monday and has 28 days: exactly four weeks
    expect(monthGrid(2025, 5, 1)).toHaveLength(6) // June 2025: Sunday the 1st, 30 days
  })
  it('keeps every date unique and consecutive', () => {
    const days = monthGrid(2026, 11).flat().map((c) => c.date)
    expect(new Set(days).size).toBe(days.length)
    expect(days).toEqual([...days].sort())
  })
})

describe('month navigation', () => {
  it('rolls over years', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 })
    expect(shiftMonth(2026, 5, 18)).toEqual({ year: 2027, month0: 11 })
  })
  it('gives the first and last day', () => {
    expect(monthRange(2026, 1)).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange(2024, 1).to).toBe('2024-02-29')
    expect(dateKey(2026, 0, 5)).toBe('2026-01-05')
  })
  it('names the weekdays from the chosen start', () => {
    expect(weekdayNames(1, 'en-US')[0]).toBe('Mon')
    expect(weekdayNames(0, 'en-US')[0]).toBe('Sun')
    expect(weekdayNames(1, 'en-US')).toHaveLength(7)
  })
})

describe('grouping and counting', () => {
  const wears = [wear(1, '2026-10-01 19:00', [2, 3]), wear(2, '2026-10-01 08:00', [1]), wear(3, '2026-10-02 09:00', [1]), wear(4, '2026-10-01 21:00', [2])]

  it('groups by local day', () => {
    const g = groupByDay(wears)
    expect([...g.keys()].sort()).toEqual(['2026-10-01', '2026-10-02'])
    expect(g.get('2026-10-01')).toHaveLength(3)
  })
  it('lists a day\'s distinct fragrances in the order worn, expanding blends', () => {
    expect(fragrancesOfDay(groupByDay(wears).get('2026-10-01')!)).toEqual([1, 2, 3])
    expect(fragrancesOfDay([])).toEqual([])
  })
  it('counts usage per fragrance, blends counting once per member', () => {
    expect(usageCounts(wears)).toEqual([{ id: 1, count: 2 }, { id: 2, count: 2 }, { id: 3, count: 1 }])
    expect(usageCounts([wear(9, '2026-10-01 08:00', [5, 5])])).toEqual([{ id: 5, count: 1 }])
    expect(usageCounts([])).toEqual([])
  })
  it('maps counts to heat levels', () => {
    expect([0, 1, 2, 3, 4, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 4, 4])
  })
})

describe('daylight saving and boundaries', () => {
  // Weeks must always be seven distinct, consecutive days, even across the clock changes (US 8 Mar and 1 Nov 2026, EU 29 Mar and 25 Oct 2026).
  it.each([[2026, 2], [2026, 3], [2026, 9], [2026, 10], [2026, 11], [2027, 0]])('has no repeated or skipped day in %i-%i', (y, m) => {
    const days = monthGrid(y, m).flat()
    const keys = days.map((c) => c.date)
    expect(new Set(keys).size).toBe(keys.length)
    for (let i = 1; i < keys.length; i++) {
      const a = new Date(`${keys[i - 1]}T12:00:00Z`).getTime()
      const b = new Date(`${keys[i]}T12:00:00Z`).getTime()
      expect(b - a).toBe(86_400_000)
    }
    expect(days.filter((c) => c.inMonth)).toHaveLength(new Date(y, m + 1, 0).getDate())
  })
  it('starts every week on Monday', () => {
    for (const w of monthGrid(2026, 9)) expect(new Date(`${w[0].date}T12:00:00`).getDay()).toBe(1)
  })
  it('rolls over the year in both directions', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month0: 0 })
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month0: 11 })
    expect(shiftMonth(2026, 5, 24)).toEqual({ year: 2028, month0: 5 })
  })
  it('handles February in a leap year', () => {
    expect(monthRange(2028, 1)).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(monthRange(2027, 1)).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })
})
