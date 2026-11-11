import { FeatureIndex, noteFactor } from './index'
import type { LibraryItem, TasteProfile, WardrobeName } from './taste'
import { libraryWeight } from './taste'
import { SEASONS, longevityWords, norm, plural, type Season } from './vocab'

export interface Reason {
  kind: 'shared' | 'taste' | 'season' | 'rating' | 'longevity' | 'sillage' | 'warn' | 'info' | 'brief'
  text: string
}

export interface Suggestion {
  /** Row in the index. */
  row: number
  catalogId: number
  fid: number | null
  /** 0-100 */
  score: number
  /** 0-1 how well the accords and notes match the taste profile before community quality is considered. */
  fit: number
  reasons: Reason[]
  /** Wardrobes it is already in (matched by house, name and concentration), for the badges. */
  inWardrobes: WardrobeName[]
}

/** The profile in the index own numbering, ready to be scored against thousands of rows. */
export interface Compiled {
  accPos: Float32Array
  accNeg: Float32Array
  accAvoid: Uint8Array
  notePos: Float32Array
  noteNeg: Float32Array
  noteAvoid: Uint8Array
  accPosNorm: number
  accNegNorm: number
  notePosNorm: number
  noteNegNorm: number
}

const norm2 = (v: Float32Array): number => {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  return Math.sqrt(s)
}

export function compile(index: FeatureIndex, taste: Pick<TasteProfile, 'accords' | 'notes'>): Compiled {
  const accPos = new Float32Array(index.accordNames.length)
  const accNeg = new Float32Array(index.accordNames.length)
  const accAvoid = new Uint8Array(index.accordNames.length)
  const notePos = new Float32Array(index.noteNames.length)
  const noteNeg = new Float32Array(index.noteNames.length)
  const noteAvoid = new Uint8Array(index.noteNames.length)
  for (const e of taste.accords) {
    const id = index.accordIds.get(norm(e.name))
    if (id === undefined) continue
    accPos[id] = e.weight
    accNeg[id] = e.negative
    if (e.override === 'avoid') accAvoid[id] = 1
  }
  for (const e of taste.notes) {
    const id = index.noteIds.get(norm(e.name))
    if (id === undefined) continue
    notePos[id] = e.weight
    noteNeg[id] = e.negative
    if (e.override === 'avoid') noteAvoid[id] = 1
  }
  return { accPos, accNeg, accAvoid, notePos, noteNeg, noteAvoid, accPosNorm: norm2(accPos), accNegNorm: norm2(accNeg), notePosNorm: norm2(notePos), noteNegNorm: norm2(noteNeg) }
}

export interface Fit {
  fit: number
  /** What was taken off for accords and notes I avoid or that match what I dislike. */
  penalty: number
}

/** How well row i matches the profile on accords and notes alone: 0-1. */
export function fitOf(index: FeatureIndex, c: Compiled, i: number): Fit {
  let accDot = 0
  let accNegDot = 0
  let avoid = 0
  for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) {
    const id = index.accIdx[k]
    const v = index.accVal[k] / 100
    accDot += c.accPos[id] * v
    accNegDot += c.accNeg[id] * v
    if (c.accAvoid[id] && v >= 0.35) avoid = Math.max(avoid, 0.25 + ((v - 0.35) / 0.65) * 0.35)
  }
  let noteDot = 0
  let noteNegDot = 0
  for (let k = index.noteOff[i]; k < index.noteOff[i + 1]; k++) {
    const id = index.noteIdx[k]
    const w = noteFactor(index.noteVal[k])
    noteDot += c.notePos[id] * w
    noteNegDot += c.noteNeg[id] * w
    if (c.noteAvoid[id] && w >= 0.4) avoid = Math.max(avoid, 0.2 + (w - 0.4) * 0.3)
  }
  const accCos = c.accPosNorm > 0 && index.accNorm[i] > 0 ? accDot / (c.accPosNorm * index.accNorm[i]) : null
  const noteCos = c.notePosNorm > 0 && index.noteNorm[i] > 0 ? noteDot / (c.notePosNorm * index.noteNorm[i]) : null
  let base: number
  if (accCos != null && noteCos != null) base = 0.65 * accCos + 0.35 * noteCos
  else base = accCos ?? noteCos ?? 0
  const accNegCos = c.accNegNorm > 0 && index.accNorm[i] > 0 ? accNegDot / (c.accNegNorm * index.accNorm[i]) : 0
  const noteNegCos = c.noteNegNorm > 0 && index.noteNorm[i] > 0 ? noteNegDot / (c.noteNegNorm * index.noteNorm[i]) : 0
  const dislike = 0.5 * (0.65 * accNegCos + 0.35 * noteNegCos)
  const penalty = avoid + dislike
  return { fit: Math.min(1, Math.max(0, base - penalty)), penalty }
}

