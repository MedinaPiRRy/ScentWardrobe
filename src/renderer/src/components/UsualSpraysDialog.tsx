import { useEffect, useMemo, useState } from 'react'
import type { FragranceSummary } from '@shared/types'
import BottleSvg from './BottleSvg'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

/**
 * One list for all the fragrances I own (and the ones I used to), with a number to fill in for each: how many sprays
 * I usually use. It becomes the default in the wear form and the number used for backfilled wears.
 */
export default function UsualSpraysDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<FragranceSummary[]>([])
  const [values, setValues] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [onlyMissing, setOnlyMissing] = useState(false)

  useEffect(() => {
    void window.api.fragrances.list().then((all) => {
      const mine = all.filter((f) => f.wardrobe === 'collection' || f.wardrobe === 'had')
      setRows(mine)
      setValues(Object.fromEntries(mine.map((f) => [f.id, f.defaultSprays != null ? String(f.defaultSprays) : ''])))
    })
  }, [])

  const missing = useMemo(() => rows.filter((f) => !values[f.id]?.trim()).length, [rows, values])
  const shown = rows.filter((f) => !onlyMissing || !values[f.id]?.trim())

  const fillRest = (n: number) => setValues((v) => Object.fromEntries(rows.map((f) => [f.id, v[f.id]?.trim() ? v[f.id] : String(n)])))

  const save = async () => {
    const entries: { fragranceId: number; sprays: number | null }[] = []
    for (const f of rows) {
      const raw = (values[f.id] ?? '').trim()
      const n = raw === '' ? null : Number(raw)
      if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 60)) return setError(`${f.name}: use a whole number from 1 to 60, or leave it empty.`)
      if (n !== f.defaultSprays) entries.push({ fragranceId: f.id, sprays: n })
    }
    const r = await window.api.fragrances.setDefaultSprays(entries)
    if (!r.ok) return setError(r.message)
    onSaved()
  }

  return (
    <Modal title="Usual sprays" onClose={onClose} wide>
      <p className="text-sm text-cream/70">How many sprays do you usually use of each? Fill in a number once per fragrance. It is the default when you log a wear, and the number used for wears you add for past days.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cream/60">
        <span>{missing === 0 ? 'Every fragrance has a number.' : `${missing} still empty.`}</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Show only the empty ones
        </label>
        {missing > 0 && (
          <span className="ml-auto flex items-center gap-1.5">
            Fill the empty ones with
            {[2, 3, 4, 5].map((n) => (
              <button key={n} className="rounded border border-ink-600 px-2 py-0.5 hover:bg-ink-700" onClick={() => fillRest(n)}>
                {n}
              </button>
            ))}
          </span>
        )}
      </div>

      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-lg border border-ink-600">
        {shown.length === 0 ? (
          <p className="p-4 text-sm text-cream/50">{rows.length === 0 ? 'Nothing in My Collection or Had yet.' : 'All filled in.'}</p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {shown.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-3 py-1.5">
                <div className="flex h-10 w-8 shrink-0 items-end justify-center">
                  <BottleSvg fragrance={f} showLevel={false} fixedHeight={38} />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate">{f.name}</div>
                  <div className="truncate text-xs text-cream/45">
                    {f.house}
                    {f.wardrobe === 'had' && ' · Had'}
                  </div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                  aria-label={`Usual sprays of ${f.name}`}
                  placeholder="–"
                  className="w-20 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-center text-sm text-cream"
                />
                <span className="w-12 text-xs text-cream/40">sprays</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button className={ghostBtn} onClick={onClose}>
          Cancel
        </button>
        <button className={primaryBtn} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  )
}
