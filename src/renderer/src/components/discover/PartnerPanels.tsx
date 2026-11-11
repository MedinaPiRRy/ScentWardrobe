import { useEffect, useRef, useState } from 'react'
import type { BudgetResults, DupesResults, LayeringResults } from '@shared/discover/dto'
import { useCurrency } from '../../lib/money'
import CardGrid, { type CardActions } from './CardGrid'
import SeedPick from './SeedPick'
import type { SeedChoice } from './SimilarPanel'

const box = 'rounded-xl border border-ink-600 bg-ink-800 p-4'

/** Layering partners for one fragrance, from the Layering Lab's own engine. */
export function LayeringPanel({ actions, seed, onSeed, rev }: { actions: CardActions; seed: SeedChoice | null; onSeed: (s: SeedChoice | null) => void; rev: number }) {
  const [res, setRes] = useState<LayeringResults | null>(null)
  const [loading, setLoading] = useState(false)
  const token = useRef(0)
  useEffect(() => {
    if (!seed) return setRes(null)
    const mine = ++token.current
    setLoading(true)
    void window.api.discover
      .layering({ seed: seed.ref, limit: 12 })
      .then((r) => token.current === mine && setRes(r))
      .finally(() => token.current === mine && setLoading(false))
  }, [seed, rev])
  return (
    <div className="space-y-4">
      <section className={box}>
        <SeedPick label="Find partners for" value={seed} onChange={onSeed} />
        <p className="mt-2 text-xs text-cream/70">Pairs are scored by the Layering Lab (accord affinities, notes, overlap, season and the blends you rated). Your ratings only change the order, never a pair score. Partners you own open together in the Layering Lab.</p>
      </section>
      <section aria-busy={loading} aria-label="Partners">
        {!seed && <p className="text-sm text-cream/85">Pick a fragrance, from your library or the dataset, to see what to layer it with.</p>}
        {loading && !res && <p className="text-sm text-cream/80" role="status">Looking…</p>}
        {res?.message && res.cards.length === 0 && <p className="text-sm text-cream/85">{res.message}</p>}
        {res && res.cards.length > 0 && <p className="mb-2 text-sm text-cream/80" role="status">{res.cards.length} partner{res.cards.length === 1 ? '' : 's'} for {res.base?.name}</p>}
        {res && <CardGrid cards={res.cards} actions={actions} />}
      </section>
    </div>
  )
}

/** Alternatives to one fragrance, with the "smells like" votes and any value information shown. */
export function DupesPanel({ actions, seed, onSeed, rev }: { actions: CardActions; seed: SeedChoice | null; onSeed: (s: SeedChoice | null) => void; rev: number }) {
  const [res, setRes] = useState<DupesResults | null>(null)
  const [cheaper, setCheaper] = useState(false)
  const [loading, setLoading] = useState(false)
  const token = useRef(0)
  useEffect(() => {
    if (!seed) return setRes(null)
    const mine = ++token.current
    setLoading(true)
    void window.api.discover
      .dupes({ seed: seed.ref, filters: { limit: 12 }, cheaperOnly: cheaper })
      .then((r) => token.current === mine && setRes(r))
      .finally(() => token.current === mine && setLoading(false))
  }, [seed, cheaper, rev])
  return (
    <div className="space-y-4">
      <section className={box}>
        <SeedPick label="Find alternatives to" value={seed} onChange={onSeed} />
        <p className="mt-2 text-xs text-cream/70">Includes fragrances you used to have: pick one from Had to look for a replacement. Needs the imported dataset.</p>
        <label className="mt-2 flex items-center gap-2 text-sm text-cream">
          <input type="checkbox" className="accent-[#c4964a]" checked={cheaper} onChange={(e) => setCheaper(e.target.checked)} />
          Only ones that are cheaper per ml according to prices I entered
        </label>
      </section>
      <section aria-busy={loading} aria-label="Alternatives">
        {!seed && <p className="text-sm text-cream/85">Pick a fragrance to see alternatives, with the votes behind each.</p>}
        {loading && !res && <p className="text-sm text-cream/80" role="status">Looking…</p>}
        {res && res.notes.length > 0 && (
          <ul className={`${box} mb-3 list-disc space-y-1 pl-9 text-sm text-cream/85`} aria-label="Notes">
            {res.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {res?.message && res.cards.length === 0 && <p className="text-sm text-cream/85">{res.message}</p>}
        {res && <CardGrid cards={res.cards} actions={actions} />}
      </section>
    </div>
  )
}

const SIZES = [30, 50, 75, 100, 125, 200]

/** A budget against my own price per ml, and samples to try before buying. */
export function BudgetPanel({ actions, rev }: { actions: CardActions; rev: number }) {
  const currency = useCurrency()
  const [budget, setBudget] = useState('')
  const [size, setSize] = useState(100)
  const [res, setRes] = useState<BudgetResults | null>(null)
  const token = useRef(0)
  useEffect(() => {
    const mine = ++token.current
    const b = Number(budget.replace(',', '.'))
    void window.api.discover.budget({ budget: Number.isFinite(b) && b > 0 ? b : 0, sizeMl: size }).then((r) => token.current === mine && setRes(r))
  }, [budget, size, rev])
  const hasBudget = Number(budget.replace(',', '.')) > 0
  return (
    <div className="space-y-4">
      <section className={box}>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="bud-amount" className="mb-1 block text-xs uppercase tracking-wider text-cream/70">
              Budget ({currency})
            </label>
            <input id="bud-amount" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 150" className="w-32 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream placeholder:text-cream/60" />
          </div>
          <div>
            <label htmlFor="bud-size" className="mb-1 block text-xs uppercase tracking-wider text-cream/70">
              Bottle size
            </label>
            <select id="bud-size" value={size} onChange={(e) => setSize(Number(e.target.value))} className="rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream">
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} ml
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-cream/70">The app has no prices for fragrances you do not own. This compares your budget with what bottles of this size have cost you per ml, so it is a guide to your own spending, not the price of any fragrance.</p>
      </section>

      {res && (
        <section className={box} aria-label="What bottles cost you" role="status">
          {res.estimate ? (
            <>
              <p className="text-sm text-cream/90">
                From {res.reference.n} bottle{res.reference.n === 1 ? '' : 's'} (
                {res.reference.basis === 'paid' ? 'what you paid' : 'market prices you entered'}): about <strong>{currency} {res.estimate.mid.toFixed(0)}</strong> for {res.estimate.sizeMl} ml
                {res.estimate.low !== res.estimate.high && (
                  <>
                    , usually between {currency} {res.estimate.low.toFixed(0)} and {currency} {res.estimate.high.toFixed(0)}
                  </>
                )}
                .
              </p>
              {hasBudget && <p className="mt-1 text-sm text-cream/90">{res.verdict.text}</p>}
            </>
          ) : (
            <p className="text-sm text-cream/90">{res.verdict.text}</p>
          )}
        </section>
      )}

      <section aria-label="Try before you buy">
        <h3 className="mb-1 font-display text-lg text-cream">Try before you buy</h3>
        <p className="mb-2 text-xs text-cream/70">On your Wishlist or To Try list with no sample, decant or bottle yet, best match for your taste first.</p>
        {res?.message && res.trial.length === 0 && <p className="text-sm text-cream/85">{res.message}</p>}
        {res && <CardGrid cards={res.trial} actions={actions} />}
      </section>
    </div>
  )
}
