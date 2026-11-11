import type { CatalogExtra } from './extra'
import { LAYER_CODE, LAYER_FROM_CODE, norm, type Layer } from './vocab'

/** One row of the derived Discovery table (discover_features), in a form that is cheap to load and score. */
export interface FeatureRow {
  catalogId: number
  fid: number | null
  houseKey: string
  nameKey: string
  concKey: string
  /** "name:strength,name:strength" (strength 0-100) */
  accords: string
  /** "name~layer~weight|name~layer~weight" (layer 0 general, 1 top, 2 heart, 3 base; weight 0-100, 0 = not voted) */
  notes: string
  vWinter: number | null
  vSpring: number | null
  vSummer: number | null
  vFall: number | null
  vDay: number | null
  vNight: number | null
  longevity: number | null
  sillage: number | null
  rating: number | null
  ratingN: number | null
  valueAvg: number | null
  valueN: number | null
  people: number | null
  haveN: number | null
  wantN: number | null
  popularity: number
  popRecent: number | null
  genderLean: number | null
  year: number | null
}

const clean = (s: string) => s.replace(/[,:|~]/g, ' ').replace(/\s+/g, ' ').trim()

export const encodeAccords = (list: { name: string; strength: number }[]): string =>
  list
    .filter((a) => a.name && a.strength > 0)
    .map((a) => `${clean(norm(a.name))}:${Math.min(100, Math.max(0, Math.round(a.strength)))}`)
    .join(',')

export function parseAccords(s: string): { name: string; strength: number }[] {
  if (!s) return []
  const out: { name: string; strength: number }[] = []
  for (const part of s.split(',')) {
    const i = part.lastIndexOf(':')
    if (i > 0) out.push({ name: part.slice(0, i), strength: Number(part.slice(i + 1)) || 0 })
  }
  return out
}

export const encodeNotes = (list: { name: string; layer?: Layer; weight?: number }[]): string =>
  list
    .filter((n) => n.name)
    .map((n) => `${clean(norm(n.name))}~${LAYER_CODE[n.layer ?? 'general']}~${Math.min(100, Math.max(0, Math.round(n.weight ?? 0)))}`)
    .join('|')

export function parseNotes(s: string): { name: string; layer: Layer; weight: number }[] {
  if (!s) return []
  const out: { name: string; layer: Layer; weight: number }[] = []
  for (const part of s.split('|')) {
    const [name, l, w] = part.split('~')
    if (name) out.push({ name, layer: LAYER_FROM_CODE[Number(l)] ?? 'general', weight: Number(w) || 0 })
  }
  return out
}

/** -1 (the community says womens) to +1 (mens), 0 unisex; from the vote counts when there are any, else the official label. */
export function genderLeanOf(cg: CatalogExtra['cg'] | undefined, label: string | null | undefined): number | null {
  if (cg) {
    const total = cg.female + cg.female_leaning + cg.unisex + cg.male_leaning + cg.male
    if (total >= 20) return (cg.male + 0.5 * cg.male_leaning - 0.5 * cg.female_leaning - cg.female) / total
  }
  const l = (label ?? '').toLowerCase()
  return l === 'male' ? 1 : l === 'female' ? -1 : l === 'unisex' ? 0 : null
}

/** The pieces of a catalog row (name, house, mapped data JSON, extras) Discovery needs, as parsed values. */
export interface CatalogSource {
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  popularity: number
  data: {
    gender?: string | null
    notes?: { name: string; layer?: Layer }[]
    accords?: { name: string; strength: number }[]
    community?: { winter?: number; spring?: number; summer?: number; fall?: number; day?: number; night?: number; longevity?: number; sillage?: number } | null
  }
  extra: CatalogExtra | null
}

const orNull = (v: number | undefined | null): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function buildFeatureRow(c: CatalogSource): FeatureRow {
  const cm = c.data.community ?? {}
  const nw = c.extra?.nw ?? {}
  return {
    catalogId: c.id,
    fid: c.extra?.fid ?? null,
    houseKey: norm(c.house),
    nameKey: norm(c.name),
    concKey: norm(c.concentration ?? ''),
    accords: encodeAccords(c.data.accords ?? []),
    notes: encodeNotes((c.data.notes ?? []).map((n) => ({ name: n.name, layer: n.layer, weight: nw[n.name] ?? 0 }))),
    vWinter: orNull(cm.winter),
    vSpring: orNull(cm.spring),
    vSummer: orNull(cm.summer),
    vFall: orNull(cm.fall),
    vDay: orNull(cm.day),
    vNight: orNull(cm.night),
    longevity: orNull(cm.longevity),
    sillage: orNull(cm.sillage),
    rating: c.extra?.rating?.a ?? null,
    ratingN: c.extra?.rating?.n ?? null,
    valueAvg: c.extra?.value?.a ?? null,
    valueN: c.extra?.value?.n ?? null,
    people: c.extra?.people ?? null,
    haveN: c.extra?.rel?.have ?? null,
    wantN: c.extra?.rel?.want ?? null,
    popularity: Math.max(0, Math.round(c.popularity || 0)),
    popRecent: c.extra?.recent ?? null,
    genderLean: genderLeanOf(c.extra?.cg, c.data.gender),
    year: c.year
  }
}
