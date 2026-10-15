import type { AccordStrength } from '@shared/types'

/** Horizontal accord bars in the Fragrantica style: bar length = strength, text colour chosen for contrast. */
export default function AccordBars({ accords }: { accords: AccordStrength[] }) {
  if (accords.length === 0) return <p className="text-sm text-cream/50">No accords entered yet.</p>
  return (
    <div className="space-y-1.5">
      {accords.map((a) => (
        <div key={a.name} className="relative h-6 overflow-hidden rounded bg-ink-900" title={`${a.name}: ${a.strength}%`}>
          <div className="h-full rounded transition-[width] duration-500" style={{ width: `${Math.max(a.strength, 14)}%`, background: a.color }} />
          <span className="absolute inset-y-0 left-2 flex items-center text-xs font-medium" style={{ color: readable(a.color) }}>
            {a.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function readable(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#111'
  const n = parseInt(m[1], 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.6 ? '#1a1a1a' : '#fff'
}
