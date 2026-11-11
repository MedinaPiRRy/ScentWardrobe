import { PROFILES, NEUTRAL_PROFILE, accordWarmClass, profileFor, targetWarmth } from '../recommend/activities'
import type { FeatureIndex } from './index'
import { DEFAULT_HIDE, compile, fitOf, ignoredRows, libraryRows, orderingQuality, qualityOf, type Hide, type Suggestion } from './rank'
import type { LibraryItem, TasteProfile } from './taste'
import { SEASONS, inFamily, longevityWords, norm, plural, sillageWords, type Season } from './vocab'

export type LongevityWish = 'short' | 'moderate' | 'long'
export type ProjectionWish = 'skin' | 'moderate' | 'room'
export type CrowdWish = 'pleaser' | 'stand_out'
export type PopularityWish = 'any' | 'hidden_gems' | 'popular' | 'trending'

export interface Brief {
  /** Context */
  season: Season | null
  temperatureC: number | null
  humidity: number | null
  /** Free text such as "office", "date night"; mapped with the same table the Recommendations page uses. */
  activity: string
  timeOfDay: 'day' | 'night' | null
  /** Performance */
  longevity: LongevityWish | null
  projection: ProjectionWish | null
  /** Social (estimates) */
  crowd: CrowdWish | null
  popularity: PopularityWish
  /** What it should have, and what it must not have. */
  wantAccords: string[]
  wantNotes: string[]
  avoidAccords: string[]
  avoidNotes: string[]
  /** "not syrupy sweet": drops anything where sweet accords dominate. */
  notSyrupy: boolean
  /** -1 womens .. +1 mens, a soft preference; null = ignore. */
  genderLean: number | null
}

export const EMPTY_BRIEF: Brief = {
  season: null,
  temperatureC: null,
  humidity: null,
  activity: '',
  timeOfDay: null,
  longevity: null,
  projection: null,
  crowd: null,
  popularity: 'any',
  wantAccords: [],
  wantNotes: [],
  avoidAccords: [],
  avoidNotes: [],
  notSyrupy: false,
  genderLean: null
}

/** Fills in anything a saved brief is missing (older versions, hand edits). */
export function normalizeBrief(raw: unknown): Brief {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<Brief>
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()).slice(0, 12) : [])
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const pick = <T extends string>(v: unknown, ok: readonly T[]): T | null => (ok.includes(v as T) ? (v as T) : null)
  return {
    season: pick(o.season, SEASONS),
    temperatureC: num(o.temperatureC),
    humidity: num(o.humidity),
    activity: typeof o.activity === 'string' ? o.activity.slice(0, 80) : '',
    timeOfDay: pick(o.timeOfDay, ['day', 'night'] as const),
    longevity: pick(o.longevity, ['short', 'moderate', 'long'] as const),
    projection: pick(o.projection, ['skin', 'moderate', 'room'] as const),
    crowd: pick(o.crowd, ['pleaser', 'stand_out'] as const),
    popularity: pick(o.popularity, ['any', 'hidden_gems', 'popular', 'trending'] as const) ?? 'any',
    wantAccords: list(o.wantAccords),
    wantNotes: list(o.wantNotes),
    avoidAccords: list(o.avoidAccords),
    avoidNotes: list(o.avoidNotes),
    notSyrupy: o.notSyrupy === true,
    genderLean: num(o.genderLean)
  }
}

export const briefIsEmpty = (b: Brief): boolean => JSON.stringify(b) === JSON.stringify(EMPTY_BRIEF)

export type Status = 'met' | 'partial' | 'unmet' | 'unknown'
export interface Criterion {
  key: string
  label: string
  status: Status
  detail: string
}

const VALUE: Record<Status, number> = { met: 1, partial: 0.5, unmet: 0, unknown: 0.5 }
const W = { season: 1, temperature: 1, humidity: 0.5, activity: 1.5, time: 0.7, longevity: 0.8, projection: 0.8, crowd: 0.8, popularity: 0.8, want: 1.2, gender: 0.4 } as const

