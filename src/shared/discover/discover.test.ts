import { describe, expect, it } from 'vitest'
import { EMPTY_BRIEF, evaluateRow, compileBrief, normalizeBrief, rankBrief, type Brief } from './brief'
import { encodeAccords, encodeNotes, parseAccords, parseNotes, buildFeatureRow, genderLeanOf, type FeatureRow } from './features'
import { syntheticRows } from './fixture'
import { FeatureIndex } from './index'
import { DEFAULT_HIDE, fitOf, compile, rankForYou, identityKey, libraryKeys } from './rank'
import { NO_SLIDERS, rankSimilar, seedProfile, type Seed } from './similar'
import { buildTaste, libraryWeight, type LibraryItem } from './taste'
import { extraFromDump } from './extra'

const lib = (o: Partial<LibraryItem> & { name: string }): LibraryItem => ({
  id: Math.floor(Math.random() * 1e6), house: 'H', accords: [], notes: [], rating: null, wearCount: 0, wardrobes: ['collection'], ...o
})

const row = (id: number, name: string, accords: Record<string, number>, o: Partial<FeatureRow> = {}): FeatureRow => ({
  catalogId: id, fid: null, houseKey: 'house', nameKey: name.toLowerCase(), concKey: '',
  accords: encodeAccords(Object.entries(accords).map(([name, strength]) => ({ name, strength }))),
  notes: encodeNotes([]),
  vWinter: null, vSpring: null, vSummer: null, vFall: null, vDay: null, vNight: null,
  longevity: null, sillage: null, rating: null, ratingN: null, valueAvg: null, valueN: null, people: null, haveN: null, wantN: null,
  popularity: 0, popRecent: null, genderLean: null, year: null, ...o
})

describe('feature encoding', () => {
  it('round-trips accords and notes, and survives odd characters', () => {
    expect(parseAccords(encodeAccords([{ name: 'Fresh Spicy', strength: 80 }, { name: 'a,b:c', strength: 12.4 }]))).toEqual([{ name: 'fresh spicy', strength: 80 }, { name: 'a b c', strength: 12 }])
    expect(parseNotes(encodeNotes([{ name: 'Bergamot', layer: 'top', weight: 49 }, { name: 'x|y~z' }]))).toEqual([
      { name: 'bergamot', layer: 'top', weight: 49 },
      { name: 'x y z', layer: 'general', weight: 0 }
    ])
    expect(parseAccords('')).toEqual([])
  })
  it('builds a row from a catalog entry and its extras', () => {
    const r = buildFeatureRow({
      id: 5, name: 'Aventus', house: 'Creed', year: 2010, concentration: null, popularity: 1000,
      data: { gender: 'male', accords: [{ name: 'fruity', strength: 100 }], notes: [{ name: 'Bergamot', layer: 'top' }], community: { summer: 10, winter: 2, longevity: 4 } },
      extra: { fid: 9828, nw: { Bergamot: 49 }, rating: { a: 4.3, n: 900 }, people: 5000, recent: 300 }
    })
    expect(r).toMatchObject({ catalogId: 5, fid: 9828, houseKey: 'creed', nameKey: 'aventus', accords: 'fruity:100', notes: 'bergamot~1~49', vSummer: 10, rating: 4.3, ratingN: 900, people: 5000, popRecent: 300, genderLean: 1 })
  })
  it('works out the gender lean from votes, falling back to the label', () => {
    expect(genderLeanOf({ female: 0, female_leaning: 0, unisex: 0, male_leaning: 0, male: 100 }, null)).toBe(1)
    expect(genderLeanOf({ female: 50, female_leaning: 0, unisex: 0, male_leaning: 0, male: 50 }, null)).toBe(0)
    expect(genderLeanOf(undefined, 'female')).toBe(-1)
    expect(genderLeanOf(undefined, undefined)).toBeNull()
  })
  it('keeps only the useful extras of a dump record, and nothing when there are none', () => {
    const e = extraFromDump({
      id: 1, notes: { tiered: { top: [{ name: 'Lemon', weight: 80 }], middle: [], base: [{ name: 'Musk', weight: 0 }] }, flat: [] },
      rating: { average: 4.1, histogram: [{ bucket: 4, count: 30 }, { bucket: 5, count: 70 }] }, relation: { have: 10, had: 2, want: 7 },
      similar: { reminds_me_of: [{ id: 5, up_votes: 10, down_votes: 20 }, { id: 6, up_votes: 50, down_votes: 5 }] }, popularity: { magnitude: 10, recent_magnitude: 4 }, meta: { scraped_at: 1700000000 }
    })
    expect(e).toMatchObject({ fid: 1, nw: { Lemon: 80 }, rating: { a: 4.1, n: 100 }, rel: { have: 10, had: 2, want: 7 }, rm: [[6, 50, 5]], recent: 4, scraped: 1700000000 })
    expect(e!.nw).not.toHaveProperty('Musk')
    expect(extraFromDump({ id: 3 })).toBeNull()
  })
})

