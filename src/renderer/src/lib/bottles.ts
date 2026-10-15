import type { Bottle } from '@shared/types'

export const LOW_LEVEL_THRESHOLD = 0.15
export const DEFAULT_SPRAYS_PER_WEAR = 4

export interface BottleStats {
  /** 0-100 */
  percent: number
  low: boolean
  /** Null when the bottle isn't active. */
  wearsLeft: number | null
}

/** Level and estimated wears left, using the average sprays per wear (or a default when nothing is logged). */
export function bottleStats(b: Bottle, avgSprays: number | null, threshold = LOW_LEVEL_THRESHOLD): BottleStats {
  const fraction = b.sizeMl > 0 ? Math.min(Math.max(b.remainingMl / b.sizeMl, 0), 1) : 0
  const active = b.status === 'active'
  const perWear = (avgSprays && avgSprays > 0 ? avgSprays : DEFAULT_SPRAYS_PER_WEAR) * b.mlPerSpray
  return {
    percent: Math.round(fraction * 100),
    low: active && fraction < threshold,
    wearsLeft: active && perWear > 0 ? Math.floor(b.remainingMl / perWear) : null
  }
}

export function formatMl(n: number): string {
  return `${Number.isInteger(n) ? n : Math.round(n * 10) / 10} ml`
}