export const ACTIVITY_CHOICES = Object.keys(PROFILES)

interface Ctx {
  brief: Brief
  wantAcc: { name: string; id: number | undefined }[]
  wantNote: { name: string; id: number | undefined }[]
  avoidAcc: { name: string; id: number | undefined }[]
  avoidNote: { name: string; id: number | undefined }[]
  sweetIds: Set<number>
  activity: typeof NEUTRAL_PROFILE | null
  warmthTarget: number | null
  /** Per accord id: how it counts toward warmth, and (for the chosen activity) liked minus disliked. */
  warmClass: Float32Array
  activityVal: Float32Array
  datasetDate: string | null
}

export function compileBrief(index: FeatureIndex, brief: Brief, datasetDate: string | null = null): Ctx {
  const acc = (names: string[]) => names.map((name) => ({ name, id: index.accordIds.get(norm(name)) }))
  const note = (names: string[]) => names.map((name) => ({ name, id: index.noteIds.get(norm(name)) }))
  const sweetIds = new Set<number>()
  for (const [n, id] of index.accordIds) if (inFamily('sweet', n)) sweetIds.add(id)
  const t = brief.temperatureC
  const activity = brief.activity.trim() ? profileFor(brief.activity) : null
  const warmClass = new Float32Array(index.accordNames.length)
  const activityVal = new Float32Array(index.accordNames.length)
  index.accordNames.forEach((name, id) => {
    warmClass[id] = accordWarmClass(name)
    if (activity) activityVal[id] = (activity.likes[name] ?? 0) - (activity.dislikes[name] ?? 0)
  })
  return {
    brief,
    wantAcc: acc(brief.wantAccords),
    wantNote: note(brief.wantNotes),
    avoidAcc: acc(brief.avoidAccords),
    avoidNote: note(brief.avoidNotes),
    sweetIds,
    activity,
    warmClass,
    activityVal,
    warmthTarget: t != null ? targetWarmth(t) : brief.season ? { winter: 0.6, spring: 0.05, summer: -0.55, fall: 0.3 }[brief.season] : null,
    datasetDate
  }
}

const accordStrength = (index: FeatureIndex, i: number, id: number): number => {
  for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) if (index.accIdx[k] === id) return index.accVal[k]
  return 0
}
/** Weight 0-100 of a note on this row (an unvoted note counts as 50), or -1 when the row does not have it. */
const noteWeight = (index: FeatureIndex, i: number, id: number): number => {
  for (let k = index.noteOff[i]; k < index.noteOff[i + 1]; k++) if (index.noteIdx[k] === id) return index.noteVal[k] > 0 ? index.noteVal[k] : 50
  return -1
}

export interface Evaluation {
  /** True when a dealbreaker rules it out. */
  excluded: boolean
  excludedBy: string | null
  /** 0-1 share of the active criteria met (partly met counts half, unknown counts half). */
  satisfaction: number
  /** How many criteria were active. */
  criteria: number
}

/** warmthIndex() computed straight from the typed arrays: -1 fresh .. +1 warm. */
const warmthOf = (index: FeatureIndex, ctx: Ctx, i: number): number => {
  let warm = 0
  let fresh = 0
  let total = 0
  for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) {
    const v = index.accVal[k]
    const c = ctx.warmClass[index.accIdx[k]]
    total += v
    if (c > 0) warm += v
    else if (c < 0) fresh += v * -c
  }
  return total <= 0 ? 0 : Math.max(-1, Math.min(1, ((warm - fresh) / total) * 1.5))
}

const sweetShare = (index: FeatureIndex, i: number, sweetIds: Set<number>): number => {
  let s = 0
  let total = 0
  for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) {
    total += index.accVal[k]
    if (sweetIds.has(index.accIdx[k])) s += index.accVal[k]
  }
  return total > 0 ? s / total : 0
}

