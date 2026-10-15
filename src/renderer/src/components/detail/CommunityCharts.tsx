import type { CommunityData } from '@shared/types'

function Bars({ title, rows }: { title: string; rows: { label: string; votes: number; color: string }[] }) {
  const max = Math.max(...rows.map((r) => r.votes), 1)
  return (
    <div>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-cream/50">{title}</div>
      <div className="flex h-20 items-end gap-2">
        {rows.map((r) => (
          <div key={r.label} className="flex h-full flex-1 flex-col items-center justify-end" title={`${r.label}: ${r.votes} votes`}>
            <div className="w-full rounded-t" style={{ height: `${(r.votes / max) * 78}%`, minHeight: r.votes ? 3 : 0, background: r.color }} />
            <div className="mt-1 text-[10px] text-cream/60">{r.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CommunityCharts({ c }: { c: CommunityData | null }) {
  if (!c) return <p className="text-sm text-cream/50">No community data yet. It is filled in when you import from Fragrantica, or by hand in Edit.</p>
  return (
    <div>
      <div className="grid grid-cols-2 gap-6">
        <Bars
          title="Season"
          rows={[
            { label: 'Winter', votes: c.winter, color: '#7fb4e0' },
            { label: 'Spring', votes: c.spring, color: '#8fd18f' },
            { label: 'Summer', votes: c.summer, color: '#f2c94c' },
            { label: 'Fall', votes: c.fall, color: '#d9822b' }
          ]}
        />
        <Bars
          title="Time of day"
          rows={[
            { label: 'Day', votes: c.day, color: '#f2d27a' },
            { label: 'Night', votes: c.night, color: '#5a6fb3' }
          ]}
        />
      </div>
      {(c.longevity != null || c.sillage != null) && (
        <p className="mt-2 text-xs text-cream/60">
          Community longevity {c.longevity ?? '–'} / 5 · sillage {c.sillage ?? '–'} / 4
        </p>
      )}
    </div>
  )
}
