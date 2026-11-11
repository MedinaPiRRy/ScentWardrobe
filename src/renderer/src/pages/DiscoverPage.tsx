import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EMPTY_BRIEF, type Brief } from '@shared/discover/brief'
import type { BriefResults, DiscoverCard, DiscoverFilters, DiscoverResults, DiscoverStatus, IgnoredItem, SavedBrief, SimilarResults, TasteResult } from '@shared/discover/dto'
import { DEFAULT_HIDE, type Hide } from '@shared/discover/rank'
import { NO_SLIDERS, type Sliders } from '@shared/discover/similar'
import type { Override } from '@shared/discover/taste'
import type { Season } from '@shared/discover/vocab'
import type { FragranceInput, Placement } from '@shared/types'
import type { TempUnit } from '@shared/weather'
import BriefPanel from '../components/discover/BriefPanel'
import SimilarPanel, { type SeedChoice } from '../components/discover/SimilarPanel'
import CardGrid from '../components/discover/CardGrid'
import DetailDialog from '../components/discover/DetailDialog'
import GapsPanel from '../components/discover/GapsPanel'
import GiftsPanel from '../components/discover/GiftsPanel'
import { BudgetPanel, DupesPanel, LayeringPanel } from '../components/discover/PartnerPanels'
import TastePanel from '../components/discover/TastePanel'
import FragranceForm from '../components/FragranceForm'
import ImportWizard from '../components/ImportWizard'
import { ghostBtn, primaryBtn } from '../components/Dialogs'

type Mode = 'for_you' | 'similar' | 'brief' | 'gaps' | 'layering' | 'dupes' | 'budget' | 'gifts'
const MODES: { key: Mode; label: string; hint: string }[] = [
  { key: 'for_you', label: 'For you', hint: 'Suggestions from your own taste' },
  { key: 'similar', label: 'More like these', hint: 'Start from fragrances you pick' },
  { key: 'brief', label: 'Brief', hint: 'Describe what you need' },
  { key: 'gaps', label: 'Gaps', hint: 'Where your collection is thin' },
  { key: 'layering', label: 'Layering', hint: 'Partners to layer with' },
  { key: 'dupes', label: 'Dupes', hint: 'Alternatives and replacements' },
  { key: 'budget', label: 'Budget', hint: 'Budget and trying first' },
  { key: 'gifts', label: 'Gifts', hint: 'Ideas for a person, not a scent' }
]
const SEARCH_MODES: Mode[] = ['for_you', 'similar', 'brief']

interface Filters {
  season: Season | null
  minVotes: number
  genderLean: number | null
  hide: Hide
}
const DEFAULT_FILTERS: Filters = { season: null, minVotes: 0, genderLean: null, hide: DEFAULT_HIDE }
const FILTER_KEY = 'discover.filters'
const PAGE = 20

