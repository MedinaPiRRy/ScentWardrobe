import type { ColumnMapping, FragranceInput, ImportPreview, ImportResult, LocalHit, WardrobeKind } from '@shared/types'
import type { Db } from '../db'
import { normalize, prepare, score, tokens, type Searchable } from './fuzzy'
import { isFragranticaDump, mapDumpRecord, mapRow, type MappedEntry } from './mapping'
import { openSource, type Source } from './sources'

interface IndexRow {
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  popularity: number
  s: Searchable
}

let index: IndexRow[] | null = null
let indexedFor: Db | null = null

const dropIndex = () => {
  index = null
}

function getIndex(db: Db): IndexRow[] {
  if (!index || indexedFor !== db) {
    const rows = db.prepare('SELECT id, name, house, year, concentration, popularity FROM catalog_fragrances').all() as Omit<IndexRow, 's'>[]
    index = rows.map((r) => ({ ...r, s: prepare(r.name, r.house) }))
    indexedFor = db
  }
  return index
}

export function datasetCount(db: Db): number {
  return (db.prepare('SELECT count(*) AS c FROM catalog_fragrances').get() as { c: number }).c
}

const keyOf = (name: string, house: string) => `${normalize(name)}|${normalize(house)}`

/** Small boost for well-known fragrances so "sauvage" lists Dior's before obscure namesakes. Up to +0.15. */
const popularityBonus = (p: number) => Math.min(Math.log10(1 + p) / 6, 1) * 0.15

/** Fuzzy search over my own fragrances (first) and the imported dataset. */
export function searchLocal(db: Db, query: string, limit = 30): LocalHit[] {
  const q = tokens(query)
  if (q.length === 0) return []

  const mine: LocalHit[] = []
  const rows = db
    .prepare(
      `SELECT f.id, f.name, f.house, f.year, f.concentration, w.wardrobe, w.dislike_note AS dislikeNote
       FROM fragrances f LEFT JOIN wardrobe_items w ON w.fragrance_id = f.id`
    )
    .all() as { id: number; name: string; house: string; year: number | null; concentration: string | null; wardrobe: WardrobeKind | null; dislikeNote: string | null }[]
  const mineKeys = new Set<string>()
  for (const r of rows) {
    const sc = score(q, prepare(r.name, r.house))
    if (sc > 0) {
      mine.push({ source: 'mine', id: r.id, name: r.name, house: r.house, year: r.year, concentration: r.concentration, wardrobe: r.wardrobe, dislikeNote: r.wardrobe === 'garbage' ? r.dislikeNote : null, score: sc })
      mineKeys.add(keyOf(r.name, r.house))
    }
  }

  const fromDataset: LocalHit[] = []
  for (const r of getIndex(db)) {
    const sc = score(q, r.s)
    if (sc > 0) {
      fromDataset.push({ source: 'dataset', id: r.id, name: r.name, house: r.house, year: r.year, concentration: r.concentration, wardrobe: null, score: sc + popularityBonus(r.popularity) })
    }
  }

  const byScore = (a: LocalHit, b: LocalHit) => b.score - a.score || a.name.localeCompare(b.name)
  // A dataset entry that is already in my library is shown once, as mine.
  const dataset = fromDataset.sort(byScore).filter((h) => !mineKeys.has(keyOf(h.name, h.house)))
  return [...mine.sort(byScore), ...dataset].slice(0, limit)
}

export function datasetEntry(db: Db, id: number): FragranceInput | null {
  const row = db.prepare('SELECT data FROM catalog_fragrances WHERE id = ?').get(id) as { data: string } | undefined
  return row ? (JSON.parse(row.data) as FragranceInput) : null
}

export function clearDataset(db: Db): void {
  db.prepare('DELETE FROM catalog_fragrances').run()
  dropIndex()
}

const tick = () => new Promise<void>((r) => setImmediate(r))

/** Mapped entries (or null for unusable rows) from a source, using the dump reader for known layouts. */
function* mappedRows(src: Source, mapping: ColumnMapping): Generator<MappedEntry | null> {
  if (src.format === 'jsonl' && src.records && isFragranticaDump(src.columns)) {
    for (const rec of src.records()) yield mapDumpRecord(rec)
  } else {
    for (const row of src.rows()) yield mapRow(row, mapping)
  }
}

export const detectPreset = (src: Source): 'fragrantica-dump' | null => (src.format === 'jsonl' && isFragranticaDump(src.columns) ? 'fragrantica-dump' : null)

/** Reads only the start of the file, so a mapping change on a 500 MB file still previews instantly. */
export function previewImport(path: string, table: string | null, mapping: ColumnMapping, scan = 3000, show = 8): ImportPreview {
  const src = openSource(path, table ?? undefined)
  try {
    let total = 0
    let skipped = 0
    let truncated = false
    const entries: FragranceInput[] = []
    for (const e of mappedRows(src, mapping)) {
      if (total >= scan) {
        truncated = true
        break
      }
      total++
      if (!e) skipped++
      else if (entries.length < show) entries.push(e)
    }
    return { total, truncated, skipped, entries }
  } finally {
    src.close()
  }
}

const identity = (e: FragranceInput) => (e.sourceUrl ? `u:${e.sourceUrl}` : `n:${e.name.toLowerCase()}|${e.house.toLowerCase()}|${(e.concentration ?? '').toLowerCase()}`)

/** Streams the mapped rows into catalog_fragrances in batches, yielding to the event loop between them. */
export async function runImport(
  db: Db,
  path: string,
  table: string | null,
  mapping: ColumnMapping,
  replace: boolean,
  onProgress: (done: number) => void = () => undefined
): Promise<ImportResult> {
  const src = openSource(path, table ?? undefined)
  const insert = db.prepare('INSERT INTO catalog_fragrances (name, house, year, concentration, data, popularity, source_url) VALUES (?, ?, ?, ?, ?, ?, ?)')
  let imported = 0
  let skipped = 0
  let seen = 0
  try {
    if (replace) clearDataset(db)
    // Existing rows are remembered in memory: a per-row lookup would be quadratic on a 140k-row dataset.
    const known = new Set<string>()
    for (const r of db.prepare('SELECT name, house, concentration, source_url FROM catalog_fragrances').iterate() as Iterable<{ name: string; house: string; concentration: string | null; source_url: string | null }>) {
      known.add(r.source_url ? `u:${r.source_url}` : `n:${r.name.toLowerCase()}|${r.house.toLowerCase()}|${(r.concentration ?? '').toLowerCase()}`)
    }

    let batch: MappedEntry[] = []
    const flush = () => {
      db.transaction(() => {
        for (const e of batch) {
          const key = identity(e)
          if (known.has(key)) {
            skipped++
            continue
          }
          known.add(key)
          const { popularity, ...entry } = e
          insert.run(e.name, e.house, e.year ?? null, e.concentration ?? null, JSON.stringify(entry), Math.round(popularity ?? 0), e.sourceUrl ?? null)
          imported++
        }
      })()
      batch = []
    }
    for (const e of mappedRows(src, mapping)) {
      seen++
      if (!e) {
        skipped++
        continue
      }
      batch.push(e)
      if (batch.length >= 2000) {
        flush()
        onProgress(seen)
        await tick()
      }
    }
    flush()
    onProgress(seen)
  } finally {
    src.close()
    dropIndex()
  }
  return { imported, skipped, totalInCatalog: datasetCount(db) }
}
