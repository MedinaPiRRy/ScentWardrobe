import { describe, expect, it } from 'vitest'
import { EMPTY_BRIEF } from './brief'
import { ACCORD_WORDS, VOCABULARY, chipLabel, chipsToBrief, dedupe, interpretPersona, interpretVibe, EMPTY_PERSONA } from './vibes'

const kinds = (text: string) => interpretVibe(text).chips.map((c) => `${c.kind}:${c.value}`)

describe('reading a feeling with the hand-written vocabulary', () => {
  it('turns "fresh soap" and "Italian vacation" into accords, as written in the vocabulary', () => {
    expect(kinds('fresh soap')).toEqual(['accord:soapy', 'accord:aldehydic', 'accord:musky'])
    const it = interpretVibe('An Italian vacation')
    expect(it.chips.map((c) => c.value)).toEqual(expect.arrayContaining(['citrus', 'aromatic', 'herbal', 'marine', 'summer']))
    expect(it.chips.every((c) => c.from === 'italian vacation')).toBe(true)
    expect(it.unknown).toEqual([])
  })
  it('longest phrase wins over its parts, and every chip says which words made it', () => {
    const r = interpretVibe('coffee shop in winter')
    expect(r.chips.filter((c) => c.from === 'coffee shop').map((c) => c.value)).toEqual(['coffee', 'vanilla', 'warm spicy'])
    expect(r.chips.find((c) => c.kind === 'season')).toMatchObject({ value: 'winter', from: 'winter' })
  })
  it('reports words it does not know instead of guessing, and ignores filler words', () => {
    const r = interpretVibe('something that smells like a zorblax afternoon')
    expect(r.unknown).toEqual(['zorblax', 'afternoon'])
    expect(r.chips).toEqual([])
  })
  it('understands "no" and "not": accords and notes are left out, other things cannot be and say so', () => {
    expect(kinds('fresh but no vanilla')).toEqual(['accord:fresh', 'avoidAccord:vanilla'])
    expect(kinds('not sweet, without vetiver')).toEqual(['avoidAccord:sweet', 'avoidNote:vetiver'])
    const r = interpretVibe('not summer')
    expect(r.chips).toEqual([])
    expect(r.notes[0]).toBe('"not summer" cannot be used: only accords and notes can be left out.')
  })
  it('knows accord and note words on their own, and performance and occasion words', () => {
    expect(kinds('citrus bergamot')).toEqual(['accord:citrus', 'note:bergamot'])
    expect(kinds('office, long lasting and subtle')).toEqual(['time:day', 'activity:office', 'longevity:long', 'projection:skin'])
    expect(kinds('a crowd pleaser')).toEqual(['crowd:pleaser'])
  })
  it('keeps one value for things a brief has only one of', () => {
    const r = interpretVibe('summer winter')
    expect(r.chips.filter((c) => c.kind === 'season').map((c) => c.value)).toEqual(['summer'])
  })
  it('is case, accent and punctuation insensitive', () => {
    expect(kinds('FRESH, Café!')).toEqual(['accord:fresh', 'accord:coffee', 'accord:vanilla'])
  })
  it('every vocabulary entry says something', () => {
    for (const [phrase, e] of Object.entries(VOCABULARY)) expect(Object.keys(e).length, phrase).toBeGreaterThan(0)
    expect(ACCORD_WORDS.length).toBeGreaterThan(30)
  })
})

describe('chips become a brief', () => {
  it('fills the fields, keeps what the brief already had and lets an avoid beat a want', () => {
    const base = { ...EMPTY_BRIEF, wantAccords: ['woody'], notSyrupy: true }
    const b = chipsToBrief(interpretVibe('summer morning, fresh, citrus, not citrus, loud, no vetiver, masculine').chips, base)
    expect(b).toMatchObject({ season: 'summer', timeOfDay: 'day', projection: 'room', avoidAccords: ['citrus'], avoidNotes: ['vetiver'], genderLean: 1, notSyrupy: true })
    expect(b.wantAccords).toEqual(['woody', 'fresh'])
  })
  it('has a readable label for each kind', () => {
    expect(chipLabel({ kind: 'avoidAccord', value: 'sweet', from: 'x' })).toBe('no sweet')
    expect(chipLabel({ kind: 'crowd', value: 'pleaser', from: 'x' })).toBe('crowd-pleaser (estimate)')
    expect(chipLabel({ kind: 'crowd', value: 'stand_out', from: 'x' })).toBe('stands out (less common)')
  })
  it('dedupe keeps the first of single-valued kinds', () => {
    expect(dedupe([{ kind: 'season', value: 'summer', from: 'a' }, { kind: 'season', value: 'winter', from: 'b' }, { kind: 'accord', value: 'citrus', from: 'a' }, { kind: 'accord', value: 'citrus', from: 'b' }]).map((c) => c.value)).toEqual(['summer', 'citrus'])
  })
})

describe('describing a person', () => {
  it('gives starting points, each with the reason, and nothing for an empty form', () => {
    expect(interpretPersona(EMPTY_PERSONA).chips).toEqual([])
    expect(interpretPersona(EMPTY_PERSONA).notes[0]).toMatch(/Fill in a few/)
    const r = interpretPersona({ ageBand: '50plus', lifestyle: 'traveller', experience: 'new', climate: 'hot', occasions: ['dates', 'formal'], gender: '' })
    const get = (k: string) => r.chips.filter((c) => c.kind === k).map((c) => c.value)
    expect(get('crowd')).toEqual(['pleaser'])
    expect(get('season')).toEqual(['summer'])
    expect(get('longevity')).toEqual(['long'])
    expect(get('activity')).toEqual(['travel'])
    expect(get('accord')).toEqual(expect.arrayContaining(['fresh', 'woody', 'aromatic']))
    expect(r.chips.find((c) => c.value === 'aromatic')!.from).toMatch(/typical starting point/)
  })
  it('enthusiasts get less common picks; gender is only a soft nudge', () => {
    const r = interpretPersona({ ...EMPTY_PERSONA, experience: 'enthusiast', gender: 'feminine' })
    expect(r.chips.map((c) => c.value)).toEqual(['stand_out', 'hidden_gems', 'feminine'])
    expect(chipsToBrief(r.chips).genderLean).toBe(-1)
  })
})
