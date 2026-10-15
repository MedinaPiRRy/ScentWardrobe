import type { WearEntry } from '@shared/types'

const pad = (n: number) => String(n).padStart(2, '0')

export const dateKey = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`
export const dateKeyOf = (d: Date) => dateKey(d.getFullYear(), d.getMonth(), d.getDate())

export interface Cell {
  /** 'YYYY-MM-DD' */
  date: string
  day: number
  inMonth: boolean
}

/** Weeks of a month, padded with days of the neighbouring months. Weeks start on Monday unless told otherwise. */
export function monthGrid(year: number, month0: number, weekStartsOn: 0 | 1 = 1): Cell[][] {
  const first = new Date(year, month0, 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  const daysInMonth = new Date(year, month0 + 1, 0).getDate()
  const weeks = Math.ceil((offset + daysInMonth) / 7)
  const out: Cell[][] = []
  for (let w = 0; w < weeks; w++) {
    const row: Cell[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(year, month0, 1 - offset + w * 7 + i)
      row.push({ date: dateKeyOf(d), day: d.getDate(), inMonth: d.getMonth() === month0 })
    }
    out.push(row)
  }
  return out
}

export function shiftMonth(year: number, month0: number, by: number): { year: number; month0: number } {
  const d = new Date(year, month0 + by, 1)
  return { year: d.getFullYear(), month0: d.getMonth() }
}

export const monthRange = (year: number, month0: number) => ({ from: dateKey(year, month0, 1), to: dateKey(year, month0, new Date(year, month0 + 1, 0).getDate()) })

/** Wears by their local day. */
export function groupByDay(wears: WearEntry[]): Map<string, WearEntry[]> {
  const m = new Map<string, WearEntry[]>()
  for (const w of wears) {
    const k = w.wornAt.slice(0, 10)
    m.set(k, [...(m.get(k) ?? []), w])
  }
  return m
}

/** The distinct fragrances worn on a day, in the order they were worn. A blend contributes each of its members. */
export function fragrancesOfDay(wears: WearEntry[]): number[] {
  const seen: number[] = []
  for (const w of [...wears].sort((a, b) => a.wornAt.localeCompare(b.wornAt))) for (const id of w.memberIds) if (!seen.includes(id)) seen.push(id)
  return seen
}

/** How often each fragrance was worn (a blend counts once for every member), most worn first. */
export function usageCounts(wears: WearEntry[]): { id: number; count: number }[] {
  const c = new Map<number, number>()
  for (const w of wears) for (const id of new Set(w.memberIds)) c.set(id, (c.get(id) ?? 0) + 1)
  return [...c.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id - b.id)
}

/** 0 (nothing) to 4 (a lot), for the year heatmap. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  return count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4
}

export const monthName = (year: number, month0: number, locale?: string) => new Date(year, month0, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
export const weekdayNames = (weekStartsOn: 0 | 1 = 1, locale?: string) =>
  Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + ((i + weekStartsOn) % 7)).toLocaleDateString(locale, { weekday: 'short' }))
