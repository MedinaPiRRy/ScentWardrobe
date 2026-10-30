import type { RatingChange } from '@shared/types'

const SOURCE_LABEL: Record<RatingChange['source'], string> = { earlier: 'earlier rating', detail: '', shelf: 'from the shelf', wear: 'after a wear' }

const dayOf = (s: string) => s.slice(0, 10)

/** How my rating of one fragrance changed over time: a small line plus the latest changes. Newest first in `history`. */
export default function RatingHistory({ history }: { history: RatingChange[] }) {
  if (history.length === 0) return <p className="text-sm text-cream/60">Not rated yet. Rate it in the panel on the left, or from the shelf.</p>
  const ordered = [...history].reverse() // oldest first for the line
  const points = ordered.filter((h) => h.rating != null)
  const w = 240
  const h = 48
  const x = (i: number) => (points.length <= 1 ? w / 2 : 8 + (i * (w - 16)) / (points.length - 1))
  const y = (r: number) => h - 6 - ((r - 1) / 9) * (h - 12)
  return (
    <div>
      {points.length >= 2 && (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Rating over time: ${points.map((p) => p.rating).join(', then ')}`} className="mb-2">
          <polyline fill="none" stroke="var(--color-brass-500)" strokeWidth="2" points={points.map((p, i) => `${x(i)},${y(p.rating as number)}`).join(' ')} />
          {points.map((p, i) => (
            <circle key={p.id} cx={x(i)} cy={y(p.rating as number)} r="3" fill="var(--color-brass-400)" />
          ))}
        </svg>
      )}
      <ol className="space-y-1 text-sm">
        {history.slice(0, 8).map((c) => (
          <li key={c.id} className="flex items-baseline gap-3">
            <span className="w-24 shrink-0 text-xs text-cream/60">{dayOf(c.ratedAt)}</span>
            <span className="font-display text-brass-400">{c.rating != null ? `${c.rating}/10` : 'cleared'}</span>
            {SOURCE_LABEL[c.source] && <span className="text-xs text-cream/55">{SOURCE_LABEL[c.source]}</span>}
          </li>
        ))}
      </ol>
      {history.length > 8 && <p className="mt-1 text-xs text-cream/55">and {history.length - 8} earlier changes</p>}
    </div>
  )
}
