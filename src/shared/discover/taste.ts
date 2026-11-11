import { norm, plural } from './vocab'

export type WardrobeName = 'collection' | 'wishlist' | 'to_try' | 'had' | 'garbage'

/** What Discovery needs to know about one fragrance of mine. */
export interface LibraryItem {
  id: number
  name: string
  house: string
  concentration?: string | null
  accords: { name: string; strength: number }[]
  notes: string[]
  /** 1-10 or null (not rated yet) */
  rating: number | null
  wearCount: number
  wardrobes: WardrobeName[]
  /** Worn but not owned. */
  isForeign?: boolean
}

export type Override = 'love' | 'mute' | 'avoid'
export interface TasteOverrides {
  accords: Record<string, Override>
  notes: Record<string, Override>
}
export const NO_OVERRIDES: TasteOverrides = { accords: {}, notes: {} }

export interface TasteEntry {
  name: string
  /** 0-1 how much my library points toward it. */
  weight: number
  /** 0-1 how much of what I dislike has it (Garbage Perfumes and low ratings). */
  negative: number
  override?: Override
}

export interface TasteProfile {
  accords: TasteEntry[]
  notes: TasteEntry[]
  /** Plain words. */
  summary: string
  /** How many fragrances pull toward and away, and how many were used in total. */
  basedOn: { positive: number; negative: number; total: number }
  /** The fragrances that shaped it most, for "why". */
  anchors: { id: number; name: string; weight: number }[]
}

/**
 * How strongly one fragrance of mine pulls the taste toward (positive) or away from (negative) its accords.
 *
 * - Where it lives: Collection 1, Had 0.6 (I owned it), Wishlist 0.5, To Try 0.4, not mine but worn 0.5. Garbage Perfumes is -1.
 * - My rating changes it: 1-3 flips it negative (rated 1 is -0.8), 4-6 about 0.7-1.0, 7-10 up to 1.5.
 * - Wearing it a lot counts for more (up to +60% at 30 wears), but never rescues a low rating.
 */
export function libraryWeight(item: LibraryItem): number {
  if (item.wardrobes.includes('garbage')) return -1
  const base = item.wardrobes.includes('collection')
    ? 1
    : item.wardrobes.includes('had')
      ? 0.6
      : item.wardrobes.includes('wishlist')
        ? 0.5
        : item.wardrobes.includes('to_try')
          ? 0.4
          : item.isForeign && item.wearCount > 0
            ? 0.5
            : 0
  if (base === 0) return 0
  const r = item.rating
  const factor = r == null ? 1 : r <= 3 ? -(0.8 - (r - 1) * 0.25) : r <= 6 ? 0.7 + (r - 4) * 0.15 : 1 + (r - 6) * 0.125
  if (factor < 0) return factor * base
  const wearBoost = 1 + Math.min(Math.log(1 + item.wearCount) / Math.log(31), 1) * 0.6
  return base * factor * (item.wearCount > 0 ? wearBoost : 1)
}

const NOTE_MIN_SHARE = 0.04

