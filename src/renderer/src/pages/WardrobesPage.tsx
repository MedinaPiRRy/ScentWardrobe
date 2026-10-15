import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { DbInfo, WearEntry, FragranceDetail, FragranceInput, FragranceSummary, HadReason, MoveRequest, PastBottle, Placement, Season, WardrobeKind } from '@shared/types'
import ContextMenu, { type MenuItem } from '../components/ContextMenu'
import { BottleDialog, ghostBtn, ImpressionDialog, primaryBtn } from '../components/Dialogs'
import DetailPanel from '../components/detail/DetailPanel'
import AddFragranceDialog from '../components/AddFragranceDialog'
import FragranceForm from '../components/FragranceForm'
import Drawer, { TRAY_THEME } from '../components/Drawer'
import GarbageBin from '../components/GarbageBin'
import { GarbageDialog, HadDialog, OfferHadDialog } from '../components/WardrobeDialogs'
import ImportWizard from '../components/ImportWizard'
import WearForm from '../components/WearForm'
import Shelf from '../components/Shelf'
import { THEMES } from '../components/themes'
import {
  filterFragrances,
  isRackItem,
  SEASONS,
  SORT_LABELS,
  sortFragrances,
  HAD_REASON_LABEL,
  WARDROBE_LABEL,
  WARDROBES,
  type SortKey
} from '../lib/shelf'

const KINDS = WARDROBES

type Pending =
  | { kind: 'impression'; f: FragranceSummary; initial: string; size: number | null }
  | { kind: 'bottle'; f: FragranceSummary }
  | { kind: 'garbage'; f: FragranceSummary }
  | { kind: 'had'; f: FragranceSummary }
  | { kind: 'offerHad'; f: FragranceSummary; reason: HadReason }

