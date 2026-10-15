/** Framework-free types for the layering engine (also used by the main process and the renderer). */

export interface LayerNote {
  name: string
  layer: 'top' | 'heart' | 'base' | 'general'
  family?: string | null
}

export interface LayerItem {
  id: number
  name: string
  house?: string
  /** Accord strengths, 0-100. */
  accords: { name: string; strength: number }[]
  notes: LayerNote[]
  /** Community season votes and day/night votes (any scale; only the proportions matter). */
  seasons?: { winter: number; spring: number; summer: number; fall: number } | null
  daynight?: { day: number; night: number } | null
  /** How hard it projects on a 1-4 scale (1 intimate .. 4 enormous): my own average when logged, else the community's. */
  projection?: number | null
}

/** An item as placed in the mixer. */
export interface MixItem {
  item: LayerItem
  /** Number of sprays, i.e. the spray ratio. */
  sprays: number
}

/** A combo I have actually tried and rated, used so the engine learns my taste. */
export interface RatedCombo {
  /** 1-10 */
  rating: number
  items: { accords: { name: string; strength: number }[] }[]
}

export type AffinityMatrix = Record<string, number>

export type Verdict = 'Great pairing' | 'Worth testing' | 'Redundant' | 'Likely to clash'

export interface Reason {
  /** Positive helps the score, negative hurts it. In score points. */
  impact: number
  kind: 'affinity' | 'notes' | 'competition' | 'redundancy' | 'season' | 'taste' | 'balance'
  text: string
}

export interface PairAnalysis {
  a: number
  b: number
  score: number
  reasons: Reason[]
}

export interface LayerAnalysis {
  /** Weighted blend of the accords, strongest = 100. */
  blend: { name: string; strength: number }[]
  /** How much of the blend each fragrance accounts for (sums to 1), after weighting by sprays and projection. */
  shares: { id: number; name: string; share: number }[]
  score: number
  verdict: Verdict
  reasons: Reason[]
  pairs: PairAnalysis[]
  description: string
}