/** Scores one row against the brief; fills `out` with the per-criterion detail when given. */
export function evaluateRow(index: FeatureIndex, ctx: Ctx, i: number, out?: Criterion[]): Evaluation {
  const b = ctx.brief
  let sum = 0
  let wsum = 0
  // Strings are only built when the detail is wanted (the top of the list): ranking 140,000 rows must not allocate per row.
  const note = (key: string, label: string, status: Status, detail: string): void => {
    out!.push({ key, label, status, detail })
  }
  const vote = (k: number): number => index.votes[i * 6 + k]

  // dealbreakers first: they remove the row
  for (const a of ctx.avoidAcc) {
    if (a.id === undefined) continue
    const s = accordStrength(index, i, a.id)
    if (s >= 50) return { excluded: true, excludedBy: `strong ${a.name} (${s}/100)`, satisfaction: 0, criteria: 0 }
    const st: Status = s >= 25 ? 'partial' : 'met'
    sum += W.want * VALUE[st]
    wsum += W.want
    if (out) note(`avoid:${a.name}`, `No ${a.name}`, st, st === 'partial' ? `has some ${a.name} (${s}/100), not dominant` : `${a.name} is not a main accord`)
  }
  for (const n of ctx.avoidNote) {
    if (n.id === undefined) continue
    const w = noteWeight(index, i, n.id)
    if (w >= 40) return { excluded: true, excludedBy: `prominent ${n.name}`, satisfaction: 0, criteria: 0 }
    const st: Status = w >= 0 ? 'partial' : 'met'
    sum += W.want * VALUE[st]
    wsum += W.want
    if (out) note(`avoidn:${n.name}`, `No ${n.name}`, st, st === 'partial' ? `lists ${n.name}, but it is not prominent` : `no ${n.name} in the notes`)
  }
  if (b.notSyrupy) {
    const share = sweetShare(index, i, ctx.sweetIds)
    if (share >= 0.45) return { excluded: true, excludedBy: 'syrupy sweet', satisfaction: 0, criteria: 0 }
    const st: Status = share >= 0.3 ? 'partial' : 'met'
    sum += W.want * VALUE[st]
    wsum += W.want
    if (out) note('syrup', 'Not syrupy sweet', st, `${Math.round(share * 100)}% of its accords are sweet ones`)
  }

  if (b.season) {
    const si = SEASONS.indexOf(b.season)
    const total = vote(0) + vote(1) + vote(2) + vote(3)
    const known = !Number.isNaN(total) && total >= 30
    const share = known ? vote(si) / total : 0
    const st: Status = !known ? 'unknown' : share >= 0.3 ? 'met' : share >= 0.2 ? 'partial' : 'unmet'
    sum += W.season * VALUE[st]
    wsum += W.season
    if (out) note('season', `For ${b.season}`, st, known ? `${Math.round(share * 100)}% of ${plural(total, 'season vote')} say ${b.season}` : 'too few season votes in the dataset')
  }
  let warmth = Number.NaN
  if (ctx.warmthTarget != null || b.humidity != null) warmth = warmthOf(index, ctx, i)
  if (ctx.warmthTarget != null) {
    const tw = ctx.warmthTarget
    // Fresher than needed is fine in the heat, and richer than needed is fine in the cold.
    const beyond = (tw <= -0.5 && warmth <= tw) || (tw >= 0.5 && warmth >= tw)
    const fit = beyond ? 1 : Math.max(0, Math.min(1, 1 - Math.abs(warmth - tw) / 1.2))
    const st: Status = fit >= 0.7 ? 'met' : fit >= 0.45 ? 'partial' : 'unmet'
    sum += W.temperature * VALUE[st]
    wsum += W.temperature
    if (out) note('temperature', `Suits ${b.temperatureC != null ? `${Math.round(b.temperatureC)} °C` : 'this season'}`, st, `${warmth > 0.25 ? 'warm, rich' : warmth < -0.25 ? 'fresh, light' : 'balanced'} profile (an estimate from its accords)`)
  }
  if (b.humidity != null) {
    const humid = Math.max(0, Math.min(1, (b.humidity - 60) / 40))
    const heavy = Math.max(0, Math.min(1, warmth + 0.2))
    const fit = Math.max(0, Math.min(1, 1 - humid * heavy * 1.2))
    const st: Status = fit >= 0.7 ? 'met' : fit >= 0.45 ? 'partial' : 'unmet'
    sum += W.humidity * VALUE[st]
    wsum += W.humidity
    if (out) note('humidity', `Holds up at ${Math.round(b.humidity)}% humidity`, st, humid > 0 ? (heavy > 0.5 ? 'heavy accords feel stronger in humid air (rule of thumb)' : 'light profile, little affected by humidity') : 'not humid, nothing to adjust')
  }
  if (ctx.activity) {
    let raw = 0
    let total = 0
    for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) {
      raw += index.accVal[k] * ctx.activityVal[index.accIdx[k]]
      total += index.accVal[k]
    }
    const fit = total > 0 ? Math.max(0, Math.min(1, 0.5 + (raw / total) * 0.9)) : 0.5
    const st: Status = total === 0 ? 'unknown' : fit >= 0.65 ? 'met' : fit >= 0.5 ? 'partial' : 'unmet'
    sum += W.activity * VALUE[st]
    wsum += W.activity
    if (out) note('activity', `Good for ${b.activity.trim()}`, st, 'matches the accords usually liked for this occasion')
  }
  if (b.timeOfDay) {
    const d = vote(4)
    const nt = vote(5)
    const votes = d + nt
    const known = !Number.isNaN(votes) && votes >= 30
    const share = known ? (b.timeOfDay === 'day' ? d / votes : nt / votes) : 0
    const st: Status = !known ? 'unknown' : share >= 0.55 ? 'met' : share >= 0.42 ? 'partial' : 'unmet'
    sum += W.time * VALUE[st]
    wsum += W.time
    if (out) note('time', b.timeOfDay === 'day' ? 'Worn in the day' : 'Worn at night', st, known ? `${Math.round(share * 100)}% of ${plural(votes, 'vote')} say ${b.timeOfDay}` : 'too few day/night votes')
  }
  if (b.longevity) {
    const l = index.longevity[i]
    const [lo, hi] = b.longevity === 'short' ? [0, 2.9] : b.longevity === 'moderate' ? [2.9, 3.6] : [3.6, 5]
    const st: Status = Number.isNaN(l) ? 'unknown' : l >= lo && l <= hi ? 'met' : Math.abs(l - (l < lo ? lo : hi)) <= 0.4 ? 'partial' : 'unmet'
    sum += W.longevity * VALUE[st]
    wsum += W.longevity
    if (out) note('longevity', `Lasts ${b.longevity === 'short' ? 'a few hours' : b.longevity === 'moderate' ? 'a work day' : 'all day'}`, st, Number.isNaN(l) ? 'no longevity votes' : `${longevityWords(l)} (${l.toFixed(1)}/5)`)
  }
  if (b.projection) {
    const s = index.sillage[i]
    const [lo, hi] = b.projection === 'skin' ? [0, 2.1] : b.projection === 'moderate' ? [2.1, 2.9] : [2.9, 4]
    const st: Status = Number.isNaN(s) ? 'unknown' : s >= lo && s <= hi ? 'met' : Math.abs(s - (s < lo ? lo : hi)) <= 0.35 ? 'partial' : 'unmet'
    sum += W.projection * VALUE[st]
    wsum += W.projection
    if (out) note('projection', b.projection === 'skin' ? 'Stays close to the skin' : b.projection === 'moderate' ? 'Moderate projection' : 'Fills a room', st, Number.isNaN(s) ? 'no sillage votes' : `${sillageWords(s)} (${s.toFixed(1)}/4)`)
  }
  if (b.crowd === 'pleaser') {
    const q = qualityOf(index, i)
    const sil = index.sillage[i]
    const silFit = Number.isNaN(sil) ? 0.5 : Math.max(0, 1 - Math.abs(sil - 2.5) / 1.5)
    const score = 0.5 * (q ?? 0.5) + 0.25 * index.popRank[i] + 0.25 * silFit
    const st: Status = score >= 0.65 ? 'met' : score >= 0.5 ? 'partial' : 'unmet'
    sum += W.crowd * VALUE[st]
    wsum += W.crowd
    if (out) note('crowd', 'Crowd-pleaser (estimate)', st, 'estimated from ratings, how well known it is and a moderate sillage; not a measured fact')
  } else if (b.crowd === 'stand_out') {
    const r = index.popRank[i]
    const st: Status = r <= 0.35 ? 'met' : r <= 0.55 ? 'partial' : 'unmet'
    sum += W.crowd * VALUE[st]
    wsum += W.crowd
    if (out) note('crowd', 'Stands out (less common)', st, `less common than ${Math.round((1 - r) * 100)}% of the dataset (by its popularity score)`)
  }
  if (b.popularity !== 'any') {
    const r = index.popRank[i]
    let st: Status
    let label: string
    let detail = ''
    const when = ctx.datasetDate ? ` (dataset from ${ctx.datasetDate})` : ' (dataset date unknown)'
    if (b.popularity === 'hidden_gems') {
      const q = qualityOf(index, i)
      st = r <= 0.4 && (q == null || q >= 0.55) ? 'met' : r <= 0.55 ? 'partial' : 'unmet'
      label = 'Hidden gem'
      if (out) detail = `less common${q != null ? ' and well rated' : ''}${when}`
    } else if (b.popularity === 'popular') {
      st = r >= 0.8 ? 'met' : r >= 0.6 ? 'partial' : 'unmet'
      label = 'Popular'
      if (out) detail = `more popular than ${Math.round(r * 100)}% of the dataset${when}`
    } else {
      const t = index.trendRank[i]
      st = Number.isNaN(t) ? 'unknown' : t >= 0.85 ? 'met' : t >= 0.7 ? 'partial' : 'unmet'
      label = 'Trending'
      if (out) detail = Number.isNaN(t) ? 'the dataset has no recent-activity numbers for it' : `recent activity is high compared with its total${when}`
    }
    sum += W.popularity * VALUE[st]
    wsum += W.popularity
    if (out) note('popularity', label, st, detail)
  }
  for (const a of ctx.wantAcc) {
    const s = a.id === undefined ? 0 : accordStrength(index, i, a.id)
    const st: Status = s >= 40 ? 'met' : s >= 15 ? 'partial' : 'unmet'
    sum += W.want * VALUE[st]
    wsum += W.want
    if (out) note(`want:${a.name}`, `Has ${a.name}`, st, s > 0 ? `${a.name} ${s}/100 among its accords` : `no ${a.name} accord`)
  }
  for (const n of ctx.wantNote) {
    const w = n.id === undefined ? -1 : noteWeight(index, i, n.id)
    const st: Status = w >= 30 ? 'met' : w >= 0 ? 'partial' : 'unmet'
    sum += W.want * VALUE[st]
    wsum += W.want
    if (out) note(`wantn:${n.name}`, `Has ${n.name}`, st, w >= 0 ? `lists ${n.name}${w < 30 ? ' (faint)' : ''}` : `no ${n.name} in its notes`)
  }
  if (b.genderLean != null) {
    const g = index.genderLean[i]
    const st: Status = Number.isNaN(g) ? 'unknown' : Math.abs(g - b.genderLean) <= 0.4 ? 'met' : Math.abs(g - b.genderLean) <= 0.7 ? 'partial' : 'unmet'
    sum += W.gender * VALUE[st]
    wsum += W.gender
    if (out) note('gender', b.genderLean > 0.3 ? 'Leans masculine' : b.genderLean < -0.3 ? 'Leans feminine' : 'Unisex-leaning', st, Number.isNaN(g) ? 'no gender votes' : 'a soft preference from community votes, not a rule')
  }
  return { excluded: false, excludedBy: null, satisfaction: wsum > 0 ? sum / wsum : 0, criteria: wsum > 0 ? (out?.length ?? 1) : 0 }
}

