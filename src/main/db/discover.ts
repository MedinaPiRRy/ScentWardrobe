import { normalizeBrief, rankBrief, type Brief } from '@shared/discover/brief'
import type { BriefRequest, BriefResults, DiscoverCard, DiscoverFilters, DiscoverResults, DiscoverStatus, IgnoredItem, SavedBrief, SeedRef, SimilarRequest, SimilarResults, TasteResult } from '@shared/discover/dto'
import { FeatureIndex, buildFeatureRow, norm, type CatalogExtra, type CatalogSource, type FeatureRow } from '@shared/discover'
import { DEFAULT_HIDE, rankForYou, type Hide, type Suggestion } from '@shared/discover/rank'
import { rankSimilar, type Seed } from '@shared/discover/similar'
import { NO_OVERRIDES, buildTaste, type LibraryItem, type Override, type TasteOverrides, type WardrobeName } from '@shared/discover/taste'
import type { Result } from '@shared/types'
import type { Db } from '../db'
import { fail, listFragrances, toResult } from './repo'
import { getSetting, setSetting } from './settings'

/** Bump when the derived table changes shape or meaning: an older index is rebuilt. */
export const INDEX_VERSION = 1
const K = { version: 'discover.index.version', upto: 'discover.index.upto', complete: 'discover.index.complete', scraped: 'discover.dataset.scraped', profile: 'discover.profile' }
const CHUNK = 1500

const tick = () => new Promise<void>((r) => setImmediate(r))
const count = (db: Db, sql: string): number => (db.prepare(sql).get() as { c: number }).c

// ---- the derived index: building ----------------------------------------------------------------------

let generation = 0
let cache: { db: Db; generation: number; index: FeatureIndex } | null = null
let loading: Promise<FeatureIndex | null> | null = null
let building: { db: Db; cancelled: boolean; done: number; total: number } | null = null

/** Forget the index: after an import, a re-import or removing the dataset. It is rebuilt the next time Discovery is opened. */
export function invalidateDiscoverIndex(db: Db): void {
  generation++
  cache = null
  loading = null
  if (building) building.cancelled = true
  try {
    db.prepare('DELETE FROM discover_features').run()
    setSetting(db, K.upto, '0')
    setSetting(db, K.complete, '0')
    setSetting(db, K.scraped, '')
  } catch {
    /* the table does not exist in a test database that skipped migrations */
  }
}

const isComplete = (db: Db): boolean => getSetting(db, K.complete) === '1' && getSetting(db, K.version) === String(INDEX_VERSION)

export function discoverStatus(db: Db): DiscoverStatus {
  const datasetCount = count(db, 'SELECT count(*) AS c FROM catalog_fragrances')
  const versionOk = getSetting(db, K.version) === String(INDEX_VERSION) || getSetting(db, K.version) === null
  return {
    datasetCount,
    indexed: building ? building.done : count(db, 'SELECT count(*) AS c FROM discover_features'),
    complete: isComplete(db),
    building: building?.db === db,
    stale: !versionOk,
    withExtras: count(db, 'SELECT count(*) AS c FROM catalog_extra'),
    datasetDate: getSetting(db, K.scraped) || null,
    loaded: cache?.db === db && cache.generation === generation
  }
}

function rowsToSources(rows: { id: number; name: string; house: string; year: number | null; concentration: string | null; popularity: number; data: string; extra: string | null }[]): { source: CatalogSource; scraped: number }[] {
  const out: { source: CatalogSource; scraped: number }[] = []
  for (const r of rows) {
    let data: CatalogSource['data'] = {}
    let extra: CatalogExtra | null = null
    try {
      data = JSON.parse(r.data) as CatalogSource['data']
    } catch {
      /* a damaged row is indexed with no features rather than stopping the build */
    }
    try {
      extra = r.extra ? (JSON.parse(r.extra) as CatalogExtra) : null
    } catch {
      extra = null
    }
    out.push({ source: { id: r.id, name: r.name, house: r.house, year: r.year, concentration: r.concentration, popularity: r.popularity, data, extra }, scraped: extra?.scraped ?? 0 })
  }
  return out
}