/** Community quality 0-1 from the rating (shrunk toward a typical 3.9 when few people voted); null when the dataset has no rating. */
export function qualityOf(index: FeatureIndex, i: number): number | null {
  const a = index.rating[i]
  const n = index.ratingN[i]
  if (Number.isNaN(a) || Number.isNaN(n) || n <= 0) return null
  const shrunk = (a * n + 3.9 * 150) / (n + 150)
  return Math.min(1, Math.max(0, (shrunk - 3.2) / 1.4))
}

/** How much to trust the community numbers 0-1: the number of voters, else how well known it is. */
export function confidenceOf(index: FeatureIndex, i: number): number {
  const p = index.people[i]
  if (!Number.isNaN(p) && p > 0) return Math.min(1, Math.log10(1 + p) / 4.3)
  return index.popRank[i] * 0.8
}

/** Blends fit with community quality and confidence. Without community numbers (a library-only index) the fit stands alone. */
export function blend(index: FeatureIndex, i: number, fit: number, hasCommunity: boolean): number {
  if (!hasCommunity) return fit
  const q = qualityOf(index, i)
  const parts: [number, number][] = [[fit, 0.7], [confidenceOf(index, i), 0.1]]
  if (q != null) parts.push([q, 0.2])
  const w = parts.reduce((s, [, x]) => s + x, 0)
  return parts.reduce((s, [v, x]) => s + v * x, 0) / w
}

// ---- who owns what -----------------------------------------------------------------------------------

export const identityKey = (house: string, name: string, concentration?: string | null): string => `${norm(house)}|${norm(name)}|${norm(concentration ?? '')}`

export interface LibraryKeys {
  /** key -> wardrobes; a fragrance without a concentration also answers to "house|name|*". */
  map: Map<string, WardrobeName[]>
}

export function libraryKeys(items: LibraryItem[]): LibraryKeys {
  const map = new Map<string, WardrobeName[]>()
  for (const it of items) {
    if (it.wardrobes.length === 0) continue
    const conc = norm(it.concentration ?? '')
    const keys = [identityKey(it.house, it.name, it.concentration)]
    if (!conc) keys.push(`${norm(it.house)}|${norm(it.name)}|*`)
    for (const k of keys) map.set(k, [...new Set([...(map.get(k) ?? []), ...it.wardrobes])])
  }
  return { map }
}

export function wardrobesOfRow(index: FeatureIndex, keys: LibraryKeys, i: number): WardrobeName[] {
  const base = `${index.houseKey[i]}|${index.nameKey[i]}|`
  return [...new Set([...(keys.map.get(base + index.concKey[i]) ?? []), ...(keys.map.get(`${base}*`) ?? [])])]
}

/** Which rows of the index are things I have, by wardrobe: a handful of lookups instead of a string compare per row. */
export function libraryRows(index: FeatureIndex, library: LibraryItem[]): Map<number, WardrobeName[]> {
  const out = new Map<number, WardrobeName[]>()
  for (const it of library) {
    if (it.wardrobes.length === 0) continue
    const conc = norm(it.concentration ?? '')
    for (const i of index.rowsForKey(norm(it.house), norm(it.name))) {
      if (conc && index.concKey[i] !== conc) continue
      out.set(i, [...new Set([...(out.get(i) ?? []), ...it.wardrobes])])
    }
  }
  return out
}

