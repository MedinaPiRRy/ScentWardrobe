import { listRatingHistory } from './ratings'
import { WARDROBE_ORDER } from '@shared/wardrobes'
import type {
  AccordStrength,
  Bottle,
  CommunityData,
  DbInfo,
  ErrorCode,
  FragranceDetail,
  FragranceSummary,
  HadReason,
  JournalEntry,
  PastBottle,
  Season,
  ShelfBottle,
  Membership,
  NoteEntry,
  PerformanceStats,
  Result,
  WardrobeKind
} from '@shared/types'
import type { Db } from './index'
import { currentVersion } from './migrations'

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string
  ) {
    super(message)
  }
}

export const fail = (code: ErrorCode, message: string): Result<never> => ({ ok: false, code, message })

/** Runs fn and converts thrown errors (including DB trigger aborts) into a Result. */
export function toResult<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, data: fn() }
  } catch (e) {
    if (e instanceof AppError) return fail(e.code, e.message)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('WISHLIST_IMPRESSION_REQUIRED')) {
      return fail('WISHLIST_IMPRESSION_REQUIRED', IMPRESSION_MESSAGE)
    }
    return fail('UNKNOWN', msg)
  }
}

const IMPRESSION_MESSAGE = 'Describe what it smells like to you before adding this fragrance to the wishlist.'

interface SummaryRow {
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  image_path: string | null
  is_sample: number
  rating: number | null
  has_impression: number
  default_sprays: number | null
  is_foreign: number
  wear_count: number
  last_worn: string | null
}

const SUMMARY_SQL = `
SELECT f.id, f.name, f.house, f.year, f.concentration, f.image_path, f.is_sample, f.default_sprays, f.is_foreign, f.rating,
       EXISTS (SELECT 1 FROM smell_impression s WHERE s.fragrance_id = f.id AND length(trim(s.text)) > 0) AS has_impression,
       (SELECT count(*) FROM wear_log l WHERE l.fragrance_id = f.id) AS wear_count,
       (SELECT max(l.worn_at) FROM wear_log l WHERE l.fragrance_id = f.id) AS last_worn
FROM fragrances f`

interface MembershipRow {
  wardrobe: WardrobeKind
  shelf_position: number
  imported: number
  dislike_note: string | null
  had_years: string | null
  had_memory: string | null
  had_reason: HadReason | null
  desired_size_ml: number | null
  added_at: string
}

export function membershipsOf(db: Db, fragranceId: number, hasImpression: boolean): Membership[] {
  const rows = db
    .prepare('SELECT wardrobe, shelf_position, imported, dislike_note, had_years, had_memory, had_reason, desired_size_ml, added_at FROM wardrobe_memberships WHERE fragrance_id = ?')
    .all(fragranceId) as MembershipRow[]
  return rows
    .map((r) => ({
      wardrobe: r.wardrobe,
      shelfPosition: r.shelf_position,
      importedPending: r.wardrobe === 'wishlist' && r.imported === 1 && !hasImpression,
      dislikeNote: r.dislike_note,
      hadYears: r.had_years,
      hadMemory: r.had_memory,
      hadReason: r.had_reason,
      desiredSizeMl: r.desired_size_ml,
      addedAt: r.added_at
    }))
    .sort((x, y) => WARDROBE_ORDER.indexOf(x.wardrobe) - WARDROBE_ORDER.indexOf(y.wardrobe))
}

function accordsFor(db: Db, fragranceId: number): AccordStrength[] {
  return db
    .prepare(
      `SELECT a.name, a.color, fa.strength FROM fragrance_accords fa
       JOIN accords a ON a.id = fa.accord_id
       WHERE fa.fragrance_id = ? ORDER BY fa.strength DESC, a.name`
    )
    .all(fragranceId) as AccordStrength[]
}

const SEASONS: Season[] = ['winter', 'spring', 'summer', 'fall']

function seasonsFor(db: Db, id: number): Season[] {
  const c = db.prepare('SELECT winter, spring, summer, fall FROM fragrance_community WHERE fragrance_id = ?').get(id) as
    | Record<Season, number>
    | undefined
  if (!c) return []
  const top = Math.max(...SEASONS.map((s) => c[s]))
  if (top <= 0) return []
  return SEASONS.filter((s) => c[s] >= top * 0.6).sort((a, b) => c[b] - c[a])
}