export default function WardrobesPage() {
  const [info, setInfo] = useState<DbInfo | null>(null)
  const [all, setAll] = useState<FragranceSummary[]>([])
  const [pastBottles, setPastBottles] = useState<PastBottle[]>([])
  const [tab, setTab] = useState<WardrobeKind>('collection')
  const [query, setQuery] = useState('')
  const [season, setSeason] = useState<Season | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('shelf')
  const [menu, setMenu] = useState<{ f: FragranceSummary; x: number; y: number } | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const [rev, setRev] = useState(0)
  const [form, setForm] = useState<{ mode: 'add'; prefill: FragranceInput | null } | { mode: 'edit'; d: FragranceDetail } | null>(null)
  const [adding, setAdding] = useState(false)
  const [wearFor, setWearFor] = useState<{ fragranceId: number; entry?: WearEntry } | null>(null)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try {
      return localStorage.getItem('drawer.open') === '1'
    } catch {
      return false
    }
  })
  const searchRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const [i, list, past] = await Promise.all([window.api.app.dbInfo(), window.api.fragrances.list(), window.api.wardrobe.pastBottles()])
    setInfo(i)
    setAll(list)
    setPastBottles(past)
    setRev((r) => r + 1)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((cur) => (cur === m ? null : cur)), 3500)
  }, [])

  // Deep link from other pages: /?open=<id>
  useEffect(() => {
    const id = parseInt(params.get('open') ?? '', 10)
    if (!id || all.length === 0) return
    const f = all.find((x) => x.id === id)
    if (f?.wardrobe) setTab(f.wardrobe)
    setOpenId(id)
    setParams({}, { replace: true })
  }, [params, all, setParams])

  const addFragrance = useCallback(() => setAdding(true), [])

  // Ctrl+F focuses the search box here; Ctrl+N is handled globally (App) and arrives as /?add=1.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  useEffect(() => {
    if (params.get('add')) {
      setAdding(true)
      setParams({}, { replace: true })
    } else if (params.get('search')) {
      searchRef.current?.focus()
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const inTab = useMemo(() => sortFragrances(all.filter((f) => f.wardrobe === tab), 'shelf'), [all, tab])
  const filtering = query.trim() !== '' || season !== 'all'
  const visible = useMemo(() => sortFragrances(filterFragrances(inTab, query, season), sort), [inTab, query, season, sort])
  const canDrag = !filtering && sort === 'shelf'

  const counts = useMemo(() => {
    const c: Record<WardrobeKind, number> = { collection: 0, wishlist: 0, to_try: 0, had: 0, garbage: 0 }
    for (const f of all) if (f.wardrobe) c[f.wardrobe]++
    return c
  }, [all])

  // The Had cabinet also shows the old bottles of fragrances I bought again (they live in another wardrobe now).
  const pastCards = useMemo(() => {
    const byFragrance = new Map<number, PastBottle[]>()
    for (const p of pastBottles) byFragrance.set(p.fragranceId, [...(byFragrance.get(p.fragranceId) ?? []), p])
    return [...byFragrance.entries()]
      .map(([id, list]) => ({ f: all.find((x) => x.id === id), list }))
      .filter((x): x is { f: FragranceSummary; list: PastBottle[] } => !!x.f && x.f.wardrobe !== null && x.f.wardrobe !== 'had')
  }, [pastBottles, all])

  const hadVisible = useMemo(() => {
    if (tab !== 'had') return visible
    const extra = filterFragrances(pastCards.map((c) => c.f), query, season)
    return [...visible, ...extra]
  }, [tab, visible, pastCards, query, season])

  const captions = useMemo(() => {
    const m = new Map<number, string>()
    if (tab !== 'had') return m
    for (const f of inTab) m.set(f.id, [f.hadYears, f.hadReason ? HAD_REASON_LABEL[f.hadReason].toLowerCase() : null].filter(Boolean).join(' · ') || 'a memory')
    for (const c of pastCards) {
      const years = c.list.map((p) => p.years).filter(Boolean).join(', ')
      m.set(c.f.id, `${years || 'before'} · now in ${WARDROBE_LABEL[c.f.wardrobe!]}`)
    }
    return m
  }, [tab, inTab, pastCards])

  // Matches in the other wardrobes, so a search never hides that something is already owned, wanted or disliked.
  const elsewhere = useMemo(
    () => (query.trim() ? filterFragrances(all.filter((f) => f.wardrobe && f.wardrobe !== tab), query, 'all').slice(0, 8) : []),
    [all, query, tab]
  )

  const main = tab === 'collection' ? visible.filter((f) => !isRackItem(f)) : tab === 'had' ? hadVisible : visible
  // The drawer shows every vial (sample or decant) I hold, whichever wardrobe the fragrance is in: ones I own, ones I
  // only want a bottle of, and ones I have a vial of next to a full bottle. Each card is drawn as its vial.
  const rack = useMemo(() => {
    if (tab !== 'collection') return []
    const isVial = (b: { type: string }) => b.type === 'decant' || b.type === 'sample'
    const holders = all.filter((f) => (f.wardrobe === 'collection' || f.wardrobe === 'wishlist' || f.wardrobe === 'to_try') && f.bottles.some(isVial))
    const rank = (f: FragranceSummary) => (f.wardrobe === 'collection' ? 0 : 1)
    return sortFragrances(filterFragrances(holders, query, season), 'name')
      .sort((a, b) => rank(a) - rank(b))
      .map((f) => ({ ...f, bottles: f.bottles.filter(isVial) }))
  }, [tab, all, query, season])
  const vialCaptions = useMemo(() => {
    const m = new Map<number, string>()
    for (const f of rack) if (f.wardrobe !== 'collection' && f.wardrobe) m.set(f.id, `on my ${WARDROBE_LABEL[f.wardrobe]}`)
    return m
  }, [rack])

  const theme = THEMES[tab]
  const tone = tab === 'to_try' ? 'light' : 'dark'
  const hadIds = useMemo(() => new Set(inTab.map((f) => f.id)), [inTab])

  // ---- reordering -------------------------------------------------------------------
  const reorder = async (section: 'main' | 'rack', ids: number[]) => {
    const fullMain = inTab.filter((f) => (tab === 'collection' ? !isRackItem(f) : true)).map((f) => f.id)
    const fullRack = inTab.filter((f) => tab === 'collection' && isRackItem(f)).map((f) => f.id)
    const ownIds = tab === 'had' ? ids.filter((id) => hadIds.has(id)) : ids
    const order = section === 'main' ? [...ownIds, ...fullRack] : [...fullMain, ...ownIds]
    setAll((prev) => prev.map((f) => (f.wardrobe === tab ? { ...f, shelfPosition: order.indexOf(f.id) } : f)))
    const r = await window.api.wardrobe.reorder(tab, order)
    if (!r.ok) say(r.message)
    void refresh()
  }

  // ---- moving between wardrobes -----------------------------------------------------
  const submitMove = async (req: MoveRequest, name: string) => {
    const r = await window.api.wardrobe.move(req)
    if (!r.ok) {
      setDialogError(r.message)
      if (!pending) say(r.message)
      return
    }
    setPending(null)
    setDialogError(null)
    say(`${name} moved to ${WARDROBE_LABEL[req.to]}.`)
    await refresh()
  }

  const startMove = async (f: FragranceSummary, to: WardrobeKind) => {
    setDialogError(null)
    if (to === 'wishlist') {
      const d = await window.api.fragrances.get(f.id)
      setPending({ kind: 'impression', f, initial: d?.impression ?? '', size: f.desiredSizeMl })
    } else if (to === 'garbage') {
      setPending({ kind: 'garbage', f })
    } else if (to === 'had') {
      setPending({ kind: 'had', f })
    } else if (to === 'collection' && f.activeBottleCount === 0) {
      setPending({ kind: 'bottle', f })
    } else {
      await submitMove({ fragranceId: f.id, to }, f.name)
    }
  }

  const openDetail = (f: FragranceSummary) => setOpenId(f.id)

  const toggleDrawer = () =>
    setDrawerOpen((v) => {
      try {
        localStorage.setItem('drawer.open', v ? '0' : '1')
      } catch {
        /* optional */
      }
      return !v
    })

  const saveForm = async (input: FragranceInput, placement: Placement): Promise<string | null> => {
    const r = form?.mode === 'edit' ? await window.api.fragrances.update(form.d.id, input) : await window.api.fragrances.create(input, placement)
    if (!r.ok) return r.message
    const wasEdit = form?.mode === 'edit'
    setForm(null)
    if (!wasEdit) {
      setTab(r.data.wardrobe ?? tab)
      setOpenId(r.data.id)
    }
    say(wasEdit ? 'Changes saved.' : `${r.data.name} added.`)
    await refresh()
    return null
  }

  const menuItems = (f: FragranceSummary): MenuItem[] => [
    { label: 'Open', onSelect: () => openDetail(f) },
    { label: 'Log a wear', onSelect: () => setWearFor({ fragranceId: f.id }) },
    ...KINDS.filter((k) => k !== f.wardrobe).map((k) => ({ label: `Move to ${WARDROBE_LABEL[k]}`, onSelect: () => void startMove(f, k) }))
  ]

  const shelfProps = {
    theme,
    tone: tone as 'dark' | 'light',
    showLevel: tab === 'collection',
    sepia: tab === 'had',
    draggable: canDrag,
    onOpen: (f: FragranceSummary) => openDetail(f),
    onContextMenu: (f: FragranceSummary, x: number, y: number) => setMenu({ f, x, y })
  }

  const totalHere = inTab.length

  return (
    <div className="flex min-h-full flex-col p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-ink-800 p-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`rounded-md px-4 py-2 text-sm transition-colors ${tab === k ? 'bg-ink-600 text-brass-400' : 'text-cream/70 hover:text-cream'}`}
            >
              {WARDROBE_LABEL[k]} <span className="ml-1 text-xs opacity-60">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, house, accord, note…  (Ctrl+F)"
            className="w-72 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-cream placeholder:text-cream/35"
          />
          <select value={season} onChange={(e) => setSeason(e.target.value as Season | 'all')} className="rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm" aria-label="Season filter">
            <option value="all">All seasons</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-ink-600 bg-ink-900 px-2 py-2 text-sm" aria-label="Sort">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                Sort: {SORT_LABELS[k]}
              </option>
            ))}
          </select>
          <button className={primaryBtn} onClick={addFragrance}>
            + Add fragrance
          </button>
        </div>
      </header>

      {elsewhere.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-cream/60">
          Also found in:
          {elsewhere.map((f) => (
            <button
              key={f.id}
              onClick={() => setTab(f.wardrobe!)}
              title={f.wardrobe === 'garbage' ? (f.dislikeNote ? `You disliked it: ${f.dislikeNote}` : 'You put this in the bin') : undefined}
              className={`rounded-full border px-2.5 py-1 ${f.wardrobe === 'garbage' ? 'border-red-400/50 bg-red-950/40 text-red-200' : 'border-ink-600 bg-ink-800 text-cream/80 hover:border-brass-500/60'}`}
            >
              {f.name} · {WARDROBE_LABEL[f.wardrobe!]}
              {f.wardrobe === 'garbage' && ' ⚠'}
            </button>
          ))}
        </div>
      )}

      {!canDrag && totalHere > 0 && tab !== 'garbage' && (
        <p className="mb-2 text-xs text-cream/50">Dragging is off while searching, filtering or sorting. Set sort to “Shelf order” and clear filters to rearrange.</p>
      )}

      <div className="relative overflow-hidden rounded-xl" style={theme.frame}>
        <div className="px-4 pt-3 pb-2 text-center text-[11px] uppercase tracking-[0.3em]" style={{ color: theme.accent }}>
          {WARDROBE_LABEL[tab]}
        </div>

        {totalHere === 0 ? (
          <EmptyShelf tab={tab} sampleCount={info?.fragranceCount ?? 0} onAdd={addFragrance} onSeed={async () => { await window.api.dev.seedSampleData(); await refresh() }} />
        ) : (tab === 'had' ? hadVisible : visible).length === 0 && tab !== 'garbage' ? (
          <div className="py-20 text-center" style={{ ...theme.back, color: tone === 'light' ? '#444' : '#efe6d6aa' }}>
            Nothing here matches your search.
          </div>
        ) : tab === 'garbage' ? (
          <GarbageBin items={visible} onOpen={openDetail} onContextMenu={(f, x, y) => setMenu({ f, x, y })} />
        ) : (
          <>
            {main.length > 0 && <Shelf {...shelfProps} items={main} captions={tab === 'had' ? captions : undefined} onReorder={(ids) => reorder('main', ids)} />}
            {main.length === 0 && tab === 'collection' && (
              <div className="py-16 text-center text-sm" style={{ ...theme.back, color: '#efe6d6aa' }}>
                Only decants, samples and minis here so far. They live in the drawer below.
              </div>
            )}
          </>
        )}
        <div className="h-3" />
      </div>

      {tab === 'collection' && (
        <div className="-mt-1 pb-1">
          <Drawer open={drawerOpen || (query.trim() !== '' && rack.length > 0)} onToggle={toggleDrawer} count={rack.length}>
            {rack.length > 0 ? (
              <Shelf {...shelfProps} theme={TRAY_THEME} items={rack} slot={104} scale={0.85} draggable={false} captions={vialCaptions.size > 0 ? vialCaptions : undefined} onReorder={() => undefined} />
            ) : (
              <p className="px-6 py-10 text-center text-sm text-cream/55">
                {query.trim() || season !== 'all' ? 'No vials match your search.' : 'Nothing in the drawer yet. Every sample and decant you add is kept here, including those of fragrances you only want.'}
              </p>
            )}
          </Drawer>
        </div>
      )}

      {info && info.sampleCount > 0 && (
        <button
          className="mt-4 self-start text-xs text-cream/40 underline hover:text-cream/70"
          onClick={async () => {
            await window.api.dev.clearSampleData()
            await refresh()
            say('Sample data removed.')
          }}
        >
          Remove sample data ({info.sampleCount} fragrances)
        </button>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.f)} onClose={() => setMenu(null)} />}

      {pending?.kind === 'impression' && (
        <ImpressionDialog
          fragrance={pending.f}
          initial={pending.initial}
          initialSize={pending.size}
          serverError={dialogError}
          onCancel={() => setPending(null)}
          onSubmit={(impression, desiredSizeMl) => void submitMove({ fragranceId: pending.f.id, to: 'wishlist', impression, desiredSizeMl }, pending.f.name)}
        />
      )}
      {pending?.kind === 'bottle' && (
        <BottleDialog
          fragrance={pending.f}
          serverError={dialogError}
          onCancel={() => setPending(null)}
          onSubmit={(bottle) => void submitMove({ fragranceId: pending.f.id, to: 'collection', bottle }, pending.f.name)}
        />
      )}
      {pending?.kind === 'garbage' && (
        <GarbageDialog
          fragrance={pending.f}
          initial={pending.f.dislikeNote ?? ''}
          onCancel={() => setPending(null)}
          onSubmit={(note) => void submitMove({ fragranceId: pending.f.id, to: 'garbage', dislikeNote: note }, pending.f.name)}
        />
      )}
      {pending?.kind === 'had' && (
        <HadDialog
          title={`Move ${pending.f.name} to Had`}
          intro="Keep it as a memory. Everything about it stays: notes, wears and journal."
          initial={{ years: pending.f.hadYears, memory: pending.f.hadMemory, reason: pending.f.hadReason }}
          submitLabel="Move to Had"
          onCancel={() => setPending(null)}
          onSubmit={(had) => void submitMove({ fragranceId: pending.f.id, to: 'had', had }, pending.f.name)}
        />
      )}
      {pending?.kind === 'offerHad' && (
        <OfferHadDialog
          fragrance={pending.f}
          reason={pending.reason}
          onNo={() => setPending(null)}
          onYes={(reason) => setPending({ kind: 'had', f: { ...pending.f, hadReason: reason } })}
        />
      )}
      {openId != null && (
        <DetailPanel
          id={openId}
          rev={rev}
          onClose={() => setOpenId(null)}
          onChanged={() => void refresh()}
          onEdit={(d) => setForm({ mode: 'edit', d })}
          onMove={(f, to) => void startMove(f, to)}
          onLastBottleGone={(f, reason) => setPending({ kind: 'offerHad', f, reason })}
          onOpen={setOpenId}
          onLogWear={(id) => setWearFor({ fragranceId: id })}
          onAddToLab={(id) => navigate(`/layering?add=${id}`)}
          onEditWear={(w) => w.fragranceId != null && setWearFor({ fragranceId: w.fragranceId, entry: w })}
          say={say}
        />
      )}
      {wearFor && (
        <WearForm
          fragranceId={wearFor.entry?.comboId != null ? undefined : wearFor.fragranceId}
          entry={wearFor.entry}
          onClose={() => setWearFor(null)}
          onSaved={(result, label) => {
            setWearFor(null)
            if (!result) say('Wear updated.')
            else if (result.warnings.length) {
              const w = result.warnings[0]
              say(`Wear logged. ${w.name} is running low: ${w.percent}% left${w.wearsLeft != null ? `, about ${w.wearsLeft} wears` : ''}.`)
            } else say(`Logged a wear of ${label}.`)
            void refresh()
          }}
        />
      )}
      {adding && (
        <AddFragranceDialog
          onClose={() => setAdding(false)}
          onOpenMine={(id) => {
            setAdding(false)
            const f = all.find((x) => x.id === id)
            if (f?.wardrobe) setTab(f.wardrobe)
            setOpenId(id)
          }}
          onPrefill={(prefill) => {
            setAdding(false)
            setForm({ mode: 'add', prefill })
          }}
          onImportDataset={() => {
            setAdding(false)
            setImporting(true)
          }}
        />
      )}
      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false)
            say(m)
          }}
        />
      )}
      {form && (
        <FragranceForm
          key={form.mode === 'edit' ? `e${form.d.id}` : 'new'}
          mode={form.mode}
          prefill={form.mode === 'add' ? form.prefill : undefined}
          initial={form.mode === 'edit' ? form.d : undefined}
          defaultWardrobe={tab}
          onClose={() => setForm(null)}
          onSubmit={saveForm}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

function EmptyShelf({ tab, sampleCount, onAdd, onSeed }: { tab: WardrobeKind; sampleCount: number; onAdd: () => void; onSeed: () => void }) {
  const theme = THEMES[tab]
  const copy: Record<WardrobeKind, string> = {
    collection: 'Your shelf is waiting for its first bottle.',
    wishlist: 'Nothing on your wishlist yet. Add the ones you dream about.',
    to_try: 'No fragrances queued for testing.',
    had: 'Nothing here yet. Fragrances you finished, sold or gave away can rest here as keepsakes.',
    garbage: 'The bin is empty.'
  }
  return (
    <div className="relative" style={{ ...theme.back, height: 300 }}>
      <div className="pointer-events-none absolute inset-0" style={{ background: theme.glow }} />
      <div className="relative flex h-full flex-col items-center justify-center gap-3 pb-6 text-center" style={{ color: tab === 'to_try' ? '#3b3427' : '#efe6d6' }}>
        <p className="max-w-md text-lg">{copy[tab]}</p>
        <div className="flex gap-2">
          <button className={primaryBtn} onClick={onAdd}>
            Add your first fragrance
          </button>
          {sampleCount === 0 && (
            <button className={ghostBtn} style={{ color: 'inherit' }} onClick={onSeed}>
              Load sample data
            </button>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-3.5" style={theme.plank} />
    </div>
  )
}
