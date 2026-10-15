import { useEffect, useMemo, useRef, useState } from 'react'
import { buildAffinity, defaultAffinity, overridesFrom, pairKey, ruleReason, SAME_ACCORD_AFFINITY, type AffinityMatrix } from '@shared/layering'
import { ghostBtn, primaryBtn } from './Dialogs'

const SETTING = 'layering.affinity'
const field = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'

const label = (v: number) => (v >= 0.6 ? 'works great' : v >= 0.25 ? 'works well' : v > -0.25 ? 'neutral' : v > -0.6 ? 'tends to clash' : 'clashes')
const color = (v: number) => (v > 0.1 ? '#7fd18f' : v < -0.1 ? '#e07a6a' : '#9a9082')

/** Edit how well accords sit together. Changes save as you go and feed the Layering Lab and the recommendations. */
export default function AffinityEditor() {
  const defaults = useMemo(defaultAffinity, [])
  const [matrix, setMatrix] = useState<AffinityMatrix>(defaults)
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [v, setV] = useState(0.4)
  const [accords, setAccords] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    void (async () => {
      try {
        const raw = await window.api.settings.get(SETTING)
        if (raw) setMatrix(buildAffinity(JSON.parse(raw) as AffinityMatrix))
      } catch {
        /* a broken stored value falls back to the defaults */
      }
      setAccords((await window.api.catalog.accords()).map((x) => x.name))
      setLoaded(true)
    })()
  }, [])

  const persist = (next: AffinityMatrix) => {
    setMatrix(next)
    setSaved(false)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      const r = await window.api.settings.set(SETTING, JSON.stringify(overridesFrom(next)))
      if (r.ok) setSaved(true)
      else setError(r.message)
    }, 350)
  }

  const rows = useMemo(() => {
    const f = filter.trim().toLowerCase()
    return Object.entries(matrix)
      .map(([k, value]) => {
        const [x, y] = k.split('|')
        return { k, x, y, value, isDefault: k in defaults, changed: defaults[k] !== value }
      })
      .filter((r) => !f || r.x.includes(f) || r.y.includes(f))
      .sort((p, q) => p.x.localeCompare(q.x) || p.y.localeCompare(q.y))
  }, [matrix, filter, defaults])

  const changedCount = Object.keys(overridesFrom(matrix)).length

  const add = () => {
    const x = a.trim().toLowerCase()
    const y = b.trim().toLowerCase()
    if (!x || !y) return setError('Enter two accords.')
    setError(null)
    persist({ ...matrix, [pairKey(x, y)]: Math.round(v * 100) / 100 })
    setA('')
    setB('')
  }

  if (!loaded) return <p className="text-sm text-cream/50">Loading…</p>

  return (
    <div>
      <datalist id="affinity-accords">
        {accords.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <p className="text-sm text-cream/65">
        Each pair is rated from −1 (clash) to +1 (works great). The Layering Lab and the daily recommendations use these numbers. Accords that are not listed are neutral, and the same accord on both sides counts as +{SAME_ACCORD_AFFINITY}.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by accord…" className={`${field} w-56`} aria-label="Filter accord pairs" />
        <span className="text-xs text-cream/50">
          {rows.length} pairs · {changedCount} changed {saved && changedCount >= 0 && <span className="text-emerald-300">· saved</span>}
        </span>
        <button
          className={`${ghostBtn} ml-auto`}
          disabled={changedCount === 0}
          onClick={() => {
            if (window.confirm('Reset every pair to the built-in values? Your own pairs are removed.')) persist(defaultAffinity())
          }}
        >
          Reset all
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-ink-600 bg-ink-900/60 p-3">
        <label className="text-xs text-cream/60">
          Accord
          <input list="affinity-accords" value={a} onChange={(e) => setA(e.target.value)} className={`${field} mt-1 block w-40`} />
        </label>
        <label className="text-xs text-cream/60">
          with
          <input list="affinity-accords" value={b} onChange={(e) => setB(e.target.value)} className={`${field} mt-1 block w-40`} />
        </label>
        <label className="text-xs text-cream/60">
          Affinity <span style={{ color: color(v) }}>{v.toFixed(2)}</span>
          <input type="range" min={-1} max={1} step={0.05} value={v} onChange={(e) => setV(+e.target.value)} className="mt-2 block w-40 accent-[#c4964a]" />
        </label>
        <button className={primaryBtn} onClick={add}>
          Add or change pair
        </button>
        {error && <span className="text-sm text-red-300">{error}</span>}
      </div>

      <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-lg border border-ink-600">
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-cream/50">No pairs match.</p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {rows.map((r) => (
              <li key={r.k} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <div className="w-52 shrink-0">
                  <span className="capitalize">{r.x}</span> <span className="text-cream/40">+</span> <span className="capitalize">{r.y}</span>
                  {!r.isDefault && <span className="ml-2 rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase text-cream/70">mine</span>}
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.05}
                  value={r.value}
                  onChange={(e) => persist({ ...matrix, [r.k]: +e.target.value })}
                  className="flex-1 accent-[#c4964a]"
                  aria-label={`Affinity of ${r.x} with ${r.y}`}
                />
                <span className="w-12 text-right tabular-nums" style={{ color: color(r.value) }}>
                  {r.value > 0 ? '+' : ''}
                  {r.value.toFixed(2)}
                </span>
                <span className="hidden w-28 shrink-0 truncate text-xs text-cream/45 lg:block" title={ruleReason(r.x, r.y)}>
                  {label(r.value)}
                </span>
                <span className="w-16 shrink-0 text-right text-xs">
                  {r.isDefault && r.changed && (
                    <button className="text-cream/50 underline hover:text-cream" onClick={() => persist({ ...matrix, [r.k]: defaults[r.k] })}>
                      reset
                    </button>
                  )}
                  {!r.isDefault && (
                    <button
                      className="text-cream/50 underline hover:text-red-300"
                      onClick={() => {
                        const next = { ...matrix }
                        delete next[r.k]
                        persist(next)
                      }}
                    >
                      remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
