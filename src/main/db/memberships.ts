import type { FragranceSummary, HadReason, MoveRequest, Result, WardrobeKind } from '@shared/types'
import { sortWardrobes, WARDROBE_NAME } from '@shared/wardrobes'
import type { Db } from './index'
import { AppError, getSummary, toResult } from './repo'

const IMPRESSION_MESSAGE = 'Describe what it smells like to you before adding this fragrance to the wishlist.'

export interface MoveOptions {
  /**
   * Importers only: allows a wishlist membership without a smell note and marks it, so it shows as "needs a note".
   * The renderer cannot set this (the IPC handler never passes it), so the wishlist rule still holds for everything
   * added by hand.
   */
  imported?: boolean
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

export function wardrobesOf(db: Db, fragranceId: number): WardrobeKind[] {
  const rows = db.prepare('SELECT wardrobe FROM wardrobe_memberships WHERE fragrance_id = ?').all(fragranceId) as { wardrobe: WardrobeKind }[]
  return sortWardrobes(rows.map((r) => r.wardrobe))
}

const names = (list: WardrobeKind[]) => list.map((w) => WARDROBE_NAME[w]).join(', ')

/** Moving an item out of Had into the collection turns its Had details into a "previous bottle" record. */
function archiveHadDetails(db: Db, fragranceId: number): void {
  const w = db.prepare("SELECT had_years, had_memory, had_reason FROM wardrobe_memberships WHERE fragrance_id = ? AND wardrobe = 'had'").get(fragranceId) as
    | { had_years: string | null; had_memory: string | null; had_reason: HadReason | null }
    | undefined
  if (w && (w.had_years || w.had_memory || w.had_reason)) {
    db.prepare('INSERT INTO past_bottles (fragrance_id, years, memory, reason) VALUES (?, ?, ?, ?)').run(fragranceId, w.had_years, w.had_memory, w.had_reason)
  }
}

/**
 * Adds a membership. `leaving` is a wardrobe that is being left in the same step (a move), so it does not count as a
 * conflict. Throws; call inside a transaction.
 */
function add(db: Db, req: MoveRequest, opts: MoveOptions, leaving: WardrobeKind | null): void {
  const to = req.to
  const have = wardrobesOf(db, req.fragranceId).filter((w) => w !== leaving)
  const others = have.filter((w) => w !== to)

  // Garbage Perfumes is exclusive: a disliked fragrance is not also something I own or want.
  if (to === 'garbage' && others.length > 0) {
    if (!req.confirmExclusive) throw new AppError('GARBAGE_CONFLICT', `It is also in ${names(others)}. A fragrance in Garbage Perfumes cannot be in another wardrobe at the same time. Confirm to remove it from ${names(others)}.`)
    for (const w of others) rememberAndDelete(db, req.fragranceId, w)
  }
  if (to !== 'garbage' && have.includes('garbage')) {
    if (!req.confirmExclusive) throw new AppError('GARBAGE_CONFLICT', `It is in Garbage Perfumes. Adding it to ${WARDROBE_NAME[to]} takes it out of the bin. Confirm to continue.`)
    rememberAndDelete(db, req.fragranceId, 'garbage')
  }

  let imported = 0
  if (to === 'wishlist') {
    const text = req.impression?.trim()
    if (text) {
      db.prepare(
        `INSERT INTO smell_impression (fragrance_id, text) VALUES (?, ?)
         ON CONFLICT(fragrance_id) DO UPDATE SET text = excluded.text`
      ).run(req.fragranceId, text)
    }
    const has = db.prepare('SELECT 1 FROM smell_impression WHERE fragrance_id = ? AND length(trim(text)) > 0').get(req.fragranceId)
    if (!has) {
      if (!opts.imported) throw new AppError('WISHLIST_IMPRESSION_REQUIRED', IMPRESSION_MESSAGE)
      imported = 1
    }
  }

  if (to === 'collection') {
    const active = db.prepare(`SELECT 1 FROM bottles WHERE fragrance_id = ? AND status = 'active'`).get(req.fragranceId)
    if (!active) {
      const b = req.bottle
      if (!b) throw new AppError('BOTTLE_REQUIRED', 'Choose a bottle type and size to add this to your collection.')
      if (!(b.sizeMl > 0)) throw new AppError('INVALID', 'Bottle size must be greater than 0 ml.')
      const remaining = Math.min(Math.max(b.remainingMl ?? b.sizeMl, 0), b.sizeMl)
      if (b.price != null && !(Number.isFinite(b.price) && b.price >= 0)) throw new AppError('INVALID', 'The price must be 0 or more.')
      db.prepare('INSERT INTO bottles (fragrance_id, type, size_ml, remaining_ml, price, bought_at, purchase_date) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        req.fragranceId, b.type, b.sizeMl, remaining, b.price ?? null, clean(b.boughtAt), clean(b.purchaseDate)
      )
    }
    if (leaving === 'had') archiveHadDetails(db, req.fragranceId)
  }

  db.prepare('UPDATE fragrances SET is_foreign = 0 WHERE id = ?').run(req.fragranceId)

  const created = !db.prepare('SELECT 1 FROM wardrobe_memberships WHERE fragrance_id = ? AND wardrobe = ?').get(req.fragranceId, to)
  const position = (db.prepare('SELECT coalesce(max(shelf_position), -1) + 1 AS p FROM wardrobe_memberships WHERE wardrobe = ?').get(to) as { p: number }).p
  db.prepare(
    `INSERT INTO wardrobe_memberships (fragrance_id, wardrobe, shelf_position, desired_size_ml, imported)
     VALUES (@id, @to, @pos, @desired, @imported)
     ON CONFLICT(fragrance_id, wardrobe) DO UPDATE SET
       desired_size_ml = CASE WHEN excluded.wardrobe = 'wishlist' THEN coalesce(excluded.desired_size_ml, wardrobe_memberships.desired_size_ml) ELSE wardrobe_memberships.desired_size_ml END,
       imported = excluded.imported`
  ).run({ id: req.fragranceId, to, pos: position, desired: req.desiredSizeMl ?? null, imported })

  // Wardrobe-specific notes belong to that membership. A returning fragrance gets its old notes back.
  const mem = db.prepare('SELECT dislike_note, had_years, had_memory, had_reason FROM membership_memory WHERE fragrance_id = ? AND wardrobe = ?').get(req.fragranceId, to) as
    | { dislike_note: string | null; had_years: string | null; had_memory: string | null; had_reason: HadReason | null }
    | undefined
  if (mem && created) {
    if (to === 'garbage' && req.dislikeNote === undefined) db.prepare("UPDATE wardrobe_memberships SET dislike_note = ? WHERE fragrance_id = ? AND wardrobe = 'garbage'").run(mem.dislike_note, req.fragranceId)
    if (to === 'had' && !req.had) db.prepare("UPDATE wardrobe_memberships SET had_years = ?, had_memory = ?, had_reason = ? WHERE fragrance_id = ? AND wardrobe = 'had'").run(mem.had_years, mem.had_memory, mem.had_reason, req.fragranceId)
  }
  if (to === 'garbage' && req.dislikeNote !== undefined) {
    db.prepare("UPDATE wardrobe_memberships SET dislike_note = ? WHERE fragrance_id = ? AND wardrobe = 'garbage'").run(clean(req.dislikeNote), req.fragranceId)
  }
  if (to === 'had' && req.had) {
    db.prepare("UPDATE wardrobe_memberships SET had_years = ?, had_memory = ?, had_reason = ? WHERE fragrance_id = ? AND wardrobe = 'had'").run(
      clean(req.had.years), clean(req.had.memory), req.had.reason ?? null, req.fragranceId
    )
  }
}

/** Keeps the notes of a wardrobe that is being left, so they are there again if the fragrance comes back. */
function rememberAndDelete(db: Db, fragranceId: number, wardrobe: WardrobeKind, keepNotes = true): void {
  if (keepNotes && (wardrobe === 'garbage' || wardrobe === 'had')) {
    db.prepare(
      `INSERT INTO membership_memory (fragrance_id, wardrobe, dislike_note, had_years, had_memory, had_reason)
       SELECT fragrance_id, wardrobe, dislike_note, had_years, had_memory, had_reason FROM wardrobe_memberships
       WHERE fragrance_id = ? AND wardrobe = ? AND (dislike_note IS NOT NULL OR had_years IS NOT NULL OR had_memory IS NOT NULL OR had_reason IS NOT NULL)
       ON CONFLICT(fragrance_id, wardrobe) DO UPDATE SET dislike_note = excluded.dislike_note, had_years = excluded.had_years, had_memory = excluded.had_memory, had_reason = excluded.had_reason`
    ).run(fragranceId, wardrobe)
  }
  db.prepare('DELETE FROM wardrobe_memberships WHERE fragrance_id = ? AND wardrobe = ?').run(fragranceId, wardrobe)
}

/** Removes one membership, if it is not the last. The fragrance, its bottles, wears and notes are untouched. */
function remove(db: Db, fragranceId: number, wardrobe: WardrobeKind): void {
  const have = wardrobesOf(db, fragranceId)
  if (!have.includes(wardrobe)) throw new AppError('NOT_FOUND', `It is not in ${WARDROBE_NAME[wardrobe]}.`)
  if (have.length === 1) throw new AppError('INVALID', `${WARDROBE_NAME[wardrobe]} is its only wardrobe. Move it to another one, or delete the fragrance.`)
  rememberAndDelete(db, fragranceId, wardrobe)
}

/**
 * Puts a fragrance in a wardrobe. Without `from` it is added next to the wardrobes it is already in; with `from` it is
 * moved (added to `to`, removed from `from`, in one step). History (wears, notes, bottles) is untouched because it hangs
 * off the fragrance, not the wardrobe. Throwing variant, for use inside larger transactions.
 */
export function applyMove(db: Db, req: MoveRequest, opts: MoveOptions = {}): FragranceSummary {
  const exists = db.prepare('SELECT 1 FROM fragrances WHERE id = ?').get(req.fragranceId)
  if (!exists) throw new AppError('NOT_FOUND', 'Fragrance not found.')
  db.transaction(() => {
    if (req.from && req.from !== req.to) {
      if (!wardrobesOf(db, req.fragranceId).includes(req.from)) throw new AppError('NOT_FOUND', `It is not in ${WARDROBE_NAME[req.from]}.`)
      add(db, req, opts, req.from)
      // Had -> Collection turns the Had details into a previous-bottle record, so they are not remembered twice.
      rememberAndDelete(db, req.fragranceId, req.from, !(req.from === 'had' && req.to === 'collection'))
    } else {
      add(db, req, opts, null)
    }
  })()
  return getSummary(db, req.fragranceId)!
}

export function moveToWardrobe(db: Db, req: MoveRequest): Result<FragranceSummary> {
  return toResult(() => applyMove(db, req))
}

export function removeFromWardrobe(db: Db, fragranceId: number, wardrobe: WardrobeKind): Result<FragranceSummary> {
  return toResult(() => {
    db.transaction(() => remove(db, fragranceId, wardrobe))()
    return getSummary(db, fragranceId)!
  })
}

/** Edits the notes that belong to a wardrobe: why I dislike it (Garbage) or the Had details. */
export function setWardrobeDetails(db: Db, fragranceId: number, d: { dislikeNote?: string | null; had?: { years?: string | null; memory?: string | null; reason?: HadReason | null } }): Result<null> {
  return toResult(() => {
    const have = wardrobesOf(db, fragranceId)
    if (have.length === 0) throw new AppError('NOT_FOUND', 'That fragrance is not in a wardrobe.')
    if (d.dislikeNote !== undefined) {
      if (!have.includes('garbage')) throw new AppError('NOT_FOUND', 'It is not in Garbage Perfumes.')
      db.prepare("UPDATE wardrobe_memberships SET dislike_note = ? WHERE fragrance_id = ? AND wardrobe = 'garbage'").run(clean(d.dislikeNote), fragranceId)
    }
    if (d.had) {
      if (!have.includes('had')) throw new AppError('NOT_FOUND', 'It is not in Had.')
      if (d.had.reason && !['finished', 'sold', 'gifted'].includes(d.had.reason)) throw new AppError('INVALID', 'Choose finished, sold or gifted.')
      db.prepare("UPDATE wardrobe_memberships SET had_years = ?, had_memory = ?, had_reason = ? WHERE fragrance_id = ? AND wardrobe = 'had'").run(
        clean(d.had.years), clean(d.had.memory), d.had.reason ?? null, fragranceId
      )
    }
    return null
  })
}

export function reorderWardrobe(db: Db, wardrobe: WardrobeKind, orderedIds: number[]): Result<null> {
  return toResult(() => {
    const upd = db.prepare('UPDATE wardrobe_memberships SET shelf_position = ? WHERE fragrance_id = ? AND wardrobe = ?')
    db.transaction(() => orderedIds.forEach((id, i) => upd.run(i, id, wardrobe)))()
    return null
  })
}
