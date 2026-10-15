import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { useSearchParams } from 'react-router-dom'
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import type { SavedCombo } from '@shared/types'
import { accordColor } from '@shared/accordColors'
import { analyzeLayer, buildAffinity, suggestPartners, VERDICT_GREAT, VERDICT_WORTH_TESTING, type AffinityMatrix, type LayerItem, type RatedCombo, type Verdict } from '@shared/layering'
import BottleSvg from '../components/BottleSvg'
import { ghostBtn, primaryBtn } from '../components/Dialogs'
import WearForm from '../components/WearForm'

const MAX_LAYERS = 3
const MAX_SPRAYS = 10

interface Slot {
  id: number
  sprays: number
}

const verdictStyle: Record<Verdict, { color: string; blurb: string }> = {
  'Great pairing': { color: '#7fd18f', blurb: 'These should work well together.' },
  'Worth testing': { color: '#e0b24f', blurb: 'Promising, but try it on skin first.' },
  Redundant: { color: '#8fa8d4', blurb: 'So alike that layering adds little.' },
  'Likely to clash': { color: '#e07a6a', blurb: 'Expect the two to fight.' }
}

/** The items only need an id, name and accords to be drawn as a bottle on the shelf. */
const asSummary = (it: LayerItem) =>
  ({
    id: it.id, name: it.name, house: it.house ?? '', year: null, concentration: null, imagePath: null, wardrobe: 'collection' as const, shelfPosition: 0, rating: null,
    topAccords: it.accords.slice(0, 2).map((a) => ({ ...a, color: accordColor(a.name) })), activeBottleCount: 1, bottles: [], desiredSizeMl: null, wearCount: 0,
    lastWornAt: null, seasons: [], accordNames: [], noteNames: [], isSample: false
  }) as unknown as Parameters<typeof BottleSvg>[0]['fragrance']

function ShelfBottle({ item, inMix, onAdd, images }: { item: LayerItem; inMix: boolean; onAdd: () => void; images: Map<number, string | null> }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `f-${item.id}`, disabled: inMix })
  const summary = { ...asSummary(item), imagePath: images.get(item.id) ?? null }
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onAdd}
      title={inMix ? `${item.name} is already in the blend` : `${item.name}: drag into the mixing area, or click to add`}
      className={`flex w-24 shrink-0 flex-col items-center gap-1 rounded-lg px-1 pt-2 pb-1 text-center transition ${inMix ? 'opacity-35' : 'hover:bg-ink-700/70'} ${isDragging ? 'opacity-40' : ''}`}
      style={{ touchAction: 'none' }}
    >
      <div className="flex h-24 items-end" style={{ filter: 'drop-shadow(0 4px 3px rgba(0,0,0,.5))' }}>
        <BottleSvg fragrance={summary} showLevel={false} scale={0.62} />
      </div>
      <div className="w-full truncate text-xs text-cream/90">{item.name}</div>
      <div className="w-full truncate text-[10px] text-cream/45">{item.house}</div>
    </button>
  )
}

/** Must be a child of DndContext for the droppable to register. */
function MixZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'mixer' })
  return (
    <section ref={setNodeRef} aria-label="Mixing area" className={`rounded-xl border-2 border-dashed p-4 transition-colors ${isOver ? 'border-brass-400 bg-brass-500/10' : 'border-ink-600 bg-ink-800/60'}`}>
      {children}
    </section>
  )
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 44
  const c = 2 * Math.PI * r
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`Compatibility ${score} out of 100`}>
      <circle cx="56" cy="56" r={r} fill="none" stroke="#2a2118" strokeWidth="9" />
      <circle cx="56" cy="56" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 56 56)" style={{ transition: 'stroke-dasharray .5s' }} />
      <text x="56" y="62" textAnchor="middle" fontSize="28" fontFamily="Georgia, serif" fill={color}>
        {score}
      </text>
    </svg>
  )
}

