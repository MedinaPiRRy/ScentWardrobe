import type {
  BottleInput,
  CatalogItem,
  FragranceInput,
  FragranceSummary,
  Placement,
  Result
} from '@shared/types'
import { accordColor } from '@shared/accordColors'
import type { Db } from './index'
import { applyMove, AppError, getSummary, toResult, type MoveOptions } from './repo'

const clean = (v: string | null | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

export function upsertNote(db: Db, name: string, family: string | null = null): number {
  const found = db.prepare('SELECT id FROM notes WHERE name = ?').get(name) as { id: number } | undefined
  if (found) return found.id
  return Number(db.prepare('INSERT INTO notes (name, family) VALUES (?, ?)').run(name, family).lastInsertRowid)
}

export function upsertAccord(db: Db, name: string, color: string = accordColor(name)): number {
  const found = db.prepare('SELECT id, color FROM accords WHERE name = ?').get(name) as { id: number; color: string } | undefined
  if (found) {
    if (found.color === '#888888' && color !== '#888888') db.prepare('UPDATE accords SET color = ? WHERE id = ?').run(color, found.id)
    return found.id
  }
  return Number(db.prepare('INSERT INTO accords (name, color) VALUES (?, ?)').run(name, color).lastInsertRowid)
}

function validate(input: FragranceInput): void {
  if (!input.name?.trim()) throw new AppError('INVALID', 'A fragrance needs a name.')
  if (!input.house?.trim()) throw new AppError('INVALID', 'A fragrance needs a house.')
  if (input.year != null && (!Number.isInteger(input.year) || input.year < 1700 || input.year > 2100)) {
    throw new AppError('INVALID', 'Year looks wrong.')
  }
  for (const a of input.accords) {
    if (!a.name.trim()) throw new AppError('INVALID', 'Every accord needs a name.')
    if (!(a.strength >= 0 && a.strength <= 100)) throw new AppError('INVALID', 'Accord strength must be 0-100.')
  }
}

/** Replaces the notes, accords and community data of a fragrance. */
function writeRelations(db: Db, id: number, input: FragranceInput): void {
  db.prepare('DELETE FROM fragrance_notes WHERE fragrance_id = ?').run(id)
  db.prepare('DELETE FROM fragrance_accords WHERE fragrance_id = ?').run(id)
  db.prepare('DELETE FROM fragrance_community WHERE fragrance_id = ?').run(id)

  const addNote = db.prepare('INSERT OR IGNORE INTO fragrance_notes (fragrance_id, note_id, layer) VALUES (?, ?, ?)')
  for (const n of input.notes) {
    const name = n.name.trim()
    if (!name) continue
    const noteId = upsertNote(db, name)
    if (n.iconPath) db.prepare('UPDATE notes SET icon_path = ? WHERE id = ? AND icon_path IS NULL').run(n.iconPath, noteId)
    addNote.run(id, noteId, n.layer)
  }
  const addAccord = db.prepare(
    'INSERT INTO fragrance_accords (fragrance_id, accord_id, strength) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET strength = excluded.strength'
  )
  for (const a of input.accords) addAccord.run(id, upsertAccord(db, a.name.trim(), a.color), Math.round(a.strength))

  const c = input.community
  if (c) {
    db.prepare(
      `INSERT INTO fragrance_community (fragrance_id, winter, spring, summer, fall, day, night, longevity, sillage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, c.winter, c.spring, c.summer, c.fall, c.day, c.night, c.longevity, c.sillage)
  }
}

const asDuplicate = (e: unknown): never => {
  if (e instanceof Error && /UNIQUE constraint failed: index 'ux_fragrance_identity'|ux_fragrance_identity/.test(e.message)) {
    throw new AppError('DUPLICATE', 'You already have a fragrance with this name, house and concentration.')
  }
  throw e
}

export function createFragrance(db: Db, input: FragranceInput, placement: Placement, opts: MoveOptions = {}): Result<FragranceSummary> {
  return toResult(() =>
    db.transaction(() => {
      validate(input)
      let id: number
      try {
        id = Number(
          db
            .prepare(
              `INSERT INTO fragrances (name, house, year, concentration, perfumers, gender, description, image_path, source_url)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              input.name.trim(), input.house.trim(), input.year ?? null, clean(input.concentration), clean(input.perfumers),
              clean(input.gender), clean(input.description), clean(input.imagePath), clean(input.sourceUrl)
            ).lastInsertRowid
        )
      } catch (e) {
        return asDuplicate(e)
      }
      writeRelations(db, id, input)
      return applyMove(db, { ...placement, fragranceId: id }, opts)
    })()
  )
}

/**
 * A fragrance I wore but do not own: it gets no wardrobe and is marked foreign, so it stays out of the shelves,
 * recommendations, layering and collection stats while still showing in the calendar and in searches.
 */