describe('taste profile', () => {
  it('weighs what I own by rating and wear, and learns dislikes from Garbage and low ratings', () => {
    expect(libraryWeight(lib({ name: 'a', rating: 9 }))).toBeGreaterThan(libraryWeight(lib({ name: 'a', rating: 5 })))
    expect(libraryWeight(lib({ name: 'a', rating: 5, wearCount: 30 }))).toBeGreaterThan(libraryWeight(lib({ name: 'a', rating: 5 })))
    expect(libraryWeight(lib({ name: 'a', rating: 2, wearCount: 50 }))).toBeLessThan(0)
    expect(libraryWeight(lib({ name: 'a', wardrobes: ['garbage'] }))).toBe(-1)
    expect(libraryWeight(lib({ name: 'a', wardrobes: ['wishlist'] }))).toBeLessThan(libraryWeight(lib({ name: 'a' })))
    expect(libraryWeight(lib({ name: 'a', wardrobes: [], isForeign: true, wearCount: 0 }))).toBe(0)
  })
  it('puts the accords of what I love first and the accords of what I dislike in the negative column', () => {
    const t = buildTaste([
      lib({ name: 'Loved', rating: 9, accords: [{ name: 'citrus', strength: 100 }, { name: 'woody', strength: 60 }], notes: ['bergamot'] }),
      lib({ name: 'Also', accords: [{ name: 'citrus', strength: 80 }], notes: ['bergamot', 'vetiver'] }),
      lib({ name: 'Bin', wardrobes: ['garbage'], accords: [{ name: 'sweet', strength: 100 }, { name: 'vanilla', strength: 90 }] })
    ])
    expect(t.accords[0].name).toBe('citrus')
    expect(t.accords.find((a) => a.name === 'sweet')).toMatchObject({ weight: 0 })
    expect(t.accords.find((a) => a.name === 'sweet')!.negative).toBeGreaterThan(0)
    expect(t.basedOn).toMatchObject({ positive: 2, negative: 1 })
    expect(t.summary).toMatch(/leans citrus/)
    expect(t.summary).toMatch(/steer away from sweet/)
  })
  it('applies my edits: love adds, mute removes, avoid is remembered', () => {
    const items = [lib({ name: 'L', accords: [{ name: 'citrus', strength: 100 }] })]
    const t = buildTaste(items, { accords: { vanilla: 'love', citrus: 'mute', oud: 'avoid' }, notes: {} })
    expect(t.accords.find((a) => a.name === 'vanilla')!.weight).toBeGreaterThanOrEqual(0.9)
    expect(t.accords.find((a) => a.name === 'citrus')!.weight).toBe(0)
    expect(t.accords.find((a) => a.name === 'oud')).toMatchObject({ override: 'avoid', weight: 0 })
  })
  it('says so plainly when the library is empty', () => {
    expect(buildTaste([]).summary).toMatch(/nothing in your library/i)
    expect(buildTaste([lib({ name: 'x', wardrobes: ['garbage'], accords: [{ name: 'sweet', strength: 50 }] })]).basedOn.positive).toBe(0)
  })
})

