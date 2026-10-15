import { useEffect } from 'react'

export interface MenuItem {
  label: string
  onSelect: () => void
  hint?: string
}

export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  // Keep the menu on screen.
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - (items.length * 36 + 16))

  return (
    <div
      className="fixed z-50 w-56 rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-2xl"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it) => (
        <button
          key={it.label}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-cream hover:bg-ink-600"
          onClick={() => {
            onClose()
            it.onSelect()
          }}
        >
          {it.label}
          {it.hint && <span className="text-xs text-cream/40">{it.hint}</span>}
        </button>
      ))}
    </div>
  )
}