const INSERT = `INSERT OR REPLACE INTO discover_features (catalog_id, fid, house_key, name_key, conc_key, accords, notes, v_winter, v_spring, v_summer, v_fall, v_day, v_night, longevity, sillage, rating, rating_n, value_avg, value_n, people, have_n, want_n, popularity, pop_recent, gender_lean, year)
VALUES (@catalogId, @fid, @houseKey, @nameKey, @concKey, @accords, @notes, @vWinter, @vSpring, @vSummer, @vFall, @vDay, @vNight, @longevity, @sillage, @rating, @ratingN, @valueAvg, @valueN, @people, @haveN, @wantN, @popularity, @popRecent, @genderLean, @year)`

export interface BuildHooks {
  onProgress?: (done: number, total: number) => void
}

/**
 * Builds (or resumes building) the derived table from the dataset in chunks, yielding to the window between them. Each chunk and
 * its progress marker are one transaction, so stopping at any moment (cancel, closing the app) loses nothing: the next call continues.
 */
export async function buildDiscoverIndex(db: Db, hooks: BuildHooks = {}): Promise<'done' | 'cancelled'> {
  if (building) return 'cancelled'
  if (getSetting(db, K.version) !== null && getSetting(db, K.version) !== String(INDEX_VERSION)) invalidateDiscoverIndex(db)
  const myGeneration = generation
  const total = count(db, 'SELECT count(*) AS c FROM catalog_fragrances')
  const state = { db, cancelled: false, done: count(db, 'SELECT count(*) AS c FROM discover_features'), total }
  building = state
  try {
    let upto = Number(getSetting(db, K.upto) ?? '0') || 0
    let scraped = Number(getSetting(db, K.scraped) || '0') || 0
    const select = db.prepare(
      `SELECT c.id, c.name, c.house, c.year, c.concentration, c.popularity, c.data, e.extra FROM catalog_fragrances c LEFT JOIN catalog_extra e ON e.catalog_id = c.id WHERE c.id > ? ORDER BY c.id LIMIT ${CHUNK}`
    )
    const insert = db.prepare(INSERT)
    while (!state.cancelled && generation === myGeneration) {
      const rows = select.all(upto) as Parameters<typeof rowsToSources>[0]
      if (rows.length === 0) break
      const sources = rowsToSources(rows)
      db.transaction(() => {
        for (const s of sources) {
          insert.run(buildFeatureRow(s.source))
          scraped = Math.max(scraped, s.scraped)
        }
        upto = rows[rows.length - 1].id
        setSetting(db, K.upto, String(upto))
        if (scraped > 0) setSetting(db, K.scraped, String(scraped))
      })()
      state.done += rows.length
      hooks.onProgress?.(Math.min(state.done, total), total)
      await tick()
    }
    if (state.cancelled || generation !== myGeneration) return 'cancelled'
    setSetting(db, K.version, String(INDEX_VERSION))
    setSetting(db, K.complete, '1')
    // keep the scraped stamp as a readable date
    if (scraped > 0) setSetting(db, K.scraped, new Date(scraped * 1000).toISOString().slice(0, 10))
    return 'done'
  } finally {
    building = null
  }
}

/** Starts building in the background; returns at once. */
export function startDiscoverIndex(db: Db): DiscoverStatus {
  if (!building && !isComplete(db) && count(db, 'SELECT count(*) AS c FROM catalog_fragrances') > 0) void buildDiscoverIndex(db)
  return discoverStatus(db)
}

export function cancelDiscoverIndex(db: Db): DiscoverStatus {
  if (building) building.cancelled = true
  return discoverStatus(db)
}

