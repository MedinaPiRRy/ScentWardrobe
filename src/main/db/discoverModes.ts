import { buildAffinity } from '@shared/layering/affinity'
import { analyzeLayer, suggestPartners } from '@shared/layering/engine'
import type { AffinityMatrix, LayerItem } from '@shared/layering/types'
import { approxVotes, compareValue, dupeScore, evidenceStrength } from '@shared/discover/dupes'
import { budgetVerdict, costFor, priceReference, trialHint, type PricedBottle } from '@shared/discover/budget'
import { analyzeCoverage, type GapItem } from '@shared/discover/gaps'
import { compile, fitOf, ignoredRows, libraryRows, rankForYou, type Suggestion } from '@shared/discover/rank'
import { seedProfile } from '@shared/discover/similar'
import type { LibraryItem } from '@shared/discover/taste'
import { norm } from '@shared/discover/vocab'
import type { BudgetResults, DiscoverCard, DiscoverFilters, DupesResults, GapsResult, LayeringResults, SeedRef } from '@shared/discover/dto'
import type { Season } from '@shared/discover/vocab'
import type { FeatureIndex } from '@shared/discover'
import type { CatalogExtra } from '@shared/discover/extra'
import type { Db } from '../db'
import { datasetCards, emptyResults, findRow, getTaste, hideOf, ignoredSet, libraryIdByKey, libraryIndex, loadLibrary, pickSource } from './discover'
import { layerCandidates, layerItemsFor, ratedHistory } from './layering'
import { getSetting } from './settings'

// ---- wardrobe gaps -------------------------------------------------------------------------------------------

const seasonOfMonth = (m0: number): Season => (m0 === 11 || m0 <= 1 ? 'winter' : m0 <= 4 ? 'spring' : m0 <= 7 ? 'summer' : 'fall')

/** The coverage map of My Collection from what I own and what my wear log says. Needs no dataset. */
export function discoverCoverage(db: Db): GapsResult {
  const items = layerCandidates(db)
  const longevity = new Map((db.prepare('SELECT fragrance_id AS id, longevity FROM fragrance_community').all() as { id: number; longevity: number | null }[]).map((r) => [r.id, r.longevity]))
  const wears = db.prepare("SELECT fragrance_id AS id, worn_at AS at, time_of_day AS tod, activity FROM wear_log WHERE fragrance_id IS NOT NULL AND worn_at NOT LIKE '' ").all() as { id: number; at: string; tod: string | null; activity: string | null }[]
  const stats = new Map<number, GapItem['wears']>()
  for (const w of wears) {
    const st = stats.get(w.id) ?? { total: 0, bySeason: { winter: 0, spring: 0, summer: 0, fall: 0 }, day: 0, night: 0, activities: {} }
    st.total++
    const month = Number(w.at.slice(5, 7)) - 1
    if (month >= 0 && month <= 11) st.bySeason[seasonOfMonth(month)]++
    const hour = Number(w.at.slice(11, 13))
    const night = w.tod ? w.tod === 'evening' || w.tod === 'night' : Number.isFinite(hour) && (hour >= 18 || hour < 5)
    if (night) st.night++
    else st.day++
    if (w.activity) st.activities[w.activity] = (st.activities[w.activity] ?? 0) + 1
    stats.set(w.id, st)
  }
  const empty = (): GapItem['wears'] => ({ total: 0, bySeason: { winter: 0, spring: 0, summer: 0, fall: 0 }, day: 0, night: 0, activities: {} })
  const gapItems: GapItem[] = items.map((i) => ({
    id: i.id, name: i.name, accords: i.accords, seasons: i.seasons ?? null, daynight: i.daynight ?? null, projection: i.projection ?? null, longevity: longevity.get(i.id) ?? null, wears: stats.get(i.id) ?? empty()
  }))
  return { coverage: analyzeCoverage(gapItems) }
}

// ---- layering partners ---------------------------------------------------------------------------------------

