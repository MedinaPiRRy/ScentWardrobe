import { useEffect, useMemo, useState } from 'react'
import type { FragranceInput, FragranceSummary, LocalHit, SavedCombo, WearEntry } from '@shared/types'
import BottleSvg from './BottleSvg'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'
import { WARDROBE_LABEL } from '../lib/shelf'
import { PROJECTION_LABELS } from '../lib/performance'
import { dateKeyOf } from '../lib/calendar'

export type LogTarget = { fragranceId: number } | { comboId: number; title: string; sprays: number }

interface Props {
  date: string
  wears: WearEntry[]
  fragrances: Map<number, FragranceSummary>
  combos: SavedCombo[]
  onClose: () => void
  onChanged: () => void
  onLog: (target: LogTarget) => void
  onEdit: (entry: WearEntry) => void
  say: (m: string) => void
}

const longDate = (d: string) => new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function DayPanel({ date, wears, fragrances, combos, onClose, onChanged, onLog, onEdit, say }: Props) {
  const [pick, setPick] = useState('')
  const [confirm, setConfirm] = useState<number | null>(null)

  // Everything I can log a wear of: what I own first, then what I used to own, then the rest. Garbage is left out.
  const groups = useMemo(() => {
    const all = [...fragrances.values()].sort((a, b) => a.house.localeCompare(b.house) || a.name.localeCompare(b.name))
    const by = (w: FragranceSummary['wardrobe'][]) => all.filter((f) => w.includes(f.wardrobe))
    return [
      { label: WARDROBE_LABEL.collection, items: by(['collection']) },
      { label: WARDROBE_LABEL.had, items: by(['had']) },
      { label: 'Wishlist and To Try', items: by(['wishlist', 'to_try']) },
      { label: 'Not mine', items: all.filter((f) => f.isForeign) }
    ].filter((g) => g.items.length > 0)
  }, [fragrances])

  const start = () => {
    if (!pick) return
    if (pick.startsWith('c')) {
      const c = combos.find((x) => x.id === Number(pick.slice(1)))
      if (c) onLog({ comboId: c.id, title: c.items.map((i) => i.name).join(' + '), sprays: c.items.reduce((s, i) => s + i.sprays, 0) })
    } else onLog({ fragranceId: Number(pick.slice(1)) })
  }

  const remove = async (w: WearEntry) => {
    setConfirm(null)
    const r = await window.api.wears.delete(w.id)
    if (!r.ok) say(r.message)
    onChanged()
  }

  const todayKey = dateKeyOf(new Date())
  const isFuture = date > todayKey
  const isPast = date < todayKey

  return (
    <Modal title={longDate(date)} onClose={onClose} wide>
      {wears.length === 0 ? (
        <p className="text-sm text-cream/55">{isFuture ? 'Nothing here yet.' : 'No wears on this day.'}</p>
      ) : (
        <ul className="space-y-2">
          {wears.map((w) => (
            <li key={w.id} className="rounded-lg border border-ink-600 bg-ink-900/60 p-3">
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 items-end gap-1">
                  {w.memberIds.slice(0, 3).map((id) => {
                    const f = fragrances.get(id)
                    return (
                      <div key={id} className="flex h-14 w-9 items-end justify-center" title={f?.name}>
                        {f ? <BottleSvg fragrance={f} showLevel={false} fixedHeight={52} /> : <span className="text-cream/30">?</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{w.title}</span>
                    {w.memberIds.some((id) => fragrances.get(id)?.isForeign) && <span className="rounded border border-cream/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cream/70">not mine</span>}
                    {w.backfilled && <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cream/70">diary entry</span>}
                  </div>
                  <div className="text-xs text-cream/55">
                    {w.wornAt.slice(11, 16)} · {w.sprays} spray{w.sprays === 1 ? '' : 's'}
                    {w.activity && ` · ${w.activity}`}
                    {w.weather && ` · ${w.temperatureC != null ? `${w.temperatureC}°C ` : ''}${w.weather}`}
                  </div>
                  <div className="text-xs text-cream/45">
                    {[w.projection != null && PROJECTION_LABELS[w.projection], w.longevityHours != null && `${w.longevityHours} h`, w.compliments > 0 && `${w.compliments} compliment${w.compliments === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}
                  </div>
                  {w.notes && <div className="mt-1 text-xs italic text-cream/70">{w.notes}</div>}
                </div>
                <div className="flex shrink-0 gap-3 text-xs text-cream/55">
                  {confirm === w.id ? (
                    <>
                      Delete?
                      <button className="text-red-300 underline" onClick={() => void remove(w)}>
                        Yes
                      </button>
                      <button className="underline" onClick={() => setConfirm(null)}>
                        No
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="underline hover:text-cream" onClick={() => onEdit(w)}>
                        Edit
                      </button>
                      <button className="underline hover:text-cream" onClick={() => setConfirm(w.id)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-ink-600 pt-4">
        <div className="mb-1 text-sm text-cream/80">Log a wear on this day</div>
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="What did you wear?" className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-2 text-sm text-cream">
            <option value="">What did you wear?</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((f) => (
                  <option key={f.id} value={`f${f.id}`}>
                    {f.name} · {f.house}
                  </option>
                ))}
              </optgroup>
            ))}
            {combos.length > 0 && (
              <optgroup label="Blends">
                {combos.map((c) => (
                  <option key={c.id} value={`c${c.id}`}>
                    {c.items.map((i) => i.name).join(' + ')}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <button className={primaryBtn} disabled={!pick} onClick={start}>
            Log a wear
          </button>
        </div>
        <ForeignAdd
          onAdded={(id) => {
            onChanged()
            onLog({ fragranceId: id })
          }}
        />
        {isPast && (
          <p className="mt-1.5 text-xs text-cream/45">Past days are saved as diary entries. They use your usual spray count and leave bottle levels alone.</p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button className={ghostBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}

/** Adds a fragrance I wore but do not own. Typing a name suggests matches from my fragrances and the imported dataset. */
function ForeignAdd({ onAdded }: { onAdded: (id: number) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [house, setHouse] = useState('')
  const [hits, setHits] = useState<LocalHit[]>([])
  const [picked, setPicked] = useState<FragranceInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || picked || name.trim().length < 2) return setHits([])
    let live = true
    const t = window.setTimeout(() => void window.api.search.local(`${name} ${house}`).then((h) => live && setHits(h.slice(0, 5))), 200)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [open, name, house, picked])

  const choose = async (h: LocalHit) => {
    if (h.source === 'mine') return onAdded(h.id)
    const e = await window.api.search.datasetEntry(h.id)
    if (!e) return
    setPicked(e)
    setName(e.name)
    setHouse(e.house)
    setHits([])
  }

  const add = async () => {
    setBusy(true)
    setError(null)
    const input: FragranceInput = picked ?? { name: name.trim(), house: house.trim(), notes: [], accords: [] }
    const r = await window.api.fragrances.addForeign(input)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    onAdded(r.data.id)
  }

  if (!open) {
    return (
      <button className="mt-2 text-xs text-cream/60 underline hover:text-cream" onClick={() => setOpen(true)}>
        Wore something that is not yours? Add it
      </button>
    )
  }
  const field = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
  return (
    <div className="mt-3 rounded-lg border border-ink-600 bg-ink-900/50 p-3">
      <div className="mb-1.5 text-xs text-cream/60">A fragrance that is not in your wardrobes. It is saved marked "not mine" and kept out of your shelves and stats.</div>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => (setName(e.target.value), setPicked(null))} placeholder="Name" aria-label="Fragrance name" className={`${field} min-w-0 flex-1`} />
        <input value={house} onChange={(e) => (setHouse(e.target.value), setPicked(null))} placeholder="House" aria-label="House" className={`${field} min-w-0 flex-1`} />
        <button className={primaryBtn} disabled={busy || !name.trim() || !house.trim()} onClick={() => void add()}>
          Add and log
        </button>
      </div>
      {hits.length > 0 && (
        <div className="mt-1.5 overflow-hidden rounded border border-ink-600">
          {hits.map((h) => (
            <button key={`${h.source}${h.id}`} onClick={() => void choose(h)} className="flex w-full justify-between gap-2 border-b border-ink-700 px-2 py-1 text-left text-xs last:border-0 hover:bg-ink-700">
              <span>
                {h.name} <span className="text-cream/50">{h.house}</span>
              </span>
              <span className="text-cream/45">{h.source === 'mine' ? 'already in the app' : 'from the dataset'}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-red-300">{error}</p>}
    </div>
  )
}