/** Rows marked "not interested" (keys are house|name|concentration, normalised). */
export function ignoredRows(index: FeatureIndex, keys: Set<string> | undefined): Set<number> {
  const out = new Set<number>()
  if (!keys) return out
  for (const k of keys) {
    const [h, n, c] = k.split('|')
    for (const i of index.rowsForKey(h, n)) if (!c || index.concKey[i] === c) out.add(i)
  }
  return out
}

const NONE: WardrobeName[] = []

// ---- reasons ------------------------------------------------------------------------------------------

const join = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** Reasons a suggestion was made, from my own library and the dataset votes. Never invented: each line states a fact it was computed from. */
export function explainRow(index: FeatureIndex, i: number, taste: Pick<TasteProfile, 'accords'>, library: LibraryItem[], opts: { season?: Season | null } = {}): Reason[] {
  const reasons: Reason[] = []
  const acc = new Map(index.accords(i).map((a) => [a.name, a.strength]))

  // shares X and Y with <the library fragrance it is most like>
  let best: { item: LibraryItem; shared: string[]; w: number } | null = null
  for (const it of library) {
    const w = libraryWeight(it)
    if (w <= 0) continue
    const shared = it.accords
      .filter((a) => a.strength >= 40 && (acc.get(norm(a.name)) ?? 0) >= 40)
      .sort((a, b) => b.strength - a.strength)
      .map((a) => norm(a.name))
    if (shared.length === 0) continue
    if (!best || shared.length > best.shared.length || (shared.length === best.shared.length && w > best.w)) best = { item: it, shared, w }
  }
  if (best) reasons.push({ kind: 'shared', text: `shares ${join(best.shared.slice(0, 3))} with ${best.item.name}` })
  else {
    const mine = taste.accords.filter((a) => a.weight >= 0.4 && (acc.get(norm(a.name)) ?? 0) >= 40).map((a) => a.name).slice(0, 3)
    if (mine.length) reasons.push({ kind: 'taste', text: `strong in ${join(mine)}, which your library favours` })
  }

  const avoided = taste.accords.filter((a) => a.override === 'avoid' && (acc.get(norm(a.name)) ?? 0) >= 35).map((a) => a.name)
  if (avoided.length) reasons.push({ kind: 'warn', text: `has ${join(avoided)}, which you avoid` })

  const sv = index.seasonVotes(i)
  if (sv && sv.total >= 100) {
    const want = opts.season ?? null
    const pick = want ?? SEASONS.reduce((b, s) => (sv[s] > sv[b] ? s : b), SEASONS[0])
    const share = sv[pick] / sv.total
    if (want ? share >= 0.2 : share >= 0.4) reasons.push({ kind: 'season', text: `worn by people in ${pick}, ${plural(Math.round(sv[pick]), 'vote')}` })
  }
  const r = index.rating[i]
  const rn = index.ratingN[i]
  if (!Number.isNaN(r) && rn >= 200) reasons.push({ kind: 'rating', text: `rated ${r.toFixed(2)}/5 by ${rn.toLocaleString('en-US')} people` })
  const l = index.longevity[i]
  if (!Number.isNaN(l)) reasons.push({ kind: 'longevity', text: `${longevityWords(l)} (${l.toFixed(1)}/5 from the community)` })
  return reasons
}

// ---- ranking ------------------------------------------------------------------------------------------

export interface Hide {
  /** Anything I have in My Collection. */
  owned: boolean
  garbage: boolean
  wishlist: boolean
  toTry: boolean
  had: boolean
  ignored: boolean
}
export const DEFAULT_HIDE: Hide = { owned: true, garbage: true, wishlist: false, toTry: false, had: false, ignored: true }