describe('scoring and ranking', () => {
  const index = FeatureIndex.fromRows([
    row(1, 'Citrus Wood', { citrus: 100, woody: 70 }, { vSummer: 800, vWinter: 100, vSpring: 100, vFall: 50, rating: 4.4, ratingN: 3000, people: 4000, longevity: 3.9, popularity: 5000 }),
    row(2, 'Sweet Vanilla', { sweet: 100, vanilla: 90 }, { rating: 4.5, ratingN: 3000, people: 4000, popularity: 9000 }),
    row(3, 'Citrus Only', { citrus: 100 }, { rating: 3.0, ratingN: 10, people: 12, popularity: 10 }),
    row(4, 'Mine Already', { citrus: 100, woody: 80 }, { rating: 4.4, ratingN: 3000, people: 4000, popularity: 7000 })
  ])
  const library = [
    lib({ id: 1, name: 'Bleu de Chanel', house: 'House', rating: 9, accords: [{ name: 'citrus', strength: 100 }, { name: 'woody', strength: 80 }, { name: 'aromatic', strength: 50 }] }),
    lib({ id: 2, name: 'Mine Already', house: 'House', accords: [{ name: 'citrus', strength: 100 }, { name: 'woody', strength: 80 }] }),
    lib({ id: 3, name: 'Bin Thing', house: 'House', wardrobes: ['garbage'], accords: [{ name: 'sweet', strength: 100 }] })
  ]
  const taste = buildTaste(library)

  it('scores a match high and the opposite low', () => {
    const c = compile(index, taste)
    expect(fitOf(index, c, 0).fit).toBeGreaterThan(0.8)
    expect(fitOf(index, c, 1).fit).toBeLessThan(0.1)
  })
  it('explains in words what it shares with something I own, with the season votes and the rating', () => {
    const r = rankForYou(index, taste, library, { season: 'summer' })
    const top = r.results[0]
    expect(top.catalogId).toBe(1)
    const texts = top.reasons.map((x) => x.text)
    expect(texts).toContain('shares citrus and woody with Bleu de Chanel')
    expect(texts).toContain('worn by people in summer, 800 votes')
    expect(texts.some((t) => /rated 4\.40\/5 by 3,000 people/.test(t))).toBe(true)
  })
  it('hides what I own, what is in the bin and what I said no to, and counts them', () => {
    const r = rankForYou(index, taste, library, { ignored: new Set(['house|citrus only|']) })
    expect(r.results.map((x) => x.catalogId)).toEqual([1])
    expect(r.hidden).toMatchObject({ owned: 1, ignored: 1 })
    const shown = rankForYou(index, taste, library, { hide: { ...DEFAULT_HIDE, owned: false, ignored: false } })
    expect(shown.results.map((x) => x.catalogId).sort()).toEqual([1, 3, 4])
    expect(shown.results.find((x) => x.catalogId === 4)!.inWardrobes).toEqual(['collection'])
  })
  it('lets a well-known, well-rated match beat an obscure one with the same accords', () => {
    const r = rankForYou(index, taste, library, { hide: { ...DEFAULT_HIDE, owned: false } })
    const pos = (id: number) => r.results.findIndex((x) => x.catalogId === id)
    expect(pos(1)).toBeLessThan(pos(3))
  })
  it('penalises what I avoid and says so', () => {
    const t = buildTaste(library, { accords: { woody: 'avoid' }, notes: {} })
    const r = rankForYou(index, t, library)
    expect(r.results.find((x) => x.catalogId === 1)?.reasons.map((x) => x.text).join(' ')).toMatch(/has woody, which you avoid/)
    expect(fitOf(index, compile(index, t), 0).fit).toBeLessThan(fitOf(index, compile(index, taste), 0).fit)
  })
  it('filters by season and by minimum votes', () => {
    expect(rankForYou(index, taste, library, { season: 'summer', hide: { ...DEFAULT_HIDE, owned: false } }).results.map((x) => x.catalogId)).toEqual([1])
    expect(rankForYou(index, taste, library, { minVotes: 1000, hide: { ...DEFAULT_HIDE, owned: false } }).results.map((x) => x.catalogId)).not.toContain(3)
  })
  it('matches ownership by identity, with or without the concentration', () => {
    const keys = libraryKeys([lib({ name: 'Sauvage', house: 'Dior', concentration: 'EDP' }), lib({ name: 'Eros', house: 'Versace' })])
    expect(keys.map.has(identityKey('dior', 'sauvage', 'edp'))).toBe(true)
    expect(keys.map.has('versace|eros|*')).toBe(true)
    expect(keys.map.has('dior|sauvage|*')).toBe(false)
  })
})

