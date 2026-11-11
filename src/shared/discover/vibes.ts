import { EMPTY_BRIEF, type Brief, type CrowdWish, type LongevityWish, type PopularityWish, type ProjectionWish } from './brief'
import type { Season } from './vocab'

/**
 * How free words and short descriptions of a person become a brief.
 *
 * The vocabulary below is written by hand. It is not a model: a word is either in it or it is reported back as "not understood".
 * Each entry says what a phrase means in terms the rest of Discovery already has (accords, notes, season, time of day, occasion,
 * performance, how well known), so the result is always shown as editable chips before anything is searched.
 */

export type ChipKind = 'accord' | 'note' | 'avoidAccord' | 'avoidNote' | 'season' | 'time' | 'activity' | 'longevity' | 'projection' | 'crowd' | 'popularity' | 'gender' | 'syrupy'

export interface Chip {
  kind: ChipKind
  /** The accord, note, season... (or the numeric lean for gender). */
  value: string
  /** The words that produced it, for "why". */
  from: string
}

interface Effect {
  accords?: string[]
  notes?: string[]
  season?: Season
  time?: 'day' | 'night'
  activity?: string
  longevity?: LongevityWish
  projection?: ProjectionWish
  crowd?: CrowdWish
  popularity?: PopularityWish
  gender?: 'masculine' | 'feminine' | 'unisex'
}

