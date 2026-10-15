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
  MoveRequest,
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
  wardrobe: WardrobeKind | null
  shelf_position: number | null
  rating: number | null
  desired_size_ml: number | null
  imported: number | null
  dislike_note: string | null
  had_years: string | null
  had_memory: string | null
  had_reason: HadReason | null
  has_impression: number
  default_sprays: number | null
  is_foreign: number
  wear_count: number
  last_worn: string | null
}

const SUMMARY_SQL = `
SELECT f.id, f.name, f.house, f.year, f.concentration, f.image_path, f.is_sample, f.default_sprays, f.is_foreign,
       w.wardrobe, w.shelf_position, w.rating, w.desired_size_ml, w.imported, w.dislike_note, w.had_years, w.had_memory, w.had_reason,
       EXISTS (SELECT 1 FROM smell_impression s WHERE s.fragrance_id = f.id AND length(trim(s.text)) > 0) AS has_impression,
       (SELECT count(*) FROM wear_log l WHERE l.fragrance_id = f.id) AS wear_count,
       (SELECT max(l.worn_at) FROM wear_log l WHERE l.fragrance_id = f.id) AS last_worn
FROM fragrances f
LEFT JOIN wardrobe_items w ON w.fragrance_id = f.id`

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
    wardrobe: r.wardrobe,
    shelfPosition: r.shelf_position,
    rating: r.rating,
    topAccords: accords.slice(0, 3),
    accordNames: accords.map((a) => a.name),
    noteNames,
    bottles,
    activeBottleCount: bottles.length,
    desiredSizeMl: r.desired_size_ml,
    wearCount: r.wear_count,
    lastWornAt: r.last_worn,
    seasons: seasonsFor(db, r.id),
    isSample: r.is_sample === 1,
    dislikeNote: r.dislike_note,
    hadYears: r.had_years,
    hadMemory: r.had_memory,
    hadReason: r.had_reason,
    importedPending: r.wardrobe === 'wishlist' && r.imported === 1 && r.has_impression === 0,
    defaultSprays: r.default_sprays,
    isForeign: r.is_foreign === 1
  }
}

