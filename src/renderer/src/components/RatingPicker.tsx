import { useRef } from 'react'
import { ghostBtn, Modal } from './Dialogs'

/** Ten small number buttons for a 1-10 rating. Clicking the current value clears it. */
export default function RatingPicker({ value, onChange, size = 'md', label = 'Rating' }: { value: number | null; onChange: (v: number | null) => void; size?: 'sm' | 'md'; label?: string }) {
  const dims = size === 'sm' ? 'h-5 w-5 text-[10px]' : 'h-7 w-7 text-xs'
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 10`}
          title={value === n ? 'Click again to clear' : `${n}/10`}
          onClick={() => onChange(value === n ? null : n)}
          className={`${dims} rounded font-medium ${value != null && n <= value ? 'bg-brass-500 text-[#17110b]' : 'border border-cream/40 bg-ink-900 text-cream/70 hover:bg-ink-600'} ${value === n ? 'ring-2 ring-brass-400' : ''}`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** A small dialog for rating one fragrance (from the shelf's context menu). */
export function RateDialog({ name, current, onPick, onClose }: { name: string; current: number | null; onPick: (v: number | null) => void; onClose: () => void }) {
  const first = useRef<HTMLDivElement>(null)
  return (
    <Modal title={`Rate ${name}`} onClose={onClose}>
      <div ref={first}>
        <p className="mb-3 text-sm text-cream/70">How much do you like it? Higher ratings make it appear more often in recommendations; you can change your mind at any time.</p>
        <RatingPicker value={current} onChange={(v) => onPick(v)} />
        <div className="mt-4 flex justify-end gap-2">
          {current != null && (
            <button className={ghostBtn} onClick={() => onPick(null)}>
              Clear rating
            </button>
          )}
          <button className={ghostBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
