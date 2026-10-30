import { useCallback, useEffect, useState } from 'react'
import type { RatingSuggestion } from '@shared/rating'
import RatingPicker from './RatingPicker'

/**
 * A gentle, dismissible strip on My Collection: a few fragrances whose rating may no longer be right (rated low but worn
 * a lot, rated high but untouched, never rated, or rated long ago). It is a suggestion, never a popup.
 */
export default function RatingSuggestions({ version, onChanged, say }: { version: number; onChanged: () => void; say: (m: string) => void }) {
  const [items, setItems] = useState<RatingSuggestion[]>([])
  const [open, setOpen] = useState(true)

  const load = useCallback(async () => setItems(await window.api.ratings.suggestions()), [])
  useEffect(() => {
    void load()
  }, [load, version])

  if (items.length === 0) return null
  const rate = async (id: number, v: number | null) => {
    const r = await window.api.wardrobe.setRating(id, v, 'detail')
    if (!r.ok) return say(r.message)
    onChanged()
    void load()
  }
  const dismiss = async (id: number) => {
    await window.api.ratings.dismiss(id)
    void load()
  }

  return (
    <section aria-label="Rating suggestions" className="mb-3 rounded-lg border border-brass-500/30 bg-brass-500/5 px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-cream/90">Does your taste still match your ratings?</div>
        <button className="text-xs text-cream/60 underline hover:text-cream" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Hide' : `Show ${items.length}`}
        </button>
      </div>
      {open && (
        <ul className="mt-2 space-y-2">
          {items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{s.name}</span> <span className="text-cream/50">{s.house}</span>
                <div className="text-xs text-cream/65">{s.reason}</div>
              </div>
              <RatingPicker value={s.rating} onChange={(v) => void rate(s.id, v)} size="sm" label={`Rate ${s.name}`} />
              <button className="text-xs text-cream/60 underline hover:text-cream" onClick={() => void dismiss(s.id)} title="Hide this suggestion for 3 months">
                Not now
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
