import type { RatingChange, RatingSource } from '@shared/types'
import { ratingSuggestions, DISMISS_DAYS, type RatingFacts, type RatingSuggestion } from '@shared/rating'
import type { Db } from './index'
import { AppError } from './repo'
import { getSetting, setSetting } from './settings'

const DISMISS_KEY = 'rating.dismissed'

/**
 * Sets (or clears, with null) my rating of a fragrance and remembers the change. Writing the value it already has is a
 * no-op, so re-clicking the same number does not clutter the history. Throws; callers wrap it in a Result.
 */
export function writeRating(db: Db, fragranceId: number, rating: number | null, source: RatingSource = 'detail'): void {
  if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) throw new AppError('INVALID', 'Rating must be a whole number from 1 to 10.')
  const cur = db.prepare('SELECT rating, (SELECT count(*) FROM wardrobe_memberships m WHERE m.fragrance_id = fragrances.id) AS memberships FROM fragrances WHERE id = ?').get(fragranceId) as { rating: number | null; memberships: number } | undefined
  if (!cur || cur.memberships === 0) throw new AppError('NOT_FOUND', 'Add the fragrance to a wardrobe before rating it.')
  if (cur.rating === rating) return
  db.prepare('UPDATE fragrances SET rating = ? WHERE id = ?').run(rating, fragranceId)
  db.prepare('INSERT INTO rating_history (fragrance_id, rating, source) VALUES (?, ?, ?)').run(fragranceId, rating, source)
}

export function listRatingHistory(db: Db, fragranceId: number, limit = 60): RatingChange[] {
  return db
    .prepare('SELECT id, rating, rated_at AS ratedAt, source FROM rating_history WHERE fragrance_id = ? ORDER BY rated_at DESC, id DESC LIMIT ?')
    .all(fragranceId, limit) as RatingChange[]
}

const dismissed = (db: Db): Record<string, string> => {
  try {
    const v = JSON.parse(getSetting(db, DISMISS_KEY) ?? '{}') as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function dismissRatingSuggestion(db: Db, fragranceId: number, now = new Date()): void {
  const all = dismissed(db)
  all[String(fragranceId)] = now.toISOString().slice(0, 10)
  setSetting(db, DISMISS_KEY, JSON.stringify(all))
}

const daysBetween = (from: string, now: Date) => Math.max(Math.round((now.getTime() - new Date(from.slice(0, 10) + 'T12:00:00').getTime()) / 86_400_000), 0)

/** The facts the suggestion rules need, for every fragrance in My Collection. */
export function ratingFacts(db: Db, now = new Date()): RatingFacts[] {
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.house, f.rating, w.added_at AS addedAt,
              (SELECT max(rated_at) FROM rating_history h WHERE h.fragrance_id = f.id) AS lastRatedAt,
              (SELECT count(*) FROM wear_log l WHERE l.fragrance_id = f.id AND substr(l.worn_at, 1, 10) >= ?) AS wears90,
              (SELECT count(*) FROM wear_log l WHERE l.fragrance_id = f.id) AS wearsTotal,
              (SELECT max(substr(l.worn_at, 1, 10)) FROM wear_log l WHERE l.fragrance_id = f.id) AS lastWorn
       FROM fragrances f JOIN wardrobe_memberships w ON w.fragrance_id = f.id AND w.wardrobe = 'collection'`
    )
    .all(new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)) as { id: number; name: string; house: string; rating: number | null; addedAt: string; lastRatedAt: string | null; wears90: number; wearsTotal: number; lastWorn: string | null }[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    house: r.house,
    rating: r.rating,
    lastRatedAt: r.lastRatedAt,
    wearsLast90Days: r.wears90,
    wearsTotal: r.wearsTotal,
    daysSinceWorn: r.lastWorn ? daysBetween(r.lastWorn, now) : null,
    daysOwned: daysBetween(r.addedAt, now)
  }))
}

/** A few gentle "is this rating still right?" suggestions, leaving out fragrances I dismissed recently. */
export function listRatingSuggestions(db: Db, now = new Date(), limit = 3): RatingSuggestion[] {
  const hidden = dismissed(db)
  const facts = ratingFacts(db, now).filter((f) => {
    const d = hidden[String(f.id)]
    return !d || daysBetween(d, now) >= DISMISS_DAYS
  })
  return ratingSuggestions(facts, now, limit)
}
