import { useState } from 'react'
import type { Bottle, BottleInput, BottleStatus, BottleType, FragranceDetail, HadReason } from '@shared/types'
import { bottleStats, formatMl, LOW_LEVEL_THRESHOLD } from '../../lib/bottles'
import { compareBottle, formatMoney, useCurrency } from '../../lib/money'
import { dateKeyOf } from '../../lib/calendar'
import { ghostBtn, Modal, primaryBtn, SizePicker } from '../Dialogs'

const TYPES: BottleType[] = ['full bottle', 'travel/mini', 'decant', 'sample']
const field = 'mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'

function BottleFormDialog({ bottle, onCancel, onSubmit, error, vial }: { bottle: Bottle | null; onCancel: () => void; onSubmit: (b: BottleInput) => void; error: string | null; vial: boolean }) {
  const [type, setType] = useState<BottleType>(bottle?.type ?? (vial ? 'sample' : 'full bottle'))
  const [size, setSize] = useState(String(bottle?.sizeMl ?? (vial ? 2 : 100)))
  const [remaining, setRemaining] = useState(bottle ? String(bottle.remainingMl) : '')
  const [perSpray, setPerSpray] = useState(String(bottle?.mlPerSpray ?? 0.1))
  const [price, setPrice] = useState(bottle?.price != null ? String(bottle.price) : '')
  const [boughtAt, setBoughtAt] = useState(bottle?.boughtAt ?? '')
  const [purchaseDate, setPurchaseDate] = useState(bottle?.purchaseDate ?? '')
  const [openedDate, setOpenedDate] = useState(bottle?.openedDate ?? '')
  const [batch, setBatch] = useState(bottle?.batchCode ?? '')
  const [status, setStatus] = useState<BottleStatus>(bottle?.status ?? 'active')
  const [market, setMarket] = useState(bottle?.marketPrice != null ? String(bottle.marketPrice) : '')
  const [marketOn, setMarketOn] = useState(bottle?.marketCheckedOn ?? '')
  const [marketSource, setMarketSource] = useState(bottle?.marketSource ?? '')
  const currency = useCurrency()
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const sizeMl = parseFloat(size)
    const rem = remaining.trim() === '' ? sizeMl : parseFloat(remaining)
    const mlPerSpray = parseFloat(perSpray)
    if (!(sizeMl > 0)) return setProblem('Enter a size greater than 0 ml.')
    if (!(rem >= 0 && rem <= sizeMl)) return setProblem('Remaining must be between 0 and the bottle size.')
    if (!(mlPerSpray > 0)) return setProblem('ml per spray must be greater than 0.')
    const marketPrice = market.trim() === '' ? null : parseFloat(market)
    if (marketPrice != null && !(marketPrice >= 0)) return setProblem('Enter a market price of 0 or more, or leave it blank.')
    setProblem(null)
    onSubmit({
      type, sizeMl, remainingMl: rem, mlPerSpray,
      price: price.trim() === '' ? null : parseFloat(price),
      boughtAt, purchaseDate, openedDate, batchCode: batch,
      marketPrice, marketCheckedOn: marketPrice == null ? null : marketOn || dateKeyOf(new Date()), marketSource: marketPrice == null ? null : marketSource,
      status: !bottle ? 'active' : status === 'active' && rem === 0 ? 'empty' : status === 'empty' && rem > 0 ? 'active' : status
    })
  }

  return (
    <Modal title={bottle ? 'Edit bottle' : 'Add a bottle'} onClose={onCancel} wide>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-cream/80">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as BottleType)} className={field}>
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          ml per spray
          <input type="number" step="any" min="0" value={perSpray} onChange={(e) => setPerSpray(e.target.value)} className={field} />
        </label>
        <div className="col-span-2">
          Size
          <div className="mt-1">
            <SizePicker value={size} onChange={setSize} />
          </div>
        </div>
        <label>
          Remaining (ml){!bottle && ' · blank = full'}
          <input type="number" step="any" min="0" value={remaining} onChange={(e) => setRemaining(e.target.value)} className={field} />
        </label>
        <label>
          Price paid ({currency}, optional)
          <input type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={field} />
        </label>
        <label>
          Where bought
          <input value={boughtAt} onChange={(e) => setBoughtAt(e.target.value)} className={field} />
        </label>
        {bottle && (
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as BottleStatus)} className={field}>
              <option value="active">In use</option>
              <option value="empty">Empty</option>
              <option value="sold/gifted">Sold or gifted</option>
            </select>
          </label>
        )}
        <label>
          Batch code
          <input value={batch} onChange={(e) => setBatch(e.target.value)} className={field} />
        </label>
        <label>
          Purchase date
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={field} />
        </label>
        <label>
          Opened date
          <input type="date" value={openedDate} onChange={(e) => setOpenedDate(e.target.value)} className={field} />
        </label>
        <fieldset className="col-span-2 rounded-lg border border-ink-600 p-3">
          <legend className="px-1 text-xs uppercase tracking-wide text-cream/55">Market price today (typed by hand)</legend>
          <div className="grid grid-cols-3 gap-3">
            <label>
              Price ({currency})
              <input type="number" step="any" min="0" value={market} onChange={(e) => setMarket(e.target.value)} className={field} />
            </label>
            <label>
              Checked on
              <input type="date" value={marketOn} onChange={(e) => setMarketOn(e.target.value)} className={field} disabled={market.trim() === ''} />
            </label>
            <label>
              Where I checked
              <input value={marketSource} onChange={(e) => setMarketSource(e.target.value)} className={field} disabled={market.trim() === ''} placeholder="shop or site" />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-cream/40">The app never looks prices up. Leave the date blank to use today.</p>
        </fieldset>
        {(problem || error) && (
          <p className="col-span-2 text-sm text-red-300" role="alert">
            {problem ?? error}
          </p>
        )}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn}>
            {bottle ? 'Save bottle' : 'Add bottle'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PriceLine({ b, currency }: { b: Bottle; currency: string }) {
  const c = compareBottle(b)
  if (c.paid == null && c.market == null) return null
  const m = (n: number) => formatMoney(n, currency)
  return (
    <div className="mt-1 text-xs text-cream/60">
      {c.paid != null && <>Paid {m(c.paid)}{c.paidPerMl != null && ` (${m(c.paidPerMl)}/ml)`}</>}
      {c.paid != null && c.market != null && ' · '}
      {c.market != null && (
        <>
          Market {m(c.market)}
          {b.marketCheckedOn && ` on ${b.marketCheckedOn}`}
          {b.marketSource && ` at ${b.marketSource}`}
        </>
      )}
      {c.saved != null && c.savedPercent != null && (
        <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${c.saved >= 0 ? 'bg-emerald-900/50 text-emerald-200' : 'bg-red-900/50 text-red-200'}`}>
          {c.saved >= 0 ? `Saved ${m(c.saved)} (${c.savedPercent}%)` : `Overpaid ${m(-c.saved)} (${-c.savedPercent}%)`}
        </span>
      )}
    </div>
  )
}

export default function BottlesSection({ d, onChanged, onNoBottlesLeft, say }: { d: FragranceDetail; onChanged: () => void; /** The last active bottle is gone (empty, sold or gifted). */ onNoBottlesLeft: (reason: HadReason) => void; say: (m: string) => void }) {
  const [editing, setEditing] = useState<Bottle | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const avg = d.performance.avgSprays
  const currency = useCurrency()

  const save = async (input: BottleInput) => {
    const r = editing === 'new' ? await window.api.bottles.add(d.id, input) : await window.api.bottles.update((editing as Bottle).id, input)
    if (!r.ok) return setError(r.message)
    const next = editing !== 'new' && (input.status === 'empty' || input.status === 'sold/gifted') ? input.status : null
    setEditing(null)
    setError(null)
    onChanged()
    if (next) await offerHadIfLast(next === 'empty' ? 'finished' : 'sold')
  }

  /** After a bottle left: if nothing is in use any more, suggest moving the fragrance to Had. */
  const offerHadIfLast = async (reason: HadReason) => {
    const fresh = await window.api.fragrances.get(d.id)
    if (fresh && fresh.wardrobe === 'collection' && fresh.bottles.every((b) => b.status !== 'active')) onNoBottlesLeft(reason)
  }

  const markEmpty = async (b: Bottle) => {
    if (!window.confirm(`Mark this ${b.sizeMl} ml ${b.type} as empty?`)) return
    const r = await window.api.bottles.markEmpty(b.id)
    if (!r.ok) say(r.message)
    onChanged()
    if (r.ok) await offerHadIfLast('finished')
  }

  return (
    <div>
      <div className="space-y-2">
        {d.bottles.length === 0 && <p className="text-sm text-cream/50">No bottles yet.</p>}
        {d.bottles.map((b) => {
          const st = bottleStats(b, avg)
          return (
            <div key={b.id} className={`rounded-lg border border-ink-600 bg-ink-900/60 p-3 ${b.status !== 'active' ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-medium">{b.type}</span> · {formatMl(b.sizeMl)}
                  {b.status !== 'active' && <span className="ml-2 rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase">{b.status}</span>}
                  {st.low && <span className="ml-2 rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] uppercase text-red-200">Running low</span>}
                </div>
                <div className="flex gap-1">
                  <button className="rounded border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700" onClick={() => { setError(null); setEditing(b) }}>
                    Edit
                  </button>
                  {b.status === 'active' && (
                    <button className="rounded border border-ink-600 px-2 py-1 text-xs hover:bg-ink-700" onClick={() => markEmpty(b)}>
                      Mark empty
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 rounded bg-ink-800">
                  <div className="h-2 rounded" style={{ width: `${st.percent}%`, background: st.low ? '#c0463a' : '#d9b26f' }} />
                </div>
                <div className="w-44 text-right text-xs text-cream/70">
                  {formatMl(b.remainingMl)} · {st.percent}%
                </div>
              </div>
              <div className="mt-1 text-xs text-cream/50">
                {st.wearsLeft != null && `≈ ${st.wearsLeft} wears left${avg ? '' : ' (assuming 4 sprays)'} · `}
                {b.mlPerSpray} ml/spray
                {b.boughtAt && ` · ${b.boughtAt}`}
                {b.batchCode && ` · batch ${b.batchCode}`}
              </div>
              <PriceLine b={b} currency={currency} />
            </div>
          )
        })}
      </div>
      <button className={`${ghostBtn} mt-3`} onClick={() => { setError(null); setEditing('new') }}>
        + Add bottle
      </button>
      <p className="mt-1 text-[11px] text-cream/35">Low-level warning appears under {Math.round(LOW_LEVEL_THRESHOLD * 100)}%.</p>
      {editing && <BottleFormDialog vial={d.wardrobe !== 'collection'} bottle={editing === 'new' ? null : editing} error={error} onCancel={() => setEditing(null)} onSubmit={save} />}
    </div>
  )
}