// ---- the derived index: loading into memory -----------------------------------------------------------

type FeatureDbRow = Record<string, number | string | null>
const toRow = (r: FeatureDbRow): FeatureRow => ({
  catalogId: r.catalog_id as number,
  fid: (r.fid as number | null) ?? null,
  houseKey: r.house_key as string,
  nameKey: r.name_key as string,
  concKey: r.conc_key as string,
  accords: r.accords as string,
  notes: r.notes as string,
  vWinter: r.v_winter as number | null,
  vSpring: r.v_spring as number | null,
  vSummer: r.v_summer as number | null,
  vFall: r.v_fall as number | null,
  vDay: r.v_day as number | null,
  vNight: r.v_night as number | null,
  longevity: r.longevity as number | null,
  sillage: r.sillage as number | null,
  rating: r.rating as number | null,
  ratingN: r.rating_n as number | null,
  valueAvg: r.value_avg as number | null,
  valueN: r.value_n as number | null,
  people: r.people as number | null,
  haveN: r.have_n as number | null,
  wantN: r.want_n as number | null,
  popularity: (r.popularity as number) ?? 0,
  popRecent: r.pop_recent as number | null,
  genderLean: r.gender_lean as number | null,
  year: r.year as number | null
})

/** The in-memory index of the dataset, loading it (in slices, so the window keeps responding) the first time. Null when it is not built yet. */
export function loadDiscoverIndex(db: Db): Promise<FeatureIndex | null> {
  if (!isComplete(db)) return Promise.resolve(null)
  if (cache && cache.db === db && cache.generation === generation) return Promise.resolve(cache.index)
  if (loading) return loading
  const myGeneration = generation
  const p = (async () => {
    const rows: FeatureRow[] = []
    const page = db.prepare('SELECT * FROM discover_features WHERE catalog_id > ? ORDER BY catalog_id LIMIT 20000')
    let after = 0
    for (;;) {
      const chunk = page.all(after) as FeatureDbRow[]
      if (chunk.length === 0) break
      for (const r of chunk) rows.push(toRow(r))
      after = chunk[chunk.length - 1].catalog_id as number
      await tick()
    }
    const index = FeatureIndex.fromRows(rows)
    if (generation === myGeneration) cache = { db, generation, index }
    return generation === myGeneration ? index : null
  })().finally(() => {
    loading = null
  })
  loading = p
  return p
}

// ---- my library ---------------------------------------------------------------------------------------

/** Every fragrance of mine with its full accord strengths and notes, as the taste profile and the scorers see it. */
export function loadLibrary(db: Db): LibraryItem[] {
  const accords = new Map<number, { name: string; strength: number }[]>()
  for (const r of db.prepare('SELECT fa.fragrance_id AS id, a.name AS name, fa.strength AS strength FROM fragrance_accords fa JOIN accords a ON a.id = fa.accord_id').all() as { id: number; name: string; strength: number }[]) {
    const list = accords.get(r.id) ?? []
    list.push({ name: r.name, strength: r.strength })
    accords.set(r.id, list)
  }
  const notes = new Map<number, string[]>()
  for (const r of db.prepare('SELECT fn.fragrance_id AS id, n.name AS name FROM fragrance_notes fn JOIN notes n ON n.id = fn.note_id').all() as { id: number; name: string }[]) {
    const list = notes.get(r.id) ?? []
    list.push(r.name)
    notes.set(r.id, list)
  }
  return listFragrances(db).map((f) => ({
    id: f.id,
    name: f.name,
    house: f.house,
    concentration: f.concentration,
    accords: accords.get(f.id) ?? [],
    notes: notes.get(f.id) ?? [],
    rating: f.rating,
    wearCount: f.wearCount,
    wardrobes: f.wardrobes as WardrobeName[],
    isForeign: f.isForeign
  }))
}

// ---- taste profile and my edits -------------------------------------------------------------------------

