import { useState } from 'react'
import type { TasteResult } from '@shared/discover/dto'
import type { Override, TasteEntry } from '@shared/discover/taste'

const btn = 'rounded px-1.5 py-0.5 text-xs'

function Row({ e, kind, onSet }: { e: TasteEntry; kind: 'accord' | 'note'; onSet: (kind: 'accord' | 'note', name: string, v: Override | null) => void }) {
  const toggle = (v: Override) => onSet(kind, e.name, e.override === v ? null : v)
  const pressed = (v: Override) => e.override === v
  const on = 'bg-brass-500 text-[#17110b]'
  const off = 'border border-ink-600 text-cream/80 hover:bg-ink-700'
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 truncate text-cream" title={e.name}>
        {e.name}
      </span>
      <span className="relative h-2 w-16 shrink-0 overflow-hidden rounded bg-ink-900" aria-hidden>
        <span className="absolute inset-y-0 left-0 bg-brass-500" style={{ width: `${Math.round(e.weight * 100)}%` }} />
      </span>
      <span className="w-20 shrink-0 text-xs text-cream/70">{e.weight > 0 ? `likes ${Math.round(e.weight * 100)}%` : e.negative > 0 ? `dislikes ${Math.round(e.negative * 100)}%` : 'edited'}</span>
      <button type="button" className={`${btn} ${pressed('love') ? on : off}`} aria-pressed={pressed('love')} aria-label={`More ${e.name}`} title="Want more of this" onClick={() => toggle('love')}>
        More
      </button>
      <button type="button" className={`${btn} ${pressed('mute') ? on : off}`} aria-pressed={pressed('mute')} aria-label={`Ignore ${e.name}`} title="Do not let my library push this" onClick={() => toggle('mute')}>
        Ignore
      </button>
      <button type="button" className={`${btn} ${pressed('avoid') ? on : off}`} aria-pressed={pressed('avoid')} aria-label={`Avoid ${e.name}`} title="Mark down anything with this" onClick={() => toggle('avoid')}>
        Avoid
      </button>
    </li>
  )
}

/** My taste profile in plain words and as editable accord and note lists. */
export default function TastePanel({ data, onSet }: { data: TasteResult | null; onSet: (kind: 'accord' | 'note', name: string, v: Override | null) => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'accord' | 'note'>('accord')
  const [text, setText] = useState('')
  if (!data) return null
  const { taste } = data
  // The strongest twelve, plus everything I edited (so an edit never disappears from the list).
  const shown = (list: TasteEntry[]): TasteEntry[] => {
    const pool = list.filter((a) => a.weight > 0 || a.negative >= 0.1 || a.override)
    const top = pool.slice(0, 12)
    return [...top, ...pool.filter((a) => a.override && !top.includes(a))]
  }
  const accords = shown(taste.accords)
  const notes = shown(taste.notes)
  return (
    <section className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="My taste profile">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg text-brass-400">My taste</h2>
          <p className="mt-1 text-sm text-cream/90">{taste.summary}</p>
          {taste.anchors.length > 0 && <p className="mt-1 text-xs text-cream/70">Shaped most by: {taste.anchors.map((a) => a.name).join(', ')}.</p>}
        </div>
        <button type="button" className="rounded-md border border-ink-600 px-3 py-1.5 text-sm text-cream hover:bg-ink-700" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide details' : 'Edit my taste'}
        </button>
      </div>
      {open && (
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-cream/70">Accords</h3>
            <ul className="space-y-1.5">
              {accords.map((a) => (
                <Row key={a.name} e={a} kind="accord" onSet={onSet} />
              ))}
              {accords.length === 0 && <li className="text-sm text-cream/70">Nothing yet.</li>}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs uppercase tracking-wider text-cream/70">Notes</h3>
            <ul className="space-y-1.5">
              {notes.map((a) => (
                <Row key={a.name} e={a} kind="note" onSet={onSet} />
              ))}
              {notes.length === 0 && <li className="text-sm text-cream/70">Your fragrances have no notes entered yet, so only accords count.</li>}
            </ul>
          </div>
          <form
            className="flex flex-wrap items-center gap-2 md:col-span-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) onSet(kind, text, 'love')
              setText('')
            }}
          >
            <label className="text-sm text-cream/80" htmlFor="taste-add">
              Add something I like that my library does not show:
            </label>
            <select aria-label="Accord or note" value={kind} onChange={(e) => setKind(e.target.value as 'accord' | 'note')} className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream">
              <option value="accord">accord</option>
              <option value="note">note</option>
            </select>
            <input id="taste-add" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. oud" className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream placeholder:text-cream/60" />
            <button type="submit" className="rounded-md border border-ink-600 px-3 py-1 text-sm text-cream hover:bg-ink-700">
              Add
            </button>
          </form>
        </div>
      )}
    </section>
  )
}
