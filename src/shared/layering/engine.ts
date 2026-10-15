import { affinityOf, buildAffinity, ruleReason } from './affinity'
import { describeBlend } from './describe'
import type { AffinityMatrix, LayerAnalysis, LayerItem, MixItem, PairAnalysis, RatedCombo, Reason, Verdict } from './types'

export interface EngineOptions {
  /** Defaults plus the user's overrides (see buildAffinity). */
  affinity?: AffinityMatrix
  /** Combos I tried and rated; similar combos are nudged up or down. */
  history?: RatedCombo[]
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const round1 = (n: number) => Math.round(n * 10) / 10
const DEFAULT_PROJECTION = 2.5

// Score budget, in points around a neutral 50.
const AFFINITY_POINTS = 35
const AFFINITY_GAIN = 4
const NOTES_MAX = 10
const COMPETITION_MAX = 14
const REDUNDANCY_MAX = 22
const SEASON_POINTS = 8
const TASTE_MAX = 12

export const VERDICT_GREAT = 78
export const VERDICT_WORTH_TESTING = 58

type Vec = Map<string, number>

const toVec = (accords: { name: string; strength: number }[]): Vec => {
  const v: Vec = new Map()
  for (const a of accords) {
    const n = a.name.trim().toLowerCase()
    if (n) v.set(n, Math.max(v.get(n) ?? 0, clamp(a.strength, 0, 100) / 100))
  }
  return v
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (const [k, x] of a) {
    na += x * x
    dot += x * (b.get(k) ?? 0)
  }
  for (const y of b.values()) nb += y * y
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/** A stronger projector dominates more: 0.5x at "intimate" up to 1.7x at "enormous". */
export function perfFactor(projection: number | null | undefined): number {
  return 0.5 + (clamp(projection ?? DEFAULT_PROJECTION, 1, 4) - 1) * 0.4
}

export const weightOf = (m: MixItem): number => Math.max(m.sprays, 0) * perfFactor(m.item.projection)

/** Weighted mix of the fragrances' accord strengths, scaled so the strongest accord is 100. */
export function blendAccords(mix: MixItem[]): { name: string; strength: number }[] {
  const total = mix.reduce((s, m) => s + weightOf(m), 0)
  if (total <= 0) return []
  const sum = new Map<string, number>()
  for (const m of mix) {
    const w = weightOf(m)
    for (const [name, v] of toVec(m.item.accords)) sum.set(name, (sum.get(name) ?? 0) + (w * v) / total)
  }
  const max = Math.max(...sum.values(), 0)
  if (max <= 0) return []
  return [...sum.entries()]
    .map(([name, v]) => ({ name, strength: Math.round((v / max) * 100) }))
    .filter((a) => a.strength >= 4)
    .sort((a, b) => b.strength - a.strength || a.name.localeCompare(b.name))
    .slice(0, 12)
}

export function sharesOf(mix: MixItem[]): { id: number; name: string; share: number }[] {
  const total = mix.reduce((s, m) => s + weightOf(m), 0)
  return mix.map((m) => ({ id: m.item.id, name: m.item.name, share: total > 0 ? weightOf(m) / total : 1 / mix.length }))
}

// ---- pair scoring ---------------------------------------------------------------------------

interface Contribution {
  a: string
  b: string
  c: number
}

/** Average accord-pair affinity, weighted by how strong both accords are. Returns -1..1 plus the biggest contributors. */
function accordAffinity(A: LayerItem, B: LayerItem, matrix: AffinityMatrix): { value: number; parts: Contribution[] } {
  const top = (it: LayerItem) => [...toVec(it.accords)].sort((x, y) => y[1] - x[1]).slice(0, 8)
  const ta = top(A)
  const tb = top(B)
  let num = 0
  let den = 0
  const parts: Contribution[] = []
  for (const [a, sa] of ta) {
    for (const [b, sb] of tb) {
      const w = sa * sb
      den += w
      const c = w * affinityOf(matrix, a, b)
      num += c
      if (c !== 0) parts.push({ a, b, c })
    }
  }
  if (den === 0) return { value: 0, parts: [] }
  // Most accord pairs are neutral, which dilutes the average; the gain puts a clearly good or bad pairing near +-1.
  const scale = AFFINITY_GAIN / den
  return { value: clamp(num * scale, -1, 1), parts: parts.map((p) => ({ ...p, c: p.c * scale })) }
}

function notesBonus(A: LayerItem, B: LayerItem): { points: number; shared: string[] } {
  const byName = new Map(B.notes.map((n) => [n.name.trim().toLowerCase(), n]))
  const shared: string[] = []
  let points = 0
  for (const n of A.notes) {
    const other = byName.get(n.name.trim().toLowerCase())
    if (!other || shared.includes(n.name)) continue
    shared.push(n.name)
    // A note that shows up in a different layer of the other fragrance bridges the two.
    points += other.layer !== n.layer && other.layer !== 'general' && n.layer !== 'general' ? 3.5 : 2.5
  }
  return { points: Math.min(points, NOTES_MAX), shared }
}

const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const

function seasonVec(it: LayerItem): number[] | null {
  const s = it.seasons
  if (!s) return null
  const v = SEASONS.map((k) => Math.max(s[k] ?? 0, 0))
  const sum = v.reduce((a, b) => a + b, 0)
  return sum > 0 ? v.map((x) => x / sum) : null
}

const topSeasons = (v: number[]) =>
  SEASONS.map((s, i) => [s, v[i]] as const)
    .sort((a, b) => b[1] - a[1])
    .filter((x, _i, arr) => x[1] >= arr[0][1] * 0.75)
    .map((x) => x[0])
    .join('/')

function seasonScore(A: LayerItem, B: LayerItem): { points: number; reasons: Reason[] } {
  const reasons: Reason[] = []
  let points = 0
  const va = seasonVec(A)
  const vb = seasonVec(B)
  if (va && vb) {
    const dot = va.reduce((s, x, i) => s + x * vb[i], 0)
    const sim = dot / (Math.sqrt(va.reduce((s, x) => s + x * x, 0)) * Math.sqrt(vb.reduce((s, x) => s + x * x, 0)))
    const raw = clamp((sim - 0.9) / 0.1, -1, 1) // fragrances' season votes are broad, so only strong differences count
    points += raw * SEASON_POINTS
    if (sim >= 0.97) reasons.push({ kind: 'season', impact: round1(raw * SEASON_POINTS), text: `Both suit the same seasons (${topSeasons(va)}).` })
    else if (sim < 0.8) reasons.push({ kind: 'season', impact: round1(raw * SEASON_POINTS), text: `${A.name} is a ${topSeasons(va)} scent and ${B.name} a ${topSeasons(vb)} one, so they rarely fit the same weather.` })
  }
  const da = A.daynight
  const db = B.daynight
  if (da && db && da.day + da.night > 0 && db.day + db.night > 0) {
    const ra = da.day / (da.day + da.night)
    const rb = db.day / (db.day + db.night)
    const diff = Math.abs(ra - rb)
    const p = clamp((0.25 - diff) * 8, -3, 2)
    points += p
    if (diff > 0.4) reasons.push({ kind: 'season', impact: round1(p), text: `${ra > rb ? A.name : B.name} is a daytime scent and ${ra > rb ? B.name : A.name} a night one.` })
  }
  return { points, reasons }
}

interface TasteHit {
  weight: number
  resid: number
  rating: number
}

function tasteAdjustment(A: LayerItem, B: LayerItem, history: RatedCombo[]): { points: number; strongest: TasteHit | null } {
  const a = toVec(A.accords)
  const b = toVec(B.accords)
  let weighted = 0
  let weights = 0
  let strongest: TasteHit | null = null
  for (const combo of history) {
    const vecs = combo.items.map((i) => toVec(i.accords))
    for (let i = 0; i < vecs.length; i++) {
      for (let j = i + 1; j < vecs.length; j++) {
        const sim = Math.max((cosine(a, vecs[i]) + cosine(b, vecs[j])) / 2, (cosine(a, vecs[j]) + cosine(b, vecs[i])) / 2)
        if (sim < 0.6) continue
        const hit: TasteHit = { weight: sim * sim, resid: (combo.rating - 5.5) / 4.5, rating: combo.rating }
        weighted += hit.weight * hit.resid
        weights += hit.weight
        if (!strongest || hit.weight > strongest.weight) strongest = hit
      }
    }
  }
  // The +0.5 keeps a single data point from swinging the score as much as several would.
  return { points: weights > 0 ? clamp((weighted / (weights + 0.5)) * TASTE_MAX, -TASTE_MAX, TASTE_MAX) : 0, strongest }
}

export interface PairDetail extends PairAnalysis {
  redundancy: number
}

function analyzePair(x: MixItem, y: MixItem, opts: Required<EngineOptions>, labelPrefix: string): PairDetail & { ai: number; bi: number } {
  const A = x.item
  const B = y.item
  const reasons: Reason[] = []
  const tag = (t: string) => (labelPrefix ? `${labelPrefix}${t}` : t)

  // 1. accord affinity
  const aff = accordAffinity(A, B, opts.affinity)
  const affPoints = aff.value * AFFINITY_POINTS
  const pos = aff.parts.filter((p) => p.c > 0).sort((p, q) => q.c - p.c)
  const neg = aff.parts.filter((p) => p.c < 0).sort((p, q) => p.c - q.c)
  const describe = (p: Contribution) => {
    const why = ruleReason(p.a, p.b)
    if (p.a === p.b) return `Both lean ${p.a}.`
    if (why) return `${cap(p.a)} with ${p.b}: ${why}.`
    return `${cap(p.a)} and ${p.b} ${p.c > 0 ? 'tend to sit well together' : 'tend to clash'}.`
  }
  for (const p of pos.slice(0, 2)) if (p.c * AFFINITY_POINTS >= 1.2) reasons.push({ kind: 'affinity', impact: round1(p.c * AFFINITY_POINTS), text: tag(describe(p)) })
  for (const p of neg.slice(0, 2)) if (-p.c * AFFINITY_POINTS >= 1.2) reasons.push({ kind: 'affinity', impact: round1(p.c * AFFINITY_POINTS), text: tag(describe(p)) })

  // 2. shared / bridging notes
  const nb = notesBonus(A, B)
  if (nb.points > 0) reasons.push({ kind: 'notes', impact: round1(nb.points), text: tag(`They share ${list(nb.shared.slice(0, 3))}, which ties the two together.`) })

  // 3. two loud fragrances competing
  const wa = weightOf(x)
  const wb = weightOf(y)
  const shareA = wa + wb > 0 ? wa / (wa + wb) : 0.5
  // Only clearly strong projectors count as loud: an average one (2.5) does not compete.
  const loud = (p: number | null | undefined) => clamp((clamp(p ?? DEFAULT_PROJECTION, 1, 4) - 2.5) / 1.5, 0, 1)
  const competition = COMPETITION_MAX * Math.min(loud(A.projection), loud(B.projection)) * (1 - Math.abs(2 * shareA - 1))
  if (competition >= 3) reasons.push({ kind: 'competition', impact: -round1(competition), text: tag(`Both are strong projectors at similar strength, so they compete for attention. Spray one less.`) })

  // 4. near-identical profiles
  const similarity = cosine(toVec(A.accords), toVec(B.accords))
  const redundancy = similarity > 0.8 ? ((similarity - 0.8) / 0.2) * REDUNDANCY_MAX : 0
  if (redundancy >= 3) reasons.push({ kind: 'redundancy', impact: -round1(redundancy), text: tag(`Their accord profiles are ${Math.round(similarity * 100)}% alike, so layering adds little.`) })

  // 5. seasons
  const sea = seasonScore(A, B)
  reasons.push(...sea.reasons.map((r) => ({ ...r, text: tag(r.text) })))

  // 6. learned taste
  const taste = tasteAdjustment(A, B, opts.history)
  if (Math.abs(taste.points) >= 1.5 && taste.strongest) {
    reasons.push({
      kind: 'taste',
      impact: round1(taste.points),
      text: tag(taste.points > 0 ? `You rated a similar pairing ${taste.strongest.rating}/10 before.` : `You rated a similar pairing only ${taste.strongest.rating}/10 before.`)
    })
  }

  const score = clamp(50 + affPoints + nb.points - competition - redundancy + sea.points + taste.points, 0, 100)
  return { a: A.id, b: B.id, ai: 0, bi: 0, score, reasons, redundancy }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

export function verdictFor(score: number, redundancy: number): Verdict {
  if (score >= VERDICT_GREAT) return 'Great pairing'
  if (redundancy >= 10 && score >= 40) return 'Redundant'
  if (score >= VERDICT_WORTH_TESTING) return 'Worth testing'
  return 'Likely to clash'
}

/** Scores a mix of 2-3 fragrances: blended accords, who dominates, a 0-100 score, the reasons for it and a description. */
export function analyzeLayer(mix: MixItem[], options: EngineOptions = {}): LayerAnalysis {
  const opts: Required<EngineOptions> = { affinity: options.affinity ?? buildAffinity(), history: options.history ?? [] }
  const used = mix.filter((m) => m.sprays > 0)
  const blend = blendAccords(used)
  const shares = sharesOf(used)

  if (used.length < 2) return { blend, shares, score: 0, verdict: 'Likely to clash', reasons: [], pairs: [], description: '' }

  const pairs: (PairDetail & { weight: number })[] = []
  for (let i = 0; i < used.length; i++) {
    for (let j = i + 1; j < used.length; j++) {
      const prefix = used.length > 2 ? `${used[i].item.name} + ${used[j].item.name}: ` : ''
      const p = analyzePair(used[i], used[j], opts, prefix)
      pairs.push({ ...p, weight: weightOf(used[i]) * weightOf(used[j]) })
    }
  }
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0) || 1
  let score = pairs.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight
  const reasons: Reason[] = pairs.flatMap((p) => p.reasons)

  if (used.length === 3 && used.every((m) => (m.item.projection ?? DEFAULT_PROJECTION) >= 3)) {
    score -= 4
    reasons.push({ kind: 'competition', impact: -4, text: 'Three strong projectors in one blend get crowded.' })
  }
  score = clamp(score, 0, 100)

  // The single clearest positive or negative fact first.
  reasons.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
  const redundancy = Math.max(...pairs.map((p) => p.redundancy))
  const verdict = verdictFor(score, redundancy)
  return {
    blend,
    shares,
    score: Math.round(score),
    verdict,
    reasons: reasons.slice(0, 7),
    pairs: pairs.map(({ a, b, score: s, reasons: r }) => ({ a, b, score: Math.round(s), reasons: r })),
    description: describeBlend(used, blend, shares)
  }
}

export interface PartnerSuggestion {
  item: LayerItem
  score: number
  verdict: Verdict
  /** One line on why. */
  headline: string
}

/** Ranks `candidates` as partners for `base` (one spray each), best first. */
export function suggestPartners(base: LayerItem, candidates: LayerItem[], options: EngineOptions = {}): PartnerSuggestion[] {
  return candidates
    .filter((c) => c.id !== base.id)
    .map((c) => {
      const r = analyzeLayer([{ item: base, sprays: 1 }, { item: c, sprays: 1 }], options)
      const best = r.reasons.find((x) => x.impact > 0) ?? r.reasons[0]
      const worst = r.reasons.find((x) => x.impact < 0)
      return { item: c, score: r.score, verdict: r.verdict, headline: r.score >= VERDICT_WORTH_TESTING ? (best?.text ?? '') : (worst?.text ?? best?.text ?? '') }
    })
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
}