export function listFragrances(db: Db, filter: { wardrobe?: WardrobeKind } = {}): FragranceSummary[] {
  const rows = (
    filter.wardrobe
      ? db
          .prepare(`${SUMMARY_SQL} WHERE w.wardrobe = ? ORDER BY w.shelf_position, f.house, f.name`)
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

  return {
    ...summary,
    pastBottles,
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

/**
 * Puts a fragrance in a wardrobe (inserting or moving). History (wears, notes, bottles) is untouched
 * because it hangs off the fragrance, not the wardrobe row.
 */
export function moveToWardrobe(db: Db, req: MoveRequest): Result<FragranceSummary> {
  return toResult(() => applyMove(db, req))
}

export interface MoveOptions {
  /**
   * Importers only: allows a wishlist item without a smell note and marks it, so it shows as "needs a note".
   * The renderer cannot set this (the IPC handler never passes it), so the wishlist rule still holds for everything
   * added by hand.
   */
  imported?: boolean
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

/** Moving an item out of Had into the collection turns its Had details into a "previous bottle" record. */
function archiveHadDetails(db: Db, fragranceId: number): void {
  const w = db.prepare('SELECT had_years, had_memory, had_reason FROM wardrobe_items WHERE fragrance_id = ?').get(fragranceId) as
    | { had_years: string | null; had_memory: string | null; had_reason: HadReason | null }
    | undefined
  if (w && (w.had_years || w.had_memory || w.had_reason)) {
    db.prepare('INSERT INTO past_bottles (fragrance_id, years, memory, reason) VALUES (?, ?, ?, ?)').run(fragranceId, w.had_years, w.had_memory, w.had_reason)
    db.prepare('UPDATE wardrobe_items SET had_years = NULL, had_memory = NULL, had_reason = NULL WHERE fragrance_id = ?').run(fragranceId)
  }
}

/** Throwing variant of moveToWardrobe, for use inside larger transactions. */
export function applyMove(db: Db, req: MoveRequest, opts: MoveOptions = {}): FragranceSummary {
  const exists = db.prepare('SELECT 1 FROM fragrances WHERE id = ?').get(req.fragranceId)
  if (!exists) throw new AppError('NOT_FOUND', 'Fragrance not found.')
  const before = db.prepare('SELECT wardrobe FROM wardrobe_items WHERE fragrance_id = ?').get(req.fragranceId) as { wardrobe: WardrobeKind } | undefined

  db.transaction(() => {
    let imported = 0
    if (req.to === 'wishlist') {
      const text = req.impression?.trim()
      if (text) {
        db.prepare(
          `INSERT INTO smell_impression (fragrance_id, text) VALUES (?, ?)
           ON CONFLICT(fragrance_id) DO UPDATE SET text = excluded.text`
        ).run(req.fragranceId, text)
      }
      const has = db
        .prepare('SELECT 1 FROM smell_impression WHERE fragrance_id = ? AND length(trim(text)) > 0')
        .get(req.fragranceId)
      if (!has) {
        if (!opts.imported) throw new AppError('WISHLIST_IMPRESSION_REQUIRED', IMPRESSION_MESSAGE)
        imported = 1
      }
    }

    if (req.to === 'collection') {
      const active = db
        .prepare(`SELECT 1 FROM bottles WHERE fragrance_id = ? AND status = 'active'`)
        .get(req.fragranceId)
      if (!active) {
        const b = req.bottle
        if (!b) throw new AppError('BOTTLE_REQUIRED', 'Choose a bottle type and size to add this to your collection.')
        if (!(b.sizeMl > 0)) throw new AppError('INVALID', 'Bottle size must be greater than 0 ml.')
        const remaining = Math.min(Math.max(b.remainingMl ?? b.sizeMl, 0), b.sizeMl)
        db.prepare(
          'INSERT INTO bottles (fragrance_id, type, size_ml, remaining_ml) VALUES (?, ?, ?, ?)'
        ).run(req.fragranceId, b.type, b.sizeMl, remaining)
      }
      if (before?.wardrobe === 'had') archiveHadDetails(db, req.fragranceId)
    }

    db.prepare('UPDATE fragrances SET is_foreign = 0 WHERE id = ?').run(req.fragranceId)

    const position =
      (db.prepare('SELECT coalesce(max(shelf_position), -1) + 1 AS p FROM wardrobe_items WHERE wardrobe = ?').get(
        req.to
      ) as { p: number }).p

    db.prepare(
      `INSERT INTO wardrobe_items (fragrance_id, wardrobe, shelf_position, desired_size_ml, imported)
       VALUES (@id, @to, @pos, @desired, @imported)
       ON CONFLICT(fragrance_id) DO UPDATE SET
         wardrobe = excluded.wardrobe,
         shelf_position = CASE WHEN wardrobe_items.wardrobe = excluded.wardrobe
                               THEN wardrobe_items.shelf_position ELSE excluded.shelf_position END,
         desired_size_ml = CASE WHEN excluded.wardrobe = 'wishlist'
                                THEN coalesce(excluded.desired_size_ml, wardrobe_items.desired_size_ml)
                                ELSE wardrobe_items.desired_size_ml END,
         imported = excluded.imported`
    ).run({ id: req.fragranceId, to: req.to, pos: position, desired: req.desiredSizeMl ?? null, imported })

    // Wardrobe-specific notes. They are kept when something moves away, so history survives a round trip.
    if (req.to === 'garbage' && req.dislikeNote !== undefined) {
      db.prepare('UPDATE wardrobe_items SET dislike_note = ? WHERE fragrance_id = ?').run(clean(req.dislikeNote), req.fragranceId)
    }
    if (req.to === 'had' && req.had) {
      db.prepare('UPDATE wardrobe_items SET had_years = ?, had_memory = ?, had_reason = ? WHERE fragrance_id = ?').run(
        clean(req.had.years), clean(req.had.memory), req.had.reason ?? null, req.fragranceId
      )
    }
  })()

  return getSummary(db, req.fragranceId)!
}

/** Edits the notes that belong to a wardrobe: why I dislike it (Garbage) or the Had details. */
export function setWardrobeDetails(db: Db, fragranceId: number, d: { dislikeNote?: string | null; had?: { years?: string | null; memory?: string | null; reason?: HadReason | null } }): Result<null> {
  return toResult(() => {
    const row = db.prepare('SELECT 1 FROM wardrobe_items WHERE fragrance_id = ?').get(fragranceId)
    if (!row) throw new AppError('NOT_FOUND', 'That fragrance is not in a wardrobe.')
    if (d.dislikeNote !== undefined) db.prepare('UPDATE wardrobe_items SET dislike_note = ? WHERE fragrance_id = ?').run(clean(d.dislikeNote), fragranceId)
    if (d.had) {
      if (d.had.reason && !['finished', 'sold', 'gifted'].includes(d.had.reason)) throw new AppError('INVALID', 'Choose finished, sold or gifted.')
      db.prepare('UPDATE wardrobe_items SET had_years = ?, had_memory = ?, had_reason = ? WHERE fragrance_id = ?').run(
        clean(d.had.years), clean(d.had.memory), d.had.reason ?? null, fragranceId
      )
    }
    return null
  })
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

export function reorderWardrobe(db: Db, wardrobe: WardrobeKind, orderedIds: number[]): Result<null> {
  return toResult(() => {
    const upd = db.prepare('UPDATE wardrobe_items SET shelf_position = ? WHERE fragrance_id = ? AND wardrobe = ?')
    db.transaction(() => orderedIds.forEach((id, i) => upd.run(i, id, wardrobe)))()
    return null
  })
}