/** Phrase (one to three words) to what it means. Longer phrases win over their parts. */
export const VOCABULARY: Record<string, Effect> = {
  // clean and fresh
  'fresh soap': { accords: ['soapy', 'aldehydic', 'musky'] },
  soap: { accords: ['soapy', 'musky'] },
  soapy: { accords: ['soapy'] },
  'clean laundry': { accords: ['soapy', 'musky', 'fresh'] },
  laundry: { accords: ['soapy', 'musky', 'fresh'] },
  clean: { accords: ['soapy', 'musky', 'fresh'] },
  shower: { accords: ['soapy', 'fresh', 'aquatic'] },
  spa: { accords: ['soapy', 'herbal', 'musky'] },
  crisp: { accords: ['fresh', 'citrus'] },
  airy: { accords: ['ozonic', 'fresh'], projection: 'skin' },
  // places and journeys
  'italian vacation': { accords: ['citrus', 'aromatic', 'herbal', 'marine'], season: 'summer' },
  mediterranean: { accords: ['citrus', 'aromatic', 'herbal', 'marine'], season: 'summer' },
  riviera: { accords: ['citrus', 'aromatic', 'marine'], season: 'summer' },
  beach: { accords: ['marine', 'aquatic', 'salty'], season: 'summer' },
  ocean: { accords: ['marine', 'aquatic', 'salty'] },
  sea: { accords: ['marine', 'aquatic', 'salty'] },
  seaside: { accords: ['marine', 'salty', 'aquatic'] },
  sailing: { accords: ['marine', 'salty', 'aquatic'] },
  tropical: { accords: ['tropical', 'coconut', 'fruity'], season: 'summer' },
  island: { accords: ['tropical', 'coconut', 'marine'], season: 'summer' },
  vacation: { accords: ['citrus', 'tropical', 'marine'], activity: 'travel' },
  holiday: { accords: ['citrus', 'tropical', 'marine'], activity: 'travel' },
  forest: { accords: ['woody', 'green', 'earthy', 'mossy'] },
  woods: { accords: ['woody', 'green', 'earthy'] },
  pine: { accords: ['woody', 'green', 'aromatic'] },
  hiking: { accords: ['woody', 'green', 'earthy'], activity: 'casual' },
  camping: { accords: ['woody', 'smoky', 'earthy'] },
  campfire: { accords: ['smoky', 'woody'], season: 'fall' },
  bonfire: { accords: ['smoky', 'woody'] },
  rain: { accords: ['ozonic', 'earthy', 'green'] },
  petrichor: { accords: ['earthy', 'ozonic'] },
  garden: { accords: ['green', 'floral', 'herbal'], season: 'spring' },
  meadow: { accords: ['green', 'floral', 'herbal'], season: 'spring' },
  flowers: { accords: ['floral', 'white floral'] },
  bouquet: { accords: ['floral', 'white floral', 'rose'] },
  blossom: { accords: ['floral', 'white floral'], season: 'spring' },
  // seasons and weather
  summer: { season: 'summer' },
  'hot day': { season: 'summer', accords: ['citrus', 'fresh'] },
  heatwave: { season: 'summer', accords: ['citrus', 'aquatic'] },
  spring: { season: 'spring' },
  autumn: { season: 'fall' },
  fall: { season: 'fall' },
  leaves: { accords: ['earthy', 'woody'], season: 'fall' },
  winter: { season: 'winter' },
  snow: { season: 'winter', accords: ['powdery', 'musky'] },
  cold: { season: 'winter' },
  fireplace: { accords: ['smoky', 'woody', 'amber'], season: 'winter' },
  cozy: { accords: ['amber', 'vanilla', 'warm spicy'], season: 'winter' },
  cosy: { accords: ['amber', 'vanilla', 'warm spicy'], season: 'winter' },
  blanket: { accords: ['vanilla', 'musky', 'amber'], season: 'winter' },
  hygge: { accords: ['vanilla', 'amber', 'woody'], season: 'winter' },
  // food, drink, places indoors
  'coffee shop': { accords: ['coffee', 'vanilla', 'warm spicy'] },
  coffee: { accords: ['coffee'] },
  cafe: { accords: ['coffee', 'vanilla'] },
  bakery: { accords: ['vanilla', 'caramel', 'sweet'] },
  dessert: { accords: ['vanilla', 'caramel', 'sweet'] },
  cake: { accords: ['vanilla', 'sweet'] },
  cookies: { accords: ['vanilla', 'caramel', 'sweet'] },
  'sweet tooth': { accords: ['sweet', 'vanilla', 'caramel'] },
  candy: { accords: ['sweet', 'fruity'] },
  chocolate: { accords: ['chocolate', 'sweet'] },
  honey: { accords: ['honey', 'sweet'] },
  library: { accords: ['woody', 'powdery', 'balsamic'] },
  'old books': { accords: ['woody', 'powdery', 'balsamic'] },
  church: { accords: ['balsamic', 'woody'], notes: ['incense'] },
  incense: { notes: ['incense'], accords: ['balsamic'] },
  'leather jacket': { accords: ['leather', 'smoky'] },
  leather: { accords: ['leather'] },
  biker: { accords: ['leather', 'smoky'] },
  tobacco: { accords: ['tobacco'] },
  cigar: { accords: ['tobacco', 'leather'] },
  whiskey: { accords: ['boozy', 'tobacco', 'leather'] },
  speakeasy: { accords: ['boozy', 'tobacco', 'leather'], time: 'night' },
  arabian: { accords: ['oud', 'amber', 'rose'] },
  'middle eastern': { accords: ['oud', 'amber', 'rose'] },
  oud: { accords: ['oud'] },
  // occasions
  office: { activity: 'office', time: 'day' },
  work: { activity: 'office', time: 'day' },
  business: { activity: 'office' },
  meeting: { activity: 'office' },
  interview: { activity: 'office' },
  gym: { activity: 'gym' },
  workout: { activity: 'gym' },
  sport: { activity: 'gym' },
  running: { activity: 'gym' },
  'date night': { activity: 'date night', time: 'night' },
  date: { activity: 'date night' },
  romantic: { activity: 'date night', accords: ['rose', 'vanilla', 'musky'] },
  romance: { activity: 'date night', accords: ['rose', 'vanilla', 'musky'] },
  party: { activity: 'night out' },
  club: { activity: 'night out', time: 'night' },
  'night out': { activity: 'night out', time: 'night' },
  wedding: { activity: 'wedding' },
  formal: { activity: 'formal' },
  gala: { activity: 'formal' },
  'black tie': { activity: 'formal' },
  travel: { activity: 'travel' },
  flight: { activity: 'travel' },
  casual: { activity: 'casual' },
  weekend: { activity: 'casual' },
  errands: { activity: 'casual' },
  home: { activity: 'home' },
  lounge: { activity: 'home' },
  relax: { activity: 'home' },
  // time
  morning: { time: 'day' },
  daytime: { time: 'day' },
  day: { time: 'day' },
  night: { time: 'night' },
  evening: { time: 'night' },
  midnight: { time: 'night', accords: ['amber', 'vanilla'] },
  // performance
  'long lasting': { longevity: 'long' },
  'all day': { longevity: 'long' },
  'beast mode': { longevity: 'long', projection: 'room' },
  lasts: { longevity: 'long' },
  subtle: { projection: 'skin' },
  'skin scent': { projection: 'skin', accords: ['musky'] },
  'close to skin': { projection: 'skin' },
  intimate: { projection: 'skin' },
  quiet: { projection: 'skin' },
  delicate: { projection: 'skin' },
  light: { projection: 'skin', accords: ['fresh'] },
  loud: { projection: 'room' },
  strong: { projection: 'room' },
  projection: { projection: 'room' },
  sillage: { projection: 'room' },
  'room filling': { projection: 'room' },
  // how others react
  compliments: { crowd: 'pleaser' },
  'crowd pleaser': { crowd: 'pleaser' },
  'people pleaser': { crowd: 'pleaser' },
  safe: { crowd: 'pleaser' },
  universal: { crowd: 'pleaser' },
  popular: { popularity: 'popular' },
  trending: { popularity: 'trending' },
  'hidden gem': { popularity: 'hidden_gems' },
  unique: { crowd: 'stand_out' },
  unusual: { crowd: 'stand_out' },
  different: { crowd: 'stand_out' },
  rare: { crowd: 'stand_out' },
  'stand out': { crowd: 'stand_out' },
  // character
  elegant: { accords: ['powdery', 'woody', 'iris'] },
  classy: { accords: ['powdery', 'woody', 'iris'] },
  sophisticated: { accords: ['woody', 'leather', 'iris'] },
  sexy: { accords: ['amber', 'vanilla', 'musky', 'warm spicy'], time: 'night' },
  seductive: { accords: ['amber', 'vanilla', 'musky'], time: 'night' },
  sensual: { accords: ['musky', 'amber', 'vanilla'] },
  playful: { accords: ['fruity', 'sweet', 'fresh'] },
  fun: { accords: ['fruity', 'sweet'] },
  youthful: { accords: ['fruity', 'fresh', 'sweet'] },
  energetic: { accords: ['citrus', 'fresh', 'aromatic'] },
  calm: { accords: ['lavender', 'musky', 'woody'], projection: 'skin' },
  masculine: { gender: 'masculine' },
  feminine: { gender: 'feminine' },
  unisex: { gender: 'unisex' }
}