function engineOptions(db: Db): { affinity: AffinityMatrix; history: ReturnType<typeof ratedHistory> } {
  let overrides: AffinityMatrix = {}
  try {
    overrides = JSON.parse(getSetting(db, 'layering.affinity') ?? '{}') as AffinityMatrix
  } catch {
    overrides = {}
  }
  return { affinity: buildAffinity(overrides), history: ratedHistory(db) }
}

function indexItem(index: FeatureIndex, row: number, id: number, name: string): LayerItem {
  const sv = index.seasonVotes(row)
  const dn = index.dayShare(row)
  const sil = index.sillage[row]
  const day = index.votes[row * 6 + 4]
  const night = index.votes[row * 6 + 5]
  return {
    id,
    name,
    accords: index.accords(row),
    notes: index.notes(row).map((n) => ({ name: n.name, layer: n.layer })),
    seasons: sv ? { winter: sv.winter, spring: sv.spring, summer: sv.summer, fall: sv.fall } : null,
    daynight: dn ? { day, night } : null,
    projection: Number.isNaN(sil) ? null : sil
  }
}

const CANDIDATE_POOL = 300

/** Partners for one fragrance, scored with the Layering Lab's own engine (accord affinities, notes, redundancy, season, my rated blends) and ordered with my ratings. */
export async function discoverLayering(db: Db, req: { seed: SeedRef; limit?: number }): Promise<LayeringResults> {
  const none = { base: null }
  const library = loadLibrary(db)
  const opts = engineOptions(db)
  const limit = req.limit ?? 12
  const owned = layerCandidates(db)
  const ownedIds = new Set(owned.map((o) => o.id))
  let base: LayerItem | null = null
  let baseInfo: { name: string; house: string; fragranceId: number | null } | null = null
  const src = await pickSource(db, library)

  if ('fragranceId' in req.seed) {
    const found = layerItemsFor(db, 'WHERE f.id = ?', req.seed.fragranceId)[0]
    if (found) {
      base = found
      baseInfo = { name: found.name, house: found.house ?? '', fragranceId: found.id }
    }
  } else if (src.kind === 'dataset') {
    const row = src.index.indexOfCatalog(req.seed.catalogId)
    const c = db.prepare('SELECT name, house FROM catalog_fragrances WHERE id = ?').get(req.seed.catalogId) as { name: string; house: string } | undefined
    if (row >= 0 && c) {
      base = indexItem(src.index, row, -req.seed.catalogId, c.name)
      baseInfo = { name: c.name, house: c.house, fragranceId: null }
    }
  }
  if (!base || !baseInfo) return { ...emptyResults(src.kind === 'none' ? 'none' : src.kind, 'Pick a fragrance to find partners for.'), ...none }

  type Scored = { card: DiscoverCard; rank: number }
  const scored: Scored[] = []
  const reasonsOf = (a: LayerItem, b: LayerItem) => {
    const r = analyzeLayer([{ item: a, sprays: 1 }, { item: b, sprays: 1 }], opts)
    return { score: r.score, verdict: r.verdict, headline: (r.reasons.find((x) => x.impact > 0) ?? r.reasons[0])?.text ?? '', reasons: r.reasons.slice(0, 4).map((x) => x.text) }
  }

  // 1. Fragrances in My Collection: the same ordering the Layering Lab uses (my ratings steer the order, never the pair score)
  const mine = suggestPartners(base, owned, opts)
  const byId = new Map(library.map((l) => [l.id, l]))
  for (const p of mine) {
    const it = byId.get(p.item.id)
    const info = reasonsOf(base, p.item)
    scored.push({
      // what I can mix today comes first, in the Lab's own order (my ratings steer it), then the ideas I do not own
      rank: 1000 + p.rankScore,
      card: {
        key: `l:${p.item.id}`, source: 'library', catalogId: null, fragranceId: p.item.id, name: p.item.name, house: p.item.house ?? '', year: null, concentration: it?.concentration ?? null, sourceUrl: null, imageUrl: null,
        topAccords: [...p.item.accords].sort((a, b) => b.strength - a.strength).slice(0, 4), score: Math.round(p.score), reasons: [], inWardrobes: it?.wardrobes ?? ['collection'],
        layer: info, labIds: ownedIds.has(base.id) ? [base.id, p.item.id] : null
      }
    })
  }

  // 2. Fragrances I do not have yet: my Wishlist and To Try without a dataset, the best matches for my taste with one
  const { taste } = getTaste(db)
  const extraSuggestions: { s: Suggestion; item: LayerItem }[] = []
  if (src.kind === 'dataset') {
    const pool = rankForYou(src.index, taste, library, { limit: CANDIDATE_POOL, minFit: 0.1 })
    for (const s of pool.results) extraSuggestions.push({ s, item: indexItem(src.index, s.row, -s.catalogId, '') })
  }
  const dsCards = src.kind === 'dataset' ? datasetCards(db, extraSuggestions.map((e) => e.s), library) : []
  const byCatalog = new Map(dsCards.map((c) => [c.catalogId, c]))
  for (const e of extraSuggestions) {
    const c = byCatalog.get(e.s.catalogId)
    if (!c || (src.kind === 'dataset' && base.id === -c.catalogId!)) continue
    const item = { ...e.item, name: c.name, house: c.house }
    const p = reasonsOf(base, item)
    scored.push({ rank: p.score, card: { ...c, score: Math.round(p.score), reasons: [], layer: p, labIds: null } })
  }
  if (src.kind === 'library') {
    const unowned = layerItemsFor(db, `WHERE f.id IN (SELECT fragrance_id FROM wardrobe_memberships WHERE wardrobe IN ('wishlist','to_try'))`).filter((x) => !ownedIds.has(x.id) && x.id !== base!.id)
    for (const p of suggestPartners(base, unowned, opts)) {
      const it = byId.get(p.item.id)
      const info = reasonsOf(base, p.item)
      scored.push({
        rank: p.rankScore,
        card: { key: `l:${p.item.id}`, source: 'library', catalogId: null, fragranceId: p.item.id, name: p.item.name, house: p.item.house ?? '', year: null, concentration: it?.concentration ?? null, sourceUrl: null, imageUrl: null, topAccords: [...p.item.accords].sort((a, b) => b.strength - a.strength).slice(0, 4), score: Math.round(p.score), reasons: [], inWardrobes: it?.wardrobes ?? [], layer: info, labIds: null }
      })
    }
  }

  scored.sort((a, b) => b.rank - a.rank)
  const cards = scored.filter((s) => s.card.layer && s.card.layer.score >= 40).slice(0, limit).map((s) => s.card)
  return {
    mode: src.kind === 'none' ? 'library' : src.kind,
    cards,
    total: scored.length,
    hidden: {},
    ms: 0,
    message: cards.length === 0 ? 'Nothing pairs well enough with this one.' : null,
    base: baseInfo
  }
}

