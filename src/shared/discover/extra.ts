/** Facts about a dataset fragrance that the plain catalog row does not hold. Kept compact; every field is optional. */
export interface CatalogExtra {
  /** Fragrantica's id (the number in its URL). */
  fid?: number
  /** Note weights 0-100 by note name (as voted by members). */
  nw?: Record<string, number>
  /** Average (1-5) and number of votes. */
  rating?: { a: number; n: number }
  /** Price/value: average (1 overpriced .. 5 great value) and number of votes. */
  value?: { a: number; n: number }
  /** How many people have, had or want it. */
  rel?: { have: number; had: number; want: number }
  /** Community gender votes. */
  cg?: { female: number; female_leaning: number; unisex: number; male_leaning: number; male: number }
  /** How many people voted on the aggregates. */
  people?: number
  /** "Smells like" votes: [Fragrantica id, up votes, down votes], strongest first. */
  rm?: [number, number, number][]
  /** Popularity: recent engagement (Fragrantica's recent_magnitude), for the "trending" view. */
  recent?: number
  /** Page capture time (unix seconds): the freshness of the vote aggregates. */
  scraped?: number
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const histogramN = (h: unknown): number => arr(h).reduce((s, b) => s + (num(b.count) ?? 0), 0)

/** Picks the extra facts out of one record of the Fragrantica dump layout (data/SCHEMA.md). Returns null when there are none. */
export function extraFromDump(o: Obj): CatalogExtra | null {
  const e: CatalogExtra = {}
  const fid = num(o.id)
  if (fid != null) e.fid = fid

  const nw: Record<string, number> = {}
  const notes = obj(o.notes)
  const tiered = obj(notes.tiered)
  for (const list of [tiered.top, tiered.middle, tiered.base, notes.flat]) {
    for (const n of arr(list)) {
      const w = num(n.weight)
      if (typeof n.name === 'string' && w != null && w > 0) nw[n.name] = Math.max(nw[n.name] ?? 0, Math.round(w))
    }
  }
  if (Object.keys(nw).length) e.nw = nw

  const rating = obj(o.rating)
  const ra = num(rating.average)
  const rn = histogramN(rating.histogram)
  if (ra != null && rn > 0) e.rating = { a: ra, n: rn }
  const pv = obj(o.price_value)
  const pa = num(pv.average)
  const pn = histogramN(pv.histogram)
  if (pa != null && pn > 0) e.value = { a: pa, n: pn }

  const rel = obj(o.relation)
  if (num(rel.have) != null || num(rel.want) != null) e.rel = { have: num(rel.have) ?? 0, had: num(rel.had) ?? 0, want: num(rel.want) ?? 0 }

  const cg = obj(o.community_gender)
  if (Object.keys(cg).length) {
    e.cg = { female: num(cg.female) ?? 0, female_leaning: num(cg.female_leaning) ?? 0, unisex: num(cg.unisex) ?? 0, male_leaning: num(cg.male_leaning) ?? 0, male: num(cg.male) ?? 0 }
  }
  const people = num(o.people)
  if (people != null && people > 0) e.people = people

  const rm = arr(obj(o.similar).reminds_me_of)
    .map((x): [number, number, number] | null => {
      const id = num(x.id)
      return id == null ? null : [id, num(x.up_votes) ?? 0, num(x.down_votes) ?? 0]
    })
    .filter((x): x is [number, number, number] => x !== null && x[1] > x[2])
    .sort((a, b) => b[1] - b[2] - (a[1] - a[2]))
    .slice(0, 12)
  if (rm.length) e.rm = rm

  const recent = num(obj(o.popularity).recent_magnitude)
  if (recent != null && recent > 0) e.recent = Math.round(recent)
  const scraped = num(obj(o.meta).scraped_at)
  if (scraped != null) e.scraped = scraped
  return Object.keys(e).length > (e.fid != null ? 1 : 0) ? e : null
}
