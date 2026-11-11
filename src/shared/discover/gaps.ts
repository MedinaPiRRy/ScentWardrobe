import { PROFILES, profileFor } from '../recommend/activities'
import type { Brief } from './brief'
import { EMPTY_BRIEF } from './brief'
import { FAMILIES, SEASONS, norm, plural, type Season } from './vocab'

/** One fragrance in My Collection as the coverage analysis sees it (full bottles and vial-only fragrances alike). */
export interface GapItem {
  id: number
  name: string
  accords: { name: string; strength: number }[]
  /** Community season votes and day/night votes (any scale). */
  seasons: { winter: number; spring: number; summer: number; fall: number } | null
  daynight: { day: number; night: number } | null
  /** 1-4 (mine once logged, else the community's) and the community's 1-5 longevity. */
  projection: number | null
  longevity: number | null
  /** What my wear log says about it. */
  wears: { total: number; bySeason: Record<Season, number>; day: number; night: number; activities: Record<string, number> }
}

export type Dimension = 'season' | 'time' | 'occasion' | 'family' | 'performance'
export type CoverageStatus = 'covered' | 'thin' | 'missing'

export interface CoverageCell {
  dimension: Dimension
  key: string
  label: string
  /** How many of my fragrances suit it, and the first few names. */
  suits: number
  names: string[]
  /** What my wear log says: wears in this cell and by how many different fragrances. */
  worn: number
  wornBy: number
  status: CoverageStatus
  /** One plain sentence. */
  text: string
  /** A brief that looks for fragrances that would fill it. */
  brief: Partial<Brief>
}

export interface CoverageMap {
  cells: CoverageCell[]
  /** The gaps first, in plain words. */
  summary: string[]
  /** How many fragrances were analysed, and how many wears the log holds. */
  items: number
  wears: number
}

export const OCCASIONS: { key: string; label: string; activity: string }[] = [
  { key: 'office', label: 'Office and work', activity: 'office' },
  { key: 'casual', label: 'Casual days and weekends', activity: 'casual' },
  { key: 'gym', label: 'Sport and gym', activity: 'gym' },
  { key: 'date', label: 'Dates', activity: 'date night' },
  { key: 'nightOut', label: 'Nights out', activity: 'night out' },
  { key: 'formal', label: 'Formal events', activity: 'formal' },
  { key: 'home', label: 'Staying in', activity: 'home' },
  { key: 'travel', label: 'Travel', activity: 'travel' }
]

export const FAMILY_CELLS: { key: keyof typeof FAMILIES; label: string; core: string }[] = [
  { key: 'fresh', label: 'Fresh and citrus', core: 'citrus' },
  { key: 'woody', label: 'Woody and earthy', core: 'woody' },
  { key: 'floral', label: 'Floral and powdery', core: 'floral' },
  { key: 'sweet', label: 'Sweet and vanilla', core: 'vanilla' },
  { key: 'warm', label: 'Warm, spicy and amber', core: 'amber' }
]

const SEASON_LABEL: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' }
const statusOf = (n: number): CoverageStatus => (n === 0 ? 'missing' : n === 1 ? 'thin' : 'covered')

/** Accord strength of a family: how much of the fragrance is in it, 0-1. */
function familyShare(it: GapItem, family: keyof typeof FAMILIES): number {
  let total = 0
  let part = 0
  for (const a of it.accords) {
    total += a.strength
    if (FAMILIES[family].includes(norm(a.name))) part += a.strength
  }
  return total > 0 ? part / total : 0
}

/** The accord-based occasion fit the Recommendations page uses (0-1). */
function occasionFit(it: GapItem, key: string): number {
  const p = PROFILES[key] ?? profileFor(key)
  let raw = 0
  let total = 0
  for (const a of it.accords) {
    const n = norm(a.name)
    raw += a.strength * ((p.likes[n] ?? 0) - (p.dislikes[n] ?? 0))
    total += a.strength
  }
  return total > 0 ? Math.max(0, Math.min(1, 0.5 + (raw / total) * 0.9)) : 0
}

const share = (v: number, total: number) => (total > 0 ? v / total : 0)

/**
 * Where My Collection is thin, from what I own (community votes and accords) and what I actually wear (the wear log).
 * Pure: the caller supplies the items. A fragrance suits a season when the community says so or when I wore it then at
 * least twice, so a bottle that does more than its votes say still counts.
 */