/** Accords and notes that mean themselves when typed on their own. */
export const ACCORD_WORDS = ['citrus', 'woody', 'fresh', 'amber', 'vanilla', 'sweet', 'aromatic', 'fresh spicy', 'warm spicy', 'musky', 'floral', 'white floral', 'powdery', 'leather', 'tobacco', 'aquatic', 'green', 'fruity', 'oud', 'rose', 'earthy', 'smoky', 'balsamic', 'herbal', 'lavender', 'iris', 'coconut', 'caramel', 'coffee', 'mineral', 'marine', 'ozonic', 'salty', 'aldehydic', 'soapy', 'animalic', 'tropical', 'boozy', 'metallic', 'yellow floral', 'mossy', 'honey', 'chocolate', 'spicy']
export const NOTE_WORDS = ['bergamot', 'lemon', 'vetiver', 'cedar', 'sandalwood', 'patchouli', 'tonka bean', 'musk', 'jasmine', 'pepper', 'cardamom', 'cinnamon', 'oakmoss', 'ambroxan', 'orange', 'grapefruit', 'mint', 'sage', 'incense', 'cedarwood', 'neroli', 'violet', 'ginger', 'saffron', 'pineapple', 'apple', 'peach', 'rum', 'tea', 'lily', 'tuberose', 'geranium', 'rosemary', 'basil', 'cumin', 'myrrh', 'benzoin', 'labdanum', 'ambergris', 'sandal']