export default function LayeringPage() {
  const [candidates, setCandidates] = useState<LayerItem[]>([])
  const [images, setImages] = useState<Map<number, string | null>>(new Map())
  const [history, setHistory] = useState<RatedCombo[]>([])
  const [affinity, setAffinity] = useState<AffinityMatrix>(() => buildAffinity())
  const [combos, setCombos] = useState<SavedCombo[]>([])
  const [mix, setMix] = useState<Slot[]>([])
  const [chart, setChart] = useState<'radar' | 'bars'>('radar')
  const [suggestFor, setSuggestFor] = useState<number | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [wearCombo, setWearCombo] = useState<SavedCombo | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [params, setParams] = useSearchParams()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 3500)
  }, [])

  const reloadLearning = useCallback(async () => {
    const [h, c] = await Promise.all([window.api.layering.history(), window.api.layering.combos()])
    setHistory(h)
    setCombos(c)
  }, [])

  useEffect(() => {
    void (async () => {
      const [cand, list] = await Promise.all([window.api.layering.candidates(), window.api.fragrances.list({ wardrobe: 'collection' })])
      setCandidates(cand)
      setImages(new Map(list.map((f) => [f.id, f.imagePath])))
      await reloadLearning()
      try {
        const raw = await window.api.settings.get('layering.affinity')
        if (raw) setAffinity(buildAffinity(JSON.parse(raw) as AffinityMatrix))
      } catch {
        /* a broken override must not break the lab */
      }
    })()
  }, [reloadLearning])

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates])

  const addToMix = useCallback(
    (id: number) => {
      setMix((m) => {
        if (m.some((s) => s.id === id)) return m
        if (m.length >= MAX_LAYERS) {
          say(`A blend takes at most ${MAX_LAYERS} fragrances. Remove one first.`)
          return m
        }
        return [...m, { id, sprays: 1 }]
      })
    },
    [say]
  )

  // Deep link from a fragrance's detail view: /layering?add=<id>
  useEffect(() => {
    if (candidates.length === 0) return
    const ids = (params.get('mix') ?? '').split(',').map((x) => parseInt(x, 10)).filter((x) => x > 0 && byId.has(x)).slice(0, MAX_LAYERS)
    if (ids.length > 0) {
      setMix(ids.map((id) => ({ id, sprays: 1 })))
      setParams({}, { replace: true })
      return
    }
    const id = parseInt(params.get('add') ?? '', 10)
    if (!id) return
    if (byId.has(id)) addToMix(id)
    else say('Only fragrances in My Collection can be layered.')
    setParams({}, { replace: true })
  }, [params, candidates, byId, addToMix, setParams, say])

  const mixItems = mix.filter((s) => byId.has(s.id)).map((s) => ({ item: byId.get(s.id)!, sprays: s.sprays }))
  const analysis = useMemo(() => analyzeLayer(mixItems, { affinity, history }), [mixItems.map((m) => `${m.item.id}x${m.sprays}`).join(','), affinity, history]) // eslint-disable-line react-hooks/exhaustive-deps
  const ready = mixItems.length >= 2
  const style = verdictStyle[analysis.verdict]

  const suggestions = useMemo(() => {
    const base = suggestFor != null ? byId.get(suggestFor) : undefined
    return base ? suggestPartners(base, candidates, { affinity, history }) : []
  }, [suggestFor, byId, candidates, affinity, history])

  const onDragStart = (e: DragStartEvent) => setDragging(parseInt(String(e.active.id).slice(2), 10))
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    if (e.over?.id === 'mixer') addToMix(parseInt(String(e.active.id).slice(2), 10))
  }

  const setSprays = (id: number, n: number) => setMix((m) => m.map((s) => (s.id === id ? { ...s, sprays: Math.min(Math.max(n, 1), MAX_SPRAYS) } : s)))
  const move = (i: number, dir: -1 | 1) =>
    setMix((m) => {
      const j = i + dir
      if (j < 0 || j >= m.length) return m
      const next = [...m]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const save = async () => {
    const r = await window.api.layering.saveCombo({ items: mix.map((s) => ({ fragranceId: s.id, sprays: s.sprays })), predictedScore: analysis.score })
    if (!r.ok) return say(r.message)
    say(r.data.existing ? 'You already saved this blend.' : 'Blend saved. Try it, then rate it below so I can learn your taste.')
    await reloadLearning()
  }

  const load = (c: SavedCombo) => {
    const missing = c.items.filter((i) => !byId.has(i.fragranceId))
    if (missing.length) say(`${missing.map((m) => m.name).join(', ')} is no longer in your collection.`)
    setMix(c.items.filter((i) => byId.has(i.fragranceId)).map((i) => ({ id: i.fragranceId, sprays: i.sprays })))
    window.scrollTo?.({ top: 0 })
  }

  const rate = async (c: SavedCombo, rating: number | null) => {
    const r = await window.api.layering.rateCombo(c.id, rating)
    if (!r.ok) say(r.message)
    await reloadLearning()
  }

  const comboTitle = (c: SavedCombo) => c.items.map((i) => i.name).join(' + ')

  if (candidates.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h1 className="font-display text-3xl text-brass-400">Layering Lab</h1>
        <p className="mt-2 max-w-md text-cream/60">Layering uses the fragrances in My Collection. Add at least two bottles there, then come back to mix them.</p>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="mx-auto max-w-6xl space-y-5 p-6">
        <header>
          <h1 className="font-display text-3xl text-brass-400">Layering Lab</h1>
          <p className="text-sm text-cream/55">Drag two or three bottles into the mixing area, set the spray ratio, and see how they should smell together.</p>
        </header>

        <section className="rounded-xl border border-ink-600 bg-gradient-to-b from-[#3a2413] to-[#24160c] shadow-inner" aria-label="My collection">
          <div className="flex gap-1 overflow-x-auto px-3 pt-2">
            {candidates.map((c) => (
              <ShelfBottle key={c.id} item={c} inMix={mix.some((s) => s.id === c.id)} onAdd={() => addToMix(c.id)} images={images} />
            ))}
          </div>
          <div className="h-3 rounded-b-xl" style={{ background: 'linear-gradient(180deg,#a56a35,#7a4a22 60%,#5b3515)', boxShadow: '0 6px 12px rgba(0,0,0,.5)' }} />
        </section>

        <MixZone>
          {mix.length === 0 ? (
            <p className="py-6 text-center text-sm text-cream/50">Drop a bottle here to start a blend.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {mixItems.map((m, i) => (
                <div key={m.item.id} className="rounded-lg border border-ink-600 bg-ink-900/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{m.item.name}</div>
                      <div className="truncate text-xs text-cream/50">{m.item.house}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-brass-400">{i === 0 ? 'Sprayed first · base layer' : `Sprayed ${i === 1 ? 'second' : 'third'}`}</div>
                    </div>
                    <button className="px-1 text-cream/50 hover:text-cream" aria-label={`Remove ${m.item.name}`} onClick={() => setMix((x) => x.filter((s) => s.id !== m.item.id))}>
                      ×
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button className={`${ghostBtn} px-2.5 py-1`} aria-label={`Fewer sprays of ${m.item.name}`} onClick={() => setSprays(m.item.id, m.sprays - 1)}>
                        −
                      </button>
                      <span className="w-14 text-center text-sm">
                        {m.sprays} spray{m.sprays === 1 ? '' : 's'}
                      </span>
                      <button className={`${ghostBtn} px-2.5 py-1`} aria-label={`More sprays of ${m.item.name}`} onClick={() => setSprays(m.item.id, m.sprays + 1)}>
                        +
                      </button>
                    </div>
                    <div className="flex gap-1 text-cream/50">
                      <button className="px-1 hover:text-cream disabled:opacity-25" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Spray ${m.item.name} earlier`} title="Spray earlier">
                        ◀
                      </button>
                      <button className="px-1 hover:text-cream disabled:opacity-25" disabled={i === mixItems.length - 1} onClick={() => move(i, 1)} aria-label={`Spray ${m.item.name} later`} title="Spray later">
                        ▶
                      </button>
                    </div>
                  </div>
                  <button className="mt-2 text-xs text-brass-400 underline hover:text-brass-500" onClick={() => setSuggestFor(m.item.id)}>
                    Suggest a layer for this
                  </button>
                </div>
              ))}
            </div>
          )}
          {mix.length > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-cream/55">
              <span>{ready ? `Ratio ${mixItems.map((m) => m.sprays).join(' : ')}` : 'Add one more fragrance to see the prediction.'}</span>
              <button className="underline hover:text-cream" onClick={() => setMix([])}>
                Clear
              </button>
            </div>
          )}
        </MixZone>

        {ready && (
          <section className="grid gap-5 md:grid-cols-[1.1fr_1fr]" aria-label="Prediction">
            <div className="space-y-4 rounded-xl border border-ink-600 bg-ink-800 p-5">
              <div className="flex items-center gap-4">
                <ScoreRing score={analysis.score} color={style.color} />
                <div>
                  <div className="font-display text-2xl" style={{ color: style.color }}>
                    {analysis.verdict}
                  </div>
                  <div className="text-sm text-cream/60">{style.blurb}</div>
                  <div className="mt-1 text-[11px] text-cream/40">
                    Compatibility {analysis.score}/100 · great ≥ {VERDICT_GREAT}, worth testing ≥ {VERDICT_WORTH_TESTING}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="mb-1 font-display text-base text-brass-400">What to expect</h3>
                <p className="text-sm leading-relaxed text-cream/85">{analysis.description}</p>
              </div>

              <div>
                <h3 className="mb-1 font-display text-base text-brass-400">Why this score</h3>
                {analysis.reasons.length === 0 ? (
                  <p className="text-sm text-cream/50">Nothing stands out either way.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {analysis.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className={`mt-0.5 w-10 shrink-0 text-right text-xs tabular-nums ${r.impact >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {r.impact > 0 ? '+' : ''}
                          {Math.round(r.impact)}
                        </span>
                        <span className="text-cream/85">{r.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button className={primaryBtn} onClick={save}>
                  Save blend
                </button>
                <button
                  className={ghostBtn}
                  onClick={async () => {
                    const r = await window.api.layering.saveCombo({ items: mix.map((s) => ({ fragranceId: s.id, sprays: s.sprays })), predictedScore: analysis.score })
                    if (!r.ok) return say(r.message)
                    await reloadLearning()
                    const c = (await window.api.layering.combos()).find((x) => x.id === r.data.id)
                    if (c) setWearCombo(c)
                  }}
                >
                  Wear this blend
                </button>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-ink-600 bg-ink-800 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base text-brass-400">Blended accords</h3>
                <div className="flex rounded-md bg-ink-900 p-0.5 text-xs">
                  {(['radar', 'bars'] as const).map((k) => (
                    <button key={k} onClick={() => setChart(k)} className={`rounded px-2.5 py-1 ${chart === k ? 'bg-ink-600 text-brass-400' : 'text-cream/60'}`}>
                      {k === 'radar' ? 'Radar' : 'Bars'}
                    </button>
                  ))}
                </div>
              </div>
              {chart === 'radar' ? (
                <div className="h-64">
                  <ResponsiveContainer>
                    <RadarChart data={analysis.blend.slice(0, 8).map((a) => ({ name: a.name, value: a.strength }))} outerRadius="72%">
                      <PolarGrid stroke="var(--chart-grid)" />
                      <PolarAngleAxis dataKey="name" tick={{ fill: 'var(--chart-text)', fontSize: 11 }} />
                      <Radar dataKey="value" stroke="#d9b26f" fill="#d9b26f" fillOpacity={0.35} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {analysis.blend.slice(0, 9).map((a) => (
                    <div key={a.name} className="relative h-6 overflow-hidden rounded bg-ink-900" title={`${a.name}: ${a.strength}`}>
                      <div className="h-full rounded" style={{ width: `${Math.max(a.strength, 12)}%`, background: accordColor(a.name) }} />
                      <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium text-black/80 mix-blend-normal" style={{ textShadow: '0 0 3px rgba(255,255,255,.6)' }}>
                        {a.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="mb-1 text-xs text-cream/55">Who dominates (spray ratio × projection)</div>
                <div className="flex h-5 overflow-hidden rounded">
                  {analysis.shares.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-center text-[10px] font-medium text-black/80" style={{ width: `${s.share * 100}%`, background: ['#d9b26f', '#8fb4d4', '#c48fb5'][i % 3] }} title={`${s.name}: ${Math.round(s.share * 100)}%`}>
                      {s.share >= 0.15 ? `${Math.round(s.share * 100)}%` : ''}
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-cream/55">
                  {analysis.shares.map((s, i) => (
                    <span key={s.id}>
                      <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ['#d9b26f', '#8fb4d4', '#c48fb5'][i % 3] }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-xl border border-ink-600 bg-ink-800 p-5" aria-label="Suggest a layer">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg text-brass-400">Suggest a layer</h2>
            <select value={suggestFor ?? ''} onChange={(e) => setSuggestFor(e.target.value ? +e.target.value : null)} className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm" aria-label="Fragrance to find a partner for">
              <option value="">Pick a fragrance…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.house}
                </option>
              ))}
            </select>
          </div>
          {suggestFor == null ? (
            <p className="mt-2 text-sm text-cream/50">Pick one of your fragrances and I will rank the best partners from your collection.</p>
          ) : suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-cream/50">You need at least one other fragrance in your collection.</p>
          ) : (
            <ol className="mt-3 divide-y divide-ink-700">
              {suggestions.slice(0, 8).map((s, i) => (
                <li key={s.item.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-5 text-cream/35">{i + 1}.</span>
                  <span className="w-10 text-right font-display text-lg" style={{ color: verdictStyle[s.verdict].color }}>
                    {s.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      {s.item.name} <span className="text-cream/45">{s.item.house}</span>
                    </div>
                    <div className="truncate text-xs text-cream/50">
                      {s.verdict}
                      {s.headline && ` · ${s.headline}`}
                    </div>
                  </div>
                  <button
                    className={ghostBtn}
                    onClick={() => setMix([{ id: suggestFor, sprays: 1 }, { id: s.item.id, sprays: 1 }])}
                    title="Put the two in the mixing area"
                  >
                    Mix
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-xl border border-ink-600 bg-ink-800 p-5" aria-label="Saved blends">
          <h2 className="font-display text-lg text-brass-400">Saved blends</h2>
          <p className="mb-2 text-xs text-cream/45">Rate a blend after you try it. I use your ratings to adjust the scores of similar pairings.</p>
          {combos.length === 0 ? (
            <p className="text-sm text-cream/50">Nothing saved yet.</p>
          ) : (
            <ul className="space-y-3">
              {combos.map((c) => (
                <li key={c.id} className="rounded-lg border border-ink-600 bg-ink-900/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{comboTitle(c)}</div>
                      <div className="text-xs text-cream/50">
                        Ratio {c.sprayRatio}
                        {c.predictedScore != null && ` · predicted ${c.predictedScore}/100`}
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button className="underline hover:text-brass-400" onClick={() => load(c)}>
                        Load
                      </button>
                      <button className="underline hover:text-brass-400" onClick={() => setWearCombo(c)}>
                        Wear
                      </button>
                      <button
                        className="underline hover:text-red-300"
                        onClick={async () => {
                          if (!window.confirm('Delete this saved blend? Its wears stay in your log.')) return
                          await window.api.layering.deleteCombo(c.id)
                          await reloadLearning()
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <span className="mr-1 text-xs text-cream/50">My rating</span>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        aria-label={`Rate blend ${n}`}
                        onClick={() => rate(c, c.myRating === n ? null : n)}
                        className={`h-6 w-6 rounded text-[11px] ${c.myRating && n <= c.myRating ? 'bg-brass-500 text-[#17110b]' : 'bg-ink-800 text-cream/50 hover:bg-ink-600'}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DragOverlay>
        {dragging != null && byId.get(dragging) && (
          <div className="rounded-lg bg-ink-700/90 px-2 py-1 shadow-xl" style={{ filter: 'drop-shadow(0 8px 6px rgba(0,0,0,.6))' }}>
            <BottleSvg fragrance={{ ...asSummary(byId.get(dragging)!), imagePath: images.get(dragging) ?? null }} showLevel={false} scale={0.7} />
          </div>
        )}
      </DragOverlay>

      {wearCombo && (
        <WearForm
          comboId={wearCombo.id}
          comboTitle={comboTitle(wearCombo)}
          defaultSprays={wearCombo.items.reduce((s, i) => s + i.sprays, 0)}
          onClose={() => setWearCombo(null)}
          onSaved={(result) => {
            setWearCombo(null)
            say(result?.warnings.length ? `Wear logged. ${result.warnings[0].name} is running low.` : 'Logged a wear of this blend.')
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast}
        </div>
      )}
    </DndContext>
  )
}