export interface ForYouOptions {
  limit?: number
  offset?: number
  season?: Season | null
  /** Needs at least this many season votes when a season is chosen, and at least this many voters in general. */
  minVotes?: number
  /** -1..1: only fragrances whose community lean is within 0.6 of this (soft filter, off when null). */
  genderLean?: number | null
  hide?: Hide
  /** Identity keys of fragrances marked "not interested". */
  ignored?: Set<string>
  /** Library-only index (no community numbers): fit alone ranks. */
  libraryOnly?: boolean
  /** Minimum fit to be considered at all. */
  minFit?: number
  /** Post-multiplier per row (e.g. the slider adjustments of "More like these"). */
  adjust?: (i: number, fit: number) => number
  /** What the "shares X with Y" reasons compare against (default: my library). "More like these" compares with the seeds. */
  explainFrom?: LibraryItem[]
  /** Rows never to show (e.g. the seeds themselves). */
  exclude?: Set<number>
}

export interface ForYouResult {
  results: Suggestion[]
  /** How many rows passed every filter. */
  total: number
  hidden: { owned: number; garbage: number; wishlist: number; toTry: number; had: number; ignored: number; filtered: number }
  ms: number
}

export function rankForYou(index: FeatureIndex, taste: Pick<TasteProfile, 'accords' | 'notes'>, library: LibraryItem[], opts: ForYouOptions = {}): ForYouResult {
  const t0 = Date.now()
  const compiled = compile(index, taste)
  const mineRows = libraryRows(index, library)
  const ignoredSet = ignoredRows(index, opts.ignored)
  const hide = opts.hide ?? DEFAULT_HIDE
  const minFit = opts.minFit ?? 0.12
  const minVotes = opts.minVotes ?? 0
  const hidden = { owned: 0, garbage: 0, wishlist: 0, toTry: 0, had: 0, ignored: 0, filtered: 0 }

  // 1. score every row, keep the ones with a real match
  const ids: number[] = []
  const finals: number[] = []
  const fits: number[] = []
  for (let i = 0; i < index.n; i++) {
    if (opts.exclude?.has(i)) continue
    const { fit } = fitOf(index, compiled, i)
    if (fit < minFit) continue
    const adj = opts.adjust ? opts.adjust(i, fit) : 1
    const f = blend(index, i, fit, !opts.libraryOnly) * adj
    ids.push(i)
    finals.push(f)
    fits.push(fit)
  }
  const order = ids.map((_, k) => k).sort((a, b) => finals[b] - finals[a] || ids[a] - ids[b])

  // 2. walk down the ranking applying the filters, keeping a page
  const out: Suggestion[] = []
  let total = 0
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 40
  for (const k of order) {
    const i = ids[k]
    if (minVotes > 0 && !(index.people[i] >= minVotes || index.ratingN[i] >= minVotes)) {
      hidden.filtered++
      continue
    }
    if (opts.season) {
      const s = index.seasonShare(i, opts.season)
      if (!s || s.votes < 30 || s.share < 0.2) {
        hidden.filtered++
        continue
      }
    }
    if (opts.genderLean != null) {
      const g = index.genderLean[i]
      if (!Number.isNaN(g) && Math.abs(g - opts.genderLean) > 0.6) {
        hidden.filtered++
        continue
      }
    }
    const mine = mineRows.get(i) ?? NONE
    const drop = (reason: keyof typeof hidden): boolean => {
      hidden[reason]++
      return true
    }
    if (mine.includes('garbage') && hide.garbage && drop('garbage')) continue
    if (mine.includes('collection') && hide.owned && drop('owned')) continue
    if (hide.ignored && ignoredSet.has(i) && drop('ignored')) continue
    if (!mine.includes('collection')) {
      if (mine.includes('wishlist') && hide.wishlist && drop('wishlist')) continue
      if (mine.includes('to_try') && hide.toTry && drop('toTry')) continue
      if (mine.includes('had') && hide.had && drop('had')) continue
    }
    total++
    if (total > offset && out.length < limit) {
      out.push({
        row: i,
        catalogId: index.catalogId[i],
        fid: index.fid[i] || null,
        score: Math.round(finals[k] * 100),
        fit: fits[k],
        reasons: explainRow(index, i, taste, opts.explainFrom ?? library, { season: opts.season }),
        inWardrobes: mine
      })
    }
  }
  return { results: out, total, hidden, ms: Date.now() - t0 }
}
