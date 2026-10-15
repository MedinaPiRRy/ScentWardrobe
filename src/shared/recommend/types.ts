import type { LayerItem, Verdict } from '../layering/types'

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

/** A collection fragrance as the recommender sees it. */
export interface RecItem extends LayerItem {
  /** Longevity on the community's 1-5 scale: mine once I have logged 2+ durations, else the community's. */
  longevity?: number | null
  /** My rating, 1-10. Only a tiebreaker. */
  rating?: number | null
  /** When I last wore it, 'YYYY-MM-DD ...' local time. */
  lastWornAt?: string | null
  /** Wears in the last 7 days. */
  wearsLast7Days?: number
  wearCount?: number
}

export interface WeatherNow {
  temperatureC: number | null
  /** Relative humidity, percent. */
  humidity: number | null
  condition?: string | null
}

export interface RecContext {
  activity: string
  timeOfDay: TimeOfDay
  /** null when offline and nothing was entered: the engine then assumes a typical temperature for the month. */
  weather: WeatherNow | null
  now: Date
}

export type BreakdownKey = 'season' | 'daynight' | 'temperature' | 'humidity' | 'activity' | 'longevity' | 'rotation' | 'rating'

export interface BreakdownLine {
  key: BreakdownKey
  label: string
  /** 0-1 for the weighted components; null for the point adjustments. */
  fit: number | null
  /** Points added to the score (can be negative for adjustments). */
  points: number
}

export interface Recommendation {
  id: number
  name: string
  house: string
  /** 0-100 */
  score: number
  /** One sentence, e.g. "Cold and dry evening, date night: warm vanilla-amber profile, moderate projection, not worn in 9 days." */
  explanation: string
  breakdown: BreakdownLine[]
}

export interface ComboSuggestion {
  ids: number[]
  names: string[]
  layerScore: number
  verdict: Verdict
  description: string
  /** Why this pair was picked. */
  note: string
}

export interface RecommendResult {
  picks: Recommendation[]
  /** Every candidate, best first. */
  ranked: Recommendation[]
  combo: ComboSuggestion | null
  /** What the engine assumed, e.g. "no weather entered: assuming 14 °C". */
  assumptions: string[]
}
