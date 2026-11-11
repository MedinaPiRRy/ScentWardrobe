import { useEffect, useState } from 'react'
import type { SeedRef, SimilarResults } from '@shared/discover/dto'
import type { Sliders } from '@shared/discover/similar'
import type { LocalHit } from '@shared/types'

export interface SeedChoice {
  ref: SeedRef
  name: string
  house: string
}

const SLIDERS: { key: keyof Sliders; label: string; low: string; high: string; min: number; max: number }[] = [
  { key: 'sweet', label: 'Sweetness', low: 'less sweet', high: 'sweeter', min: -1, max: 1 },
  { key: 'fresh', label: 'Freshness', low: 'warmer, richer', high: 'fresher', min: -1, max: 1 },
  { key: 'projection', label: 'Projection', low: 'quieter', high: 'louder', min: -1, max: 1 },
  { key: 'longevity', label: 'Longevity', low: 'shorter', high: 'longer lasting', min: -1, max: 1 },
  { key: 'drydown', label: 'Drydown', low: 'same drydown', high: 'a different one', min: 0, max: 1 },
  { key: 'unusual', label: 'How common', low: 'as popular as these', high: 'more unusual', min: 0, max: 1 }
]

/** Pick the fragrances to start from and say how the result should differ ("like X, but ..."). */
export default function SimilarPanel({ seeds, onSeeds, sliders, onSliders, last }: { seeds: SeedChoice[]; onSeeds: (s: SeedChoice[]) => void; sliders: Sliders; onSliders: (s: Sliders) => void; last: SimilarResults | null }) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LocalHit[]>([])
  useEffect(() => {
    let current = true
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const t = window.setTimeout(() => void window.api.search.local(query).then((h) => current && setHits(h.slice(0, 6))), 180)
    return () => {
      current = false
      window.clearTimeout(t)
    }
  }, [query])

  const add = (h: LocalHit) => {
    const ref: SeedRef = h.source === 'dataset' ? { catalogId: h.id } : { fragranceId: h.id }
    const key = JSON.stringify(ref)
    if (seeds.length < 6 && !seeds.some((s) => JSON.stringify(s.ref) === key)) onSeeds([...seeds, { ref, name: h.name, house: h.house }])
    setQuery('')
    setHits([])
  }
  const changed = Object.values(sliders).some((v) => Math.abs(v) > 0.05)

  return (
    <section className="space-y-4 rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Start from these fragrances">
      <div>
        <label htmlFor="seed-search" className="mb-1 block text-xs uppercase tracking-wider text-cream/70">
          Start from (up to 6)
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {seeds.map((s) => (
            <span key={JSON.stringify(s.ref)} className="inline-flex items-center gap-1 rounded-full border border-brass-500/50 bg-brass-500/15 py-0.5 pl-2.5 pr-1 text-sm text-cream">
              {s.name} <span className="text-cream/70">{s.house}</span>
              <button type="button" className="rounded-full px-1.5 text-cream/70 hover:bg-ink-700 hover:text-cream" aria-label={`Remove ${s.name}`} onClick={() => onSeeds(seeds.filter((x) => x !== s))}>
                ×
              </button>
            </span>
          ))}
          <div className="relative min-w-[14rem] flex-1">
            <input
              id="seed-search"
              role="combobox"
              aria-expanded={hits.length > 0}
              aria-controls="seed-hits"
              aria-autocomplete="list"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={seeds.length >= 6 ? 'Limit reached' : 'Search my library or the dataset'}
              disabled={seeds.length >= 6}
              className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream placeholder:text-cream/60"
            />
            {hits.length > 0 && (
              <ul id="seed-hits" role="listbox" aria-label="Matches" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded border border-ink-600 bg-ink-800 py-1 shadow-xl">
                {hits.map((h) => (
                  <li key={`${h.source}${h.id}`} role="option" aria-selected={false}>
                    <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-cream hover:bg-ink-600" onClick={() => add(h)}>
                      <span className="min-w-0 flex-1 truncate">
                        {h.name} <span className="text-cream/70">{h.house}</span>
                      </span>
                      <span className="shrink-0 rounded-full border border-ink-600 px-2 text-[11px] text-cream/70">{h.source === 'mine' ? 'mine' : 'dataset'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs uppercase tracking-wider text-cream/70">Like these, but...</legend>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {SLIDERS.map((s) => {
            const v = sliders[s.key]
            return (
              <div key={s.key}>
                <label className="flex items-baseline justify-between text-sm text-cream" htmlFor={`sl-${s.key}`}>
                  {s.label}
                  <span className="text-xs text-cream/70">{Math.abs(v) < 0.05 ? 'unchanged' : v < 0 ? s.low : s.high}</span>
                </label>
                <input id={`sl-${s.key}`} type="range" min={s.min} max={s.max} step={0.1} value={v} onChange={(e) => onSliders({ ...sliders, [s.key]: Number(e.target.value) })} className="w-full accent-[#c4964a]" aria-valuetext={Math.abs(v) < 0.05 ? 'unchanged' : v < 0 ? s.low : s.high} />
                <div className="flex justify-between text-[11px] text-cream/70" aria-hidden>
                  <span>{s.min < 0 ? s.low : 'unchanged'}</span>
                  <span>{s.high}</span>
                </div>
              </div>
            )
          })}
        </div>
        {changed && (
          <button type="button" className="mt-2 text-sm text-brass-400 underline" onClick={() => onSliders({ sweet: 0, fresh: 0, projection: 0, longevity: 0, drydown: 0, unusual: 0 })}>
            Reset the sliders
          </button>
        )}
      </fieldset>

      {last && last.seeds.length > 0 && (
        <div aria-live="polite" className="rounded-lg border border-ink-600 bg-ink-900 p-3 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wider text-cream/70">What I am looking for</div>
          <p className="text-cream/90">
            {last.after.slice(0, 6).map((a) => a.name).join(', ') || 'No accords listed for these.'}
            {changed && last.before.length > 0 && <span className="text-cream/70"> (before the sliders: {last.before.slice(0, 6).map((a) => a.name).join(', ')})</span>}
          </p>
          {last.changes.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-cream/80">
              {last.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
