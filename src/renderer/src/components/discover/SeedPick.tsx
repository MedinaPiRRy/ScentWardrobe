import { useEffect, useId, useState } from 'react'
import type { SeedRef } from '@shared/discover/dto'
import type { FragranceSummary, LocalHit } from '@shared/types'
import { WARDROBE_LABEL } from '../../lib/shelf'
import type { SeedChoice } from './SimilarPanel'

/** Choose one fragrance: one of mine from a list, or anything in my library or the dataset by searching. */
export default function SeedPick({ label, value, onChange, wardrobes }: { label: string; value: SeedChoice | null; onChange: (s: SeedChoice | null) => void; wardrobes?: FragranceSummary['wardrobe'][] }) {
  const id = useId()
  const [mineList, setMineList] = useState<FragranceSummary[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LocalHit[]>([])
  useEffect(() => {
    void window.api.fragrances.list().then(setMineList)
  }, [])
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

  const pick = (ref: SeedRef, name: string, house: string) => {
    onChange({ ref, name, house })
    setQuery('')
    setHits([])
  }
  const options = mineList.filter((f) => f.wardrobe && (!wardrobes || wardrobes.includes(f.wardrobe)))
  const groups = [...new Set(options.map((f) => f.wardrobe!))]
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-cream/70" id={`${id}-l`}>
        {label}
      </div>
      {value && (
        <span className="inline-flex items-center gap-1 rounded-full border border-brass-500/50 bg-brass-500/15 py-0.5 pl-2.5 pr-1 text-sm text-cream">
          {value.name} <span className="text-cream/70">{value.house}</span>
          <button type="button" className="rounded-full px-1.5 text-cream/70 hover:bg-ink-700 hover:text-cream" aria-label={`Clear ${value.name}`} onClick={() => onChange(null)}>
            ×
          </button>
        </span>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-mine`} className="mb-1 block text-xs text-cream/70">
            One of mine
          </label>
          <select
            id={`${id}-mine`}
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream"
            value=""
            onChange={(e) => {
              const f = mineList.find((x) => x.id === Number(e.target.value))
              if (f) pick({ fragranceId: f.id }, f.name, f.house)
            }}
          >
            <option value="">Choose from my library…</option>
            {groups.map((g) => (
              <optgroup key={g} label={WARDROBE_LABEL[g]}>
                {options
                  .filter((f) => f.wardrobe === g)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} · {f.house}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="relative">
          <label htmlFor={`${id}-search`} className="mb-1 block text-xs text-cream/70">
            Or search my library and the dataset
          </label>
          <input
            id={`${id}-search`}
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls={`${id}-hits`}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a name"
            className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream placeholder:text-cream/60"
          />
          {hits.length > 0 && (
            <ul id={`${id}-hits`} role="listbox" aria-label="Matches" className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded border border-ink-600 bg-ink-800 py-1 shadow-xl">
              {hits.map((h) => (
                <li key={`${h.source}${h.id}`} role="option" aria-selected={false}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-cream hover:bg-ink-600" onClick={() => pick(h.source === 'dataset' ? { catalogId: h.id } : { fragranceId: h.id }, h.name, h.house)}>
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
  )
}
