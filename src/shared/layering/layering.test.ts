import { describe, expect, it } from 'vitest'
import { affinityOf, buildAffinity, DEFAULT_RULES, defaultAffinity, overridesFrom, pairKey } from './affinity'
import { analyzeLayer, blendAccords, perfFactor, sharesOf, suggestPartners, VERDICT_GREAT, VERDICT_WORTH_TESTING } from './engine'
import type { LayerItem, MixItem, RatedCombo } from './types'

let nextId = 1
const make = (name: string, accords: Record<string, number>, o: Partial<LayerItem> = {}): LayerItem => ({
  id: nextId++,
  name,
  accords: Object.entries(accords).map(([n, strength]) => ({ name: n, strength })),
  notes: [],
  projection: 2.5,
  ...o
})
const mix = (...pairs: [LayerItem, number][]): MixItem[] => pairs.map(([item, sprays]) => ({ item, sprays }))
const run = (a: LayerItem, b: LayerItem, o?: Parameters<typeof analyzeLayer>[1]) => analyzeLayer(mix([a, 1], [b, 1]), o)

const gourmand = () => make('Gourmand', { vanilla: 100, sweet: 85, amber: 50, 'warm spicy': 40 })
const citrusFresh = () => make('Citrus Fresh', { citrus: 100, aromatic: 65, fresh: 55, woody: 25 })
const aquatic = () => make('Aquatic', { aquatic: 100, fresh: 60, citrus: 35, woody: 20 })
const coffeeSweet = () => make('Coffee Sweet', { coffee: 100, vanilla: 80, sweet: 70, caramel: 40 })
const oud = () => make('Heavy Oud', { oud: 100, amber: 60, woody: 50, smoky: 40 })
const whiteFloral = () => make('White Floral', { 'white floral': 100, sweet: 50, powdery: 40, 'yellow floral': 40 })
const woodyAmber = () => make('Woody Amber', { woody: 100, amber: 80, 'warm spicy': 35, musky: 30 })

describe('affinity matrix', () => {
  it('is symmetric and covers every default rule', () => {
    const m = defaultAffinity()
    expect(Object.keys(m).length).toBe(DEFAULT_RULES.length)
    expect(affinityOf(m, 'vanilla', 'citrus')).toBe(affinityOf(m, 'Citrus', ' VANILLA '))
    expect(affinityOf(m, 'amber', 'woody')).toBeGreaterThan(0.5)
    expect(affinityOf(m, 'aquatic', 'sweet')).toBeLessThan(0)
    expect(affinityOf(m, 'oud', 'white floral')).toBeLessThan(0)
  })
  it('treats the same accord as mildly positive and unlisted pairs as neutral', () => {
    const m = defaultAffinity()
    expect(affinityOf(m, 'woody', 'woody')).toBeGreaterThan(0)
    expect(affinityOf(m, 'salty', 'rubber')).toBe(0)
  })
  it('applies overrides, including an override to exactly 0', () => {
    const m = buildAffinity({ 'citrus|vanilla': 0, 'rose|salty': 0.9 })
    expect(affinityOf(m, 'vanilla', 'citrus')).toBe(0)
    expect(affinityOf(m, 'salty', 'rose')).toBe(0.9)
    expect(affinityOf(buildAffinity({ 'a|b': 5 }), 'a', 'b')).toBe(1) // clamped
  })
  it('has no duplicate rules and every strength inside -1..1', () => {
    const seen = new Set<string>()
    for (const [a, b, v] of DEFAULT_RULES) {
      const k = [a, b].sort().join('|')
      expect(seen.has(k), k).toBe(false)
      seen.add(k)
      expect(Math.abs(v)).toBeLessThanOrEqual(1)
    }
  })
})

describe('affinity overrides', () => {
  it('stores only what differs from the defaults', () => {
    const edited = { ...defaultAffinity(), [pairKey('vanilla', 'citrus')]: -0.4, [pairKey('salty', 'rose')]: 0.8 }
    expect(overridesFrom(edited)).toEqual({ 'citrus|vanilla': -0.4, 'rose|salty': 0.8 })
    expect(overridesFrom(defaultAffinity())).toEqual({})
  })
  it('keeps an explicit neutral override of a default rule, and round-trips through buildAffinity', () => {
    const edited = { ...defaultAffinity(), [pairKey('vanilla', 'citrus')]: 0 }
    const o = overridesFrom(edited)
    expect(o).toEqual({ 'citrus|vanilla': 0 })
    expect(affinityOf(buildAffinity(o), 'citrus', 'vanilla')).toBe(0)
  })
  it('clamps, rounds and ignores junk', () => {
    expect(overridesFrom({ 'a|b': 7, 'c|d': 0.456, nonsense: 1, 'e|f': NaN })).toEqual({ 'a|b': 1, 'c|d': 0.46 })
  })
})

