import type { ComboInput, Result, SavedCombo } from '@shared/types'
import type { LayerItem, RatedCombo } from '@shared/layering/types'
import { projectionToSillageRating } from '@shared/performance'
import type { Db } from './index'
import { AppError, toResult } from './repo'

const MIN_RATED_WEARS = 2

/** The collection as input for the layering engine. */
export function layerCandidates(db: Db): LayerItem[] {
  const frags = db
    .prepare(
      `SELECT f.id, f.name, f.house FROM fragrances f JOIN wardrobe_items w ON w.fragrance_id = f.id AND w.wardrobe = 'collection'
       ORDER BY f.house, f.name`
    )
    .all() as { id: number; name: string; house: string }[]

  const accords = db.prepare(`SELECT a.name, fa.strength FROM fragrance_accords fa JOIN accords a ON a.id = fa.accord_id WHERE fa.fragrance_id = ? ORDER BY fa.strength DESC`)
  const notes = db.prepare(`SELECT n.name, n.family, fn.layer FROM fragrance_notes fn JOIN notes n ON n.id = fn.note_id WHERE fn.fragrance_id = ?`)
  const community = db.prepare('SELECT winter, spring, summer, fall, day, night, sillage FROM fragrance_community WHERE fragrance_id = ?')
  const mine = db.prepare('SELECT avg(projection) AS p, count(projection) AS n FROM wear_log WHERE fragrance_id = ?')

  return frags.map((f) => {
    const c = community.get(f.id) as { winter: number; spring: number; summer: number; fall: number; day: number; night: number; sillage: number | null } | undefined
    const m = mine.get(f.id) as { p: number | null; n: number }
    const projection = m.n >= MIN_RATED_WEARS && m.p != null ? projectionToSillageRating(m.p) : (c?.sillage ?? null)
    return {
      id: f.id,
      name: f.name,
      house: f.house,
      accords: accords.all(f.id) as { name: string; strength: number }[],
      notes: (notes.all(f.id) as { name: string; family: string | null; layer: 'top' | 'heart' | 'base' | 'general' }[]).map((n) => ({ name: n.name, layer: n.layer, family: n.family })),
      seasons: c ? { winter: c.winter, spring: c.spring, summer: c.summer, fall: c.fall } : null,
      daynight: c ? { day: c.day, night: c.night } : null,
      projection
    }
  })
}

export function ratedHistory(db: Db): RatedCombo[] {
  const combos = db.prepare('SELECT id, my_rating AS rating FROM layer_combos WHERE my_rating IS NOT NULL').all() as { id: number; rating: number }[]
  const items = db.prepare(
    `SELECT a.name, fa.strength FROM layer_combo_items ci
     JOIN fragrance_accords fa ON fa.fragrance_id = ci.fragrance_id JOIN accords a ON a.id = fa.accord_id
     WHERE ci.combo_id = ? AND ci.fragrance_id = ?`
  )
  const members = db.prepare('SELECT fragrance_id FROM layer_combo_items WHERE combo_id = ? ORDER BY position')
  return combos.map((c) => ({
    rating: c.rating,
    items: (members.all(c.id) as { fragrance_id: number }[]).map((m) => ({ accords: items.all(c.id, m.fragrance_id) as { name: string; strength: number }[] }))
  }))
}

const ratioOf = (sprays: number[]) => sprays.join(':')

export function listCombos(db: Db): SavedCombo[] {
  const rows = db.prepare('SELECT id, spray_ratio, predicted_score, my_rating, notes, created_at FROM layer_combos ORDER BY id DESC').all() as {
    id: number
    spray_ratio: string | null
    predicted_score: number | null
    my_rating: number | null
    notes: string | null
    created_at: string
  }[]
  const items = db.prepare(
    `SELECT ci.fragrance_id AS fragranceId, f.name, f.house, ci.spray_weight AS sprays, ci.position
     FROM layer_combo_items ci JOIN fragrances f ON f.id = ci.fragrance_id WHERE ci.combo_id = ? ORDER BY ci.position`
  )
  return rows.map((r) => ({
    id: r.id,
    items: items.all(r.id) as SavedCombo['items'],
    sprayRatio: r.spray_ratio ?? '',
    predictedScore: r.predicted_score,
    myRating: r.my_rating,
    notes: r.notes,
    createdAt: r.created_at
  }))
}

export function saveCombo(db: Db, input: ComboInput): Result<{ id: number; existing: boolean }> {
  return toResult(() =>
    db.transaction(() => {
      const items = input.items
      if (items.length < 2 || items.length > 3) throw new AppError('INVALID', 'A combo needs 2 or 3 fragrances.')
      if (new Set(items.map((i) => i.fragranceId)).size !== items.length) throw new AppError('INVALID', 'Each fragrance can only appear once in a combo.')
      if (items.some((i) => !Number.isInteger(i.sprays) || i.sprays < 1 || i.sprays > 20)) throw new AppError('INVALID', 'Sprays must be whole numbers from 1 to 20.')
      for (const i of items) if (!db.prepare('SELECT 1 FROM fragrances WHERE id = ?').get(i.fragranceId)) throw new AppError('NOT_FOUND', 'One of the fragrances no longer exists.')

      // The same fragrances in the same order and ratio are the same combo.
      const signature = items.map((i) => `${i.fragranceId}x${i.sprays}`).join(',')
      for (const c of listCombos(db)) {
        if (c.items.map((i) => `${i.fragranceId}x${i.sprays}`).join(',') === signature) {
          if (input.predictedScore != null) db.prepare('UPDATE layer_combos SET predicted_score = ? WHERE id = ?').run(Math.round(input.predictedScore), c.id)
          return { id: c.id, existing: true }
        }
      }
      const id = Number(
        db
          .prepare('INSERT INTO layer_combos (spray_ratio, predicted_score, notes) VALUES (?, ?, ?)')
          .run(ratioOf(items.map((i) => i.sprays)), input.predictedScore != null ? Math.round(input.predictedScore) : null, input.notes?.trim() || null).lastInsertRowid
      )
      const add = db.prepare('INSERT INTO layer_combo_items (combo_id, fragrance_id, position, spray_weight) VALUES (?, ?, ?, ?)')
      items.forEach((i, pos) => add.run(id, i.fragranceId, pos, i.sprays))
      return { id, existing: false }
    })()
  )
}

export function rateCombo(db: Db, id: number, rating: number | null, notes?: string | null): Result<null> {
  return toResult(() => {
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 10)) throw new AppError('INVALID', 'Rating must be a whole number from 1 to 10.')
    const r = db
      .prepare('UPDATE layer_combos SET my_rating = ?, notes = CASE WHEN ? IS NULL THEN notes ELSE nullif(trim(?), \'\') END WHERE id = ?')
      .run(rating, notes ?? null, notes ?? null, id)
    if (r.changes === 0) throw new AppError('NOT_FOUND', 'Combo not found.')
    return null
  })
}

export function deleteCombo(db: Db, id: number): Result<null> {
  return toResult(() => {
    db.prepare('DELETE FROM layer_combos WHERE id = ?').run(id)
    return null
  })
}
