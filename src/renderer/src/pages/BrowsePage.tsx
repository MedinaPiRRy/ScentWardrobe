import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { CommunityData, FragranceInput, LocalHit, NoteEntry, Placement } from '@shared/types'
import type { LayerItem } from '@shared/layering/types'
import { accordColor } from '@shared/accordColors'
import { similarOwned } from '@shared/similar'
import FragranceForm from '../components/FragranceForm'
import { ghostBtn, primaryBtn } from '../components/Dialogs'
import AccordBars from '../components/detail/AccordBars'
import CommunityCharts from '../components/detail/CommunityCharts'
import NotesPyramid from '../components/detail/NotesPyramid'
import { hasMod } from '../lib/platform'
import { wardrobeList } from '../lib/shelf'

type Source = 'mine' | 'dataset' | 'web'

/** What is on screen: everything needed to show a fragrance read-only, from any of the three places. */
interface Viewed {
  source: Source
  /** Library id when it comes from my library. */
  id?: number
  wardrobeLabel?: string
  input: FragranceInput
  community: CommunityData | null
  note?: string
}

const SOURCE_BADGE: Record<Source, { text: string; tone: string }> = {
  mine: { text: 'In my library', tone: 'bg-brass-500/25 text-brass-400' },
  dataset: { text: 'From the imported dataset', tone: 'bg-ink-600 text-cream/80' },
  web: { text: 'Live from Fragrantica (not saved)', tone: 'bg-sky-900/50 text-sky-200' }
}

const FRAGRANTICA = /^https:\/\/([a-z0-9-]+\.)*fragrantica\.[a-z.]+\/perfume\//i