describe('blending', () => {
  it('scales the strongest accord to 100 and sorts descending', () => {
    const b = blendAccords(mix([gourmand(), 1], [citrusFresh(), 1]))
    expect(b[0].strength).toBe(100)
    expect(b.map((x) => x.strength)).toEqual([...b.map((x) => x.strength)].sort((x, y) => y - x))
  })
  it('follows the spray ratio', () => {
    const g = gourmand()
    const c = citrusFresh()
    expect(blendAccords(mix([g, 3], [c, 1]))[0].name).toBe('vanilla')
    expect(blendAccords(mix([g, 1], [c, 3]))[0].name).toBe('citrus')
    const shares = sharesOf(mix([g, 2], [c, 1]))
    expect(shares[0].share).toBeCloseTo(2 / 3)
    expect(shares[0].share + shares[1].share).toBeCloseTo(1)
  })
  it('lets a stronger projector dominate at equal sprays', () => {
    const quiet = make('Quiet', { woody: 100 }, { projection: 1 })
    const loud = make('Loud', { citrus: 100 }, { projection: 4 })
    expect(perfFactor(4)).toBeGreaterThan(perfFactor(1))
    const [q, l] = sharesOf(mix([quiet, 1], [loud, 1]))
    expect(l.share).toBeGreaterThan(q.share)
    expect(blendAccords(mix([quiet, 1], [loud, 1]))[0].name).toBe('citrus')
  })
  it('falls back to a neutral projection when unknown', () => {
    expect(perfFactor(null)).toBe(perfFactor(2.5))
    expect(perfFactor(undefined)).toBe(perfFactor(2.5))
    expect(perfFactor(99)).toBe(perfFactor(4))
  })
  it('returns nothing for empty input', () => {
    expect(blendAccords([])).toEqual([])
    expect(blendAccords(mix([gourmand(), 0]))).toEqual([])
  })
})

