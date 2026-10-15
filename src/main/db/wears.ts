import type {
  FollowUpInput,
  LowBottleWarning,
  Result,
  TimeOfDay,
  WearEntry,
  WearInput,
  WearLogged
} from '@shared/types'
import type { Db } from './index'
import { AppError, toResult } from './repo'
import { getNumberSetting } from './settings'

const DEFAULT_SPRAYS = 4
const LOW_THRESHOLD_KEY = 'bottle.lowThreshold'
export const DEFAULT_LOW_THRESHOLD = 0.15

interface BottleRow {
  id: number
  fragrance_id: number
  size_ml: number
  remaining_ml: number
  ml_per_spray: number
  status: string
}

export function timeOfDayFor(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

const WORN_AT = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/

function validate(i: WearInput): void {
  if ((i.fragranceId == null) === (i.comboId == null)) throw new AppError('INVALID', 'A wear is for one fragrance or one layer combo.')
  if (!WORN_AT.test(i.wornAt)) throw new AppError('INVALID', 'The date and time look wrong.')
  if (!Number.isInteger(i.sprays) || i.sprays < 0 || i.sprays > 60) throw new AppError('INVALID', 'Sprays must be a whole number from 0 to 60.')
  if (i.projection != null && !(Number.isInteger(i.projection) && i.projection >= 1 && i.projection <= 5)) throw new AppError('INVALID', 'Projection must be 1 to 5.')
  if (i.longevityHours != null && !(i.longevityHours >= 0 && i.longevityHours <= 72)) throw new AppError('INVALID', 'Longevity must be between 0 and 72 hours.')
  if (i.compliments != null && !(Number.isInteger(i.compliments) && i.compliments >= 0)) throw new AppError('INVALID', 'Compliments must be a whole number.')
  if (i.humidity != null && !(i.humidity >= 0 && i.humidity <= 100)) throw new AppError('INVALID', 'Humidity must be 0 to 100 %.')
}

function activeBottles(db: Db, fragranceId: number): BottleRow[] {
  return db
    .prepare(`SELECT id, fragrance_id, size_ml, remaining_ml, ml_per_spray, status FROM bottles WHERE fragrance_id = ? AND status = 'active' AND remaining_ml > 0 ORDER BY id`)
    .all(fragranceId) as BottleRow[]
}

/** Takes `sprays` from a bottle, recording the exact amount. Marks the bottle empty when it runs out. */
function deduct(db: Db, wearId: number, bottle: BottleRow, sprays: number): { before: number; after: number; ml: number } {
  const ml = Math.min(sprays * bottle.ml_per_spray, bottle.remaining_ml)
  const after = Math.max(bottle.remaining_ml - ml, 0)
  if (ml > 0) {
    db.prepare('INSERT INTO wear_deductions (wear_id, bottle_id, ml) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET ml = ml + excluded.ml').run(wearId, bottle.id, ml)
  }
  db.prepare(`UPDATE bottles SET remaining_ml = ?, status = CASE WHEN ? <= 0.0001 THEN 'empty' ELSE status END WHERE id = ?`).run(after, after, bottle.id)
  return { before: bottle.remaining_ml, after, ml }
}

/** Gives back what a wear took (exactly), un-emptying bottles that had only just run out. */
function restore(db: Db, wearId: number): void {
  const rows = db.prepare('SELECT bottle_id, ml FROM wear_deductions WHERE wear_id = ?').all(wearId) as { bottle_id: number; ml: number }[]
  for (const r of rows) {
    db.prepare(
      `UPDATE bottles SET remaining_ml = min(remaining_ml + ?, size_ml),
         status = CASE WHEN status = 'empty' THEN 'active' ELSE status END WHERE id = ?`
    ).run(r.ml, r.bottle_id)
  }
  db.prepare('DELETE FROM wear_deductions WHERE wear_id = ?').run(wearId)
}

function lowWarning(db: Db, bottleId: number, avgSprays: number | null): LowBottleWarning {
  const b = db
    .prepare(
      `SELECT b.id, b.fragrance_id AS fid, b.size_ml, b.remaining_ml, b.ml_per_spray, f.name FROM bottles b JOIN fragrances f ON f.id = b.fragrance_id WHERE b.id = ?`
    )
    .get(bottleId) as { id: number; fid: number; size_ml: number; remaining_ml: number; ml_per_spray: number; name: string }
  const perWear = (avgSprays && avgSprays > 0 ? avgSprays : DEFAULT_SPRAYS) * b.ml_per_spray
  return {
    bottleId: b.id,
    fragranceId: b.fid,
    name: b.name,
    percent: Math.round((b.remaining_ml / b.size_ml) * 100),
    remainingMl: b.remaining_ml,
    wearsLeft: perWear > 0 ? Math.floor(b.remaining_ml / perWear) : null
  }
}

export function averageSprays(db: Db, fragranceId: number): number | null {
  const r = db.prepare('SELECT avg(sprays) AS a FROM wear_log WHERE fragrance_id = ? AND sprays > 0').get(fragranceId) as { a: number | null }
  return r.a
}

/** Applies the bottle deductions for a wear and reports bottles that crossed the low-level threshold. */
function applyDeductions(db: Db, wearId: number, input: WearInput, enabled: boolean): LowBottleWarning[] {
  const threshold = getNumberSetting(db, LOW_THRESHOLD_KEY, DEFAULT_LOW_THRESHOLD)
  const warnings: LowBottleWarning[] = []
  if (!enabled || input.sprays <= 0) return warnings

  const take = (fragranceId: number, sprays: number, bottleId: number | null | undefined) => {
    let bottle: BottleRow | undefined
    if (bottleId != null) {
      bottle = db.prepare('SELECT id, fragrance_id, size_ml, remaining_ml, ml_per_spray, status FROM bottles WHERE id = ?').get(bottleId) as BottleRow | undefined
      if (!bottle || bottle.fragrance_id !== fragranceId) throw new AppError('INVALID', 'That bottle belongs to a different fragrance.')
      if (bottle.status !== 'active') throw new AppError('INVALID', 'That bottle is not active. Choose another one.')
    } else bottle = activeBottles(db, fragranceId)[0]
    if (!bottle || sprays <= 0) return // wearing something you have no bottle of (a sample you were given, a friend's) is fine
    const { before, after } = deduct(db, wearId, bottle, sprays)
    if (before / bottle.size_ml >= threshold && after / bottle.size_ml < threshold) {
      warnings.push(lowWarning(db, bottle.id, averageSprays(db, fragranceId)))
    }
  }

  if (input.fragranceId != null) {
    take(input.fragranceId, input.sprays, input.bottleId)
  } else {
    const items = db.prepare('SELECT fragrance_id, spray_weight FROM layer_combo_items WHERE combo_id = ? ORDER BY position').all(input.comboId) as { fragrance_id: number; spray_weight: number }[]
    if (items.length === 0) throw new AppError('NOT_FOUND', 'That layer combo has no fragrances.')
    const total = items.reduce((s, i) => s + i.spray_weight, 0) || items.length
    for (const it of items) take(it.fragrance_id, Math.max(1, Math.round((input.sprays * it.spray_weight) / total)), null)
  }
  return warnings
}

const COLUMNS = `fragrance_id, layer_combo_id, bottle_id, worn_at, time_of_day, sprays, activity, temperature_c, humidity, weather, projection, longevity_hours, compliments, notes, backfilled`

const pad2 = (n: number) => String(n).padStart(2, '0')
const todayOf = (now: Date) => `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`

/** Backfilled unless the caller says otherwise: any wear dated before today is a diary entry. */
export function isBackfilled(input: WearInput, now: Date): boolean {
  return input.backfilled ?? input.wornAt.slice(0, 10) < todayOf(now)
}

function insertParams(i: WearInput, bottleId: number | null, backfilled: boolean) {
  const hour = parseInt(i.wornAt.slice(11, 13), 10)
  return [
    i.fragranceId ?? null, i.comboId ?? null, bottleId, i.wornAt.replace('T', ' ').slice(0, 16), i.timeOfDay ?? timeOfDayFor(hour), i.sprays,
    i.activity?.trim() || null, i.temperatureC ?? null, i.humidity ?? null, i.weather?.trim() || null, i.projection ?? null,
    i.longevityHours ?? null, i.compliments ?? 0, i.notes?.trim() || null, backfilled ? 1 : 0
  ]
}

export function logWear(db: Db, input: WearInput, now = new Date()): Result<WearLogged> {
  return toResult(() =>
    db.transaction(() => {
      validate(input)
      const exists =
        input.fragranceId != null
          ? db.prepare('SELECT 1 FROM fragrances WHERE id = ?').get(input.fragranceId)
          : db.prepare('SELECT 1 FROM layer_combos WHERE id = ?').get(input.comboId)
      if (!exists) throw new AppError('NOT_FOUND', 'That fragrance was not found.')
      const warningsLater: LowBottleWarning[] = []
      const backfilled = isBackfilled(input, now)
      const take = input.takeFromBottle ?? !backfilled
      const id = Number(
        db.prepare(`INSERT INTO wear_log (${COLUMNS}) VALUES (${COLUMNS.split(',').map(() => '?').join(',')})`).run(...insertParams(input, input.fragranceId != null && take ? (input.bottleId ?? null) : null, backfilled)).lastInsertRowid
      )
      warningsLater.push(...applyDeductions(db, id, input, take))
      // Remember the bottle actually used when none was chosen.
      if (input.fragranceId != null && input.bottleId == null && take) {
        const used = db.prepare('SELECT bottle_id FROM wear_deductions WHERE wear_id = ? LIMIT 1').get(id) as { bottle_id: number } | undefined
        if (used) db.prepare('UPDATE wear_log SET bottle_id = ? WHERE id = ?').run(used.bottle_id, id)
      }
      return { id, warnings: warningsLater }
    })()
  )
}

export function updateWear(db: Db, id: number, input: WearInput, now = new Date()): Result<null> {
  return toResult(() => {
    db.transaction(() => {
      validate(input)
      const old = db.prepare('SELECT fragrance_id, layer_combo_id FROM wear_log WHERE id = ?').get(id) as { fragrance_id: number | null; layer_combo_id: number | null } | undefined
      if (!old) throw new AppError('NOT_FOUND', 'Wear not found.')
      if (old.fragrance_id !== (input.fragranceId ?? null) || old.layer_combo_id !== (input.comboId ?? null)) {
        throw new AppError('INVALID', 'You cannot change which fragrance a wear was for. Delete it and log a new one.')
      }
      restore(db, id)
      const backfilled = isBackfilled(input, now)
      const take = input.takeFromBottle ?? !backfilled
      db.prepare(
        `UPDATE wear_log SET bottle_id = ?, worn_at = ?, time_of_day = ?, sprays = ?, activity = ?, temperature_c = ?, humidity = ?, weather = ?,
           projection = ?, longevity_hours = ?, compliments = ?, notes = ?, backfilled = ? WHERE id = ?`
      ).run(...insertParams(input, input.fragranceId != null && take ? (input.bottleId ?? null) : null, backfilled).slice(2), id)
      applyDeductions(db, id, input, take)
      if (input.fragranceId != null && input.bottleId == null && take) {
        const used = db.prepare('SELECT bottle_id FROM wear_deductions WHERE wear_id = ? LIMIT 1').get(id) as { bottle_id: number } | undefined
        db.prepare('UPDATE wear_log SET bottle_id = ? WHERE id = ?').run(used?.bottle_id ?? null, id)
      }
    })()
    return null
  })
}

export function deleteWear(db: Db, id: number): Result<null> {
  return toResult(() => {
    db.transaction(() => {
      restore(db, id)
      db.prepare('DELETE FROM wear_log WHERE id = ?').run(id)
    })()
    return null
  })
}

interface WearRow {
  id: number
  fragrance_id: number | null
  layer_combo_id: number | null
  bottle_id: number | null
  worn_at: string
  time_of_day: TimeOfDay | null
  sprays: number
  activity: string | null
  temperature_c: number | null
  humidity: number | null
  weather: string | null
  projection: number | null
  longevity_hours: number | null
  compliments: number
  notes: string | null
  title: string | null
  house: string | null
  ml: number
  backfilled: number
}

const WEAR_SELECT = `
SELECT w.id, w.fragrance_id, w.layer_combo_id, w.bottle_id, w.worn_at, w.time_of_day, w.sprays, w.activity, w.temperature_c, w.humidity,
       w.weather, w.projection, w.longevity_hours, w.compliments, w.notes,
       CASE WHEN w.fragrance_id IS NOT NULL THEN f.name
            ELSE (SELECT group_concat(f2.name, ' + ') FROM layer_combo_items ci JOIN fragrances f2 ON f2.id = ci.fragrance_id WHERE ci.combo_id = w.layer_combo_id) END AS title,
       f.house AS house,
       coalesce((SELECT sum(ml) FROM wear_deductions d WHERE d.wear_id = w.id), 0) AS ml, w.backfilled AS backfilled
FROM wear_log w LEFT JOIN fragrances f ON f.id = w.fragrance_id`

/** Rows to entries. A layer combo's members are looked up in one query for all rows. */
function toEntries(db: Db, rows: WearRow[]): WearEntry[] {
  const comboIds = [...new Set(rows.map((r) => r.layer_combo_id).filter((x): x is number => x != null))]
  const members = new Map<number, number[]>()
  if (comboIds.length > 0) {
    const found = db
      .prepare(`SELECT combo_id, fragrance_id FROM layer_combo_items WHERE combo_id IN (${comboIds.map(() => '?').join(',')}) ORDER BY position`)
      .all(...comboIds) as { combo_id: number; fragrance_id: number }[]
    for (const m of found) members.set(m.combo_id, [...(members.get(m.combo_id) ?? []), m.fragrance_id])
  }
  return rows.map((r) => ({
    id: r.id, fragranceId: r.fragrance_id, comboId: r.layer_combo_id, title: r.title ?? 'Unknown', house: r.house, bottleId: r.bottle_id,
    wornAt: r.worn_at, timeOfDay: r.time_of_day, sprays: r.sprays, activity: r.activity, temperatureC: r.temperature_c, humidity: r.humidity,
    weather: r.weather, projection: r.projection, longevityHours: r.longevity_hours, compliments: r.compliments, notes: r.notes, mlUsed: r.ml,
    backfilled: r.backfilled === 1,
    memberIds: r.fragrance_id != null ? [r.fragrance_id] : (members.get(r.layer_combo_id ?? -1) ?? [])
  }))
}

export function listWears(db: Db, filter: { fragranceId?: number; limit?: number } = {}): WearEntry[] {
  const where = filter.fragranceId != null ? 'WHERE w.fragrance_id = ?' : ''
  const sql = `${WEAR_SELECT} ${where} ORDER BY w.worn_at DESC, w.id DESC LIMIT ${Math.min(filter.limit ?? 200, 2000)}`
  const rows = (filter.fragranceId != null ? db.prepare(sql).all(filter.fragranceId) : db.prepare(sql).all()) as WearRow[]
  return toEntries(db, rows)
}

/** Wears between two local dates ('YYYY-MM-DD', inclusive), oldest first. */
export function listWearsRange(db: Db, from: string, to: string): WearEntry[] {
  const rows = db
    .prepare(`${WEAR_SELECT} WHERE substr(w.worn_at, 1, 10) BETWEEN ? AND ? ORDER BY w.worn_at, w.id`)
    .all(from, to) as WearRow[]
  return toEntries(db, rows)
}

// ---- "how long did it last?" follow-ups --------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0')
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const END_OF_DAY_HOUR = 20

/** A wear is due for a follow-up once its day is over: any earlier day, or after 8 pm on the same day. */
export function isFollowUpDue(wornAt: string, now: Date): boolean {
  const day = wornAt.slice(0, 10)
  const today = localDate(now)
  if (day < today) return true
  return day === today && now.getHours() >= END_OF_DAY_HOUR
}

export function pendingFollowUps(db: Db, now = new Date()): WearEntry[] {
  const rows = db
    .prepare(`${WEAR_SELECT} WHERE w.longevity_hours IS NULL AND w.followup_dismissed = 0 AND w.backfilled = 0 AND w.fragrance_id IS NOT NULL ORDER BY w.worn_at`)
    .all() as WearRow[]
  return toEntries(db, rows.filter((r) => isFollowUpDue(r.worn_at, now)))
}

export function completeFollowUp(db: Db, id: number, input: FollowUpInput): Result<null> {
  return toResult(() => {
    if (input.longevityHours != null && !(input.longevityHours >= 0 && input.longevityHours <= 72)) throw new AppError('INVALID', 'Longevity must be between 0 and 72 hours.')
    if (input.projection != null && !(Number.isInteger(input.projection) && input.projection >= 1 && input.projection <= 5)) throw new AppError('INVALID', 'Projection must be 1 to 5.')
    const r = db
      .prepare('UPDATE wear_log SET longevity_hours = ?, projection = coalesce(?, projection) WHERE id = ?')
      .run(input.longevityHours, input.projection ?? null, id)
    if (r.changes === 0) throw new AppError('NOT_FOUND', 'Wear not found.')
    return null
  })
}

export function dismissFollowUp(db: Db, id: number): Result<null> {
  return toResult(() => {
    db.prepare('UPDATE wear_log SET followup_dismissed = 1 WHERE id = ?').run(id)
    return null
  })
}
