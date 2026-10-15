import type { FragranceSummary, Season, ShelfBottle, WardrobeKind } from '@shared/types'

export type SortKey = 'shelf' | 'house' | 'name' | 'rating' | 'mostWorn' | 'lastWorn' | 'season'

export const SORT_LABELS: Record<SortKey, string> = {
  shelf: 'Shelf order',
  house: 'House',
  name: 'Name',
  rating: 'My rating',
  mostWorn: 'Most worn',
  lastWorn: 'Last worn',
  season: 'Season'
}

export const SEASONS: Season[] = ['winter', 'spring', 'summer', 'fall']

const DEFAULT_SIZE_ML = 75

/** The bottle drawn on the shelf: the largest active one, else a nominal one for wishlist / to-try items. */
export function shelfBottle(f: FragranceSummary): ShelfBottle {
  if (f.bottles.length) return f.bottles[0]
  return { type: 'full bottle', sizeMl: f.desiredSizeMl ?? DEFAULT_SIZE_ML, remainingMl: f.desiredSizeMl ?? DEFAULT_SIZE_ML }
}

/** 2 ml sample -> short, 200 ml -> tall, on a log scale so mid sizes stay distinguishable. */
export function bottleHeightPx(sizeMl: number, min = 84, max = 176): number {
  const t = (Math.log(Math.min(Math.max(sizeMl, 2), 200)) - Math.log(2)) / (Math.log(200) - Math.log(2))
  return Math.round(min + (max - min) * t)
}

export function fillLevel(b: ShelfBottle): number {
  return b.sizeMl > 0 ? Math.min(Math.max(b.remainingMl / b.sizeMl, 0), 1) : 1
}

/** Decants and samples (with no bigger bottle) live on the decant rack. */
export function isRackItem(f: FragranceSummary): boolean {
  return f.bottles.length > 0 && f.bottles.every((b) => b.type === 'decant' || b.type === 'sample')
}

export function matchesQuery(f: FragranceSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [f.name, f.house, ...f.accordNames, ...f.noteNames].join('\n').toLowerCase()
  return q.split(/\s+/).every((word) => hay.includes(word))
}

export function filterFragrances(items: FragranceSummary[], query: string, season: Season | 'all'): FragranceSummary[] {
  return items.filter((f) => matchesQuery(f, query) && (season === 'all' || f.seasons.includes(season)))
}

const cmpText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' })

export function sortFragrances(items: FragranceSummary[], key: SortKey): FragranceSummary[] {
  const byName = (a: FragranceSummary, b: FragranceSummary) => cmpText(a.name, b.name)
  const out = [...items]
  switch (key) {
    case 'shelf':
      return out.sort((a, b) => (a.shelfPosition ?? 0) - (b.shelfPosition ?? 0) || byName(a, b))
    case 'house':
      return out.sort((a, b) => cmpText(a.house, b.house) || byName(a, b))
    case 'name':
      return out.sort(byName)
    case 'rating':
      return out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b))
    case 'mostWorn':
      return out.sort((a, b) => b.wearCount - a.wearCount || byName(a, b))
    case 'lastWorn':
      // Never-worn items go last.
      return out.sort((a, b) => (b.lastWornAt ?? '').localeCompare(a.lastWornAt ?? '') || byName(a, b))
    case 'season': {
      const rank = (f: FragranceSummary) => (f.seasons[0] ? SEASONS.indexOf(f.seasons[0]) : SEASONS.length)
      return out.sort((a, b) => rank(a) - rank(b) || byName(a, b))
    }
  }
}

export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const out = [...list]
  out.splice(to, 0, out.splice(from, 1)[0])
  return out
}

export const WARDROBE_LABEL: Record<WardrobeKind, string> = {
  collection: 'My Collection',
  wishlist: 'Wishlist',
  to_try: 'To Try',
  had: 'Had',
  garbage: 'Garbage Perfumes'
}

/** Tab order. */
export const WARDROBES: WardrobeKind[] = ['collection', 'wishlist', 'to_try', 'had', 'garbage']

export const HAD_REASON_LABEL = { finished: 'Finished it', sold: 'Sold it', gifted: 'Gave it away' } as const

export const QUICK_SIZES_ML = [2, 5, 10, 30, 50, 75, 100, 125, 200]