function toSummary(db: Db, r: SummaryRow): FragranceSummary {
  const memberships = membershipsOf(db, r.id, r.has_impression === 1)
  const main = memberships[0]
  const accords = accordsFor(db, r.id)
  const bottles = db
    .prepare(
      `SELECT type, size_ml AS sizeMl, remaining_ml AS remainingMl FROM bottles
       WHERE fragrance_id = ? AND status = 'active' ORDER BY size_ml DESC`
    )
    .all(r.id) as ShelfBottle[]
  const noteNames = (
    db
      .prepare('SELECT DISTINCT n.name FROM fragrance_notes fn JOIN notes n ON n.id = fn.note_id WHERE fn.fragrance_id = ?')
      .all(r.id) as { name: string }[]
  ).map((n) => n.name)
  return {
    id: r.id,
    name: r.name,
    house: r.house,
    year: r.year,
    concentration: r.concentration,
    imagePath: r.image_path,
    wardrobe: main?.wardrobe ?? null,
    wardrobes: memberships.map((m) => m.wardrobe),
    memberships,
    shelfPosition: main?.shelfPosition ?? null,
    rating: r.rating,
    topAccords: accords.slice(0, 3),
    accordNames: accords.map((a) => a.name),
    noteNames,
    bottles,
    activeBottleCount: bottles.length,
    desiredSizeMl: main?.desiredSizeMl ?? null,
    wearCount: r.wear_count,
    lastWornAt: r.last_worn,
    seasons: seasonsFor(db, r.id),
    isSample: r.is_sample === 1,
    dislikeNote: main?.dislikeNote ?? null,
    hadYears: main?.hadYears ?? null,
    hadMemory: main?.hadMemory ?? null,
    hadReason: main?.hadReason ?? null,
    importedPending: memberships.some((m) => m.importedPending),
    defaultSprays: r.default_sprays,
    isForeign: r.is_foreign === 1
  }
}

export function listFragrances(db: Db, filter: { wardrobe?: WardrobeKind } = {}): FragranceSummary[] {
  const rows = (
    filter.wardrobe
      ? db
          .prepare(`${SUMMARY_SQL} JOIN wardrobe_memberships w ON w.fragrance_id = f.id AND w.wardrobe = ? ORDER BY w.shelf_position, f.house, f.name`)
          .all(filter.wardrobe)
      : db.prepare(`${SUMMARY_SQL} ORDER BY f.house, f.name`).all()
  ) as SummaryRow[]
  return rows.map((r) => toSummary(db, r))
}

export function getSummary(db: Db, id: number): FragranceSummary | null {
  const r = db.prepare(`${SUMMARY_SQL} WHERE f.id = ?`).get(id) as SummaryRow | undefined
  return r ? toSummary(db, r) : null
}

/** Meteorological season of a 'YYYY-MM-DD ...' date (northern hemisphere). */
export function seasonOf(date: string): string | null {
  const m = parseInt(date.slice(5, 7), 10)
  if (!(m >= 1 && m <= 12)) return null
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall'
}

function performanceFor(db: Db, id: number): PerformanceStats {
  const agg = db
    .prepare(
      `SELECT count(*) AS n, avg(projection) AS p, avg(longevity_hours) AS l, avg(sprays) AS s
       FROM wear_log WHERE fragrance_id = ?`
    )
    .get(id) as { n: number; p: number | null; l: number | null; s: number | null }
  const series = db
    .prepare(
      `SELECT substr(worn_at, 1, 10) AS date, projection, longevity_hours AS longevity
       FROM wear_log WHERE fragrance_id = ? AND (projection IS NOT NULL OR longevity_hours IS NOT NULL)
       ORDER BY worn_at`
    )
    .all(id) as PerformanceStats['series']
  const extra = db
    .prepare('SELECT worn_at, longevity_hours AS l, weather, compliments FROM wear_log WHERE fragrance_id = ?')
    .all(id) as { worn_at: string; l: number | null; weather: string | null; compliments: number }[]
  const group = (keyOf: (r: (typeof extra)[number]) => string | null) => {
    const m = new Map<string, { sum: number; n: number }>()
    for (const r of extra) {
      const k = keyOf(r)
      if (!k || r.l == null) continue
      const g = m.get(k) ?? { sum: 0, n: 0 }
      g.sum += r.l
      g.n++
      m.set(k, g)
    }
    return [...m.entries()].map(([label, g]) => ({ label, avg: Math.round((g.sum / g.n) * 10) / 10, wears: g.n })).sort((a, b) => b.wears - a.wears || a.label.localeCompare(b.label))
  }
  return {
    wearCount: agg.n,
    avgProjection: agg.p,
    avgLongevity: agg.l,
    avgSprays: agg.s,
    compliments: extra.reduce((s, r) => s + r.compliments, 0),
    longevityBySeason: group((r) => seasonOf(r.worn_at)),
    longevityByWeather: group((r) => r.weather?.trim().toLowerCase() || null),
    series
  }
}