/** Builds the taste profile from my library, then applies my own edits. Pure. */
export function buildTaste(items: LibraryItem[], overrides: TasteOverrides = NO_OVERRIDES): TasteProfile {
  const accPos = new Map<string, number>()
  const accNeg = new Map<string, number>()
  const notePos = new Map<string, number>()
  const noteNeg = new Map<string, number>()
  let posTotal = 0
  let negTotal = 0
  let positive = 0
  let negative = 0
  const anchors: { id: number; name: string; weight: number }[] = []

  for (const it of items) {
    const w = libraryWeight(it)
    if (w === 0) continue
    if (w > 0) {
      positive++
      posTotal += w
      anchors.push({ id: it.id, name: it.name, weight: w })
    } else {
      negative++
      negTotal += -w
    }
    const target = w > 0 ? accPos : accNeg
    const noteTarget = w > 0 ? notePos : noteNeg
    for (const a of it.accords) {
      const k = norm(a.name)
      if (k) target.set(k, (target.get(k) ?? 0) + Math.abs(w) * (Math.max(a.strength, 0) / 100))
    }
    for (const n of it.notes) {
      const k = norm(n)
      if (k) noteTarget.set(k, (noteTarget.get(k) ?? 0) + Math.abs(w))
    }
  }

  const scale = (m: Map<string, number>, total: number, top: number) => new Map([...m].map(([k, v]) => [k, total > 0 ? v / total / (top || 1) : 0]))
  const topOf = (m: Map<string, number>, total: number) => Math.max(0, ...[...m.values()].map((v) => (total > 0 ? v / total : 0)))
  const accTop = topOf(accPos, posTotal)
  const noteTop = topOf(notePos, posTotal)
  // Negative values use the positive scale so that a few disliked fragrances do not look like a whole personality.
  const accP = scale(accPos, posTotal, accTop)
  const accN = scale(accNeg, posTotal || negTotal, accTop)
  const noteP = scale(notePos, posTotal, noteTop)
  const noteN = scale(noteNeg, posTotal || negTotal, noteTop)

  const entries = (pos: Map<string, number>, neg: Map<string, number>, ov: Record<string, Override>, min: number): TasteEntry[] => {
    const names = new Set([...pos.keys(), ...neg.keys(), ...Object.keys(ov)])
    const out: TasteEntry[] = []
    for (const name of names) {
      let weight = Math.min(pos.get(name) ?? 0, 1)
      let negativeV = Math.min(neg.get(name) ?? 0, 1)
      const override = ov[name]
      if (override === 'love') weight = Math.max(weight, 0.9)
      if (override === 'mute' || override === 'avoid') {
        weight = 0
        negativeV = override === 'mute' ? 0 : negativeV
      }
      if (weight < min && negativeV < min && !override) continue
      out.push({ name, weight, negative: negativeV, ...(override ? { override } : {}) })
    }
    return out.sort((a, b) => b.weight - a.weight || b.negative - a.negative || a.name.localeCompare(b.name))
  }
  const accords = entries(accP, accN, overrides.accords, 0.02)
  const notes = entries(noteP, noteN, overrides.notes, NOTE_MIN_SHARE)

  anchors.sort((a, b) => b.weight - a.weight || a.id - b.id)
  return {
    accords,
    notes,
    anchors: anchors.slice(0, 5),
    basedOn: { positive, negative, total: positive + negative },
    summary: tasteSummary(accords, positive, negative)
  }
}

/** A few plain sentences about the profile. */
export function tasteSummary(accords: TasteEntry[], positive: number, negative: number): string {
  const loved = accords.filter((a) => a.weight > 0 && a.override !== 'avoid')
  if (positive === 0) return 'There is nothing in your library to learn from yet. Add fragrances to My Collection (and rate them) and your taste profile appears here.'
  const names = (list: TasteEntry[]) => list.map((a) => a.name)
  const join = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
  const main = names(loved.slice(0, 3))
  const support = names(loved.slice(3, 6))
  const parts: string[] = []
  parts.push(`Your library leans ${join(main)}${support.length ? `, with ${join(support)} in support` : ''}.`)
  const avoided = accords.filter((a) => a.override === 'avoid' || (a.negative >= 0.25 && a.weight < 0.15))
  if (avoided.length) parts.push(`You steer away from ${join(names(avoided.slice(0, 3)))}.`)
  const edited = accords.filter((a) => a.override === 'love')
  if (edited.length) parts.push(`You asked for more ${join(names(edited.slice(0, 3)))}.`)
  parts.push(`Built from ${plural(positive, 'fragrance')} you like${negative ? ` and ${plural(negative, 'one')} you do not` : ''}${positive < 4 ? ', so treat it as a rough first picture' : ''}.`)
  return parts.join(' ')
}