const NEGATIONS = new Set(['no', 'not', 'without', 'avoid', 'hate', 'dislike', 'non', 'never'])
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'like', 'that', 'this', 'it', 'its', 'something', 'smell', 'smells', 'smelling', 'scent', 'scents', 'fragrance', 'fragrances', 'perfume', 'perfumes', 'feel', 'feeling', 'feels', 'vibe', 'vibes', 'kind', 'type', 'for', 'with', 'to', 'my', 'me', 'i', 'want', 'need', 'looking', 'be', 'is', 'are', 'very', 'really', 'quite', 'bit', 'little', 'more', 'less', 'but', 'too', 'so', 'at', 'as', 'from', 'you', 'your', 'find', 'some', 'one', 'give', 'make', 'something', 'would', 'wear', 'worn', 'good', 'nice', 'great', 'best', 'all', 'any', 'also', 'maybe', 'just', 'than', 'then', 'there', 'when', 'where', 'what', 'who', 'how'])

export interface Interpretation {
  chips: Chip[]
  /** Words that are not in the vocabulary. They are never guessed at. */
  unknown: string[]
  /** Things the words asked for that cannot be used, and why. */
  notes: string[]
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function chipsFor(e: Effect, from: string, negated: boolean): { chips: Chip[]; note: string | null } {
  const chips: Chip[] = []
  if (negated) {
    for (const a of e.accords ?? []) chips.push({ kind: 'avoidAccord', value: a, from })
    for (const n of e.notes ?? []) chips.push({ kind: 'avoidNote', value: n, from })
    const unusable = e.season || e.time || e.activity || e.longevity || e.projection || e.crowd || e.popularity || e.gender
    return { chips, note: unusable && chips.length === 0 ? `"not ${from}" cannot be used: only accords and notes can be left out.` : null }
  }
  for (const a of e.accords ?? []) chips.push({ kind: 'accord', value: a, from })
  for (const n of e.notes ?? []) chips.push({ kind: 'note', value: n, from })
  if (e.season) chips.push({ kind: 'season', value: e.season, from })
  if (e.time) chips.push({ kind: 'time', value: e.time, from })
  if (e.activity) chips.push({ kind: 'activity', value: e.activity, from })
  if (e.longevity) chips.push({ kind: 'longevity', value: e.longevity, from })
  if (e.projection) chips.push({ kind: 'projection', value: e.projection, from })
  if (e.crowd) chips.push({ kind: 'crowd', value: e.crowd, from })
  if (e.popularity) chips.push({ kind: 'popularity', value: e.popularity, from })
  if (e.gender) chips.push({ kind: 'gender', value: e.gender, from })
  return { chips, note: null }
}

/** Reads free text with the hand-written vocabulary. Longest phrases first; "no vanilla" leaves vanilla out. */
export function interpretVibe(text: string): Interpretation {
  const words = norm(text).replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter(Boolean)
  const chips: Chip[] = []
  const unknown: string[] = []
  const notes: string[] = []
  let negate = false
  for (let i = 0; i < words.length; ) {
    const w = words[i]
    if (NEGATIONS.has(w)) {
      negate = true
      i++
      continue
    }
    let matched = false
    for (let n = Math.min(3, words.length - i); n >= 1 && !matched; n--) {
      const phrase = words.slice(i, i + n).join(' ')
      const entry: Effect | undefined = VOCABULARY[phrase] ?? (ACCORD_WORDS.includes(phrase) ? { accords: [phrase] } : NOTE_WORDS.includes(phrase) ? { notes: [phrase] } : undefined)
      if (entry) {
        const r = chipsFor(entry, phrase, negate)
        chips.push(...r.chips)
        if (r.note) notes.push(r.note)
        negate = false
        i += n
        matched = true
      }
    }
    if (!matched) {
      if (!STOP.has(w) && w.length > 1 && !unknown.includes(w)) unknown.push(w)
      i++
    }
  }
  return { chips: dedupe(chips), unknown, notes }
}

export const dedupe = (chips: Chip[]): Chip[] => {
  const seen = new Set<string>()
  const out: Chip[] = []
  for (const c of chips) {
    const k = `${c.kind}:${c.value}`
    // one season, time, activity, longevity, projection, crowd, popularity or gender: the first wins
    const key = ['season', 'time', 'activity', 'longevity', 'projection', 'crowd', 'popularity', 'gender', 'syrupy'].includes(c.kind) ? c.kind : k
    if (!seen.has(key)) {
      seen.add(key)
      out.push(c)
    }
  }
  return out
}

const GENDER_LEAN: Record<string, number> = { masculine: 1, feminine: -1, unisex: 0 }

/** The brief these chips describe, on top of `base` (so a brief already filled in keeps its other parts). */
export function chipsToBrief(chips: Chip[], base: Brief = EMPTY_BRIEF): Brief {
  const b: Brief = { ...base, wantAccords: [...base.wantAccords], wantNotes: [...base.wantNotes], avoidAccords: [...base.avoidAccords], avoidNotes: [...base.avoidNotes] }
  const push = (list: string[], v: string) => {
    if (!list.includes(v) && list.length < 12) list.push(v)
  }
  for (const c of chips) {
    if (c.kind === 'accord') push(b.wantAccords, c.value)
    else if (c.kind === 'note') push(b.wantNotes, c.value)
    else if (c.kind === 'avoidAccord') push(b.avoidAccords, c.value)
    else if (c.kind === 'avoidNote') push(b.avoidNotes, c.value)
    else if (c.kind === 'season') b.season = c.value as Season
    else if (c.kind === 'time') b.timeOfDay = c.value as 'day' | 'night'
    else if (c.kind === 'activity') b.activity = c.value
    else if (c.kind === 'longevity') b.longevity = c.value as LongevityWish
    else if (c.kind === 'projection') b.projection = c.value as ProjectionWish
    else if (c.kind === 'crowd') b.crowd = c.value as CrowdWish
    else if (c.kind === 'popularity') b.popularity = c.value as PopularityWish
    else if (c.kind === 'gender') b.genderLean = GENDER_LEAN[c.value] ?? null
    else if (c.kind === 'syrupy') b.notSyrupy = true
  }
  // an accord wanted and avoided at once: the avoid wins
  b.wantAccords = b.wantAccords.filter((a) => !b.avoidAccords.includes(a))
  b.wantNotes = b.wantNotes.filter((a) => !b.avoidNotes.includes(a))
  return b
}

/** A readable name for a chip. */
export function chipLabel(c: Chip): string {
  switch (c.kind) {
    case 'accord': return `${c.value} accord`
    case 'note': return `${c.value} note`
    case 'avoidAccord': return `no ${c.value}`
    case 'avoidNote': return `no ${c.value} note`
    case 'season': return `for ${c.value}`
    case 'time': return c.value === 'day' ? 'worn in the day' : 'worn at night'
    case 'activity': return `for ${c.value}`
    case 'longevity': return c.value === 'long' ? 'lasts all day' : c.value === 'short' ? 'a few hours' : 'a work day'
    case 'projection': return c.value === 'skin' ? 'close to the skin' : c.value === 'room' ? 'fills a room' : 'moderate projection'
    case 'crowd': return c.value === 'pleaser' ? 'crowd-pleaser (estimate)' : 'stands out (less common)'
    case 'popularity': return c.value === 'hidden_gems' ? 'hidden gem' : c.value
    case 'gender': return `leans ${c.value}`
    case 'syrupy': return 'not syrupy sweet'
  }
}

// ---- persona: describing a person instead of a scent ----------------------------------------------------

export interface Persona {
  ageBand: '' | 'under25' | '25-34' | '35-49' | '50plus'
  lifestyle: '' | 'office' | 'active' | 'social' | 'homebody' | 'outdoors' | 'traveller'
  experience: '' | 'new' | 'some' | 'enthusiast'
  climate: '' | 'hot' | 'mild' | 'cold' | 'seasons'
  occasions: string[]
  /** A soft option, never a filter. */
  gender: '' | 'masculine' | 'feminine' | 'unisex'
}
export const EMPTY_PERSONA: Persona = { ageBand: '', lifestyle: '', experience: '', climate: '', occasions: [], gender: '' }

export const OCCASION_CHOICES = [
  { key: 'everyday', label: 'Every day' },
  { key: 'work', label: 'Work' },
  { key: 'dates', label: 'Dates' },
  { key: 'evenings', label: 'Evenings out' },
  { key: 'formal', label: 'Formal events' },
  { key: 'sport', label: 'Sport' }
]

/**
 * Starting points for a brief from a short description of a person. These are typical choices, not facts about anyone: the chips
 * are shown and can all be changed before anything is searched, and the gender option only nudges.
 */
export function interpretPersona(p: Persona): Interpretation {
  const chips: Chip[] = []
  const add = (c: Chip) => chips.push(c)
  const notes: string[] = []
  if (p.experience === 'new') {
    add({ kind: 'crowd', value: 'pleaser', from: 'new to fragrance' })
    add({ kind: 'projection', value: 'moderate', from: 'new to fragrance' })
    add({ kind: 'syrupy', value: 'syrupy', from: 'new to fragrance' })
  } else if (p.experience === 'enthusiast') {
    add({ kind: 'crowd', value: 'stand_out', from: 'a fragrance enthusiast' })
    add({ kind: 'popularity', value: 'hidden_gems', from: 'a fragrance enthusiast' })
  }
  if (p.climate === 'hot') add({ kind: 'season', value: 'summer', from: 'lives somewhere hot' })
  if (p.climate === 'cold') add({ kind: 'season', value: 'winter', from: 'lives somewhere cold' })
  const life = (accords: string[], activity: string | null, from: string, longevity?: LongevityWish) => {
    for (const a of accords) add({ kind: 'accord', value: a, from })
    if (activity) add({ kind: 'activity', value: activity, from })
    if (longevity) add({ kind: 'longevity', value: longevity, from })
  }
  if (p.lifestyle === 'office') life(['woody', 'fresh'], 'office', 'works in an office')
  if (p.lifestyle === 'active') life(['citrus', 'aquatic'], 'gym', 'leads an active life')
  if (p.lifestyle === 'social') life(['sweet', 'amber'], 'night out', 'goes out a lot')
  if (p.lifestyle === 'homebody') life(['vanilla', 'musky'], 'home', 'likes staying in')
  if (p.lifestyle === 'outdoors') life(['woody', 'green', 'earthy'], 'casual', 'is outdoorsy')
  if (p.lifestyle === 'traveller') life(['fresh', 'woody'], 'travel', 'travels often', 'long')
  if (p.ageBand === 'under25') for (const a of ['fruity', 'fresh']) add({ kind: 'accord', value: a, from: 'under 25 (a typical starting point)' })
  if (p.ageBand === '50plus') for (const a of ['woody', 'aromatic']) add({ kind: 'accord', value: a, from: '50 or over (a typical starting point)' })
  const occ = new Set(p.occasions)
  if (occ.has('dates')) add({ kind: 'activity', value: 'date night', from: 'dates' })
  if (occ.has('evenings')) add({ kind: 'time', value: 'night', from: 'evenings out' })
  if (occ.has('work')) add({ kind: 'activity', value: 'office', from: 'work' })
  if (occ.has('formal')) add({ kind: 'activity', value: 'formal', from: 'formal events' })
  if (occ.has('sport')) add({ kind: 'activity', value: 'gym', from: 'sport' })
  if (p.gender) add({ kind: 'gender', value: p.gender, from: 'a soft preference' })
  if (chips.length === 0) notes.push('Fill in a few of the questions and the starting points appear here.')
  return { chips: dedupe(chips), unknown: [], notes }
}
