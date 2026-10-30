/**
 * How a 1-10 rating steers what the app suggests. Pure functions, no framework.
 *
 * The curve (a multiplier on how well a fragrance fits the day):
 *
 *   rating   1     2     3     4     5     6     7     8     9     10
 *   weight   0.55  0.60  0.65  0.90  1.00  1.05  1.12  1.18  1.22  1.25
 *
 * - 1-3 are rarely picked (about 0.6x), 4-6 are normal (about 1x), 7-10 are favoured (up to 1.25x).
 * - Unrated counts as neutral (1.0x), and is shown as "not rated yet": no rating is never a penalty.
 * - Nothing is forgotten: the penalty of a low rating fades with time since the fragrance was last worn, and is gone
 *   after OVERDUE_FULL_DAYS, so a bottle I rated 2 still comes back when it has sat unused for long enough.
 * - A high rating is never reduced by neglect (that is the rotation logic's job).
 */

export const RATING_MIN = 1
export const RATING_MAX = 10

const CURVE: Record<number, number> = { 1: 0.55, 2: 0.6, 3: 0.65, 4: 0.9, 5: 1, 6: 1.05, 7: 1.12, 8: 1.18, 9: 1.22, 10: 1.25 }

/** The multiplier for a rating; unrated (or out of range) is neutral. */
export function ratingWeight(rating: number | null | undefined): number {
  if (rating == null || !Number.isFinite(rating)) return 1
  const r = Math.min(Math.max(Math.round(rating), RATING_MIN), RATING_MAX)
  return CURVE[r]
}

/** Days after which a low rating no longer holds a fragrance back at all. */
export const OVERDUE_FROM_DAYS = 21
export const OVERDUE_FULL_DAYS = 90

/** 0 (worn recently) to 1 (long overdue). Never worn counts as halfway overdue. */
export function overdueFactor(daysSinceWorn: number | null): number {
  if (daysSinceWorn === null) return 0.5
  return Math.min(Math.max((daysSinceWorn - OVERDUE_FROM_DAYS) / (OVERDUE_FULL_DAYS - OVERDUE_FROM_DAYS), 0), 1)
}

/** The weight actually applied when choosing what to wear: the penalty of a low rating fades as a fragrance gets overdue. */
export function effectiveRatingWeight(rating: number | null | undefined, daysSinceWorn: number | null): number {
  const w = ratingWeight(rating)
  return w < 1 ? w + (1 - w) * overdueFactor(daysSinceWorn) : w
}

/** Short description of a weight for the "Why?" breakdown. */
export function describeRatingWeight(rating: number | null | undefined, weight: number): string {
  if (rating == null) return 'Not rated yet: treated as neutral'
  const x = Math.round(weight * 100) / 100
  return `Rated ${rating}/10: ${x === 1 ? 'normal weight' : x > 1 ? `favoured (x${x})` : `held back (x${x})`}`
}

// ---- gentle prompts to re-rate ---------------------------------------------------------------------------

export interface RatingFacts {
  id: number
  name: string
  house: string
  rating: number | null
  /** When the rating last changed, 'YYYY-MM-DD ...' (null = never rated). */
  lastRatedAt: string | null
  wearsLast90Days: number
  wearsTotal: number
  /** Days since it was last worn, null if never. */
  daysSinceWorn: number | null
  /** Days since it was added, to avoid nagging about something brand new. */
  daysOwned: number
}

export interface RatingSuggestion {
  id: number
  name: string
  house: string
  rating: number | null
  reason: string
  /** Higher first. */
  priority: number
}

const dayDiff = (from: string, now: Date) => Math.max(Math.round((now.getTime() - new Date(from.replace(' ', 'T').slice(0, 10) + 'T12:00:00').getTime()) / 86_400_000), 0)

/**
 * Fragrances whose rating may be out of date: unrated but worn a lot, rated low but reached for often, rated high but
 * untouched, or not rated for a long time. At most `limit`, most telling first.
 */
export function ratingSuggestions(facts: RatingFacts[], now: Date, limit = 3): RatingSuggestion[] {
  const out: RatingSuggestion[] = []
  for (const f of facts) {
    if (f.daysOwned < 30) continue
    let hit: { reason: string; priority: number } | null = null
    if (f.rating == null) {
      if (f.wearsTotal >= 5) hit = { reason: `You have worn it ${f.wearsTotal} times and never rated it.`, priority: 60 + Math.min(f.wearsTotal, 30) }
    } else if (f.rating <= 4 && f.wearsLast90Days >= 6) {
      hit = { reason: `You rated it ${f.rating}/10 but wore it ${f.wearsLast90Days} times in the last 3 months.`, priority: 90 + Math.min(f.wearsLast90Days, 20) }
    } else if (f.rating >= 8 && (f.daysSinceWorn === null || f.daysSinceWorn >= 120) && f.daysOwned >= 120) {
      hit = { reason: f.daysSinceWorn === null ? `You rated it ${f.rating}/10 but have never worn it.` : `You rated it ${f.rating}/10 but have not worn it for ${f.daysSinceWorn} days.`, priority: 80 }
    } else if (f.lastRatedAt && dayDiff(f.lastRatedAt, now) >= 365) {
      const months = Math.round(dayDiff(f.lastRatedAt, now) / 30)
      hit = { reason: `You last rated it ${months} months ago (${f.rating}/10). Still true?`, priority: 40 + Math.min(months, 30) }
    }
    if (hit) out.push({ id: f.id, name: f.name, house: f.house, rating: f.rating, ...hit })
  }
  return out.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)).slice(0, limit)
}

/** A fragrance dismissed from the suggestions stays hidden for this long. */
export const DISMISS_DAYS = 90
