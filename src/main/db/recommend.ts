import { hoursToLongevityRating } from '@shared/performance'
import type { RecItem } from '@shared/recommend'
import type { SavedLocation } from '@shared/types'
import type { Db } from './index'
import { layerCandidates } from './layering'
import { getSetting, setSetting } from './settings'

const MIN_DURATIONS_FOR_MINE = 2
const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * The collection with everything the recommender needs. A wear of a layer combo counts as a wear of each of its
 * fragrances, so rotation also sees blends. Longevity uses my own logged hours once there are two of them.
 */
export function recommendCandidates(db: Db, now = new Date()): RecItem[] {
  const base = layerCandidates(db)
  const weekAgo = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))

  const wears = db.prepare(
    `SELECT w.worn_at AS at FROM wear_log w WHERE w.fragrance_id = @id
     UNION ALL
     SELECT w.worn_at FROM wear_log w JOIN layer_combo_items ci ON ci.combo_id = w.layer_combo_id WHERE ci.fragrance_id = @id`
  )
  const rating = db.prepare('SELECT rating FROM wardrobe_items WHERE fragrance_id = ?')
  const mine = db.prepare('SELECT avg(longevity_hours) AS h, count(longevity_hours) AS n FROM wear_log WHERE fragrance_id = ?')
  const community = db.prepare('SELECT longevity FROM fragrance_community WHERE fragrance_id = ?')

  return base.map((b) => {
    const times = (wears.all({ id: b.id }) as { at: string }[]).map((r) => r.at).sort()
    const m = mine.get(b.id) as { h: number | null; n: number }
    const c = community.get(b.id) as { longevity: number | null } | undefined
    return {
      ...b,
      longevity: m.n >= MIN_DURATIONS_FOR_MINE && m.h != null ? hoursToLongevityRating(m.h) : (c?.longevity ?? null),
      rating: (rating.get(b.id) as { rating: number | null } | undefined)?.rating ?? null,
      lastWornAt: times.length ? times[times.length - 1] : null,
      wearsLast7Days: times.filter((t) => t.slice(0, 10) >= weekAgo).length,
      wearCount: times.length
    }
  })
}

const LOCATION_KEY = 'weather.location'

export function getLocation(db: Db): SavedLocation | null {
  try {
    const l = JSON.parse(getSetting(db, LOCATION_KEY) ?? 'null') as SavedLocation | null
    return l && typeof l.latitude === 'number' && typeof l.longitude === 'number' ? l : null
  } catch {
    return null
  }
}

export const setLocation = (db: Db, loc: SavedLocation | null) =>
  loc ? setSetting(db, LOCATION_KEY, JSON.stringify({ label: loc.label, latitude: loc.latitude, longitude: loc.longitude })) : (db.prepare('DELETE FROM settings WHERE key = ?').run(LOCATION_KEY), { ok: true as const, data: null })
