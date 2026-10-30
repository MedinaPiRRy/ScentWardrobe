import { useCurrency } from '../lib/money'

const field = 'mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'

export interface PriceValues {
  price: string
  boughtAt: string
  purchaseDate: string
}

export const EMPTY_PRICE: PriceValues = { price: '', boughtAt: '', purchaseDate: '' }

/** Price paid, where it was bought and when: shown wherever a bottle is created, so no price is ever hard to find. */
export default function PriceFields({ value, onChange, idPrefix = 'price' }: { value: PriceValues; onChange: (v: PriceValues) => void; idPrefix?: string }) {
  const currency = useCurrency()
  const set = (patch: Partial<PriceValues>) => onChange({ ...value, ...patch })
  return (
    <div className="mt-3 grid grid-cols-3 gap-3 text-sm text-cream/80">
      <label htmlFor={`${idPrefix}-paid`}>
        Price paid ({currency}, optional)
        <input id={`${idPrefix}-paid`} inputMode="decimal" value={value.price} onChange={(e) => set({ price: e.target.value })} className={field} placeholder="e.g. 89.90" />
      </label>
      <label htmlFor={`${idPrefix}-where`}>
        Where bought
        <input id={`${idPrefix}-where`} value={value.boughtAt} onChange={(e) => set({ boughtAt: e.target.value })} className={field} />
      </label>
      <label htmlFor={`${idPrefix}-date`}>
        Purchase date
        <input id={`${idPrefix}-date`} type="date" value={value.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} className={field} />
      </label>
    </div>
  )
}