export function analyzeCoverage(items: GapItem[]): CoverageMap {
  const cells: CoverageCell[] = []
  const totalWears = items.reduce((s, i) => s + i.wears.total, 0)
  const add = (c: Omit<CoverageCell, 'status' | 'names'> & { who: string[] }): void => {
    const { who, ...rest } = c
    cells.push({ ...rest, names: who.slice(0, 3), status: statusOf(c.suits) })
  }

  for (const s of SEASONS) {
    const who = items.filter((i) => {
      const sv = i.seasons
      const t = sv ? sv.winter + sv.spring + sv.summer + sv.fall : 0
      return (t >= 30 && share(sv![s], t) >= 0.25) || i.wears.bySeason[s] >= 2
    })
    const wornBy = items.filter((i) => i.wears.bySeason[s] > 0)
    const worn = items.reduce((n, i) => n + i.wears.bySeason[s], 0)
    const lone = wornBy.length === 1 && worn >= 6
    add({
      dimension: 'season', key: s, label: SEASON_LABEL[s], suits: who.length, who: who.map((i) => i.name), worn, wornBy: wornBy.length,
      text: who.length === 0 ? `Nothing in your collection is meant for ${s}.` : who.length === 1 ? `Only ${who[0].name} suits ${s}${lone ? `, and it accounts for all ${worn} of your ${s} wears` : ''}.` : `${plural(who.length, 'fragrance')} suit ${s}.`,
      brief: { season: s }
    })
  }

  for (const t of ['day', 'night'] as const) {
    const who = items.filter((i) => {
      const d = i.daynight
      const tot = d ? d.day + d.night : 0
      const dayShare = tot >= 30 ? d!.day / tot : null
      const byVotes = dayShare != null && (t === 'day' ? dayShare >= 0.45 : dayShare <= 0.55)
      const byWears = (t === 'day' ? i.wears.day : i.wears.night) >= 2
      return byVotes || byWears
    })
    const wornBy = items.filter((i) => (t === 'day' ? i.wears.day : i.wears.night) > 0)
    const worn = items.reduce((n, i) => n + (t === 'day' ? i.wears.day : i.wears.night), 0)
    add({
      dimension: 'time', key: t, label: t === 'day' ? 'Daytime' : 'Evenings and nights', suits: who.length, who: who.map((i) => i.name), worn, wornBy: wornBy.length,
      text: who.length === 0 ? `Nothing is known to suit ${t === 'day' ? 'the day' : 'the night'}.` : `${plural(who.length, 'fragrance')} suit ${t === 'day' ? 'daytime' : 'evenings and nights'}.`,
      brief: { timeOfDay: t }
    })
  }

  for (const o of OCCASIONS) {
    const who = items.filter((i) => occasionFit(i, o.key) >= 0.65)
    const wornInOccasion = items.map((i) => Object.entries(i.wears.activities).filter(([a]) => profileFor(a).key === o.key).reduce((n, [, c]) => n + c, 0))
    const worn = wornInOccasion.reduce((n, c) => n + c, 0)
    add({
      dimension: 'occasion', key: o.key, label: o.label, suits: who.length, who: who.map((i) => i.name), worn, wornBy: wornInOccasion.filter((c) => c > 0).length,
      text: who.length === 0 ? `Nothing in your collection matches what is usually liked for ${o.label.toLowerCase()}.` : `${plural(who.length, 'fragrance')} fit${who.length === 1 ? 's' : ''} ${o.label.toLowerCase()}.`,
      brief: { activity: o.activity }
    })
  }

  for (const f of FAMILY_CELLS) {
    const who = items.filter((i) => familyShare(i, f.key) >= 0.4)
    add({
      dimension: 'family', key: f.key, label: f.label, suits: who.length, who: who.map((i) => i.name), worn: 0, wornBy: 0,
      text: who.length === 0 ? `You own nothing in the ${f.label.toLowerCase()} family.` : `${plural(who.length, 'fragrance')} lean ${f.label.toLowerCase()}.`,
      brief: { wantAccords: [f.core] }
    })
  }

  const proj: { key: 'skin' | 'moderate' | 'room'; label: string; test: (p: number) => boolean }[] = [
    { key: 'skin', label: 'Stays close to the skin', test: (p) => p <= 2.1 },
    { key: 'moderate', label: 'Moderate projection', test: (p) => p > 2.1 && p < 2.9 },
    { key: 'room', label: 'Fills a room', test: (p) => p >= 2.9 }
  ]
  for (const p of proj) {
    const who = items.filter((i) => i.projection != null && p.test(i.projection))
    add({
      dimension: 'performance', key: p.key, label: p.label, suits: who.length, who: who.map((i) => i.name), worn: 0, wornBy: 0,
      text: who.length === 0 ? `Nothing you own is known to project this way (${p.label.toLowerCase()}).` : `${plural(who.length, 'fragrance')}: ${p.label.toLowerCase()}.`,
      brief: { projection: p.key }
    })
  }
  const longWho = items.filter((i) => i.longevity != null && i.longevity >= 3.6)
  add({
    dimension: 'performance', key: 'long', label: 'Lasts all day', suits: longWho.length, who: longWho.map((i) => i.name), worn: 0, wornBy: 0,
    text: longWho.length === 0 ? 'Nothing you own is known to last all day.' : `${plural(longWho.length, 'fragrance')} last all day.`,
    brief: { longevity: 'long' }
  })

  const gaps = cells.filter((c) => c.status !== 'covered').sort((a, b) => Number(a.status === 'thin') - Number(b.status === 'thin'))
  const summary =
    items.length === 0
      ? ['There is nothing in My Collection to analyse yet.']
      : gaps.length === 0
        ? ['No gaps: every season, time of day, occasion, family and performance style has at least two fragrances that suit it.']
        : gaps.slice(0, 6).map((g) => g.text)
  return { cells, summary, items: items.length, wears: totalWears }
}

/** The brief that looks for fillers for one cell, on top of an empty brief. */
export const briefForCell = (c: Pick<CoverageCell, 'brief'>): Brief => ({ ...EMPTY_BRIEF, ...c.brief })
