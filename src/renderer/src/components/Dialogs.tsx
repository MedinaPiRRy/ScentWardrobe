import { useRef, useState, type ReactNode } from 'react'
import type { BottleType, FragranceSummary, NewBottleInput } from '@shared/types'
import { useEscapeClose, useFocusTrap } from '../lib/dialog'
import { QUICK_SIZES_ML } from '../lib/shelf'

export function Modal({ title, onClose, children, wide, xl }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; xl?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEscapeClose(onClose)
  useFocusTrap(box)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6" onMouseDown={onClose}>
      <div
        ref={box}
        aria-modal="true"
        className={`max-h-full w-full overflow-y-auto rounded-xl border border-ink-600 bg-ink-800 p-6 shadow-2xl ${xl ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-md'}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h2 className="mb-4 font-display text-xl text-brass-400">{title}</h2>
        {children}
      </div>
    </div>
  )
}

const btn = 'rounded-md px-4 py-2 text-sm'
export const primaryBtn = `${btn} bg-brass-500 font-medium text-[#17110b] hover:bg-brass-400`
export const ghostBtn = `${btn} border border-ink-600 text-cream hover:bg-ink-700`

export function SizePicker({ value, onChange, allowEmpty }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK_SIZES_ML.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(String(s))}
            className={`rounded-full border px-3 py-1 text-xs ${value === String(s) ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
          >
            {s} ml
          </button>
        ))}
        {allowEmpty && value && (
          <button type="button" className="px-2 text-xs text-cream/50 underline" onClick={() => onChange('')}>
            clear
          </button>
        )}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-cream/60">
        Custom
        <input
          type="number"
          min={0}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream"
        />
        ml
      </label>
    </div>
  )
}

/** Required when moving something to the wishlist. Also takes an optional desired size. */
export function ImpressionDialog({
  fragrance,
  initial,
  initialSize,
  serverError,
  onCancel,
  onSubmit
}: {
  fragrance: FragranceSummary
  initial: string
  initialSize: number | null
  serverError: string | null
  onCancel: () => void
  onSubmit: (impression: string, desiredSizeMl?: number) => void
}) {
  const [text, setText] = useState(initial)
  const [size, setSize] = useState(initialSize ? String(initialSize) : '')
  const [touched, setTouched] = useState(false)
  const empty = text.trim().length === 0

  return (
    <Modal title={`Add ${fragrance.name} to your wishlist`} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (empty) return
          const n = parseFloat(size)
          onSubmit(text.trim(), n > 0 ? n : undefined)
        }}
      >
        <label className="block text-sm text-cream/80">
          What it smells like to me <span className="text-brass-400">*</span>
        </label>
        <textarea
          autoFocus
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Bright citrus over a smoky, musky base…"
          className="mt-1 w-full rounded border border-ink-600 bg-ink-900 p-2 text-sm text-cream"
        />
        {(touched && empty) || serverError ? (
          <p className="mt-1 text-sm text-red-300" role="alert">
            {touched && empty ? 'The wishlist needs a description of what it smells like to you.' : serverError}
          </p>
        ) : null}
        <div className="mt-4 text-sm text-cream/80">Desired size (optional)</div>
        <div className="mt-1">
          <SizePicker value={size} onChange={setSize} allowEmpty />
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn}>
            Add to wishlist
          </button>
        </div>
      </form>
    </Modal>
  )
}

const BOTTLE_TYPES: BottleType[] = ['full bottle', 'travel/mini', 'decant', 'sample']

/** Asked when something enters My Collection without an active bottle. */
export function BottleDialog({
  fragrance,
  serverError,
  onCancel,
  onSubmit
}: {
  fragrance: FragranceSummary
  serverError: string | null
  onCancel: () => void
  onSubmit: (bottle: NewBottleInput) => void
}) {
  const [type, setType] = useState<BottleType>('full bottle')
  const [size, setSize] = useState('100')
  const [pct, setPct] = useState(100)
  const [touched, setTouched] = useState(false)
  const sizeMl = parseFloat(size)
  const valid = sizeMl > 0

  return (
    <Modal title={`Add ${fragrance.name} to your collection`} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setTouched(true)
          if (!valid) return
          onSubmit({ type, sizeMl, remainingMl: Math.round(sizeMl * pct) / 100 })
        }}
      >
        <label className="block text-sm text-cream/80">Bottle type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as BottleType)}
          className="mt-1 w-full rounded border border-ink-600 bg-ink-900 p-2 text-sm text-cream"
        >
          {BOTTLE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="mt-4 text-sm text-cream/80">Size</div>
        <div className="mt-1">
          <SizePicker value={size} onChange={setSize} />
        </div>
        <label className="mt-4 block text-sm text-cream/80">
          Amount left: <span className="text-brass-400">{pct}%</span>
          {valid && <span className="text-cream/50"> ({Math.round(sizeMl * pct) / 100} ml)</span>}
        </label>
        <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(+e.target.value)} className="w-full accent-[#c4964a]" />
        <p className="text-xs text-cream/50">Leave at 100% for a full bottle, or lower it if it's already partly used.</p>
        {((touched && !valid) || serverError) && (
          <p className="mt-2 text-sm text-red-300" role="alert">
            {touched && !valid ? 'Enter a bottle size greater than 0 ml.' : serverError}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn}>
            Add to collection
          </button>
        </div>
      </form>
    </Modal>
  )
}
