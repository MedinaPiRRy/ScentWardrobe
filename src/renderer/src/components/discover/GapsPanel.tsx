import { useEffect, useRef, useState } from 'react'
import { briefForCell, type CoverageCell, type CoverageMap, type Dimension } from '@shared/discover/gaps'
import type { BriefResults } from '@shared/discover/dto'
import CardGrid, { type CardActions } from './CardGrid'

const DIMENSIONS: { key: Dimension; title: string }[] = [
  { key: 'season', title: 'Seasons' },
  { key: 'time', title: 'Time of day' },
  { key: 'occasion', title: 'Occasions' },
  { key: 'family', title: 'Scent families' },
  { key: 'performance', title: 'Performance' }
]

const STATUS = {
  covered: { word: 'covered', tone: 'border-emerald-400/50 text-emerald-200' },
  thin: { word: 'thin', tone: 'border-amber-400/60 text-amber-200' },
  missing: { word: 'missing', tone: 'border-red-400/60 text-red-200' }
} as const

/** Where My Collection is thin, in plain words, from what I own and what I wear, with fillers for each gap. */
export default function GapsPanel({ actions, rev }: { actions: CardActions; rev: number }) {
  const [map, setMap] = useState<CoverageMap | null>(null)
  const [picked, setPicked] = useState<CoverageCell | null>(null)
  const [fillers, setFillers] = useState<BriefResults | null>(null)
  const [loading, setLoading] = useState(false)
  const token = useRef(0)

  useEffect(() => {
    void window.api.discover.coverage().then((r) => setMap(r.coverage))
  }, [])

  useEffect(() => {
    if (!picked) return setFillers(null)
    const mine = ++token.current
    setLoading(true)
    void window.api.discover
      .brief({ brief: briefForCell(picked), filters: { limit: 8 }, useTaste: true })
      .then((r) => token.current === mine && setFillers(r))
      .finally(() => token.current === mine && setLoading(false))
  }, [picked, rev])

  if (!map) return <p className="text-sm text-cream/80" role="status">Looking at your collection…</p>
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Summary of the gaps">
        <h2 className="font-display text-lg text-brass-400">What is missing</h2>
        <p className="mt-1 text-xs text-cream/70">
          From {map.items} fragrance{map.items === 1 ? '' : 's'} in My Collection (vials count) and {map.wears} wear{map.wears === 1 ? '' : 's'} in your log.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-cream/90">
          {map.summary.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {DIMENSIONS.map((d) => (
        <section key={d.key} className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label={d.title}>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-cream/70">{d.title}</h3>
          <ul className="grid gap-2 md:grid-cols-2">
            {map.cells
              .filter((c) => c.dimension === d.key)
              .map((c) => {
                const s = STATUS[c.status]
                const active = picked?.dimension === c.dimension && picked.key === c.key
                return (
                  <li key={c.key} className={`rounded-lg border p-3 text-sm ${active ? 'border-brass-500 bg-ink-700' : 'border-ink-600'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-cream">{c.label}</span>
                      <span className={`rounded-full border px-2 text-xs ${s.tone}`}>{s.word}</span>
                    </div>
                    <p className="mt-1 text-cream/85">{c.text}</p>
                    {c.worn > 0 && (
                      <p className="text-xs text-cream/70">
                        You wore {c.wornBy === 1 ? 'one fragrance' : `${c.wornBy} fragrances`} here {c.worn} time{c.worn === 1 ? '' : 's'}.
                      </p>
                    )}
                    {c.names.length > 0 && <p className="text-xs text-cream/70">e.g. {c.names.join(', ')}</p>}
                    {c.status !== 'covered' && (
                      <button type="button" className="mt-2 rounded-md border border-ink-600 px-3 py-1 text-sm text-brass-400 hover:bg-ink-600" aria-pressed={active} onClick={() => setPicked(active ? null : c)}>
                        {active ? 'Hide ideas' : 'Ideas to fill it'}
                      </button>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}

      {picked && (
        <section aria-label={`Ideas for ${picked.label}`} aria-busy={loading}>
          <h3 className="mb-2 font-display text-lg text-cream">Ideas for “{picked.label}”</h3>
          <p className="mb-2 text-xs text-cream/70">Fragrances you do not have that suit this, ranked by how well they match it and your taste.</p>
          {loading && !fillers && <p className="text-sm text-cream/80" role="status">Looking…</p>}
          {fillers?.message && fillers.cards.length === 0 && <p className="text-sm text-cream/85">{fillers.message}</p>}
          {fillers && <CardGrid cards={fillers.cards} actions={actions} />}
        </section>
      )}
    </div>
  )
}