export interface BriefOptions {
  limit?: number
  offset?: number
  hide?: Hide
  ignored?: Set<string>
  datasetDate?: string | null
  library: LibraryItem[]
  /** When given, how well a result matches my taste also counts (25%), so fillers for a gap are ones I would like. */
  taste?: Pick<TasteProfile, 'accords' | 'notes'>
}
export interface BriefSuggestion extends Suggestion {
  criteria: Criterion[]
}
export interface BriefResult {
  results: BriefSuggestion[]
  total: number
  /** Rows ruled out by dealbreakers, and a few examples of why. */
  excluded: number
  excludedExamples: string[]
  hidden: { owned: number; garbage: number; wishlist: number; toTry: number; had: number; ignored: number }
  ms: number
  /** How many criteria this brief actually has. */
  active: number
}

/** Ranks the whole dataset against a brief. The order follows how much of the brief a fragrance meets; community quality breaks ties. */
export function rankBrief(index: FeatureIndex, brief: Brief, opts: BriefOptions): BriefResult {
  const t0 = Date.now()
  const ctx = compileBrief(index, brief, opts.datasetDate ?? null)
  const mineRows = libraryRows(index, opts.library)
  const ignoredSet = ignoredRows(index, opts.ignored)
  const compiledTaste = opts.taste ? compile(index, opts.taste) : null
  const hide = opts.hide ?? DEFAULT_HIDE
  const hidden = { owned: 0, garbage: 0, wishlist: 0, toTry: 0, had: 0, ignored: 0 }
  let excluded = 0
  const examples: string[] = []
  const rowOf = new Int32Array(index.n)
  const valueOf = new Float64Array(index.n)
  const satOf = new Float64Array(index.n)
  let m = 0
  let active = 0
  for (let i = 0; i < index.n; i++) {
    const ev = evaluateRow(index, ctx, i)
    if (ev.excluded) {
      excluded++
      if (ev.excludedBy && examples.length < 3 && !examples.includes(ev.excludedBy)) examples.push(ev.excludedBy)
      continue
    }
    active = Math.max(active, ev.criteria)
    rowOf[m] = i
    satOf[m] = ev.satisfaction
    valueOf[m] = compiledTaste ? 0.55 * ev.satisfaction + 0.25 * fitOf(index, compiledTaste, i).fit + 0.2 * orderingQuality(index, i) : 0.8 * ev.satisfaction + 0.2 * orderingQuality(index, i)
    m++
  }
  const order = Uint32Array.from({ length: m }, (_, k) => k).sort((a, b) => valueOf[b] - valueOf[a] || rowOf[a] - rowOf[b])
  const out: BriefSuggestion[] = []
  let total = 0
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 40
  for (const k of order) {
    const i = rowOf[k]
    const v = valueOf[k]
    const s = satOf[k]
    const mine = mineRows.get(i) ?? []
    const gone = (k: keyof typeof hidden) => {
      hidden[k]++
      return true
    }
    if (mine.includes('garbage') && hide.garbage && gone('garbage')) continue
    if (mine.includes('collection') && hide.owned && gone('owned')) continue
    if (hide.ignored && ignoredSet.has(i) && gone('ignored')) continue
    if (!mine.includes('collection')) {
      if (mine.includes('wishlist') && hide.wishlist && gone('wishlist')) continue
      if (mine.includes('to_try') && hide.toTry && gone('toTry')) continue
      if (mine.includes('had') && hide.had && gone('had')) continue
    }
    total++
    if (total > offset && out.length < limit) {
      const criteria: Criterion[] = []
      evaluateRow(index, ctx, i, criteria)
      out.push({
        row: i,
        catalogId: index.catalogId[i],
        fid: index.fid[i] || null,
        score: Math.round(v * 100),
        fit: s,
        reasons: criteria.filter((c) => c.status === 'met').slice(0, 4).map((c) => ({ kind: 'brief', text: c.detail })),
        inWardrobes: mine,
        criteria
      })
    }
  }
  return { results: out, total, excluded, excludedExamples: examples, hidden, ms: Date.now() - t0, active }
}