// ---- dupes and alternatives ----------------------------------------------------------------------------------

const fidFromUrl = (url: string | null | undefined): number | null => {
  const m = /-(\d+)\.html/.exec(url ?? '')
  return m ? Number(m[1]) : null
}

/** My price per ml for each fragrance of mine (full bottles, paid else market). */
function myPerMl(db: Db): Map<number, number> {
  const out = new Map<number, number[]>()
  for (const b of db.prepare("SELECT fragrance_id AS id, size_ml AS ml, price, market_price AS market FROM bottles WHERE type = 'full bottle' AND size_ml > 0").all() as { id: number; ml: number; price: number | null; market: number | null }[]) {
    const p = b.price ?? b.market
    if (p != null && p > 0) out.set(b.id, [...(out.get(b.id) ?? []), p / b.ml])
  }
  return new Map([...out].map(([id, list]) => [id, list.reduce((s, x) => s + x, 0) / list.length]))
}

/** Alternatives to one fragrance: "smells like" votes in both directions plus accord and note similarity, with the evidence shown. */
export async function discoverDupes(db: Db, req: { seed: SeedRef; filters: DiscoverFilters; cheaperOnly?: boolean }): Promise<DupesResults> {
  const base = { source: null, hasVotes: false, notes: [] as string[] }
  const library = loadLibrary(db)
  const src = await pickSource(db, library)
  if (src.kind === 'none') return { ...emptyResults('none', src.message), ...base }
  if (src.kind === 'library') return { ...emptyResults('library', 'Dupes and alternatives search the imported dataset. Import one to use this.'), ...base }
  const index = src.index
  const currency = getSetting(db, 'ui.currency') || 'USD'

  // the source: a dataset row, or one of mine matched to its dataset row
  let row = -1
  let name = ''
  let house = ''
  let had = false
  let libItem: LibraryItem | undefined
  let fid: number | null = null
  if ('catalogId' in req.seed) {
    row = index.indexOfCatalog(req.seed.catalogId)
    const c = db.prepare('SELECT name, house FROM catalog_fragrances WHERE id = ?').get(req.seed.catalogId) as { name: string; house: string } | undefined
    if (!c || row < 0) return { ...emptyResults('dataset', 'That fragrance is not in the dataset.'), ...base }
    name = c.name
    house = c.house
  } else {
    const seedRef = req.seed
    libItem = library.find((x) => x.id === seedRef.fragranceId)
    if (!libItem) return { ...emptyResults('dataset', 'Pick a fragrance first.'), ...base }
    name = libItem.name
    house = libItem.house
    had = libItem.wardrobes.includes('had') && !libItem.wardrobes.includes('collection')
    row = findRow(index, libItem)
    const url = (db.prepare('SELECT source_url AS u FROM fragrances WHERE id = ?').get(libItem.id) as { u: string | null } | undefined)?.u
    fid = fidFromUrl(url)
  }
  if (row >= 0 && index.fid[row]) fid = index.fid[row]

  // votes: this page's own votes, and other pages that say they remind people of this one
  const votes = new Map<number, { up: number; down: number; lines: string[] }>()
  const addVote = (r: number, up: number, down: number, line: string) => {
    const v = votes.get(r) ?? { up: 0, down: 0, lines: [] }
    if (up - down > v.up - v.down) {
      v.up = up
      v.down = down
    }
    v.lines.push(line)
    votes.set(r, v)
  }
  const nameOf = (r: number): string => (db.prepare('SELECT name FROM catalog_fragrances WHERE id = ?').get(index.catalogId[r]) as { name: string } | undefined)?.name ?? ''
  const agree = (up: number, down: number) => Math.round((up / Math.max(up + down, 1)) * 100)
  if (row >= 0) {
    const ex = db.prepare('SELECT extra FROM catalog_extra WHERE catalog_id = ?').get(index.catalogId[row]) as { extra: string } | undefined
    let rm: CatalogExtra['rm'] = []
    try {
      rm = ex ? (JSON.parse(ex.extra) as CatalogExtra).rm : []
    } catch {
      rm = []
    }
    for (const [tfid, up, down] of rm ?? []) {
      const r = index.indexOfFid(tfid)
      if (r >= 0) addVote(r, up, down, `${approxVotes(up)} say ${name} reminds them of ${nameOf(r)} (${agree(up, down)}% agree)`)
    }
  }
  if (fid) {
    for (const v of db.prepare('SELECT source_id AS sid, up, down FROM discover_remind WHERE target_fid = ?').all(fid) as { sid: number; up: number; down: number }[]) {
      const r = index.indexOfCatalog(v.sid)
      if (r >= 0 && r !== row) addVote(r, v.up, v.down, `${approxVotes(v.up)} say ${nameOf(r)} reminds them of ${name} (${agree(v.up, v.down)}% agree)`)
    }
  }
  const hasVotes = votes.size > 0
  const extrasMissing = (db.prepare('SELECT count(*) AS c FROM catalog_extra').get() as { c: number }).c === 0

  // profile similarity for every candidate with votes, plus the best profile matches overall
  const accords = libItem ? libItem.accords : row >= 0 ? index.accords(row) : []
  const notes = libItem ? libItem.notes.map((n) => ({ name: n })) : row >= 0 ? index.notes(row).map((n) => ({ name: n.name, layer: n.layer })) : []
  const profile = seedProfile([{ name, accords, notes, row: row >= 0 ? row : undefined }])
  const compiled = compile(index, profile)
  const fits = new Map<number, number>()
  const similar = rankForYou(index, profile, library, { limit: 60, minFit: 0.3, exclude: row >= 0 ? new Set([row]) : undefined, hide: hideOf(req.filters), ignored: ignoredSet(db), explainFrom: [{ id: -1, name, house, accords, notes: notes.map((n) => n.name), rating: null, wearCount: 0, wardrobes: ['collection'] }] })
  for (const s of similar.results) fits.set(s.row, s.fit)
  for (const r of votes.keys()) if (!fits.has(r)) fits.set(r, fitOf(index, compiled, r).fit)

  const mineRows = libraryRows(index, library)
  const ignoredSetRows = ignoredRows(index, ignoredSet(db))
  const perMl = myPerMl(db)
  const mineByKey = libraryIdByKey(library)
  const sourcePerMl = libItem ? (perMl.get(libItem.id) ?? null) : null
  const sourceValue = row >= 0 ? { avg: Number.isNaN(index.valueAvg[row]) ? null : index.valueAvg[row], n: Number.isNaN(index.valueN[row]) ? null : index.valueN[row] } : { avg: null, n: null }
  const hide = hideOf(req.filters)
  const keys = new Set(similar.results.map((s) => s.row))
  for (const r of votes.keys()) keys.add(r)
  const suggestions: { s: Suggestion; ev: number | null; votes: string[]; cheaper: boolean | null; money: string[] }[] = []
  const byRow = new Map(similar.results.map((s) => [s.row, s]))
  const sourceHouse = norm(house)
  const sourceName = norm(name)
  const sameFragrance = (r: number): boolean => index.houseKey[r] === sourceHouse && (index.nameKey[r].startsWith(sourceName) || sourceName.startsWith(index.nameKey[r]))
  let sameFamily = 0
  for (const r of keys) {
    if (sameFragrance(r)) {
      sameFamily++
      continue
    }
    const v = votes.get(r)
    const ev = v ? evidenceStrength(v.up, v.down) : null
    const fit = fits.get(r) ?? 0
    const id = mineByKey.get(`${index.houseKey[r]}|${index.nameKey[r]}|${index.concKey[r]}`) ?? mineByKey.get(`${index.houseKey[r]}|${index.nameKey[r]}|*`) ?? null
    const val = compareValue(
      { mine: { perMl: id != null ? (perMl.get(id) ?? null) : null }, valueAvg: Number.isNaN(index.valueAvg[r]) ? null : index.valueAvg[r], valueN: Number.isNaN(index.valueN[r]) ? null : index.valueN[r] },
      { mine: { perMl: sourcePerMl }, valueAvg: sourceValue.avg, valueN: sourceValue.n },
      currency
    )
    if (req.cheaperOnly && val.cheaper !== true) continue
    const base: Suggestion = byRow.get(r) ?? { row: r, catalogId: index.catalogId[r], fid: index.fid[r] || null, score: 0, fit, reasons: [], inWardrobes: mineRows.get(r) ?? [] }
    suggestions.push({ s: { ...base, score: dupeScore(fit, ev), fit }, ev, votes: v?.lines ?? [], cheaper: val.cheaper, money: val.lines })
  }
  suggestions.sort((a, b) => b.s.score - a.s.score || a.s.row - b.s.row)

  // hidden by my usual filters, as elsewhere: owned, the bin, "not interested"
  const filtered = suggestions.filter(({ s }) => {
    const w = s.inWardrobes
    return !(hide.garbage && w.includes('garbage')) && !(hide.owned && w.includes('collection')) && !(hide.ignored && ignoredSetRows.has(s.row))
  })
  const page = filtered.slice(0, req.filters.limit ?? 12)
  const cards = datasetCards(db, page.map((p) => p.s), library, (s) => {
    const p = page.find((x) => x.s.catalogId === s.catalogId)!
    return { evidence: p.votes, money: p.money, reasons: [...s.reasons, ...(p.votes.length === 0 ? [{ kind: 'info' as const, text: 'no "smells like" votes link these two; similarity is from accords and notes only' }] : [])] }
  })

  const notesOut: string[] = []
  if (sameFamily > 0) notesOut.push(`${sameFamily === 1 ? 'Another version' : `${sameFamily} other versions`} of ${name} by ${house} ${sameFamily === 1 ? 'is' : 'are'} left out: they are the same fragrance, not alternatives.`)
  if (had) notesOut.push(`${name} is no longer in your collection: these are candidates to replace it. The dataset does not say whether it is discontinued.`)
  else notesOut.push('The dataset does not say whether a fragrance is discontinued or what it costs.')
  if (!hasVotes) notesOut.push(extrasMissing ? 'Your dataset has no "smells like" votes (it was imported before the app kept them). Import the original dump again to add them; until then results rest on accords and notes only.' : 'The dataset has no "smells like" votes for this fragrance.')
  if (sourcePerMl == null && libItem) notesOut.push('There is no price on your bottles of it, so "cheaper" cannot be judged. Add what you paid and the comparison appears for any alternative you have priced.')
  return { mode: 'dataset', cards, total: filtered.length, hidden: {}, ms: 0, message: cards.length === 0 ? 'No alternatives found with these filters.' : null, source: { name, house, had }, hasVotes, notes: notesOut }
}

