import { plural } from './vocab'

/** How strongly the "smells like" votes back a link: agreement times how many people (0-1, saturating around a few thousand net votes). */
export function evidenceStrength(up: number, down: number): number {
  const net = up - down
  if (net <= 0 || up + down <= 0) return 0
  return Math.min(1, Math.log10(1 + net) / 3.2) * (up / (up + down))
}

/** Counts of 1,000 or more on the dataset are approximate (the page abbreviates them). */
export const approxVotes = (n: number): string => (n >= 1000 ? `about ${plural(n, 'person', 'people')}` : plural(n, 'person', 'people'))

/**
 * Blends accord and note similarity with the votes. With votes the evidence counts a little more than the profile; without any
 * the profile alone is capped at 80, since similar accords do not make a clone.
 */
export function dupeScore(profileSimilarity: number, evidence: number | null): number {
  const p = Math.max(0, Math.min(1, profileSimilarity))
  return Math.round(100 * (evidence == null ? 0.8 * p : 0.45 * p + 0.55 * evidence))
}

export interface MoneyFacts {
  /** My price per ml (paid, else market), when I have bottles of it with a price. */
  perMl: number | null
}

/** "cheaper" is only said when both prices are mine; the community value votes are quoted as votes, never as a price. */
export function compareValue(
  candidate: { mine: MoneyFacts; valueAvg: number | null; valueN: number | null },
  source: { mine: MoneyFacts; valueAvg: number | null; valueN: number | null },
  currency: string
): { cheaper: boolean | null; lines: string[] } {
  const lines: string[] = []
  let cheaper: boolean | null = null
  if (candidate.mine.perMl != null && source.mine.perMl != null) {
    cheaper = candidate.mine.perMl < source.mine.perMl
    lines.push(`my prices: ${currency} ${candidate.mine.perMl.toFixed(2)}/ml against ${currency} ${source.mine.perMl.toFixed(2)}/ml (${cheaper ? 'cheaper' : 'not cheaper'})`)
  } else if (source.mine.perMl != null) lines.push(`you paid ${currency} ${source.mine.perMl.toFixed(2)}/ml for the original; there is no price on file for this one`)
  if (candidate.valueAvg != null && (candidate.valueN ?? 0) >= 30) {
    const src = source.valueAvg != null && (source.valueN ?? 0) >= 30 ? ` (the original: ${source.valueAvg.toFixed(1)}/5)` : ''
    lines.push(`community value votes: ${candidate.valueAvg.toFixed(1)}/5 from ${plural(candidate.valueN ?? 0, 'vote')}${src}. These are opinions on value, not a price`)
  }
  return { cheaper, lines }
}