export default function BrowsePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LocalHit[]>([])
  const [datasetCount, setDatasetCount] = useState(0)
  const [viewed, setViewed] = useState<Viewed | null>(null)
  const [picture, setPicture] = useState<string | null>(null)
  const [owned, setOwned] = useState<(LayerItem & { id: number })[]>([])
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<FragranceInput | null>(null)
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const search = useRef<HTMLInputElement>(null)
  const token = useRef(0)

  const isLink = FRAGRANTICA.test(query.trim())

  useEffect(() => {
    void window.api.search.datasetInfo().then((d) => setDatasetCount(d.count))
    void window.api.layering.candidates().then((c) => setOwned(c as (LayerItem & { id: number })[]))
    search.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (hasMod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        search.current?.focus()
        search.current?.select()
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  // Search as I type (not for a pasted link, which is opened with its own button).
  useEffect(() => {
    if (isLink || query.trim().length < 2) {
      setHits([])
      return
    }
    // A slow answer for an earlier query must never replace the answer for the current one.
    let current = true
    const t = window.setTimeout(() => void window.api.search.local(query).then((r) => current && setHits(r)), 180)
    return () => {
      current = false
      window.clearTimeout(t)
    }
  }, [query, isLink])

  const show = useCallback(async (v: Viewed) => {
    setViewed(v)
    setPicture(null)
    setError(null)
    const mine = ++token.current
    if (v.input.imageUrl) {
      const url = await window.api.browse.previewImage(v.input.imageUrl)
      if (token.current === mine) setPicture(url)
    }
  }, [])

  const openHit = async (h: LocalHit) => {
    setError(null)
    if (h.source === 'dataset') {
      const e = await window.api.search.datasetEntry(h.id)
      if (!e) return setError('That dataset entry could not be read.')
      return void show({ source: 'dataset', input: e, community: e.community ?? null })
    }
    const d = await window.api.fragrances.get(h.id)
    if (!d) return setError('That fragrance is no longer in your library.')
    const input: FragranceInput = {
      name: d.name, house: d.house, year: d.year, concentration: d.concentration, perfumers: d.perfumers, gender: d.gender, description: d.description,
      imagePath: d.imagePath, notes: d.notes.map((n) => ({ name: n.name, layer: n.layer })), accords: d.accords.map((a) => ({ name: a.name, strength: a.strength, color: a.color })), community: d.community
    }
    void show({ source: 'mine', id: d.id, wardrobeLabel: d.wardrobes.length ? wardrobeList(d.wardrobes) : d.isForeign ? 'Not mine' : undefined, input, community: d.community, note: d.dislikeNote ?? undefined })
  }

  const loadLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('Loading the page from Fragrantica… this takes a few seconds.')
    setError(null)
    const r = await window.api.fragrantica.importUrl(query.trim())
    setLoading(null)
    if (!r.ok) return setError(r.message)
    void show({ source: 'web', input: r.data.input, community: r.data.input.community ?? null, note: r.data.warnings.join(' ') || undefined })
  }

  const close = () => {
    token.current++
    setViewed(null)
    setPicture(null)
    search.current?.focus()
  }

  const similar = useMemo(() => (viewed ? similarOwned({ id: viewed.id, accords: viewed.input.accords, notes: viewed.input.notes }, owned) : []), [viewed, owned])

  const save = async (input: FragranceInput, placement: Placement): Promise<string | null> => {
    const r = await window.api.fragrances.create(input, placement)
    if (!r.ok) return r.message
    setAdding(null)
    setViewed(null)
    setToast({ text: `${r.data.name} added.`, id: r.data.id })
    window.setTimeout(() => setToast(null), 6000)
    return null
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 p-6">
      <header>
        <h1 className="font-display text-3xl text-brass-400">Browse</h1>
        <p className="text-sm text-cream/60">Look up any fragrance without adding it. Search your library and the imported dataset, or paste a Fragrantica link. Nothing is saved unless you add it.</p>
      </header>

      <form onSubmit={isLink ? loadLink : (e) => e.preventDefault()} className="flex gap-2">
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search fragrances or paste a Fragrantica link"
          placeholder={datasetCount ? `Search your library and ${datasetCount.toLocaleString()} dataset fragrances, or paste a Fragrantica link…` : 'Search your library, or paste a Fragrantica link…'}
          className="min-w-0 flex-1 rounded-md border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-cream placeholder:text-cream/35"
        />
        {isLink && (
          <button type="submit" className={primaryBtn} disabled={!!loading}>
            Look up this page
          </button>
        )}
      </form>
      {loading && <p className="text-sm text-cream/70" role="status">{loading}</p>}
      {error && (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[340px_1fr]">
        <section aria-label="Results" className="min-h-0 overflow-y-auto rounded-xl border border-ink-600 bg-ink-800">
          {query.trim().length < 2 || isLink ? (
            <p className="p-4 text-sm text-cream/60">{isLink ? 'Press “Look up this page” to read that fragrance live. It takes a few seconds and only reads the page you pasted.' : 'Type at least two letters.'}</p>
          ) : hits.length === 0 ? (
            <p className="p-4 text-sm text-cream/60">Nothing found{datasetCount === 0 ? ' in your library (no dataset imported yet)' : ''}. You can paste a Fragrantica link instead.</p>
          ) : (
            <ul>
              {hits.map((h) => (
                <li key={`${h.source}-${h.id}`}>
                  <button
                    onClick={() => void openHit(h)}
                    aria-current={viewed?.source === h.source && (h.source === 'mine' ? viewed.id === h.id : viewed.input.name === h.name && viewed.input.house === h.house) ? 'true' : undefined}
                    className="flex w-full items-center justify-between gap-2 border-b border-ink-700 px-3 py-2 text-left text-sm last:border-0 hover:bg-ink-700"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{h.name}</span>
                      <span className="block truncate text-xs text-cream/60">{[h.house, h.year, h.concentration].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${h.source === 'mine' ? SOURCE_BADGE.mine.tone : SOURCE_BADGE.dataset.tone}`}>
                      {h.source === 'mine' ? (h.wardrobes.length ? wardrobeList(h.wardrobes) : 'Library') : 'Dataset'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Fragrance details" className="min-h-0 overflow-y-auto rounded-xl border border-ink-600 bg-ink-800 p-5">
          {!viewed ? (
            <p className="text-sm text-cream/60">Pick a result to see its notes, accords and what the community says, and how it compares with what you own.</p>
          ) : (
            <article>
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex h-40 w-24 shrink-0 items-center justify-center">
                  {picture ? <img src={picture} alt="" className="max-h-40 max-w-24 object-contain" /> : <span className="text-xs text-cream/40">{viewed.input.imageUrl ? 'Loading picture…' : 'No picture'}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${SOURCE_BADGE[viewed.source].tone}`} data-testid="source-badge">
                      {SOURCE_BADGE[viewed.source].text}
                      {viewed.wardrobeLabel ? `: ${viewed.wardrobeLabel}` : ''}
                    </span>
                  </div>
                  <h2 className="mt-1 font-display text-2xl">{viewed.input.name}</h2>
                  <div className="text-brass-400">{viewed.input.house}</div>
                  <div className="mt-1 text-xs text-cream/65">{[viewed.input.year, viewed.input.concentration, viewed.input.gender].filter(Boolean).join(' · ')}</div>
                  {viewed.input.perfumers && <div className="mt-0.5 text-xs text-cream/60">Perfumer: {viewed.input.perfumers}</div>}
                  {viewed.note && <p className="mt-2 text-xs italic text-cream/70">{viewed.source === 'mine' ? `You disliked it: ${viewed.note}` : viewed.note}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {viewed.source === 'mine' ? (
                      <button className={primaryBtn} onClick={() => navigate(`/?open=${viewed.id}`)}>
                        Open in my wardrobes
                      </button>
                    ) : (
                      <button className={primaryBtn} onClick={() => setAdding(viewed.input)}>
                        Add to a wardrobe…
                      </button>
                    )}
                    <button className={ghostBtn} onClick={close}>
                      Close
                    </button>
                  </div>
                </div>
              </div>

              {viewed.input.description && <p className="mt-5 text-sm text-cream/85">{viewed.input.description}</p>}

              <h3 className="mt-6 border-b border-ink-600 pb-1 font-display text-lg text-brass-400">Notes</h3>
              <div className="mt-3">
                <NotesPyramid notes={viewed.input.notes.map((n, i): NoteEntry => ({ id: i + 1, name: n.name, family: null, iconPath: null, layer: n.layer }))} selectedId={null} onSelect={() => undefined} />
              </div>

              <h3 className="mt-6 border-b border-ink-600 pb-1 font-display text-lg text-brass-400">Main accords</h3>
              <div className="mt-3">
                <AccordBars accords={viewed.input.accords.map((a) => ({ name: a.name, strength: a.strength, color: a.color ?? accordColor(a.name) }))} />
              </div>

              <h3 className="mt-6 border-b border-ink-600 pb-1 font-display text-lg text-brass-400">Community</h3>
              <div className="mt-3">
                <CommunityCharts c={viewed.community} />
              </div>

              <h3 className="mt-6 border-b border-ink-600 pb-1 font-display text-lg text-brass-400">Similar to what I own</h3>
              <div className="mt-3">
                {similar.length === 0 ? (
                  <p className="text-sm text-cream/60">{viewed.input.accords.length + viewed.input.notes.length === 0 ? 'There is no accord or note data to compare.' : 'Nothing in your collection is close to this one.'}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {similar.map((s) => (
                      <li key={s.item.id} className="flex items-baseline gap-3">
                        <span className="w-12 text-right font-display text-lg text-brass-400">{s.percent}%</span>
                        <span className="min-w-0 flex-1">
                          {s.item.name} <span className="text-cream/55">{s.item.house}</span>
                          <span className="block text-xs text-cream/60">{[s.sharedAccords.length ? `shares ${s.sharedAccords.join(', ')}` : '', s.sharedNotes.length ? `notes: ${s.sharedNotes.join(', ')}` : ''].filter(Boolean).join(' · ')}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          )}
        </section>
      </div>

      {adding && <FragranceForm mode="add" prefill={adding} defaultWardrobe="wishlist" onClose={() => setAdding(null)} onSubmit={save} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast.text}
          <button className="text-brass-400 underline" onClick={() => navigate(`/?open=${toast.id}`)}>
            Open it
          </button>
        </div>
      )}
    </div>
  )
}
