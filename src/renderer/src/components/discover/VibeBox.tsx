import { useId, useMemo, useState } from 'react'
import type { Brief } from '@shared/discover/brief'
import { chipLabel, chipsToBrief, interpretVibe, type Chip, type ChipKind } from '@shared/discover/vibes'
import { ghostBtn, primaryBtn } from '../Dialogs'

export const chipKey = (c: Chip) => `${c.kind}:${c.value}`

/** The chips (what the words were understood as), each removable, and a box to add one by hand. */
export function ChipList({ chips, onRemove, onAdd, label }: { chips: Chip[]; onRemove: (c: Chip) => void; onAdd?: (c: Chip) => void; label: string }) {
  const id = useId()
  const [kind, setKind] = useState<ChipKind>('accord')
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim().toLowerCase()
    if (t && onAdd) onAdd({ kind, value: t, from: 'added by me' })
    setText('')
  }
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wider text-cream/70">{label}</div>
      {chips.length === 0 ? (
        <p className="text-sm text-cream/70">Nothing yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={chipKey(c)} className="inline-flex items-center gap-1 rounded-full border border-brass-500/50 bg-brass-500/15 py-0.5 pl-2.5 pr-1 text-sm text-cream" title={`from "${c.from}"`}>
              {chipLabel(c)}
              <span className="text-xs text-cream/70">from “{c.from}”</span>
              <button type="button" className="rounded-full px-1.5 text-cream/70 hover:bg-ink-700 hover:text-cream" aria-label={`Remove ${chipLabel(c)}`} onClick={() => onRemove(c)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Kind of chip to add" value={kind} onChange={(e) => setKind(e.target.value as ChipKind)} className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream">
            <option value="accord">accord</option>
            <option value="avoidAccord">no accord</option>
            <option value="note">note</option>
            <option value="avoidNote">no note</option>
          </select>
          <label htmlFor={`${id}-add`} className="sr-only">
            Word to add
          </label>
          <input
            id={`${id}-add`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="add one"
            className="rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream placeholder:text-cream/60"
          />
          <button type="button" className={ghostBtn} onClick={add}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}

/** "Describe a feeling": free words are read with the hand-written vocabulary and shown as chips before anything is searched. */
export default function VibeBox({ brief, onBrief }: { brief: Brief; onBrief: (b: Brief) => void }) {
  const id = useId()
  const [text, setText] = useState('')
  const [removed, setRemoved] = useState<string[]>([])
  const [extra, setExtra] = useState<Chip[]>([])
  const read = useMemo(() => interpretVibe(text), [text])
  const chips = [...read.chips.filter((c) => !removed.includes(chipKey(c))), ...extra]
  const [applied, setApplied] = useState(false)

  return (
    <section className="space-y-3 rounded-lg border border-ink-600 p-3" aria-label="Describe a feeling">
      <div>
        <label htmlFor={`${id}-text`} className="mb-1 block text-sm text-brass-400">
          Describe a feeling, a place or a memory
        </label>
        <textarea
          id={`${id}-text`}
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setRemoved([])
            setApplied(false)
          }}
          placeholder="e.g. fresh soap on a summer morning, not too sweet"
          className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream placeholder:text-cream/60"
        />
        <p className="mt-1 text-xs text-cream/70">The app reads your words with a list written by hand. Words it does not know are shown, never guessed. Nothing is searched until you press the button.</p>
      </div>
      {text.trim() !== '' && (
        <div className="space-y-3" aria-live="polite">
          <ChipList label="I read it as" chips={chips} onRemove={(c) => (extra.some((x) => chipKey(x) === chipKey(c)) ? setExtra(extra.filter((x) => chipKey(x) !== chipKey(c))) : setRemoved([...removed, chipKey(c)]))} onAdd={(c) => setExtra([...extra.filter((x) => chipKey(x) !== chipKey(c)), c])} />
          {read.unknown.length > 0 && <p className="text-sm text-amber-300">Not understood, so left out: {read.unknown.join(', ')}.</p>}
          {read.notes.map((n) => (
            <p key={n} className="text-sm text-amber-300">
              {n}
            </p>
          ))}
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={primaryBtn}
              disabled={chips.length === 0}
              onClick={() => {
                onBrief(chipsToBrief(chips, brief))
                setApplied(true)
              }}
            >
              Use these in the brief
            </button>
            {applied && <span className="text-sm text-cream/80" role="status">Added to the brief below.</span>}
          </div>
        </div>
      )}
    </section>
  )
}