export function getFragrance(db: Db, id: number): FragranceDetail | null {
  const summary = getSummary(db, id)
  if (!summary) return null
  const f = db
    .prepare('SELECT perfumers, gender, description, source_url FROM fragrances WHERE id = ?')
    .get(id) as { perfumers: string | null; gender: string | null; description: string | null; source_url: string | null }

  const notes = (
    db
      .prepare(
        `SELECT n.id, n.name, n.family, n.icon_path AS iconPath, fn.layer
         FROM fragrance_notes fn JOIN notes n ON n.id = fn.note_id
         WHERE fn.fragrance_id = ?
         ORDER BY CASE fn.layer WHEN 'top' THEN 1 WHEN 'heart' THEN 2 WHEN 'base' THEN 3 ELSE 4 END, n.name`
      )
      .all(id) as NoteEntry[]
  )

  const community = (db
    .prepare('SELECT winter, spring, summer, fall, day, night, longevity, sillage FROM fragrance_community WHERE fragrance_id = ?')
    .get(id) ?? null) as CommunityData | null

  const impression =
    (db.prepare('SELECT text FROM smell_impression WHERE fragrance_id = ?').get(id) as { text: string } | undefined)
      ?.text ?? null

  const bottles = (
    db
      .prepare(
        `SELECT id, fragrance_id AS fragranceId, type, size_ml AS sizeMl, remaining_ml AS remainingMl,
                ml_per_spray AS mlPerSpray, purchase_date AS purchaseDate, price, bought_at AS boughtAt,
                batch_code AS batchCode, opened_date AS openedDate, status,
                market_price AS marketPrice, market_checked_on AS marketCheckedOn, market_source AS marketSource
         FROM bottles WHERE fragrance_id = ? ORDER BY id`
      )
      .all(id) as Bottle[]
  )

  const journal = db
    .prepare('SELECT id, text, created_at AS createdAt FROM personal_notes WHERE fragrance_id = ? ORDER BY id DESC')
    .all(id) as JournalEntry[]

  const pastBottles = listPastBottles(db, id)
  const ratingHistory = listRatingHistory(db, id)

  return {
    ...summary,
    pastBottles,
    ratingHistory,
    performance: performanceFor(db, id),
    perfumers: f.perfumers,
    gender: f.gender,
    description: f.description,
    sourceUrl: f.source_url,
    notes,
    accords: accordsFor(db, id),
    community,
    impression,
    bottles,
    journal
  }
}

export function listPastBottles(db: Db, fragranceId?: number): PastBottle[] {
  const sql = `SELECT id, fragrance_id AS fragranceId, years, memory, reason, created_at AS createdAt FROM past_bottles ${fragranceId != null ? 'WHERE fragrance_id = ?' : ''} ORDER BY id`
  return (fragranceId != null ? db.prepare(sql).all(fragranceId) : db.prepare(sql).all()) as PastBottle[]
}

export function dbInfo(db: Db, path: string): DbInfo {
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c
  return {
    path,
    schemaVersion: currentVersion(db),
    fragranceCount: count('SELECT count(*) AS c FROM fragrances'),
    sampleCount: count('SELECT count(*) AS c FROM fragrances WHERE is_sample = 1')
  }
}