function loadFilters(): Filters {
  try {
    const raw = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null') as Partial<Filters> | null
    return raw ? { ...DEFAULT_FILTERS, ...raw, hide: { ...DEFAULT_HIDE, ...(raw.hide ?? {}) } } : DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

const card = 'rounded-xl border border-ink-600 bg-ink-800 p-4'
const sel = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'

type AnyResults = DiscoverResults | SimilarResults | BriefResults

export default function DiscoverPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<DiscoverStatus | null>(null)
  const [taste, setTaste] = useState<TasteResult | null>(null)
  const [mode, setMode] = useState<Mode>('for_you')
  const [filters, setFilters] = useState<Filters>(loadFilters)
  const [limit, setLimit] = useState(PAGE)
  const [seeds, setSeeds] = useState<SeedChoice[]>([])
  const [layerSeed, setLayerSeed] = useState<SeedChoice | null>(null)
  const [dupeSeed, setDupeSeed] = useState<SeedChoice | null>(null)
  const [sliders, setSliders] = useState<Sliders>(NO_SLIDERS)
  const [brief, setBrief] = useState<Brief>(EMPTY_BRIEF)
  const [savedBriefs, setSavedBriefs] = useState<SavedBrief[]>([])
  const [ignored, setIgnored] = useState<IgnoredItem[]>([])
  const [results, setResults] = useState<AnyResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<DiscoverCard | null>(null)
  const [adding, setAdding] = useState<{ input: FragranceInput; to: 'wishlist' | 'to_try' } | null>(null)
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState<{ text: string; id?: number } | null>(null)
  const [unit, setUnit] = useState<TempUnit>('C')
  const [rev, setRev] = useState(0)
  const token = useRef(0)

  const say = (text: string, id?: number) => {
    setToast({ text, id })
    window.setTimeout(() => setToast(null), 6000)
  }

  // ---- status, taste and the small lists -------------------------------------------------------
  const refreshStatus = useCallback(async () => setStatus(await window.api.discover.status()), [])
  useEffect(() => {
    void refreshStatus()
    void window.api.discover.taste().then(setTaste)
    void window.api.discover.ignored().then(setIgnored)
    void window.api.discover.briefs().then(setSavedBriefs)
    void window.api.settings.get('units.temp').then((v) => setUnit(v === 'F' ? 'F' : 'C'))
  }, [refreshStatus])

  // A dataset that has not been indexed yet is prepared in the background; the bar follows its progress.
  useEffect(() => {
    if (!status || status.datasetCount === 0 || status.complete) return
    if (!status.building) void window.api.discover.startIndex().then(setStatus)
    const t = window.setInterval(() => void refreshStatus(), 500)
    return () => window.clearInterval(t)
  }, [status, refreshStatus])

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters))
    } catch {
      /* optional */
    }
  }, [filters])

  // ---- fetching results ------------------------------------------------------------------------
  const ready = status != null && (status.datasetCount === 0 || status.complete)
  useEffect(() => {
    if (!ready || !SEARCH_MODES.includes(mode)) return
    const mine = ++token.current
    const f: DiscoverFilters = { limit, season: filters.season, minVotes: filters.minVotes || undefined, genderLean: filters.genderLean, hide: filters.hide }
    setLoading(true)
    const t = window.setTimeout(() => {
      const run =
        mode === 'for_you'
          ? window.api.discover.forYou(f)
          : mode === 'similar'
            ? window.api.discover.similar({ seeds: seeds.map((s) => s.ref), sliders, filters: f })
            : window.api.discover.brief({ brief, filters: f })
      run
        .then((r) => {
          if (token.current !== mine) return
          setResults(r)
          setError(null)
        })
        .catch((e: Error) => token.current === mine && setError(e.message))
        .finally(() => token.current === mine && setLoading(false))
    }, 220)
    return () => window.clearTimeout(t)
  }, [ready, mode, filters, limit, seeds, sliders, brief, rev])

  useEffect(() => setLimit(PAGE), [mode, filters, seeds, sliders, brief])
  useEffect(() => setResults(null), [mode])

  // ---- actions ---------------------------------------------------------------------------------
  const setOverride = async (kind: 'accord' | 'note', name: string, v: Override | null) => {
    const r = await window.api.discover.setOverride(kind, name, v)
    if (!r.ok) return say(r.message)
    setTaste(r.data)
    setRev((n) => n + 1)
  }
  const ignore = async (c: DiscoverCard) => {
    const r = await window.api.discover.ignore({ name: c.name, house: c.house, concentration: c.concentration })
    if (r.ok) {
      setIgnored(r.data)
      setRev((n) => n + 1)
      say(`${c.name} will not be suggested again. Bring it back from the list at the bottom.`)
    }
  }
  const unignore = async (key: string) => {
    const r = await window.api.discover.unignore(key)
    if (r.ok) {
      setIgnored(r.data)
      setRev((n) => n + 1)
    }
  }
  const startAdd = async (c: DiscoverCard, to: 'wishlist' | 'to_try') => {
    if (c.catalogId == null) return
    const e = await window.api.search.datasetEntry(c.catalogId)
    if (!e) return say('That dataset entry could not be read.')
    setAdding({ input: e, to })
  }
  const save = async (input: FragranceInput, placement: Placement): Promise<string | null> => {
    const r = await window.api.fragrances.create(input, placement)
    if (!r.ok) return r.message
    setAdding(null)
    setRev((n) => n + 1)
    say(`${r.data.name} added.`, r.data.id)
    return null
  }
  const moreLike = (c: DiscoverCard) => {
    const ref = c.fragranceId != null ? { fragranceId: c.fragranceId } : c.catalogId != null ? { catalogId: c.catalogId } : null
    if (!ref) return
    setSeeds([{ ref, name: c.name, house: c.house }])
    setMode('similar')
    window.scrollTo?.({ top: 0 })
  }

  const actions = {
    onAdd: (c: DiscoverCard, to: 'wishlist' | 'to_try') => void startAdd(c, to),
    onIgnore: (c: DiscoverCard) => void ignore(c),
    onMoreLike: moreLike,
    onDetails: (c: DiscoverCard) => setDetail(c),
    onOpenMine: (id: number) => navigate(`/?open=${id}`),
    onOpenLab: (ids: number[]) => navigate(`/layering?mix=${ids.join(',')}`)
  }

  const hideBox = (key: keyof Hide, label: string) => (
    <label className="flex items-center gap-2 text-sm text-cream">
      <input type="checkbox" className="accent-[#c4964a]" checked={filters.hide[key]} onChange={(e) => setFilters({ ...filters, hide: { ...filters.hide, [key]: e.target.checked } })} />
      {label}
    </label>
  )

  const noDataset = status != null && status.datasetCount === 0
  const building = status != null && status.datasetCount > 0 && !status.complete
  const thin = status != null && status.datasetCount > 0 && status.complete && status.withExtras < status.datasetCount * 0.5
  const cards = results?.cards ?? []
  const total = results?.total ?? 0

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <header>
        <h1 className="font-display text-3xl text-brass-400">Discovery</h1>
        <p className="mt-1 text-sm text-cream/80">Ideas for what to try next, worked out on this computer from your own library{status && status.datasetCount > 0 ? ' and the imported dataset' : ''}. Every suggestion says why. Nothing about your library leaves the app.</p>
      </header>

      {noDataset && (
        <section className={`${card} border-brass-500/40`} aria-label="No dataset imported">
          <h2 className="font-display text-lg text-cream">Working from your library only</h2>
          <p className="mt-1 text-sm text-cream/85">Without a dataset, Discovery ranks what is already on your Wishlist and To Try list against your taste. An imported dataset adds the whole catalog, plus community votes it uses to explain suggestions: seasons, day or night, longevity, projection, ratings, and how well known a fragrance is. It is optional and stays on this computer.</p>
          <div className="mt-3">
            <button className={primaryBtn} onClick={() => setImporting(true)}>
              Import a dataset…
            </button>
          </div>
        </section>
      )}
      {building && status && (
        <section className={`${card}`} aria-label="Preparing the dataset" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-cream/90">
              Preparing the dataset for Discovery: {status.indexed.toLocaleString()} of {status.datasetCount.toLocaleString()}. This happens once after an import and you can keep using the app.
            </div>
            <button className={ghostBtn} onClick={() => void window.api.discover.cancelIndex().then(setStatus)}>
              Pause
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded bg-ink-900" role="progressbar" aria-valuemin={0} aria-valuemax={status.datasetCount} aria-valuenow={status.indexed} aria-label="Preparing the dataset">
            <div className="h-full bg-brass-500 transition-[width]" style={{ width: `${Math.round((status.indexed / Math.max(status.datasetCount, 1)) * 100)}%` }} />
          </div>
          {!status.building && (
            <button className="mt-2 text-sm text-brass-400 underline" onClick={() => void window.api.discover.startIndex().then(setStatus)}>
              Continue
            </button>
          )}
        </section>
      )}
      {thin && (
        <section className={`${card}`} aria-label="Dataset without extra facts">
          <p className="text-sm text-cream/85">
            Your dataset was imported without ratings, note weights and "smells like" votes. Suggestions still work, but they are better with them: import the original dump file again and the app fills them in without duplicating anything.
          </p>
          <button className={`${ghostBtn} mt-2`} onClick={() => setImporting(true)}>
            Import the dump again…
          </button>
        </section>
      )}

      <TastePanel data={taste} onSet={setOverride} />

      <div
        role="tablist"
        aria-label="Discovery modes"
        className="flex flex-wrap gap-2"
        onKeyDown={(e) => {
          // Arrow keys, Home and End move between the modes, as in any tab list.
          const i = MODES.findIndex((m) => m.key === mode)
          const to = e.key === 'ArrowRight' ? (i + 1) % MODES.length : e.key === 'ArrowLeft' ? (i + MODES.length - 1) % MODES.length : e.key === 'Home' ? 0 : e.key === 'End' ? MODES.length - 1 : -1
          if (to < 0) return
          e.preventDefault()
          setMode(MODES[to].key)
          window.setTimeout(() => document.querySelector<HTMLElement>(`[role=tab][data-mode="${MODES[to].key}"]`)?.focus(), 0)
        }}
      >
        {MODES.map((m) => (
          <button
            key={m.key}
            role="tab"
            data-mode={m.key}
            tabIndex={mode === m.key ? 0 : -1}
            aria-selected={mode === m.key}
            title={m.hint}
            onClick={() => setMode(m.key)}
            className={`rounded-md px-4 py-2 text-sm ${mode === m.key ? 'bg-ink-600 text-brass-400' : 'border border-ink-600 text-cream/80 hover:bg-ink-700'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'similar' && <SimilarPanel seeds={seeds} onSeeds={setSeeds} sliders={sliders} onSliders={setSliders} last={results && 'seeds' in results ? (results as SimilarResults) : null} />}
      {mode === 'brief' && <BriefPanel brief={brief} onBrief={setBrief} saved={savedBriefs} onSaved={setSavedBriefs} unit={unit} />}

      {mode === 'gaps' && <GapsPanel actions={actions} rev={rev} />}
      {mode === 'layering' && <LayeringPanel actions={actions} seed={layerSeed} onSeed={setLayerSeed} rev={rev} />}
      {mode === 'dupes' && <DupesPanel actions={actions} seed={dupeSeed} onSeed={setDupeSeed} rev={rev} />}
      {mode === 'budget' && <BudgetPanel actions={actions} rev={rev} />}
      {mode === 'gifts' && <GiftsPanel actions={actions} datasetCount={status?.datasetCount ?? 0} rev={rev} />}

      {SEARCH_MODES.includes(mode) && (
      <section className={`${card} flex flex-wrap items-end gap-4`} aria-label="Filters">
        {noDataset ? null : (
          <>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-cream/70" htmlFor="f-season">
                Season
              </label>
              <select id="f-season" className={sel} value={filters.season ?? ''} onChange={(e) => setFilters({ ...filters, season: (e.target.value || null) as Season | null })}>
                <option value="">Any</option>
                <option value="spring">Spring</option>
                <option value="summer">Summer</option>
                <option value="fall">Fall</option>
                <option value="winter">Winter</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-cream/70" htmlFor="f-votes">
                At least this many voters
              </label>
              <select id="f-votes" className={sel} value={filters.minVotes} onChange={(e) => setFilters({ ...filters, minVotes: Number(e.target.value) })}>
                <option value={0}>Any</option>
                <option value={100}>100</option>
                <option value={1000}>1,000</option>
                <option value={5000}>5,000</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wider text-cream/70" htmlFor="f-gender">
                Gender lean (soft)
              </label>
              <select id="f-gender" className={sel} value={filters.genderLean == null ? '' : filters.genderLean > 0.3 ? 'm' : filters.genderLean < -0.3 ? 'f' : 'u'} onChange={(e) => setFilters({ ...filters, genderLean: e.target.value === '' ? null : e.target.value === 'm' ? 1 : e.target.value === 'f' ? -1 : 0 })}>
                <option value="">Ignore</option>
                <option value="m">Leans masculine</option>
                <option value="f">Leans feminine</option>
                <option value="u">Unisex</option>
              </select>
            </div>
          </>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-brass-400">Hide or show what I already have</summary>
          <div className="mt-2 grid gap-1.5">
            {hideBox('owned', 'Hide what I own')}
            {hideBox('wishlist', 'Hide my Wishlist')}
            {hideBox('toTry', 'Hide my To Try list')}
            {hideBox('had', 'Hide what I used to have')}
            {hideBox('garbage', 'Hide Garbage Perfumes')}
            {hideBox('ignored', 'Hide "not interested"')}
          </div>
        </details>
        <button className={ghostBtn} onClick={() => setFilters(DEFAULT_FILTERS)}>
          Reset filters
        </button>
      </section>
      )}

      {SEARCH_MODES.includes(mode) && (
      <section aria-label="Results" aria-busy={loading}>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm text-cream/80" role="status">
          <span>
            {!ready ? 'Waiting for the dataset to be prepared…' : loading && !results ? 'Looking…' : results?.mode === 'none' ? '' : `${total.toLocaleString()} suggestion${total === 1 ? '' : 's'}${results && results.ms ? ` (${results.ms} ms)` : ''}`}
            {results && 'excluded' in results && results.excluded > 0 && <span> · {results.excluded.toLocaleString()} removed by your dealbreakers{results.excludedExamples.length ? ` (${results.excludedExamples.join(', ')})` : ''}</span>}
          </span>
          {results && Object.values(results.hidden).some((n) => n > 0) && (
            <span className="text-cream/70">
              Hidden: {Object.entries(results.hidden).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k === 'toTry' ? 'on To Try' : k === 'owned' ? 'owned' : k === 'filtered' ? 'filtered out' : k === 'ignored' ? 'not interested' : k}`).join(', ')}
            </span>
          )}
        </div>
        {error && <p className="rounded border border-red-400/50 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        {results?.message && cards.length === 0 && <p className={`${card} text-sm text-cream/85`}>{results.message}</p>}
        <CardGrid cards={cards} actions={actions} exportTitle={MODES.find((m) => m.key === mode)?.label ?? 'Discovery'} />
        {cards.length > 0 && cards.length < total && (
          <div className="mt-4 text-center">
            <button className={ghostBtn} onClick={() => setLimit((n) => n + PAGE)}>
              Show more
            </button>
          </div>
        )}
      </section>
      )}

      {ignored.length > 0 && (
        <details className={card}>
          <summary className="cursor-pointer text-sm text-brass-400">Not interested ({ignored.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {ignored.map((i) => (
              <li key={i.key} className="flex items-center justify-between gap-3">
                <span className="text-cream">
                  {i.name} <span className="text-cream/70">{i.house}</span>
                </span>
                <button className="text-brass-400 underline" onClick={() => void unignore(i.key)}>
                  Bring it back
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {detail && <DetailDialog card={detail} actions={actions} onClose={() => setDetail(null)} />}
      {adding && <FragranceForm mode="add" prefill={adding.input} defaultWardrobe={adding.to} onClose={() => setAdding(null)} onSubmit={save} />}
      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false)
            say(m)
            void refreshStatus()
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex max-w-xl -translate-x-1/2 items-center gap-3 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast.text}
          {toast.id != null && (
            <button className="text-brass-400 underline" onClick={() => navigate(`/?open=${toast.id}`)}>
              Open it
            </button>
          )}
        </div>
      )}
    </div>
  )
}
