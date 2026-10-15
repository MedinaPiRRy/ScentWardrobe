import { buildAffinity } from '../layering/affinity'
import { analyzeLayer, cosine, VERDICT_WORTH_TESTING, type EngineOptions } from '../layering/engine'
import { profileFor, targetWarmth, warmthIndex, type ActivityProfile } from './activities'
import { explain } from './explain'
import type { BreakdownLine, ComboSuggestion, RecContext, RecItem, Recommendation, RecommendResult, TimeOfDay } from './types'

export interface RecommendOptions extends EngineOptions {
  /** How many picks to return. */
  top?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const round1 = (n: number) => Math.round(n * 10) / 10
const DAY_MS = 86_400_000

/** Weights of the 0-1 components. They sum to 1, so a perfect match scores 100 before the adjustments. */
export const WEIGHTS = { season: 0.17, daynight: 0.1, temperature: 0.2, humidity: 0.08, activity: 0.3, longevity: 0.15 } as const

const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const
type Season = (typeof SEASONS)[number]

export function seasonOfMonth(month0: number): Season {
  return month0 === 11 || month0 <= 1 ? 'winter' : month0 <= 4 ? 'spring' : month0 <= 7 ? 'summer' : 'fall'
}

/** What a typical day in this month feels like, used when no weather is known. */
export function assumedTemperature(month0: number): number {
  return { winter: 3, spring: 14, summer: 25, fall: 13 }[seasonOfMonth(month0)]
}

/** The season the weather feels like: the temperature decides, and the calendar breaks ties in the in-between range. */
export function effectiveSeason(temperatureC: number, month0: number): Season {
  if (temperatureC >= 24) return 'summer'
  if (temperatureC < 8) return 'winter'
  // 8-24 °C is the in-between range: spring or fall by the calendar (a warm summer day still counts as summer).
  const cal = seasonOfMonth(month0)
  if (cal === 'spring' || cal === 'fall') return cal
  if (cal === 'summer') return temperatureC >= 18 ? 'summer' : 'spring'
  return month0 === 11 ? 'fall' : 'spring' // a mild day in winter
}

const NEIGHBOURS: Record<Season, Season[]> = { winter: ['fall', 'spring'], spring: ['winter', 'summer'], summer: ['spring', 'fall'], fall: ['summer', 'winter'] }

/** 0-1: how strongly the community wears it in this season, with a little credit for neighbouring seasons. */
export function seasonFit(item: RecItem, season: Season): number | null {
  const s = item.seasons
  if (!s) return null
  const votes = SEASONS.map((k) => Math.max(s[k] ?? 0, 0))
  const max = Math.max(...votes)
  if (max <= 0) return null
  const v = (k: Season) => votes[SEASONS.indexOf(k)] / max
  return clamp(0.8 * v(season) + 0.2 * Math.max(...NEIGHBOURS[season].map(v)), 0, 1)
}

const DAY_WEIGHT: Record<TimeOfDay, number> = { morning: 1, afternoon: 1, evening: 0.35, night: 0 }

/** 0-1: share of the community that wears it at this time of day. */
export function dayNightFit(item: RecItem, tod: TimeOfDay): number | null {
  const d = item.daynight
  if (!d || d.day + d.night <= 0) return null
  const dayShare = d.day / (d.day + d.night)
  const w = DAY_WEIGHT[tod]
  return w * dayShare + (1 - w) * (1 - dayShare)
}

/** Heavy, sweet, warm fragrances are 1; light, fresh ones are 0.2 in the heat: how well the warmth matches the temperature. */
export function temperatureFit(item: RecItem, temperatureC: number): number {
  const w = warmthIndex(item.accords)
  return clamp(1 - Math.abs(w - targetWarmth(temperatureC)) / 1.2, 0, 1)
}

/** High humidity amplifies heavy fragrances; fresh ones are unaffected. */
export function humidityFit(item: RecItem, humidity: number): number {
  const w = warmthIndex(item.accords)
  const humid = clamp((humidity - 60) / 40, 0, 1)
  const heavy = clamp(w + 0.2, 0, 1)
  return clamp(1 - humid * heavy * 1.2, 0, 1)
}

/** My own projection when I have logged enough wears (the candidate list already substitutes it), else the community's, else neutral. */
export const projectionOf = (item: RecItem): number => clamp(item.projection ?? 2.5, 1, 4)

export function activityFit(item: RecItem, profile: ActivityProfile): { fit: number; accordFit: number; projectionFit: number } {
  let raw = 0
  let total = 0
  for (const a of item.accords) {
    const n = a.name.trim().toLowerCase()
    raw += a.strength * ((profile.likes[n] ?? 0) - (profile.dislikes[n] ?? 0))
    total += a.strength
  }
  const accordFit = total > 0 ? clamp(0.5 + (raw / total) * 0.9, 0, 1) : 0.5
  const projectionFit = clamp(1 - Math.abs(projectionOf(item) - profile.projection) / 2.5, 0, 1)
  return { fit: 0.6 * accordFit + 0.4 * projectionFit, accordFit, projectionFit }
}

export function longevityFit(item: RecItem, need: number): number | null {
  if (item.longevity == null) return null
  const norm = clamp((item.longevity - 1) / 4, 0, 1)
  return clamp(1 - Math.max(0, need - norm) * 1.5, 0, 1)
}

export function daysSince(dateTime: string | null | undefined, now: Date): number | null {
  if (!dateTime) return null
  const [y, m, d] = dateTime.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const then = new Date(y, m - 1, d).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(Math.round((today - then) / DAY_MS), 0)
}

/** Points for variety: recently worn fragrances lose points, ones left alone for a while gain a few. */
export function rotationPoints(days: number | null, wearsLast7Days = 0): number {
  if (days === null) return 3 // never worn: gently encourage trying it
  const recent = [-14, -10, -6, -3][days] ?? 0
  const boost = days >= 30 ? 4 : days >= 14 ? 2 : 0
  return recent + boost - Math.max(wearsLast7Days - 1, 0) * 2
}

/** My rating only breaks ties: at most +-2 points. */
export const ratingPoints = (rating: number | null | undefined): number => (rating == null ? 0 : clamp(((rating - 5.5) / 4.5) * 2, -2, 2))

const NEUTRAL = 0.5

export function scoreItem(item: RecItem, ctx: RecContext, tempC: number, humidity: number): Recommendation & { raw: number } {
  const profile = profileFor(ctx.activity)
  const season = effectiveSeason(tempC, ctx.now.getMonth())
  const lines: BreakdownLine[] = []
  const add = (key: BreakdownLine['key'], label: string, fit: number | null, weight: number) => {
    const f = fit ?? NEUTRAL // no data: neutral, neither helps nor hurts
    lines.push({ key, label, fit: round1(f * 100) / 100, points: round1(f * weight * 100) })
  }
  add('season', `Suits ${season}`, seasonFit(item, season), WEIGHTS.season)
  add('daynight', `Fits the ${ctx.timeOfDay}`, dayNightFit(item, ctx.timeOfDay), WEIGHTS.daynight)
  add('temperature', `Right for ${Math.round(tempC)} °C`, temperatureFit(item, tempC), WEIGHTS.temperature)
  add('humidity', `Handles ${Math.round(humidity)}% humidity`, humidityFit(item, humidity), WEIGHTS.humidity)
  add('activity', `Fits ${ctx.activity || 'the occasion'}`, activityFit(item, profile).fit, WEIGHTS.activity)
  add('longevity', 'Lasts long enough', longevityFit(item, profile.longevityNeed), WEIGHTS.longevity)

  const days = daysSince(item.lastWornAt, ctx.now)
  const rot = rotationPoints(days, item.wearsLast7Days ?? 0)
  const rate = ratingPoints(item.rating)
  lines.push({ key: 'rotation', label: days === null ? 'Never worn yet' : `Worn ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`, fit: null, points: round1(rot) })
  if (rate !== 0) lines.push({ key: 'rating', label: `Rated ${item.rating}/10`, fit: null, points: round1(rate) })

  const raw = lines.reduce((s, l) => s + l.points, 0)
  const score = clamp(Math.round(raw), 0, 100)
  return { id: item.id, name: item.name, house: item.house ?? '', score, raw, explanation: '', breakdown: lines }
}

/** The best pair among the leaders: good on its own merits and good together. */
function suggestCombo(ranked: (Recommendation & { raw: number })[], byId: Map<number, RecItem>, opts: RecommendOptions): ComboSuggestion | null {
  const pool = ranked.slice(0, 6)
  let best: { value: number; a: RecItem; b: RecItem; analysis: ReturnType<typeof analyzeLayer>; recAvg: number } | null = null
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = byId.get(pool[i].id)!
      const b = byId.get(pool[j].id)!
      const analysis = analyzeLayer([{ item: a, sprays: 1 }, { item: b, sprays: 1 }], opts)
      if (analysis.score < VERDICT_WORTH_TESTING || analysis.verdict === 'Redundant') continue
      const recAvg = (pool[i].score + pool[j].score) / 2
      const value = 0.5 * recAvg + 0.5 * analysis.score
      if (!best || value > best.value) best = { value, a, b, analysis, recAvg }
    }
  }
  if (!best) return null
  const why = best.analysis.reasons.find((r) => r.impact > 0)?.text
  return {
    ids: [best.a.id, best.b.id],
    names: [best.a.name, best.b.name],
    layerScore: best.analysis.score,
    verdict: best.analysis.verdict,
    description: best.analysis.description,
    note: why ?? `Both rank well today (${Math.round(best.recAvg)} on average) and work together.`
  }
}

