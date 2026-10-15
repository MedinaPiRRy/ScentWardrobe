import type { Db } from './index'

export type CsvCell = string | number | null | undefined

/** RFC 4180: quote fields containing a comma, quote or line break, and double any quotes. */
export function csvField(v: CsvCell): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n'
}

const HEADER = [
  'Wardrobe', 'Name', 'House', 'Year', 'Concentration', 'Gender', 'Perfumers', 'My rating (1-10)', 'Bottles', 'Total ml', 'Remaining ml',
  'Wears', 'Last worn', 'Usual sprays', 'Avg sprays', 'Avg projection (1-5)', 'Avg longevity (h)', 'Compliments', 'Top accords', 'Top notes', 'Heart notes', 'Base notes',
  'Other notes', 'What it smells like to me', 'Why I dislike it', 'Years I wore it', 'Memory', 'Why it left', 'Source URL',
  'Paid', 'Market price', 'Market price checked', 'Market price source'
]

const WARDROBE_LABEL = { collection: 'My Collection', wishlist: 'Wishlist', to_try: 'To Try', had: 'Had', garbage: 'Garbage Perfumes' } as const

/** One row per fragrance in a wardrobe. Opens cleanly in Excel when saved with a UTF-8 byte order mark. */
export function buildCollectionCsv(db: Db, scope: 'all' | 'collection' = 'all'): { csv: string; rows: number } {
  const frags = db
    .prepare(
      `SELECT f.id, f.name, f.house, f.year, f.concentration, f.gender, f.perfumers, f.source_url, f.default_sprays, w.wardrobe, w.rating, w.dislike_note, w.had_years, w.had_memory, w.had_reason,
              (SELECT text FROM smell_impression s WHERE s.fragrance_id = f.id) AS impression
       FROM fragrances f JOIN wardrobe_items w ON w.fragrance_id = f.id
       ${scope === 'collection' ? "WHERE w.wardrobe = 'collection'" : ''}
       ORDER BY CASE w.wardrobe WHEN 'collection' THEN 1 WHEN 'wishlist' THEN 2 WHEN 'to_try' THEN 3 WHEN 'had' THEN 4 ELSE 5 END, f.house, f.name`
    )
    .all() as { id: number; name: string; house: string; year: number | null; concentration: string | null; gender: string | null; perfumers: string | null; source_url: string | null; default_sprays: number | null; wardrobe: keyof typeof WARDROBE_LABEL; rating: number | null; impression: string | null; dislike_note: string | null; had_years: string | null; had_memory: string | null; had_reason: string | null }[]

  const bottles = db.prepare(`SELECT count(*) AS n, coalesce(sum(size_ml), 0) AS size, coalesce(sum(remaining_ml), 0) AS rem FROM bottles WHERE fragrance_id = ? AND status = 'active'`)
  const prices = db.prepare(`SELECT sum(price) AS paid, sum(market_price) AS market, max(market_checked_on) AS checked,
    (SELECT market_source FROM bottles x WHERE x.fragrance_id = ? AND x.market_source IS NOT NULL ORDER BY x.market_checked_on DESC, x.id DESC LIMIT 1) AS source FROM bottles WHERE fragrance_id = ? AND status = 'active'`)
  const wears = db.prepare('SELECT count(*) AS n, max(worn_at) AS last, avg(sprays) AS sprays, avg(projection) AS proj, avg(longevity_hours) AS lon, coalesce(sum(compliments), 0) AS comp FROM wear_log WHERE fragrance_id = ?')
  const accords = db.prepare('SELECT a.name FROM fragrance_accords fa JOIN accords a ON a.id = fa.accord_id WHERE fa.fragrance_id = ? ORDER BY fa.strength DESC LIMIT 5')
  const notes = db.prepare('SELECT n.name, fn.layer FROM fragrance_notes fn JOIN notes n ON n.id = fn.note_id WHERE fn.fragrance_id = ? ORDER BY n.name')
  const round = (n: number | null, d = 1) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)

  const rows: CsvCell[][] = [HEADER]
  for (const f of frags) {
    const b = bottles.get(f.id) as { n: number; size: number; rem: number }
    const pr = prices.get(f.id, f.id) as { paid: number | null; market: number | null; checked: string | null; source: string | null }
    const w = wears.get(f.id) as { n: number; last: string | null; sprays: number | null; proj: number | null; lon: number | null; comp: number }
    const byLayer = (layer: string) => (notes.all(f.id) as { name: string; layer: string }[]).filter((n) => n.layer === layer).map((n) => n.name).join('; ')
    rows.push([
      WARDROBE_LABEL[f.wardrobe], f.name, f.house, f.year, f.concentration, f.gender, f.perfumers, f.rating, b.n, round(b.size), round(b.rem), w.n, w.last?.slice(0, 16), f.default_sprays,
      round(w.sprays), round(w.proj), round(w.lon), w.comp, (accords.all(f.id) as { name: string }[]).map((a) => a.name).join('; '),
      byLayer('top'), byLayer('heart'), byLayer('base'), byLayer('general'), f.impression, f.dislike_note, f.had_years, f.had_memory, f.had_reason, f.source_url,
      pr.paid, pr.market, pr.checked, pr.source
    ])
  }
  return { csv: toCsv(rows), rows: frags.length }
}