const OVERRIDES = ['love', 'mute', 'avoid']

export function getOverrides(db: Db): TasteOverrides {
  try {
    const o = JSON.parse(getSetting(db, K.profile) ?? '{}') as Partial<TasteOverrides>
    const clean = (m: unknown): Record<string, Override> => {
      const out: Record<string, Override> = {}
      if (m && typeof m === 'object') for (const [k, v] of Object.entries(m)) if (OVERRIDES.includes(v as string)) out[norm(k)] = v as Override
      return out
    }
    return { accords: clean(o.accords), notes: clean(o.notes) }
  } catch {
    return { ...NO_OVERRIDES }
  }
}

export function setOverride(db: Db, kind: 'accord' | 'note', name: string, value: Override | null): Result<TasteResult> {
  return toResult(() => {
    const key = norm(name)
    if (!key) throw new Error('Name an accord or a note.')
    const o = getOverrides(db)
    const target = kind === 'accord' ? o.accords : o.notes
    if (value === null) delete target[key]
    else if (OVERRIDES.includes(value)) target[key] = value
    else throw new Error('Unknown choice.')
    setSetting(db, K.profile, JSON.stringify(o))
    return getTaste(db)
  })
}

export function getTaste(db: Db): TasteResult {
  const overrides = getOverrides(db)
  return { taste: buildTaste(loadLibrary(db), overrides), overrides }
}

// ---- not interested ---------------------------------------------------------------------------------------

const keyOf = (house: string, name: string, conc?: string | null) => `${norm(house)}|${norm(name)}|${norm(conc ?? '')}`

export const listIgnored = (db: Db): IgnoredItem[] => db.prepare('SELECT key, name, house FROM discover_ignored ORDER BY created_at DESC, name').all() as IgnoredItem[]

export function ignoreFragrance(db: Db, f: { name: string; house: string; concentration?: string | null }): Result<IgnoredItem[]> {
  return toResult(() => {
    db.prepare('INSERT OR REPLACE INTO discover_ignored (key, name, house) VALUES (?, ?, ?)').run(keyOf(f.house, f.name, f.concentration), f.name, f.house)
    return listIgnored(db)
  })
}

export function unignoreFragrance(db: Db, key: string): Result<IgnoredItem[]> {
  return toResult(() => {
    db.prepare('DELETE FROM discover_ignored WHERE key = ?').run(key)
    return listIgnored(db)
  })
}

const ignoredSet = (db: Db): Set<string> => new Set(listIgnored(db).map((i) => i.key))

// ---- cards ------------------------------------------------------------------------------------------------

interface CatalogCardRow {
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  source_url: string | null
  data: string
}

function libraryIdByKey(library: LibraryItem[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const it of library) {
    if (it.wardrobes.length === 0 && !it.isForeign) continue
    m.set(keyOf(it.house, it.name, it.concentration), it.id)
    if (!(it.concentration ?? '').trim()) m.set(`${norm(it.house)}|${norm(it.name)}|*`, it.id)
  }
  return m
}