/**
 * Ranks the collection for today's activity, time of day and weather. Components (all 0-1, weighted): season,
 * day/night, temperature, humidity, activity fit, longevity; then rotation and rating adjust the points.
 */
export function recommend(items: RecItem[], ctx: RecContext, options: RecommendOptions = {}): RecommendResult {
  const assumptions: string[] = []
  let tempC = ctx.weather?.temperatureC ?? null
  let humidity = ctx.weather?.humidity ?? null
  if (tempC === null) {
    tempC = assumedTemperature(ctx.now.getMonth())
    assumptions.push(`No temperature known: assuming ${tempC} °C for this time of year.`)
  }
  if (humidity === null) {
    humidity = 50
    assumptions.push('No humidity known: assuming 50%.')
  }

  const scored = items.map((it) => ({ item: it, rec: scoreItem(it, ctx, tempC!, humidity!) }))
  scored.sort((a, b) => b.rec.raw - a.rec.raw || a.item.name.localeCompare(b.item.name))
  const byId = new Map(items.map((i) => [i.id, i]))
  const ranked = scored.map(({ item, rec }) => ({ ...rec, explanation: explain(item, rec, ctx, tempC!, humidity!, !ctx.weather || ctx.weather.temperatureC === null) }))

  // Top picks: skip near-twins of an already chosen pick so the three are a real choice.
  const want = options.top ?? 3
  const picks: (typeof ranked)[number][] = []
  const pickedVecs: ReturnType<typeof vecOf>[] = []
  for (const r of ranked) {
    if (picks.length >= want) break
    const v = vecOf(byId.get(r.id)!)
    if (pickedVecs.some((p) => cosine(p, v) > 0.92)) continue
    picks.push(r)
    pickedVecs.push(v)
  }
  for (const r of ranked) if (picks.length < want && !picks.includes(r)) picks.push(r) // fewer than 3 distinct: fill up

  const opts: EngineOptions = { affinity: options.affinity ?? buildAffinity(), history: options.history ?? [] }
  const combo = ranked.length >= 2 ? suggestCombo(ranked, byId, opts) : null
  const strip = ({ raw: _raw, ...rest }: (typeof ranked)[number]): Recommendation => rest
  return { picks: picks.map(strip), ranked: ranked.map(strip), combo, assumptions }
}

function vecOf(item: RecItem): Map<string, number> {
  return new Map(item.accords.map((a) => [a.name.trim().toLowerCase(), a.strength / 100]))
}
