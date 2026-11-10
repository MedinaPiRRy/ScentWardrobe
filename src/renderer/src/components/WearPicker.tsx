import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { FragranceSummary, SavedCombo } from '@shared/types'
import { useEscapeClose } from '../lib/dialog'

export interface PickGroup {
  label: string
  items: FragranceSummary[]
}

interface Row {
  value: string
  label: string
  tag?: string
  group: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "decant" or "sample" when the only bottles I hold of it are vials. */
function vialTag(f: FragranceSummary): string | undefined {
  const active = f.bottles
  if (active.length === 0 || active.some((b) => b.type !== 'decant' && b.type !== 'sample')) return undefined
  return active.some((b) => b.type === 'decant') ? 'decant' : 'sample'
}

/**
 * A searchable replacement for the long "What did you wear?" drop-down: type part of a name or house to narrow the list,
 * use the arrow keys and Enter (or click) to choose. Value is "f<id>" for a fragrance and "c<id>" for a saved blend.
 */
export default function WearPicker({ groups, combos, value, onChange }: { groups: PickGroup[]; combos: SavedCombo[]; value: string; onChange: (v: string) => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [place, setPlace] = useState<CSSProperties>({})

  const all = useMemo<Row[]>(
    () => [
      ...groups.flatMap((g) => g.items.map((f) => ({ value: `f${f.id}`, label: `${f.name} · ${f.house}`, tag: vialTag(f), group: g.label }))),
      ...combos.map((c) => ({ value: `c${c.id}`, label: c.items.map((i) => i.name).join(' + '), group: 'Blends' }))
    ],
    [groups, combos]
  )
  const chosen = all.find((r) => r.value === value)

  const rows = useMemo(() => {
    const words = norm(text).split(/\s+/).filter(Boolean)
    return words.length === 0 ? all : all.filter((r) => words.every((w) => norm(r.label).includes(w)))
  }, [all, text])

  useEscapeClose(() => close(), open)
  useEffect(() => setActive(0), [text])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  // The list is positioned against the window so the dialog's own scrolling never clips it; it opens upward when there is more room above.
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const r = box.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom - 12
      const above = r.top - 12
      const up = below < 180 && above > below
      const room = Math.max(120, Math.min(288, up ? above : below))
      setPlace(up ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxHeight: room } : { left: r.left, width: r.width, top: r.bottom + 4, maxHeight: room })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  function close() {
    setOpen(false)
    setText('')
  }
  const choose = (r: Row) => {
    onChange(r.value)
    close()
  }

  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      if (rows.length) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length)
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      if (rows[active]) choose(rows[active])
    } else if (e.key === 'Tab') close()
  }

  let lastGroup = ''
  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <input
        role="combobox"
        aria-label="What did you wear?"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${id}-${rows[active].value}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={open ? text : chosen?.label ?? ''}
        placeholder={open && chosen ? chosen.label : 'What did you wear? Type to search'}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={key}
        className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-2 text-sm text-cream placeholder:text-cream/60"
      />
      {open && (
        <ul id={`${id}-list`} ref={list} role="listbox" aria-label="Fragrances" style={place} className="fixed z-[60] overflow-y-auto rounded border border-ink-600 bg-ink-800 py-1 shadow-xl">
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-cream/70">Nothing matches “{text}”.</li>}
          {rows.map((r, i) => {
            const heading = r.group !== lastGroup ? r.group : null
            lastGroup = r.group
            return (
              <li key={r.value} role="presentation">
                {heading && <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-cream/60">{heading}</div>}
                <div
                  id={`${id}-${r.value}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(r)}
                  onMouseMove={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-cream ${i === active ? 'bg-ink-600' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  {r.tag && <span className="shrink-0 rounded-full border border-ink-600 px-2 text-[11px] text-cream/70">{r.tag}</span>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
