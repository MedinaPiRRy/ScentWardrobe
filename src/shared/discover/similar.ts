import type { FeatureIndex } from './index'
import { rankForYou, type ForYouOptions, type ForYouResult } from './rank'
import type { LibraryItem, TasteEntry } from './taste'
import { FAMILIES, inFamily, norm } from './vocab'

/** A fragrance used as a starting point ("more like this"): from my library or from the dataset. */
export interface Seed {
  name: string
  accords: { name: string; strength: number }[]
  notes: { name: string; layer?: 'top' | 'heart' | 'base' | 'general' }[]
  /** Community averages (sillage 1-4, longevity 1-5) when known. */
  sillage?: number | null
  longevity?: number | null
  /** Row in the index, so the seed itself is left out of the results. */
  row?: number
}

/** "Like X, but ...". Each runs from -1 to +1 (0 = unchanged); drydown and unusual only go one way (0 to 1). */
export interface Sliders {
  /** -1 less sweet .. +1 sweeter */
  sweet: number
  /** -1 warmer, richer .. +1 fresher */
  fresh: number
  /** -1 quieter .. +1 louder */
  projection: number
  /** -1 shorter .. +1 longer lasting */
  longevity: number
  /** 0 same drydown .. 1 a different one */
  drydown: number
  /** 0 as popular as the seeds .. 1 more unusual (less common, odder accords) */
  unusual: number
}
export const NO_SLIDERS: Sliders = { sweet: 0, fresh: 0, projection: 0, longevity: 0, drydown: 0, unusual: 0 }

export const slidersActive = (s: Sliders): boolean => Object.values(s).some((v) => Math.abs(v) > 0.05)

