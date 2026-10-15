import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { CommunityData, PerformanceStats } from '@shared/types'
import { hoursToLongevityRating, projectionToSillageRating } from '../../lib/performance'

function Compare({ label, mine, theirs, max, unit }: { label: string; mine: number | null; theirs: number | null; max: number; unit: string }) {
  const bar = (v: number | null, color: string) => (
    <div className="h-2 flex-1 rounded bg-ink-900">{v != null && <div className="h-2 rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />}</div>
  )
  return (
    <div className="text-xs">
      <div className="mb-1 text-cream/60">{label}</div>
      <div className="flex items-center gap-2">
        <span className="w-24 text-brass-400">Mine {mine != null ? mine.toFixed(1) : '–'}</span>
        {bar(mine, '#d9b26f')}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="w-24 text-cream/60">Community {theirs != null ? theirs.toFixed(1) : '–'}</span>
        {bar(theirs, '#6b7a99')}
      </div>
      <div className="mt-0.5 text-[10px] text-cream/35">{unit}</div>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: { label: string; avg: number; wears: number }[] }) {
  if (rows.length === 0) return <div />
  return (
    <div>
      <div className="mb-1 text-cream/60">{title}</div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between">
            <span className="capitalize">{r.label}</span>
            <span className="text-brass-400">
              {r.avg} h <span className="text-cream/40">({r.wears})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PerformanceCard({ p, community }: { p: PerformanceStats; community: CommunityData | null }) {
  if (p.wearCount === 0) {
    return <p className="text-sm text-cream/50">No wears logged yet. Once you log wears, your own projection and longevity show up here next to the community ratings.</p>
  }
  const myLong = p.avgLongevity != null ? hoursToLongevityRating(p.avgLongevity) : null
  const mySill = p.avgProjection != null ? projectionToSillageRating(p.avgProjection) : null
  return (
    <div>
      <p className="mb-3 text-xs text-cream/60">
        {p.wearCount} wear{p.wearCount === 1 ? '' : 's'}
        {p.avgSprays != null && ` · ${p.avgSprays.toFixed(1)} sprays on average`}
        {p.avgLongevity != null && ` · ${p.avgLongevity.toFixed(1)} h average longevity`}
      </p>
      <div className="grid grid-cols-2 gap-6">
        <Compare label="Longevity" mine={myLong} theirs={community?.longevity ?? null} max={5} unit="1 very weak … 5 eternal (my hours mapped to this scale)" />
        <Compare label="Projection" mine={mySill} theirs={community?.sillage ?? null} max={4} unit="1 weak … 4 enormous (my 1-5 mapped to this scale)" />
      </div>
      {(p.longevityBySeason.length > 0 || p.longevityByWeather.length > 0 || p.compliments > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-6 text-xs">
          <Breakdown title="Longevity by season" rows={p.longevityBySeason} />
          <Breakdown title="Longevity by weather" rows={p.longevityByWeather} />
          {p.compliments > 0 && <p className="col-span-2 text-cream/60">{p.compliments} compliment{p.compliments === 1 ? '' : 's'} in total.</p>}
        </div>
      )}
      {p.series.length > 1 && (
        <div className="mt-4 h-40">
          <ResponsiveContainer>
            <LineChart data={p.series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: 'var(--chart-text)', fontSize: 10 }} />
              <YAxis yAxisId="p" domain={[0, 5]} tick={{ fill: 'var(--chart-text)', fontSize: 10 }} />
              <YAxis yAxisId="l" orientation="right" tick={{ fill: 'var(--chart-text)', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--color-ink-800)', border: '1px solid var(--color-ink-600)', color: 'var(--color-cream)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="p" type="monotone" dataKey="projection" name="Projection (1-5)" stroke="#d9b26f" dot={{ r: 2 }} connectNulls />
              <Line yAxisId="l" type="monotone" dataKey="longevity" name="Longevity (h)" stroke="#7fb4e0" dot={{ r: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