describe('compatibility scoring', () => {
  it('rates classic pairings well and explains why', () => {
    const r = run(gourmand(), citrusFresh())
    expect(r.score).toBeGreaterThanOrEqual(VERDICT_WORTH_TESTING)
    expect(r.reasons.some((x) => x.impact > 0 && x.kind === 'affinity')).toBe(true)
    const wa = run(woodyAmber(), citrusFresh())
    expect(wa.score).toBeGreaterThanOrEqual(VERDICT_WORTH_TESTING)
  })

  it('flags risky pairings (aquatic with gourmand, heavy oud with white floral)', () => {
    const a = run(aquatic(), coffeeSweet())
    expect(a.score).toBeLessThan(VERDICT_WORTH_TESTING)
    expect(a.verdict).toBe('Likely to clash')
    expect(a.reasons.some((x) => x.impact < 0 && /clash|pull|mix|weighed/.test(x.text))).toBe(true)
    const o = run(oud(), whiteFloral())
    expect(o.score).toBeLessThan(VERDICT_WORTH_TESTING)
  })

  it('ranks a good pair above a clashing one', () => {
    expect(run(gourmand(), citrusFresh()).score).toBeGreaterThan(run(aquatic(), coffeeSweet()).score)
  })

  it('penalises near-identical profiles as redundant', () => {
    const a = gourmand()
    const twin = make('Twin', { vanilla: 95, sweet: 80, amber: 55, 'warm spicy': 40 })
    const r = run(a, twin)
    expect(r.reasons.some((x) => x.kind === 'redundancy' && x.impact < 0)).toBe(true)
    expect(r.score).toBeLessThan(run(a, citrusFresh()).score)
    expect(r.verdict).toBe('Redundant')
  })

  it('penalises two loud fragrances competing, less so with an uneven ratio', () => {
    const loud1 = make('Loud 1', { woody: 100, amber: 70 }, { projection: 4 })
    const loud2 = make('Loud 2', { citrus: 100, aromatic: 70, woody: 40 }, { projection: 4 })
    const quiet2 = make('Quiet 2', { citrus: 100, aromatic: 70, woody: 40 }, { projection: 1.5 })
    const equal = analyzeLayer(mix([loud1, 1], [loud2, 1]))
    const uneven = analyzeLayer(mix([loud1, 3], [loud2, 1]))
    const withQuiet = analyzeLayer(mix([loud1, 1], [quiet2, 1]))
    expect(equal.reasons.some((x) => x.kind === 'competition')).toBe(true)
    expect(uneven.score).toBeGreaterThan(equal.score)
    expect(withQuiet.score).toBeGreaterThan(equal.score)
  })

  it('rewards shared and bridging notes', () => {
    const a = make('A', { woody: 100, amber: 50 }, { notes: [{ name: 'Vanilla', layer: 'base' }, { name: 'Cedar', layer: 'base' }] })
    const b = make('B', { citrus: 100, aromatic: 50 }, { notes: [{ name: 'Vanilla', layer: 'heart' }, { name: 'Lemon', layer: 'top' }] })
    const b2 = make('B2', { citrus: 100, aromatic: 50 }, { notes: [{ name: 'Lemon', layer: 'top' }] })
    const withShared = run(a, b)
    expect(withShared.reasons.some((x) => x.kind === 'notes' && /vanilla/i.test(x.text))).toBe(true)
    expect(withShared.score).toBeGreaterThan(run(a, b2).score)
  })

  it('rewards a shared season and penalises opposite ones', () => {
    const summer = { winter: 5, spring: 30, summer: 100, fall: 20 }
    const winter = { winter: 100, spring: 20, summer: 3, fall: 70 }
    const a = make('A', { woody: 100, amber: 50 }, { seasons: summer })
    const same = make('B', { citrus: 100, aromatic: 50 }, { seasons: { ...summer } })
    const opposite = make('C', { citrus: 100, aromatic: 50 }, { seasons: winter })
    const s = run(a, same)
    const o = run(a, opposite)
    expect(s.score).toBeGreaterThan(o.score)
    expect(s.reasons.some((x) => /same seasons/.test(x.text))).toBe(true)
    expect(o.reasons.some((x) => /different|rarely/.test(x.text))).toBe(true)
  })

  it('notices a day scent paired with a night scent', () => {
    const a = make('Day', { woody: 100, amber: 50 }, { daynight: { day: 900, night: 100 } })
    const b = make('Night', { citrus: 100, aromatic: 50 }, { daynight: { day: 100, night: 900 } })
    expect(run(a, b).reasons.some((x) => /daytime|night/.test(x.text))).toBe(true)
  })

  it('works when there is no season data at all', () => {
    const r = run(gourmand(), citrusFresh())
    expect(r.reasons.some((x) => x.kind === 'season')).toBe(false)
    expect(Number.isFinite(r.score)).toBe(true)
  })

  it('always stays within 0-100', () => {
    for (const [a, b] of [[gourmand(), citrusFresh()], [aquatic(), oud()], [gourmand(), gourmand()], [coffeeSweet(), whiteFloral()]]) {
      const s = run(a, b).score
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })

  it('uses a custom affinity matrix', () => {
    const a = make('A', { vanilla: 100 })
    const b = make('B', { citrus: 100 })
    const normal = run(a, b)
    const hated = run(a, b, { affinity: buildAffinity({ 'citrus|vanilla': -1 }) })
    expect(hated.score).toBeLessThan(normal.score)
    expect(hated.reasons.some((x) => x.impact < 0)).toBe(true)
  })
})

describe('learning from my ratings', () => {
  const a = gourmand()
  const b = citrusFresh()
  const past = (rating: number): RatedCombo => ({ rating, items: [{ accords: gourmand().accords }, { accords: citrusFresh().accords }] })
  const base = run(a, b).score

  it('raises the score for pairings similar to ones I loved', () => {
    const r = run(a, b, { history: [past(10)] })
    expect(r.score).toBeGreaterThan(base)
    expect(r.reasons.some((x) => x.kind === 'taste' && /10\/10/.test(x.text))).toBe(true)
  })
  it('lowers it for pairings similar to ones I disliked', () => {
    expect(run(a, b, { history: [past(2)] }).score).toBeLessThan(base)
  })
  it('grows with more evidence, but stays bounded', () => {
    const one = run(a, b, { history: [past(10)] }).score
    const many = run(a, b, { history: [past(10), past(10), past(10)] }).score
    expect(many).toBeGreaterThanOrEqual(one)
    expect(many - base).toBeLessThanOrEqual(12.5)
  })
  it('matches in either order and ignores unrelated history', () => {
    const swapped: RatedCombo = { rating: 10, items: [{ accords: citrusFresh().accords }, { accords: gourmand().accords }] }
    expect(run(a, b, { history: [swapped] }).score).toBeGreaterThan(base)
    const unrelated: RatedCombo = { rating: 10, items: [{ accords: aquatic().accords }, { accords: oud().accords }] }
    expect(run(a, b, { history: [unrelated] }).score).toBe(base)
  })
  it('treats a middling rating as neutral', () => {
    expect(Math.abs(run(a, b, { history: [past(5.5)] }).score - base)).toBeLessThanOrEqual(1)
  })
  it('learns from three-way combos pair by pair', () => {
    const triple: RatedCombo = { rating: 10, items: [{ accords: gourmand().accords }, { accords: citrusFresh().accords }, { accords: aquatic().accords }] }
    expect(run(a, b, { history: [triple] }).score).toBeGreaterThan(base)
  })
})

describe('verdicts', () => {
  it('maps scores to verdicts', () => {
    const great = analyzeLayer(mix([make('A', { woody: 100, amber: 80 }), 1], [make('B', { citrus: 100, aromatic: 50, woody: 20 }), 1]), {
      history: [{ rating: 10, items: [{ accords: [{ name: 'woody', strength: 100 }, { name: 'amber', strength: 80 }] }, { accords: [{ name: 'citrus', strength: 100 }, { name: 'aromatic', strength: 50 }, { name: 'woody', strength: 20 }] }] }]
    })
    expect(great.score).toBeGreaterThanOrEqual(VERDICT_GREAT)
    expect(great.verdict).toBe('Great pairing')
  })
})

describe('three fragrances', () => {
  it('scores all pairs, labels reasons with names and sums shares to 1', () => {
    const r = analyzeLayer(mix([woodyAmber(), 2], [citrusFresh(), 1], [gourmand(), 1]))
    expect(r.pairs).toHaveLength(3)
    expect(r.shares.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(r.reasons.every((x) => / \+ .*: /.test(x.text) || x.kind === 'competition')).toBe(true)
  })
  it('penalises three strong projectors', () => {
    const l = (n: string, acc: Record<string, number>) => make(n, acc, { projection: 3.8 })
    const r = analyzeLayer(mix([l('A', { woody: 100 }), 1], [l('B', { citrus: 100 }), 1], [l('C', { vanilla: 100 }), 1]))
    expect(r.reasons.some((x) => /Three strong projectors/.test(x.text))).toBe(true)
  })
})

describe('description', () => {
  it('writes 2-4 sentences naming the fragrances', () => {
    const a = make('Alpha', { woody: 100, amber: 70 }, { notes: [{ name: 'Bergamot', layer: 'top' }, { name: 'Cedar', layer: 'base' }, { name: 'Vanilla', layer: 'base' }] })
    const b = make('Beta', { citrus: 100, aromatic: 60 }, { notes: [{ name: 'Lemon', layer: 'top' }] })
    const r = analyzeLayer(mix([a, 3], [b, 1]))
    const sentences = r.description.split(/(?<=\.)\s+/)
    expect(sentences.length).toBeGreaterThanOrEqual(2)
    expect(sentences.length).toBeLessThanOrEqual(4)
    expect(r.description).toMatch(/Alpha/)
    expect(r.description).toMatch(/bergamot/)
    expect(r.description).toMatch(/drydown/)
    expect(r.description).toMatch(/dominates/)
  })
  it('says so when two fragrances are evenly matched', () => {
    const r = analyzeLayer(mix([make('Alpha', { woody: 100 }), 1], [make('Beta', { citrus: 100 }), 1]))
    expect(r.description).toMatch(/share the stage/)
  })
  it('is stable for the same input and falls back to accords without notes', () => {
    const items = mix([make('Alpha', { woody: 100, amber: 50 }), 1], [make('Beta', { citrus: 100 }), 2])
    expect(analyzeLayer(items).description).toBe(analyzeLayer(items).description)
    expect(analyzeLayer(items).description.length).toBeGreaterThan(20)
  })
  it('returns an empty analysis for fewer than two fragrances', () => {
    const r = analyzeLayer(mix([gourmand(), 1]))
    expect(r).toMatchObject({ score: 0, reasons: [], pairs: [], description: '' })
    expect(analyzeLayer([]).blend).toEqual([])
    expect(analyzeLayer(mix([gourmand(), 1], [citrusFresh(), 0])).pairs).toEqual([])
  })
})

describe('suggestPartners', () => {
  it('ranks the best partners first and skips the base itself', () => {
    const base = gourmand()
    const candidates = [base, aquatic(), citrusFresh(), woodyAmber(), oud()]
    const out = suggestPartners(base, candidates)
    expect(out.map((o) => o.item.id)).not.toContain(base.id)
    expect(out).toHaveLength(4)
    expect(out.map((o) => o.score)).toEqual([...out.map((o) => o.score)].sort((a, b) => b - a))
    expect(out[0].score).toBeGreaterThanOrEqual(VERDICT_WORTH_TESTING)
    expect(out[0].headline.length).toBeGreaterThan(5)
    expect(out[out.length - 1].score).toBeLessThan(out[0].score)
  })
  it('respects my history and custom matrix', () => {
    const base = gourmand()
    const c = citrusFresh()
    const w = woodyAmber()
    const normal = suggestPartners(base, [c, w])
    const hateCitrus = suggestPartners(base, [c, w], { affinity: buildAffinity({ 'citrus|vanilla': -1, 'aromatic|vanilla': -1, 'fresh|vanilla': -1 }) })
    expect(hateCitrus.find((x) => x.item.id === c.id)!.score).toBeLessThan(normal.find((x) => x.item.id === c.id)!.score)
  })
  it('handles an empty candidate list', () => {
    expect(suggestPartners(gourmand(), [])).toEqual([])
  })
})
