import { encodeAccords, encodeNotes, type FeatureRow } from './features'
import type { Layer } from './vocab'

/** A tiny deterministic random generator, so fixtures are the same on every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const ACCORD_POOL = ['citrus', 'woody', 'fresh', 'amber', 'vanilla', 'sweet', 'aromatic', 'fresh spicy', 'warm spicy', 'musky', 'floral', 'white floral', 'powdery', 'leather', 'tobacco', 'aquatic', 'green', 'fruity', 'oud', 'rose', 'earthy', 'smoky', 'balsamic', 'herbal', 'lavender', 'iris', 'coconut', 'caramel', 'coffee', 'mineral']
export const NOTE_POOL = ['bergamot', 'lemon', 'vetiver', 'cedar', 'sandalwood', 'patchouli', 'vanilla', 'tonka bean', 'amber', 'musk', 'jasmine', 'rose', 'lavender', 'pepper', 'cardamom', 'cinnamon', 'leather', 'tobacco', 'oakmoss', 'ambroxan', 'iris', 'orange', 'grapefruit', 'mint', 'sage', 'incense', 'oud', 'coffee', 'caramel', 'coconut']

export interface SyntheticOptions {
  seed?: number
  /** Give every row rating/people/extra numbers like a full dump import (otherwise only the plain catalog fields). */
  withExtras?: boolean
}

/** Invented rows: names like "Synthetic 000123", random accords, notes and votes. No real data. */
export function syntheticRows(n: number, opts: SyntheticOptions = {}): FeatureRow[] {
  const r = rng(opts.seed ?? 1)
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)]
  const rows: FeatureRow[] = []
  for (let i = 1; i <= n; i++) {
    const accords = new Map<string, number>()
    const na = 3 + Math.floor(r() * 7)
    for (let k = 0; k < na; k++) accords.set(pick(ACCORD_POOL), Math.round(30 + r() * 70))
    const layers: Layer[] = ['top', 'heart', 'base']
    const notes: { name: string; layer: Layer; weight: number }[] = []
    const nn = 6 + Math.floor(r() * 12)
    for (let k = 0; k < nn; k++) notes.push({ name: pick(NOTE_POOL), layer: layers[k % 3], weight: opts.withExtras === false ? 0 : Math.round(r() * 100) })
    const votes = () => Math.floor(r() * r() * 5000)
    const pop = Math.floor(r() * r() * 100000)
    rows.push({
      catalogId: i,
      fid: 100000 + i,
      houseKey: `house ${i % 400}`,
      nameKey: `synthetic ${String(i).padStart(6, '0')}`,
      concKey: '',
      accords: encodeAccords([...accords].map(([name, strength]) => ({ name, strength }))),
      notes: encodeNotes(notes),
      vWinter: votes(), vSpring: votes(), vSummer: votes(), vFall: votes(), vDay: votes(), vNight: votes(),
      longevity: 1.5 + r() * 3.4,
      sillage: 1.3 + r() * 2.3,
      rating: opts.withExtras === false ? null : 3.2 + r() * 1.6,
      ratingN: opts.withExtras === false ? null : Math.floor(50 + r() * r() * 8000),
      valueAvg: null, valueN: null,
      people: opts.withExtras === false ? null : Math.floor(100 + r() * r() * 20000),
      haveN: null, wantN: null,
      popularity: pop,
      popRecent: Math.floor(pop * r() * 0.5),
      genderLean: r() * 2 - 1,
      year: 1990 + Math.floor(r() * 36)
    })
  }
  return rows
}