// ---- budget and low-risk trial -----------------------------------------------------------------------------------

export async function discoverBudget(db: Db, req: { budget: number; sizeMl: number }): Promise<BudgetResults> {
  const currency = getSetting(db, 'ui.currency') || 'USD'
  const bottles = db.prepare("SELECT type, size_ml AS sizeMl, price, market_price AS marketPrice FROM bottles").all() as PricedBottle[]
  const reference = priceReference(bottles)
  const estimate = costFor(reference, req.sizeMl)
  const verdict = budgetVerdict(req.budget, estimate)

  // fragrances I want but have no vial of, best taste match first
  const library = loadLibrary(db)
  const { taste } = getTaste(db)
  const withBottles = new Set((db.prepare("SELECT DISTINCT fragrance_id AS id FROM bottles WHERE status != 'empty'").all() as { id: number }[]).map((r) => r.id))
  const wanted = library.filter((l) => (l.wardrobes.includes('wishlist') || l.wardrobes.includes('to_try')) && !l.wardrobes.includes('collection') && !withBottles.has(l.id))
  const { index, items } = libraryIndex(wanted)
  const ranked = rankForYou(index, taste, library, { libraryOnly: true, hide: { owned: false, garbage: true, wishlist: false, toTry: false, had: false, ignored: false }, minFit: 0, limit: 12 })
  const trial: DiscoverCard[] = ranked.results.flatMap((s): DiscoverCard[] => {
    const it = items.get(-s.catalogId)
    if (!it) return []
    return [{
      key: `l:${it.id}`, source: 'library', catalogId: null, fragranceId: it.id, name: it.name, house: it.house, year: null, concentration: it.concentration ?? null, sourceUrl: null, imageUrl: null,
      topAccords: [...it.accords].sort((a, b) => b.strength - a.strength).slice(0, 4), score: s.score, reasons: s.reasons, inWardrobes: it.wardrobes, trial: trialHint(req.sizeMl, estimate, currency)
    }]
  })
  return {
    currency, reference, estimate, verdict, trial,
    message: wanted.length === 0 ? 'Everything on your Wishlist and To Try list already has a sample, a decant or a bottle, or those lists are empty.' : null
  }
}