describe('more like these', () => {
  const index = FeatureIndex.fromRows([
    row(1, 'Seed', { citrus: 80, sweet: 60, vanilla: 50, woody: 40 }, { sillage: 2.5, longevity: 3.5, popularity: 5000 }),
    row(2, 'Sweeter Twin', { citrus: 80, sweet: 100, vanilla: 80, woody: 30 }, { sillage: 2.5, longevity: 3.5, popularity: 4000 }),
    row(3, 'Fresher Twin', { citrus: 100, fresh: 80, woody: 40, aquatic: 50 }, { sillage: 2.5, longevity: 3.5, popularity: 3000 }),
    row(4, 'Loud Twin', { citrus: 80, sweet: 60, vanilla: 50, woody: 40 }, { sillage: 3.6, longevity: 3.5, popularity: 3000 })
  ])
  const seed: Seed = { name: 'Seed', accords: index.accords(0), notes: [], sillage: 2.5, longevity: 3.5, row: 0 }

  it('leaves the seed out and ranks the closest first', () => {
    const r = rankSimilar(index, [seed], NO_SLIDERS, [])
    expect(r.results.map((x) => x.catalogId)).not.toContain(1)
    expect(r.results[0].reasons[0].text).toMatch(/^shares .* with Seed/)
  })
  it('"less sweet" turns the sweet accords down, says what it did, and moves the sweeter one down', () => {
    const plain = rankSimilar(index, [seed], NO_SLIDERS, [])
    const less = rankSimilar(index, [seed], { ...NO_SLIDERS, sweet: -1 }, [])
    expect(less.profile.changes[0]).toMatch(/^Less sweet: turned down sweet, vanilla/)
    const pos = (r: typeof plain, id: number) => r.results.findIndex((x) => x.catalogId === id)
    expect(pos(less, 2)).toBeGreaterThan(pos(plain, 2))
  })
  it('"fresher" shifts the target toward fresh accords', () => {
    const p = seedProfile([seed], { ...NO_SLIDERS, fresh: 1 })
    expect(p.accords.find((a) => a.name === 'aquatic')).toBeDefined()
    expect(p.changes.join(' ')).toMatch(/Fresher/)
    const plain = rankSimilar(index, [seed], NO_SLIDERS, [])
    const r = rankSimilar(index, [seed], { ...NO_SLIDERS, fresh: 1 }, [])
    const score = (x: typeof plain, id: number) => x.results.find((y) => y.catalogId === id)!.score
    expect(score(r, 3)).toBeGreaterThan(score(plain, 3))
    expect(score(r, 2)).toBeLessThan(score(plain, 2) + 1)
  })
  it('"louder" prefers the bigger sillage', () => {
    const r = rankSimilar(index, [seed], { ...NO_SLIDERS, projection: 1 }, [])
    expect(r.results[0].catalogId).toBe(4)
  })
  it('averages several seeds', () => {
    const p = seedProfile([{ name: 'A', accords: [{ name: 'citrus', strength: 100 }], notes: [] }, { name: 'B', accords: [{ name: 'woody', strength: 100 }], notes: [] }])
    expect(p.accords.map((a) => a.name).sort()).toEqual(['citrus', 'woody'])
    expect(p.accords[0].weight).toBeCloseTo(0.5)
  })
})