function datasetCards(db: Db, list: Suggestion[], library: LibraryItem[], extra?: (s: Suggestion) => Partial<DiscoverCard>): DiscoverCard[] {
  if (list.length === 0) return []
  const ids = list.map((s) => s.catalogId)
  const rows = new Map((db.prepare(`SELECT id, name, house, year, concentration, source_url, data FROM catalog_fragrances WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as CatalogCardRow[]).map((r) => [r.id, r]))
  const mine = libraryIdByKey(library)
  const out: DiscoverCard[] = []
  for (const s of list) {
    const r = rows.get(s.catalogId)
    if (!r) continue
    let data: { imageUrl?: string | null; accords?: { name: string; strength: number }[] } = {}
    try {
      data = JSON.parse(r.data)
    } catch {
      /* show the card without a picture */
    }
    out.push({
      key: `d:${r.id}`,
      source: 'dataset',
      catalogId: r.id,
      fragranceId: mine.get(keyOf(r.house, r.name, r.concentration)) ?? mine.get(`${norm(r.house)}|${norm(r.name)}|*`) ?? null,
      name: r.name,
      house: r.house,
      year: r.year,
      concentration: r.concentration,
      sourceUrl: r.source_url,
      imageUrl: data.imageUrl ?? null,
      topAccords: [...(data.accords ?? [])].sort((a, b) => b.strength - a.strength).slice(0, 4),
      score: s.score,
      reasons: s.reasons,
      inWardrobes: s.inWardrobes,
      ...(extra?.(s) ?? {})
    })
  }
  return out
}

// ---- library-only candidates (no dataset) ---------------------------------------------------------------

/** Fragrances of mine I do not own yet (wishlist, to try, or worn but not mine), as a tiny index so the same scoring applies. */
function libraryIndex(library: LibraryItem[]): { index: FeatureIndex; items: Map<number, LibraryItem> } {
  const items = new Map<number, LibraryItem>()
  const rows: FeatureRow[] = []
  for (const it of library) {
    const own = it.wardrobes.includes('collection') || it.wardrobes.includes('garbage') || it.wardrobes.includes('had')
    if (own) continue
    items.set(it.id, it)
    rows.push({
      catalogId: -it.id,
      fid: null,
      houseKey: norm(it.house),
      nameKey: norm(it.name),
      concKey: norm(it.concentration ?? ''),
      accords: it.accords.map((a) => `${norm(a.name).replace(/[,:|~]/g, ' ')}:${Math.round(a.strength)}`).join(','),
      notes: it.notes.map((n) => `${norm(n).replace(/[,:|~]/g, ' ')}~0~0`).join('|'),
      vWinter: null, vSpring: null, vSummer: null, vFall: null, vDay: null, vNight: null,
      longevity: null, sillage: null, rating: null, ratingN: null, valueAvg: null, valueN: null, people: null, haveN: null, wantN: null,
      popularity: 0, popRecent: null, genderLean: null, year: null
    })
  }
  return { index: FeatureIndex.fromRows(rows), items }
}

function libraryCards(list: Suggestion[], items: Map<number, LibraryItem>): DiscoverCard[] {
  return list.flatMap((s): DiscoverCard[] => {
    const it = items.get(-s.catalogId)
    if (!it) return []
    return [{
      key: `l:${it.id}`, source: 'library', catalogId: null, fragranceId: it.id, name: it.name, house: it.house, year: null, concentration: it.concentration ?? null, sourceUrl: null, imageUrl: null,
      topAccords: [...it.accords].sort((a, b) => b.strength - a.strength).slice(0, 4), score: s.score, reasons: s.reasons, inWardrobes: it.wardrobes
    }]
  })
}

// ---- the three modes ------------------------------------------------------------------------------------

const hideOf = (f: DiscoverFilters): Hide => ({ ...DEFAULT_HIDE, ...(f.hide ?? {}) })

type Source = { kind: 'dataset'; index: FeatureIndex } | { kind: 'library'; index: FeatureIndex; items: Map<number, LibraryItem> } | { kind: 'none'; message: string }

async function pickSource(db: Db, library: LibraryItem[]): Promise<Source> {
  const st = discoverStatus(db)
  if (st.datasetCount > 0) {
    if (!st.complete) return { kind: 'none', message: st.building ? 'Discovery is preparing the dataset. It will appear here when it is ready.' : 'Discovery needs to prepare the dataset first.' }
    const index = await loadDiscoverIndex(db)
    if (index) return { kind: 'dataset', index }
    return { kind: 'none', message: 'Discovery is still loading the dataset. Try again in a moment.' }
  }
  const { index, items } = libraryIndex(library)
  return { kind: 'library', index, items }
}

const emptyResults = (mode: DiscoverResults['mode'], message: string): DiscoverResults => ({ mode, cards: [], total: 0, hidden: {}, ms: 0, message })

export async function discoverForYou(db: Db, filters: DiscoverFilters = {}): Promise<DiscoverResults> {
  const library = loadLibrary(db)
  const { taste } = getTaste(db)
  if (taste.basedOn.positive === 0) return emptyResults('none', 'Discovery learns from your library. Add some fragrances to My Collection (and rate them) and suggestions appear here.')
  const src = await pickSource(db, library)
  if (src.kind === 'none') return emptyResults('none', src.message)
  const opts = { limit: filters.limit, offset: filters.offset, season: filters.season ?? null, minVotes: filters.minVotes, genderLean: filters.genderLean ?? null, hide: hideOf(filters), ignored: ignoredSet(db) }
  if (src.kind === 'library') {
    const r = rankForYou(src.index, taste, library, { ...opts, libraryOnly: true, hide: { ...opts.hide, wishlist: false, toTry: false } })
    return { mode: 'library', cards: libraryCards(r.results, src.items), total: r.total, hidden: r.hidden, ms: r.ms, message: r.total === 0 ? 'Nothing on your Wishlist or To Try matches your taste yet. Import the dataset to see suggestions from the whole catalog.' : null }
  }
  const r = rankForYou(src.index, taste, library, opts)
  return { mode: 'dataset', cards: datasetCards(db, r.results, library), total: r.total, hidden: r.hidden, ms: r.ms, message: r.total === 0 ? 'Nothing matches with these filters.' : null }
}

function resolveSeeds(db: Db, src: Source, refs: SeedRef[], library: LibraryItem[]): { seeds: Seed[]; names: { name: string; house: string }[] } {
  const seeds: Seed[] = []
  const names: { name: string; house: string }[] = []
  for (const ref of refs.slice(0, 6)) {
    if ('catalogId' in ref && src.kind === 'dataset') {
      const row = src.index.indexOfCatalog(ref.catalogId)
      const c = db.prepare('SELECT name, house FROM catalog_fragrances WHERE id = ?').get(ref.catalogId) as { name: string; house: string } | undefined
      if (row < 0 || !c) continue
      const sil = src.index.sillage[row]
      const lon = src.index.longevity[row]
      seeds.push({ name: c.name, accords: src.index.accords(row), notes: src.index.notes(row).map((n) => ({ name: n.name, layer: n.layer })), sillage: Number.isNaN(sil) ? null : sil, longevity: Number.isNaN(lon) ? null : lon, row })
      names.push(c)
    } else if ('fragranceId' in ref) {
      const it = library.find((x) => x.id === ref.fragranceId)
      if (!it) continue
      // The same fragrance in the dataset gives community numbers and keeps itself out of the results.
      let row: number | undefined
      let sillage: number | null = null
      let longevity: number | null = null
      if (src.kind === 'dataset') {
        const i = findRow(src.index, it)
        if (i >= 0) {
          row = i
          const sil = src.index.sillage[i]
          const lon = src.index.longevity[i]
          sillage = Number.isNaN(sil) ? null : sil
          longevity = Number.isNaN(lon) ? null : lon
        }
      }
      seeds.push({ name: it.name, accords: it.accords, notes: it.notes.map((n) => ({ name: n })), sillage, longevity, row })
      names.push({ name: it.name, house: it.house })
    }
  }
  return { seeds, names }
}

function findRow(index: FeatureIndex, it: LibraryItem): number {
  const h = norm(it.house)
  const n = norm(it.name)
  const c = norm(it.concentration ?? '')
  let loose = -1
  for (let i = 0; i < index.n; i++) {
    if (index.houseKey[i] === h && index.nameKey[i] === n) {
      if (index.concKey[i] === c) return i
      if (loose < 0) loose = i
    }
  }
  return c ? -1 : loose
}

export async function discoverSimilar(db: Db, req: SimilarRequest): Promise<SimilarResults> {
  const base = { seeds: [], before: [], after: [], changes: [] }
  const library = loadLibrary(db)
  const src = await pickSource(db, library)
  if (src.kind === 'none') return { ...emptyResults('none', src.message), ...base }
  const { seeds, names } = resolveSeeds(db, src, req.seeds, library)
  if (seeds.length === 0) return { ...emptyResults(src.kind, 'Pick at least one fragrance to start from.'), ...base }
  const f = req.filters
  const opts = { limit: f.limit, offset: f.offset, season: f.season ?? null, minVotes: f.minVotes, genderLean: f.genderLean ?? null, hide: hideOf(f), ignored: ignoredSet(db) }
  const lib = src.kind === 'library'
  const r = rankSimilar(src.index, seeds, req.sliders, library, lib ? { ...opts, libraryOnly: true } : opts)
  const cards = lib ? libraryCards(r.results, src.items) : datasetCards(db, r.results, library)
  const top = (e: { name: string; weight: number }[]) => e.slice(0, 8).map((x) => ({ name: x.name, weight: Math.round(x.weight * 100) / 100 }))
  return { mode: src.kind, cards, total: r.total, hidden: r.hidden, ms: r.ms, message: r.total === 0 ? 'Nothing close enough with these filters.' : null, seeds: names, before: top(r.profile.before), after: top(r.profile.accords), changes: r.profile.changes }
}

export async function discoverBrief(db: Db, req: BriefRequest): Promise<BriefResults> {
  const none = { excluded: 0, excludedExamples: [], active: 0 }
  const library = loadLibrary(db)
  const src = await pickSource(db, library)
  if (src.kind === 'none') return { ...emptyResults('none', src.message), ...none }
  const brief = normalizeBrief(req.brief)
  const f = req.filters
  const r = rankBrief(src.index, brief, { limit: f.limit, offset: f.offset, hide: hideOf(f), ignored: ignoredSet(db), datasetDate: getSetting(db, K.scraped) || null, library })
  const cards = src.kind === 'library' ? libraryCards(r.results, src.items) : datasetCards(db, r.results, library)
  // keep the per-criterion detail on the cards
  const byRow = new Map(r.results.map((s) => [s.catalogId, s.criteria]))
  for (const c of cards) c.criteria = byRow.get(c.catalogId ?? -(c.fragranceId ?? 0))
  return { mode: src.kind, cards, total: r.total, hidden: r.hidden, ms: r.ms, excluded: r.excluded, excludedExamples: r.excludedExamples, active: r.active, message: r.total === 0 ? 'Nothing meets this brief. Loosen a filter.' : null }
}

// ---- saved briefs -------------------------------------------------------------------------------------------

const toSaved = (r: { id: number; name: string; brief: string; updated_at: string }): SavedBrief => ({ id: r.id, name: r.name, brief: normalizeBrief(safeJson(r.brief)), updatedAt: r.updated_at })
const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

export const listBriefs = (db: Db): SavedBrief[] => (db.prepare('SELECT id, name, brief, updated_at FROM discover_briefs ORDER BY lower(name)').all() as Parameters<typeof toSaved>[0][]).map(toSaved)

export function saveBrief(db: Db, name: string, brief: Brief): Result<SavedBrief[]> {
  return toResult(() => {
    const n = name.trim().slice(0, 60)
    if (!n) throw new Error('Give the brief a name.')
    db.prepare(`INSERT INTO discover_briefs (name, brief) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET brief = excluded.brief, updated_at = datetime('now')`).run(n, JSON.stringify(normalizeBrief(brief)))
    return listBriefs(db)
  })
}

export function deleteBrief(db: Db, id: number): Result<SavedBrief[]> {
  return toResult(() => {
    db.prepare('DELETE FROM discover_briefs WHERE id = ?').run(id)
    return listBriefs(db)
  })
}

export { fail }
