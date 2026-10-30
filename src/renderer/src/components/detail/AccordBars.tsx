import type { AccordStrength } from '@shared/types'

/** Horizontal accord bars in the Fragrantica style: bar length = strength, text colour chosen for contrast. */
export default function AccordBars({ accords }: { accords: AccordStrength[] }) {
  if (accords.length === 0) return <p className="text-sm text-cream/50">No accords entered yet.</p>
  return (
    <div className="space-y-1.5">
      {accords.map((a) => (
        <div key={a.name} className="relative h-6 overflow-hidden rounded bg-ink-900" title={`${a.name}: ${a.strength}%`}>
          <div className="h-full rounded transition-[width] duration-500" style={{ width: `${Math.max(a.strength, 14)}%`, background: a.color }} />
          <span className="absolute inset-y-0 left-0 flex items-center rounded px-2 text-xs font-medium" style={{ color: readable(a.color), background: a.color }}>
            {a.name}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Black or white text, whichever has the higher WCAG contrast on this colour. */
export function readable(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#111'
  const n = parseInt(m[1], 16)
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#1a1a1a' : '#fff'
}
