import type { ColumnMapping, CommunityData, FragranceInput, MappingField, NoteLayer } from '@shared/types'
import type { Row } from './sources'

export const MAPPING_FIELDS: { field: MappingField; label: string; multi?: boolean }[] = [
  { field: 'name', label: 'Name' },
  { field: 'house', label: 'House / brand' },
  { field: 'year', label: 'Year' },
  { field: 'concentration', label: 'Concentration' },
  { field: 'perfumers', label: 'Perfumer(s)', multi: true },
  { field: 'gender', label: 'Gender' },
  { field: 'description', label: 'Description' },
  { field: 'imageUrl', label: 'Image URL' },
  { field: 'sourceUrl', label: 'Source URL' },
  { field: 'notesTop', label: 'Top notes' },
  { field: 'notesHeart', label: 'Heart / middle notes' },
  { field: 'notesBase', label: 'Base notes' },
  { field: 'notesGeneral', label: 'General notes (no pyramid)' },
  { field: 'accords', label: 'Main accords', multi: true },
  { field: 'externalId', label: 'Fragrantica id (to build image / page links)' },
  { field: 'popularity', label: 'Popularity (ranks search results)' },
  { field: 'seasonWinter', label: 'Winter votes' },
  { field: 'seasonSpring', label: 'Spring votes' },
  { field: 'seasonSummer', label: 'Summer votes' },
  { field: 'seasonFall', label: 'Fall / autumn votes' },
  { field: 'dayVotes', label: 'Day votes' },
  { field: 'nightVotes', label: 'Night votes' },
  { field: 'longevity', label: 'Community longevity (1-5)' },
  { field: 'sillage', label: 'Community sillage (1-4)' }
]

// Header patterns, tried in order. First pattern that matches a still-unused column wins.
const HEADER_HINTS: [MappingField, RegExp][] = [
  ['name', /^(perfume|perfume[_ ]?name|name|title|fragrance|fragrance[_ ]?name)$/i],
  ['house', /^(brand|house|designer|maker|company)$/i],
  ['year', /^(year|launch(ed)?([_ ]?year)?|release[_ ]?year)$/i],
  ['concentration', /^(concentration|conc|type|strength)$/i],
  ['perfumers', /^(perfumers?\d*|nose|noses|creators?)$/i],
  ['gender', /^(gender|for)$/i],
  ['imageUrl', /(image|img|photo|picture|thumb)/i],
  ['sourceUrl', /^(url|link|source|source[_ ]?url|page)$/i],
  ['notesTop', /(^|[_ ])top([_ ]?notes?)?$/i],
  ['notesHeart', /(middle|heart|mid)([_ ]?notes?)?$/i],
  ['notesBase', /(^|[_ ])base([_ ]?notes?)?$/i],
  ['notesGeneral', /^(notes?|all[_ ]?notes|notes[_ ]flat|flat[_ ]notes|notes_flat)$/i],
  ['accords', /(main)?[_ ]?accords?\d*$/i],
  ['externalId', /^(id|fragrantica[_ ]?id|perfume[_ ]?id)$/i],
  ['seasonWinter', /^(season[_ ])?winter$/i],
  ['seasonSpring', /^(season[_ ])?spring$/i],
  ['seasonSummer', /^(season[_ ])?summer$/i],
  ['seasonFall', /^(season[_ ])?(fall|autumn)$/i],
  ['dayVotes', /^(day|daytime)$/i],
  ['nightVotes', /^(night|nighttime)$/i],
  ['longevity', /^longevity([_ ]?(avg|average|rating))?$/i],
  ['sillage', /^sillage([_ ]?(avg|average|rating))?$/i]
]

/** When several columns could be a popularity measure, prefer them in this order. */
const POPULARITY_PREFERENCE = ['magnitude', 'popularity', 'people', 'vote_count', 'rating_count', 'have']

export function suggestMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const used = new Set<string>()
  for (const [field, re] of HEADER_HINTS) {
    const multi = MAPPING_FIELDS.find((f) => f.field === field)?.multi
    const hits = columns.filter((c) => !used.has(c) && re.test(c.trim()))
    if (hits.length === 0) continue
    const chosen = multi ? hits : [hits[0]]
    mapping[field] = chosen
    chosen.forEach((c) => used.add(c))
  }
  const pop = POPULARITY_PREFERENCE.map((n) => columns.find((c) => c.trim().toLowerCase() === n)).find(Boolean)
  if (pop) mapping.popularity = [pop]
  return mapping
}

