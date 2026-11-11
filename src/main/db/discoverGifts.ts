import type { GiftItem, GiftList } from '@shared/discover/dto'
import type { Result } from '@shared/types'
import type { Db } from '../db'
import { toCsv } from './exportCsv'
import { toResult } from './repo'

interface ListRow {
  id: number
  name: string
  persona: string
  updated_at: string
}

const parse = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export function listGiftLists(db: Db): GiftList[] {
  const items = db.prepare('SELECT list_id AS listId, key, name, house, note FROM discover_gift_items ORDER BY position, rowid')
  const all = items.all() as (GiftItem & { listId: number })[]
  return (db.prepare('SELECT id, name, persona, updated_at FROM discover_gift_lists ORDER BY lower(name)').all() as ListRow[]).map((l) => ({
    id: l.id,
    name: l.name,
    persona: parse(l.persona),
    items: all.filter((i) => i.listId === l.id).map(({ key, name, house, note }) => ({ key, name, house, note })),
    updatedAt: l.updated_at
  }))
}

const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.trim().slice(0, max) : '')

/** Creates the list (by name) if it is new, optionally remembering the description it was made from, and adds one fragrance to it. */
export function addToGiftList(db: Db, req: { name: string; persona?: unknown; item?: { key: string; name: string; house: string; note?: string | null } }): Result<GiftList[]> {
  return toResult(() => {
    const name = clean(req.name, 60)
    if (!name) throw new Error('Give the list a name, such as "Mum, birthday".')
    db.transaction(() => {
      db.prepare(`INSERT INTO discover_gift_lists (name, persona) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET updated_at = datetime('now'), persona = CASE WHEN ? THEN excluded.persona ELSE persona END`).run(
        name,
        JSON.stringify(req.persona ?? {}),
        req.persona === undefined ? 0 : 1
      )
      const id = (db.prepare('SELECT id FROM discover_gift_lists WHERE name = ?').get(name) as { id: number }).id
      if (req.item) {
        const n = (db.prepare('SELECT count(*) AS c FROM discover_gift_items WHERE list_id = ?').get(id) as { c: number }).c
        if (n >= 100) throw new Error('A list holds up to 100 fragrances.')
        const key = clean(req.item.key, 200)
        if (!key) throw new Error('That fragrance could not be added.')
        db.prepare('INSERT OR IGNORE INTO discover_gift_items (list_id, key, name, house, note, position) VALUES (?, ?, ?, ?, ?, ?)').run(id, key, clean(req.item.name, 200), clean(req.item.house, 200), clean(req.item.note, 300) || null, n)
      }
    })()
    return listGiftLists(db)
  })
}

export function removeFromGiftList(db: Db, listId: number, key: string): Result<GiftList[]> {
  return toResult(() => {
    db.prepare('DELETE FROM discover_gift_items WHERE list_id = ? AND key = ?').run(listId, key)
    return listGiftLists(db)
  })
}

export function deleteGiftList(db: Db, listId: number): Result<GiftList[]> {
  return toResult(() => {
    db.prepare('DELETE FROM discover_gift_lists WHERE id = ?').run(listId)
    return listGiftLists(db)
  })
}

/** One row of an exported result list, as the window sends it. Only plain values: the file is built here, not in the window. */
export interface ExportRow {
  name: string
  house: string
  year?: number | null
  concentration?: string | null
  score?: number | null
  reasons?: string[]
  inWardrobes?: string[]
  sourceUrl?: string | null
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function resultsCsv(title: string, rows: ExportRow[]): { csv: string; rows: number } {
  const safe = rows.slice(0, 500)
  const header = ['Name', 'House', 'Year', 'Concentration', 'Score', 'Why', 'Already in my', 'Fragrantica page']
  const body = safe.map((r) => [str(r.name, 200), str(r.house, 200), num(r.year), str(r.concentration, 50), num(r.score), (Array.isArray(r.reasons) ? r.reasons : []).map((x) => str(x, 300)).join(' | '), (Array.isArray(r.inWardrobes) ? r.inWardrobes : []).map((x) => str(x, 40)).join(', '), /^https:\/\/([a-z0-9-]+\.)*fragrantica\.[a-z.]+\//i.test(str(r.sourceUrl, 400)) ? str(r.sourceUrl, 400) : ''])
  return { csv: toCsv([[`Scent Wardrobe: ${str(title, 100)}`], header, ...body]), rows: safe.length }
}

export function giftListCsv(list: GiftList): string {
  return toCsv([[`Gift list: ${list.name}`], ['Name', 'House', 'Note'], ...list.items.map((i) => [i.name, i.house, i.note])])
}