describe('briefs', () => {
  const index = FeatureIndex.fromRows([
    row(1, 'Summer Fresh', { citrus: 100, aquatic: 70, fresh: 60 }, { vSummer: 900, vWinter: 50, vSpring: 200, vFall: 50, vDay: 900, vNight: 100, longevity: 3.8, sillage: 2.4, rating: 4.4, ratingN: 2000, people: 3000, popularity: 100 }),
    row(2, 'Winter Warm', { amber: 100, vanilla: 90, sweet: 80 }, { vSummer: 50, vWinter: 900, vSpring: 100, vFall: 400, vDay: 100, vNight: 900, longevity: 4.4, sillage: 3.4, rating: 4.5, ratingN: 2000, people: 3000, popularity: 90000 }),
    row(3, 'Vetiver Green', { green: 100, woody: 80 }, { vSummer: 400, vWinter: 100, vSpring: 400, vFall: 300, longevity: 3.0, sillage: 2.0, popularity: 5000 }, ),
    row(4, 'Unknown', { woody: 60 }, {})
  ])
  index.noteIds.set('vetiver', 99)
  const library: LibraryItem[] = []
  const brief = (b: Partial<Brief>): Brief => ({ ...EMPTY_BRIEF, ...b })
  const run = (b: Partial<Brief>) => rankBrief(index, brief(b), { library })

  it('ranks the fragrance that meets more of the brief first and shows which parts were met', () => {
    const r = run({ season: 'summer', temperatureC: 30, timeOfDay: 'day', longevity: 'long', wantAccords: ['citrus'] })
    expect(r.results[0].catalogId).toBe(1)
    const crit = r.results[0].criteria
    expect(crit.find((c) => c.key === 'season')).toMatchObject({ status: 'met' })
    expect(crit.find((c) => c.key === 'temperature')?.status).toBe('met')
    expect(crit.find((c) => c.key === 'want:citrus')?.status).toBe('met')
    const winter = r.results.find((x) => x.catalogId === 2)!
    expect(winter.criteria.find((c) => c.key === 'season')?.status).toBe('unmet')
  })
  it('reports unknown (not a guess) when the dataset has no votes', () => {
    const r = run({ season: 'summer', timeOfDay: 'night' })
    const unknown = r.results.find((x) => x.catalogId === 4)!
    expect(unknown.criteria.find((c) => c.key === 'season')?.status).toBe('unknown')
  })
  it('drops dealbreakers and says how many', () => {
    const r = run({ avoidAccords: ['green'] })
    expect(r.results.map((x) => x.catalogId)).not.toContain(3)
    expect(r.excluded).toBe(1)
    expect(r.excludedExamples[0]).toMatch(/strong green/)
    const syrup = run({ notSyrupy: true })
    expect(syrup.results.map((x) => x.catalogId)).not.toContain(2)
  })
  it('crowd-pleaser and stand-out are labelled estimates, and stand-out uses how common it is', () => {
    const r = run({ crowd: 'stand_out' })
    const c = r.results.find((x) => x.catalogId === 1)!.criteria.find((k) => k.key === 'crowd')!
    expect(c.label).toMatch(/Stands out/)
    expect(c.status).toBe('met')
    expect(run({ crowd: 'pleaser' }).results[0].criteria.find((k) => k.key === 'crowd')!.detail).toMatch(/estimated/)
  })
  it('a humid day marks heavy fragrances partly or not met', () => {
    const r = run({ humidity: 90 })
    expect(r.results.find((x) => x.catalogId === 1)!.criteria.find((k) => k.key === 'humidity')?.status).toBe('met')
    expect(r.results.find((x) => x.catalogId === 2)!.criteria.find((k) => k.key === 'humidity')?.status).not.toBe('met')
  })
  it('an empty brief ranks everything by community quality', () => {
    const ctx = compileBrief(index, EMPTY_BRIEF)
    expect(evaluateRow(index, ctx, 0)).toMatchObject({ excluded: false, criteria: 0, satisfaction: 0 })
    expect(run({}).total).toBe(4)
  })
  it('repairs a saved brief that is missing fields or has junk', () => {
    expect(normalizeBrief({ season: 'monsoon', wantAccords: ['citrus', 3, ''], longevity: 'long', genderLean: 'x' })).toMatchObject({ season: null, wantAccords: ['citrus'], longevity: 'long', genderLean: null, popularity: 'any' })
    expect(normalizeBrief(null)).toEqual(EMPTY_BRIEF)
  })
})

describe('large dataset', () => {
  it('ranks 140,000 synthetic fragrances well inside the time budget', () => {
    const t0 = Date.now()
    const index = FeatureIndex.fromRows(syntheticRows(140_000))
    const built = Date.now() - t0
    const library = [lib({ id: 1, name: 'Mine', rating: 9, accords: [{ name: 'citrus', strength: 100 }, { name: 'woody', strength: 80 }], notes: ['bergamot', 'vetiver'] })]
    const taste = buildTaste(library)
    rankForYou(index, taste, library) // warm up the JIT like a second click would
    const r = rankForYou(index, taste, library, { limit: 40 })
    expect(r.results.length).toBe(40)
    expect(r.ms).toBeLessThan(300)
    const b = rankBrief(index, { ...EMPTY_BRIEF, season: 'summer', temperatureC: 28, wantAccords: ['citrus'], avoidNotes: ['vetiver'] }, { library, limit: 40 })
    expect(b.results.length).toBeGreaterThan(0)
    expect(b.ms).toBeLessThan(1500)
    // eslint-disable-next-line no-console
    console.log(`140k rows: index built in ${built} ms, For you ${r.ms} ms, brief ${b.ms} ms`)
  }, 60_000)
})