export interface SeedProfile {
  accords: TasteEntry[]
  notes: TasteEntry[]
  /** The same accords before the sliders were applied. */
  before: TasteEntry[]
  /** What the sliders changed, in words. */
  changes: string[]
  sillage: number | null
  longevity: number | null
  baseNotes: Set<string>
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/** Averages the seeds into one target and applies the sliders. Pure. */
export function seedProfile(seeds: Seed[], s: Sliders = NO_SLIDERS): SeedProfile {
  const acc = new Map<string, number>()
  const notes = new Map<string, number>()
  const baseNotes = new Set<string>()
  for (const seed of seeds) {
    for (const a of seed.accords) acc.set(norm(a.name), (acc.get(norm(a.name)) ?? 0) + Math.max(a.strength, 0) / 100 / seeds.length)
    for (const n of seed.notes) {
      notes.set(norm(n.name), (notes.get(norm(n.name)) ?? 0) + 1 / seeds.length)
      if (n.layer === 'base') baseNotes.add(norm(n.name))
    }
  }
  const asEntries = (m: Map<string, number>): TasteEntry[] =>
    [...m]
      .filter(([, w]) => w > 0.01)
      .map(([name, weight]) => ({ name, weight: Math.min(weight, 1), negative: 0 }))
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
  const before = asEntries(acc)

  const changes: string[] = []
  const edit = (family: keyof typeof FAMILIES, t: number, add: string[], label: string): void => {
    if (Math.abs(t) <= 0.05) return
    const touched: string[] = []
    for (const m of [acc, notes]) {
      for (const [k, w] of [...m]) {
        if (inFamily(family, k)) {
          m.set(k, t < 0 ? w * (1 - 0.85 * -t) : w * (1 + t))
          if (m === acc && w > 0.1) touched.push(k)
        }
      }
    }
    if (t > 0) for (const k of add) if (!acc.has(k)) acc.set(k, 0.35 * t)
    changes.push(t < 0 ? `${label}: turned down ${touched.slice(0, 3).join(', ') || 'nothing in these seeds'}` : `${label}: turned up ${[...touched, ...add.filter((k) => !touched.includes(k))].slice(0, 3).join(', ')}`)
  }
  edit('sweet', s.sweet, ['sweet', 'vanilla'], s.sweet < 0 ? 'Less sweet' : 'Sweeter')
  if (s.fresh > 0.05) edit('fresh', s.fresh, ['citrus', 'fresh', 'aquatic', 'green'], 'Fresher')
  else if (s.fresh < -0.05) {
    edit('fresh', s.fresh, [], 'Less fresh')
    for (const [k, w] of [...acc]) if (inFamily('warm', k)) acc.set(k, w * (1 + -s.fresh * 0.6))
    changes.push('Less fresh: warm accords turned up')
  }
  if (s.drydown > 0.05) {
    for (const k of baseNotes) notes.set(k, (notes.get(k) ?? 0) * (1 - 0.9 * s.drydown))
    changes.push(`Different drydown: the base notes of the seeds (${[...baseNotes].slice(0, 3).join(', ') || 'none listed'}) count for less`)
  }
  if (Math.abs(s.projection) > 0.05) changes.push(s.projection > 0 ? 'Louder: prefers a bigger sillage than the seeds' : 'Quieter: prefers a smaller sillage than the seeds')
  if (Math.abs(s.longevity) > 0.05) changes.push(s.longevity > 0 ? 'Longer lasting: prefers more longevity than the seeds' : 'Shorter lasting: prefers less longevity than the seeds')
  if (s.unusual > 0.05) changes.push('More unusual: favours less common fragrances and odder accords (leather, smoke, oud, earth)')

  const after = asEntries(acc)
  const top = (e: TasteEntry[]) => e.slice(0, 4).map((x) => x.name).join(', ')
  if (changes.length && top(before) !== top(after)) changes.push(`Top accords: ${top(before)} became ${top(after)}`)
  return {
    accords: after,
    notes: asEntries(notes),
    before,
    changes,
    sillage: mean(seeds.map((x) => x.sillage).filter((x): x is number => typeof x === 'number')),
    longevity: mean(seeds.map((x) => x.longevity).filter((x): x is number => typeof x === 'number')),
    baseNotes
  }
}

/** Fragrances like the seeds, shifted by the sliders. Never includes the seeds themselves. */
export function rankSimilar(index: FeatureIndex, seeds: Seed[], sliders: Sliders, library: LibraryItem[], opts: ForYouOptions = {}): ForYouResult & { profile: SeedProfile } {
  const profile = seedProfile(seeds, sliders)
  const seedSil = profile.sillage ?? 2.5
  const seedLong = profile.longevity ?? 3.5
  const unusualIds = new Set<number>()
  for (const [name, id] of index.accordIds) if (inFamily('unusual', name)) unusualIds.add(id)
  const baseIds = new Set<number>()
  for (const n of profile.baseNotes) {
    const id = index.noteIds.get(n)
    if (id !== undefined) baseIds.add(id)
  }
  const active = slidersActive(sliders)

  const adjust = (i: number): number => {
    if (!active) return 1
    let m = 1
    if (Math.abs(sliders.projection) > 0.05) {
      const sil = index.sillage[i]
      m *= Number.isNaN(sil) ? 0.9 : 1 - 0.35 * Math.min(1, Math.abs(sil - (seedSil + sliders.projection * 1.2)) / 2.5)
    }
    if (Math.abs(sliders.longevity) > 0.05) {
      const l = index.longevity[i]
      m *= Number.isNaN(l) ? 0.9 : 1 - 0.35 * Math.min(1, Math.abs(l - (seedLong + sliders.longevity * 1.4)) / 3)
    }
    if (sliders.unusual > 0.05) {
      let odd = 0
      let total = 0
      for (let k = index.accOff[i]; k < index.accOff[i + 1]; k++) {
        total += index.accVal[k]
        if (unusualIds.has(index.accIdx[k])) odd += index.accVal[k]
      }
      m *= 1 + sliders.unusual * (0.35 * (1 - index.popRank[i]) + 0.25 * (total > 0 ? odd / total : 0))
    }
    if (sliders.drydown > 0.05 && baseIds.size) {
      let base = 0
      let overlap = 0
      for (let k = index.noteOff[i]; k < index.noteOff[i + 1]; k++) {
        if (index.noteLayer[k] === 3) {
          base++
          if (baseIds.has(index.noteIdx[k])) overlap++
        }
      }
      m *= 1 - sliders.drydown * 0.4 * (base > 0 ? overlap / base : 0)
    }
    return m
  }

  const exclude = new Set(opts.exclude ?? [])
  for (const s of seeds) if (s.row !== undefined) exclude.add(s.row)
  // The user's own dislikes are not applied here: the seeds say what to look for.
  const explainFrom: LibraryItem[] = seeds.map((x, k) => ({ id: -1 - k, name: x.name, house: '', accords: x.accords, notes: x.notes.map((n) => n.name), rating: null, wearCount: 0, wardrobes: ['collection'] }))
  const result = rankForYou(index, profile, library, { ...opts, exclude, adjust, explainFrom, minFit: opts.minFit ?? 0.2 })
  return { ...result, profile }
}
