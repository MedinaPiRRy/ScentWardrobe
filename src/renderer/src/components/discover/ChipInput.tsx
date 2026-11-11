import { useId, useState } from 'react'

/** A list of short words (accords, notes) with an add box and a remove button on each. */
export default function ChipInput({ label, value, onChange, suggestions = [], placeholder, max = 8 }: { label: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number }) {
  const id = useId()
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < max) onChange([...value, t])
    setText('')
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs uppercase tracking-wider text-cream/70">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-900 py-0.5 pl-2.5 pr-1 text-sm text-cream">
            {v}
            <button type="button" className="rounded-full px-1.5 text-cream/70 hover:bg-ink-700 hover:text-cream" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          list={`${id}-list`}
          value={text}
          placeholder={value.length >= max ? 'Limit reached' : placeholder ?? 'Type and press Enter'}
          disabled={value.length >= max}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          onBlur={add}
          className="min-w-[9rem] flex-1 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream placeholder:text-cream/60"
        />
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
    </div>
  )
}