// ---- value cleaning -------------------------------------------------------------------------

const small = new Set(['de', 'di', 'du', 'la', 'le', 'des', 'and', 'of', 'the', 'for', 'a', 'al', 'el'])

/** "tihota-indult" style slugs become "Tihota Indult"; ordinary text is left alone. */
export function prettify(value: string): string {
  const v = value.trim()
  if (!v) return ''
  if (/\s/.test(v) || !/-/.test(v)) return v
  return v
    .split('-')
    .filter(Boolean)
    .map((w, i) => (i > 0 && small.has(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ')
}

/** prettify(), plus capitalisation for values that are entirely lowercase (many datasets lowercase brands). */
export function tidy(value: string): string {
  const p = prettify(value)
  return p && p === p.toLowerCase() ? titleCase(p) : p
}

// Full phrases are stripped from the end of a name ("Sauvage Eau de Parfum" -> "Sauvage" + EDP). Bare words
// ("Parfum", "Cologne", "Elixir") are often part of the product name ("Cologne Indélébile", "Mon Parfum"), so they
// only set the concentration and the name is left alone.
const CONCENTRATION_PHRASES: [RegExp, string][] = [
  [/\s+extrait de parfum\s*$/i, 'Extrait de Parfum'],
  [/\s+eau de parfum\s*$/i, 'EDP'],
  [/\s+eau de toilette\s*$/i, 'EDT'],
  [/\s+eau de cologne\s*$/i, 'EDC'],
  [/\s+(EDP)\s*$/, 'EDP'],
  [/\s+(EDT)\s*$/, 'EDT']
]
const CONCENTRATION_WORDS: [RegExp, string][] = [
  [/(?<!\bde)\s(parfum|perfume)\s*$/i, 'Parfum'],
  [/\selixir\s*$/i, 'Elixir'],
  [/\sextrait\s*$/i, 'Extrait de Parfum'],
  [/\scologne\s*$/i, 'Cologne']
]

/** Removes "for women", the trailing house and a trailing concentration phrase from a name. */
export function cleanName(rawName: string, house: string): { name: string; concentration: string | null } {
  let name = tidy(rawName)
  name = name.replace(/\s+for\s+(women and men|men and women|women|men)\s*$/i, '').trim()
  if (house) {
    const h = house.trim()
    const re = new RegExp(`\\s+${h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i')
    if (re.test(name) && name.replace(re, '').trim()) name = name.replace(re, '').trim()
  }
  for (const [re, label] of CONCENTRATION_PHRASES) {
    if (re.test(name)) {
      const stripped = name.replace(re, '').trim()
      if (stripped) return { name: stripped, concentration: label }
    }
  }
  for (const [re, label] of CONCENTRATION_WORDS) if (re.test(name)) return { name, concentration: label }
  return { name, concentration: null }
}

export function normalizeGender(v: string): string | null {
  const t = v.trim().toLowerCase()
  if (!t) return null
  if (/unisex|women and men|men and women|both/.test(t)) return 'unisex'
  if (/^(f|female|woman|women|for women|ladies)$/.test(t)) return 'for women'
  if (/^(m|male|man|men|for men|gentlemen)$/.test(t)) return 'for men'
  return t
}

export const titleCase = (s: string) => s.replace(/(^|[\s-])([a-zà-ÿ])/g, (_, a: string, b: string) => a + b.toUpperCase())

export function splitList(value: string): string[] {
  const v = value.trim()
  if (!v) return []
  if (v.startsWith('[')) {
    try {
      const arr = JSON.parse(v) as unknown[]
      return arr.map((x) => String(x).trim()).filter(Boolean)
    } catch {
      /* fall through to text splitting */
    }
  }
  const sep = v.includes('|') ? '|' : v.includes(',') ? ',' : v.includes(';') ? ';' : ','
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of v.split(sep)) {
    const t = part.trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      out.push(t)
    }
  }
  return out
}

/** Splits "Orange:100|Bergamot:28" (name:weight) or plain lists; weights are dropped. */
export function parseNotes(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of splitList(value)) {
    const name = part.replace(/:\s*\d+(\.\d+)?\s*$/, '').trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    out.push(name === name.toLowerCase() ? titleCase(name) : name)
  }
  return out
}

/** Strength to give the n-th accord when the source has only an ordered list. */
export const defaultAccordStrength = (index: number) => Math.max(100 - index * 14, 15)

/** Accepts several columns (mainaccord1..5), a comma list, or JSON like {"woody": 100} / [{"name":"woody","strength":100}]. */
export function parseAccords(values: string[]): { name: string; strength: number }[] {
  const out: { name: string; strength: number }[] = []
  const add = (name: string, strength: number | null) => {
    const n = name.trim().toLowerCase()
    if (!n || out.some((o) => o.name === n)) return
    out.push({ name: n, strength: strength ?? defaultAccordStrength(out.length) })
  }
  for (const raw of values) {
    const v = raw.trim()
    if (!v) continue
    if (v.startsWith('{') || v.startsWith('[')) {
      try {
        const parsed = JSON.parse(v) as unknown
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string') add(item, null)
            else if (item && typeof item === 'object') {
              const o = item as Record<string, unknown>
              add(String(o.name ?? o.accord ?? ''), typeof o.strength === 'number' ? o.strength : typeof o.value === 'number' ? o.value : null)
            }
          }
        } else if (parsed && typeof parsed === 'object') {
          for (const [k, val] of Object.entries(parsed as Record<string, unknown>)) add(k, typeof val === 'number' ? val : parseFloat(String(val)) || null)
        }
        continue
      } catch {
        /* treat as plain text */
      }
    }
    for (const part of splitList(v)) {
      const m = /^(.*?):\s*(\d+(?:\.\d+)?)\s*$/.exec(part)
      if (m) add(m[1], parseFloat(m[2]))
      else add(part, null)
    }
  }
  // Scale explicit strengths so the strongest is 100 (Fragrantica shows widths relative to the top accord).
  const max = Math.max(...out.map((o) => o.strength), 0)
  if (max > 0 && max !== 100 && max <= 1.0001) return out.map((o) => ({ ...o, strength: Math.round((o.strength / max) * 100) }))
  return out.map((o) => ({ name: o.name, strength: Math.min(100, Math.max(0, Math.round(o.strength))) }))
}

// ---- row mapping ----------------------------------------------------------------------------

/** A mapped row plus the popularity used to rank search results (not part of the saved fragrance). */
export type MappedEntry = FragranceInput & { popularity?: number }

const cell = (row: Row, cols?: string[]) => (cols ?? []).map((c) => row[c] ?? '').filter((v) => v.trim() !== '')
const num = (v: string): number | null => {
  const n = parseFloat(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

const fragranticaImage = (id: string) => `https://fimgs.net/mdimg/perfume/375x500.${id}.jpg`
export const noteIconUrl = (imageId: number | string) => `https://fimgs.net/mdimg/sastojci/t.${imageId}.jpg`

function communityFrom(c: { winter: number | null; spring: number | null; summer: number | null; fall: number | null; day: number | null; night: number | null; longevity: number | null; sillage: number | null }): CommunityData | null {
  const votes = [c.winter, c.spring, c.summer, c.fall, c.day, c.night]
  if (votes.every((v) => v == null) && c.longevity == null && c.sillage == null) return null
  const r = (v: number | null) => (v == null ? 0 : Math.max(0, Math.round(v)))
  const rating = (v: number | null, max: number) => (v != null && v > 0 && v <= max ? Math.round(v * 100) / 100 : null)
  return {
    winter: r(c.winter), spring: r(c.spring), summer: r(c.summer), fall: r(c.fall), day: r(c.day), night: r(c.night),
    longevity: rating(c.longevity, 5), sillage: rating(c.sillage, 4)
  }
}

export function mapRow(row: Row, m: ColumnMapping): MappedEntry | null {
  const first = (f: MappingField) => cell(row, m[f])[0] ?? ''
  const rawName = first('name')
  const house = tidy(first('house'))
  if (!rawName.trim() || !house) return null

  const { name, concentration: fromName } = cleanName(rawName, house)
  const concRaw = first('concentration').trim()
  const yearNum = parseInt(first('year').match(/\d{4}/)?.[0] ?? '', 10)

  const notes: { name: string; layer: NoteLayer }[] = []
  const addNotes = (f: MappingField, layer: NoteLayer) => {
    for (const col of m[f] ?? []) for (const n of parseNotes(row[col] ?? '')) notes.push({ name: n, layer })
  }
  addNotes('notesTop', 'top')
  addNotes('notesHeart', 'heart')
  addNotes('notesBase', 'base')
  addNotes('notesGeneral', 'general')

  const perfumers = cell(row, m.perfumers)
    .flatMap((p) => p.split('|'))
    .map(tidy)
    .filter((p) => p && p.toLowerCase() !== 'unknown')
  let url = first('sourceUrl')
  let img = first('imageUrl')
  const id = first('externalId').match(/^\d+$/)?.[0]
  // Dumps scraped from Fragrantica carry its id; the bottle photo address is a pure function of it.
  if (!img && id && /fragrantica\./i.test(url)) img = fragranticaImage(id)

  const popularity = num(first('popularity'))
  return {
    name,
    house,
    year: Number.isFinite(yearNum) && yearNum >= 1700 && yearNum <= 2100 ? yearNum : null,
    concentration: concRaw || fromName,
    perfumers: perfumers.length ? [...new Set(perfumers)].join(', ') : null,
    gender: normalizeGender(first('gender')),
    description: first('description') || null,
    sourceUrl: /^https?:\/\//i.test(url) ? url : null,
    imageUrl: /^https?:\/\//i.test(img) ? img : null,
    notes,
    accords: parseAccords(cell(row, m.accords)),
    community: communityFrom({
      winter: num(first('seasonWinter')), spring: num(first('seasonSpring')), summer: num(first('seasonSummer')), fall: num(first('seasonFall')),
      day: num(first('dayVotes')), night: num(first('nightVotes')), longevity: num(first('longevity')), sillage: num(first('sillage'))
    }),
    ...(popularity != null ? { popularity } : {})
  }
}

// ---- the Fragrantica JSONL dump (nested records) ---------------------------------------------

export const isFragranticaDump = (columns: string[]) => ['id', 'slug', 'brand', 'accords', 'notes', 'seasons'].every((c) => columns.includes(c))

type Obj = Record<string, unknown>
const asObj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {})
const asArr = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : [])
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const asStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Maps one record of the Fragrantica dump (see data/SCHEMA.md) including note icons and community data. */
export function mapDumpRecord(o: Obj): MappedEntry | null {
  const house = tidy(asStr(o.brand))
  const rawName = asStr(o.name)
  if (!rawName || !house) return null
  const { name, concentration } = cleanName(rawName, house)

  const notes: FragranceInput['notes'] = []
  const addNotes = (list: unknown, layer: NoteLayer) => {
    for (const n of asArr(list)) {
      const nm = asStr(n.name)
      if (!nm) continue
      const imageId = asNum(n.image_id)
      notes.push({ name: nm, layer, iconUrl: imageId != null ? noteIconUrl(imageId) : null })
    }
  }
  const notesObj = asObj(o.notes)
  const tiered = asObj(notesObj.tiered)
  addNotes(tiered.top, 'top')
  addNotes(tiered.middle, 'heart')
  addNotes(tiered.base, 'base')
  addNotes(notesObj.flat, 'general')

  const accords = asArr(o.accords)
    .map((a) => ({ name: asStr(a.name).toLowerCase(), strength: Math.round(asNum(a.strength) ?? 0) }))
    .filter((a) => a.name)

  const perfumers = asArr(o.perfumers).map((p) => asStr(p.name)).filter(Boolean)
  const seasons = asObj(o.seasons)
  const daypart = asObj(o.daypart)
  const id = asNum(o.id)
  const year = asNum(o.year)
  const popularity = asNum(asObj(o.popularity).magnitude)
  const hasVotes = Object.keys(seasons).length > 0 || Object.keys(daypart).length > 0

  return {
    name,
    house,
    year: year && year >= 1700 && year <= 2100 ? year : null,
    concentration,
    perfumers: perfumers.length ? perfumers.join(', ') : null,
    gender: normalizeGender(asStr(o.gender)),
    description: null,
    sourceUrl: asStr(o.url) || null,
    imageUrl: asStr(o.picture) || (id != null ? fragranticaImage(String(id)) : null),
    notes,
    accords,
    community: hasVotes
      ? communityFrom({
          winter: asNum(seasons.winter), spring: asNum(seasons.spring), summer: asNum(seasons.summer), fall: asNum(seasons.autumn ?? seasons.fall),
          day: asNum(daypart.day), night: asNum(daypart.night), longevity: asNum(asObj(o.longevity).average), sillage: asNum(asObj(o.sillage).average)
        })
      : null,
    ...(popularity != null ? { popularity } : {})
  }
}