export function addForeignFragrance(db: Db, input: FragranceInput): Result<FragranceSummary> {
  return toResult(() =>
    db.transaction(() => {
      validate(input)
      const dupe = db
        .prepare('SELECT id FROM fragrances WHERE lower(name) = lower(?) AND lower(house) = lower(?) ORDER BY id LIMIT 1')
        .get(input.name.trim(), input.house.trim()) as { id: number } | undefined
      if (dupe) return getSummary(db, dupe.id)!
      let id: number
      try {
        id = Number(
          db
            .prepare(
              `INSERT INTO fragrances (name, house, year, concentration, perfumers, gender, description, image_path, source_url, is_foreign)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
            )
            .run(
              input.name.trim(), input.house.trim(), input.year ?? null, clean(input.concentration), clean(input.perfumers),
              clean(input.gender), clean(input.description), clean(input.imagePath), clean(input.sourceUrl)
            ).lastInsertRowid
        )
      } catch (e) {
        return asDuplicate(e)
      }
      writeRelations(db, id, input)
      return getSummary(db, id)!
    })()
  )
}

export function updateFragrance(db: Db, id: number, input: FragranceInput): Result<FragranceSummary> {
  return toResult(() =>
    db.transaction(() => {
      validate(input)
      try {
        const r = db
          .prepare(
            `UPDATE fragrances SET name = ?, house = ?, year = ?, concentration = ?, perfumers = ?, gender = ?,
               description = ?, image_path = coalesce(?, image_path), source_url = ?, updated_at = datetime('now')
             WHERE id = ?`
          )
          .run(
            input.name.trim(), input.house.trim(), input.year ?? null, clean(input.concentration), clean(input.perfumers),
            clean(input.gender), clean(input.description), clean(input.imagePath), clean(input.sourceUrl), id
          )
        if (r.changes === 0) throw new AppError('NOT_FOUND', 'Fragrance not found.')
      } catch (e) {
        return asDuplicate(e)
      }
      writeRelations(db, id, input)
      return getSummary(db, id)!
    })()
  )
}

export function deleteFragrance(db: Db, id: number): Result<null> {
  return toResult(() => {
    db.transaction(() => {
      // Wardrobe row first, so the wishlist triggers don't block the impression cascade.
      db.prepare('DELETE FROM wardrobe_items WHERE fragrance_id = ?').run(id)
      db.prepare('DELETE FROM fragrances WHERE id = ?').run(id)
      pruneBrokenCombos(db)
    })()
    return null
  })
}

export function setImpression(db: Db, id: number, text: string): Result<null> {
  return toResult(() => {
    db.prepare(
      `INSERT INTO smell_impression (fragrance_id, text) VALUES (?, ?)
       ON CONFLICT(fragrance_id) DO UPDATE SET text = excluded.text`
    ).run(id, text.trim())
    // Once there is a real note the item is an ordinary wishlist item again, and the wishlist rule applies to it.
    if (text.trim()) db.prepare('UPDATE wardrobe_items SET imported = 0 WHERE fragrance_id = ?').run(id)
    return null
  })
}

export function setRating(db: Db, id: number, rating: number | null): Result<null> {
  return toResult(() => {
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) {
      throw new AppError('INVALID', 'Rating must be a whole number from 1 to 10.')
    }
    const r = db.prepare('UPDATE wardrobe_items SET rating = ? WHERE fragrance_id = ?').run(rating, id)
    if (r.changes === 0) throw new AppError('NOT_FOUND', 'Add the fragrance to a wardrobe before rating it.')
    return null
  })
}

export function ownedWithNote(db: Db, noteId: number, excludeId: number): FragranceSummary[] {
  const ids = db
    .prepare(
      `SELECT DISTINCT fn.fragrance_id AS id FROM fragrance_notes fn
       JOIN wardrobe_items w ON w.fragrance_id = fn.fragrance_id AND w.wardrobe = 'collection'
       WHERE fn.note_id = ? AND fn.fragrance_id != ?`
    )
    .all(noteId, excludeId) as { id: number }[]
  return ids.map((r) => getSummary(db, r.id)!).sort((a, b) => a.name.localeCompare(b.name))
}

// ---- journal ---------------------------------------------------------------------------

export function addJournal(db: Db, fragranceId: number, text: string): Result<null> {
  return toResult(() => {
    if (!text.trim()) throw new AppError('INVALID', 'Write something first.')
    db.prepare('INSERT INTO personal_notes (fragrance_id, text) VALUES (?, ?)').run(fragranceId, text.trim())
    return null
  })
}

export function updateJournal(db: Db, entryId: number, text: string): Result<null> {
  return toResult(() => {
    if (!text.trim()) throw new AppError('INVALID', 'An entry cannot be empty. Delete it instead.')
    db.prepare('UPDATE personal_notes SET text = ? WHERE id = ?').run(text.trim(), entryId)
    return null
  })
}

export function deleteJournal(db: Db, entryId: number): Result<null> {
  return toResult(() => {
    db.prepare('DELETE FROM personal_notes WHERE id = ?').run(entryId)
    return null
  })
}

// ---- bottles ---------------------------------------------------------------------------

function checkBottle(b: BottleInput): void {
  if (!(b.sizeMl > 0)) throw new AppError('INVALID', 'Bottle size must be greater than 0 ml.')
  if (b.remainingMl != null && (b.remainingMl < 0 || b.remainingMl > b.sizeMl)) {
    throw new AppError('INVALID', 'Remaining amount must be between 0 and the bottle size.')
  }
  if (b.mlPerSpray != null && !(b.mlPerSpray > 0)) throw new AppError('INVALID', 'ml per spray must be greater than 0.')
  if (b.price != null && b.price < 0) throw new AppError('INVALID', 'Price cannot be negative.')
  if (b.marketPrice != null && !(b.marketPrice >= 0)) throw new AppError('INVALID', 'Market price cannot be negative.')
}

export function addBottle(db: Db, fragranceId: number, b: BottleInput): Result<null> {
  return toResult(() => {
    checkBottle(b)
    db.prepare(
      `INSERT INTO bottles (fragrance_id, type, size_ml, remaining_ml, ml_per_spray, purchase_date, price, bought_at, batch_code, opened_date, status, market_price, market_checked_on, market_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      fragranceId, b.type, b.sizeMl, b.remainingMl ?? b.sizeMl, b.mlPerSpray ?? 0.1, clean(b.purchaseDate), b.price ?? null,
      clean(b.boughtAt), clean(b.batchCode), clean(b.openedDate), b.status ?? 'active',
      b.marketPrice ?? null, b.marketPrice == null ? null : clean(b.marketCheckedOn), b.marketPrice == null ? null : clean(b.marketSource)
    )
    return null
  })
}

export function updateBottle(db: Db, bottleId: number, b: BottleInput): Result<null> {
  return toResult(() => {
    checkBottle(b)
    const r = db
      .prepare(
        `UPDATE bottles SET type = ?, size_ml = ?, remaining_ml = ?, ml_per_spray = ?, purchase_date = ?, price = ?,
           bought_at = ?, batch_code = ?, opened_date = ?, status = ?,
           market_price = ?, market_checked_on = ?, market_source = ? WHERE id = ?`
      )
      .run(
        b.type, b.sizeMl, b.remainingMl ?? b.sizeMl, b.mlPerSpray ?? 0.1, clean(b.purchaseDate), b.price ?? null,
        clean(b.boughtAt), clean(b.batchCode), clean(b.openedDate), b.status ?? 'active',
        b.marketPrice ?? null, b.marketPrice == null ? null : clean(b.marketCheckedOn), b.marketPrice == null ? null : clean(b.marketSource), bottleId
      )
    if (r.changes === 0) throw new AppError('NOT_FOUND', 'Bottle not found.')
    return null
  })
}

export function markBottleEmpty(db: Db, bottleId: number): Result<null> {
  return toResult(() => {
    db.prepare(`UPDATE bottles SET remaining_ml = 0, status = 'empty' WHERE id = ?`).run(bottleId)
    return null
  })
}

// ---- catalog (autocomplete) ------------------------------------------------------------

export const listNotes = (db: Db): CatalogItem[] =>
  db.prepare('SELECT id, name, family AS extra FROM notes ORDER BY name').all() as CatalogItem[]

export const listAccords = (db: Db): CatalogItem[] =>
  db.prepare('SELECT id, name, color AS extra FROM accords ORDER BY name').all() as CatalogItem[]

export function setImagePath(db: Db, id: number, file: string): Result<null> {
  return toResult(() => {
    const r = db.prepare(`UPDATE fragrances SET image_path = ?, updated_at = datetime('now') WHERE id = ?`).run(file, id)
    if (r.changes === 0) throw new AppError('NOT_FOUND', 'Fragrance not found.')
    return null
  })
}

/** A blend needs at least two fragrances; drop saved blends that lost members when fragrances were deleted. */
export function pruneBrokenCombos(db: Db): void {
  db.prepare('DELETE FROM layer_combos WHERE (SELECT count(*) FROM layer_combo_items WHERE combo_id = layer_combos.id) < 2').run()
}

export function setDefaultSprays(db: Db, entries: { fragranceId: number; sprays: number | null }[]): Result<null> {
  return toResult(() => {
    for (const e of entries) {
      if (e.sprays !== null && !(Number.isInteger(e.sprays) && e.sprays >= 1 && e.sprays <= 60)) {
        throw new AppError('INVALID', 'Sprays must be a whole number from 1 to 60.')
      }
    }
    const upd = db.prepare('UPDATE fragrances SET default_sprays = ? WHERE id = ?')
    db.transaction(() => entries.forEach((e) => upd.run(e.sprays, e.fragranceId)))()
    return null
  })
}
