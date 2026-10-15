import { useEffect, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LeaderRow, StatsOverview } from '@shared/types'
import { formatMl } from '../lib/bottles'
import { PROJECTION_LABELS } from '../lib/performance'
import { formatMoney, useCurrency } from '../lib/money'

const card = 'rounded-xl border border-ink-600 bg-ink-800 p-4'

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className={card}>
      <div className="text-[11px] uppercase tracking-wider text-cream/50">{label}</div>
      <div className="mt-1 font-display text-2xl text-brass-400">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-cream/50">{sub}</div>}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-display text-lg text-brass-400">{title}</h2>
      {hint && <p className="mb-2 text-xs text-cream/45">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  )
}

function Board({ rows, format, empty }: { rows: LeaderRow[]; format: (v: number) => string; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-cream/45">{empty}</p>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => (
        <li key={r.id} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">
              <span className="mr-2 text-cream/40">{i + 1}.</span>
              {r.name} <span className="text-cream/45">{r.house}</span>
            </span>
            <span className="shrink-0 text-brass-400">{format(r.value)}</span>
          </div>
          <div className="mt-0.5 h-1 rounded bg-ink-900">
            <div className="h-1 rounded bg-brass-500/70" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })

export default function StatsPage({ onOpen }: { onOpen?: (id: number) => void }) {
  const [s, setS] = useState<StatsOverview | null>(null)
  const currency = useCurrency()
  const money = (n: number) => formatMoney(n, currency)

  useEffect(() => {
    void window.api.stats.overview().then(setS)
  }, [])

  if (!s) return <div className="p-8 text-cream/50">Loading…</div>
  const t = s.totals
  const hasWears = t.wears > 0

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <h1 className="font-display text-3xl text-brass-400">Stats</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="In my collection" value={t.collectionCount} sub={`${formatMl(t.mlRemaining)} left of ${formatMl(t.mlOwned)} owned`} />
        <Stat label="Wears logged" value={t.wears} sub={`${t.wearsLast30Days} in the last 30 days`} />
        <Stat label="Total spent" value={t.totalSpent > 0 ? money(t.totalSpent) : '–'} sub={t.totalSpent > 0 ? 'on bottles with a price' : 'add prices to your bottles'} />
        <Stat label="Cost per wear" value={t.avgCostPerWear != null ? money(t.avgCostPerWear) : '–'} sub="across priced, worn fragrances" />
      </div>

      {(t.marketPricedBottles > 0 || s.priceRows.length > 0) && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Market value" value={t.marketPricedBottles > 0 ? money(t.marketValue) : '–'} sub={`${t.marketPricedBottles} bottle${t.marketPricedBottles === 1 ? '' : 's'} with a market price`} />
          <Stat
            label={t.paidVsMarket != null && t.paidVsMarket > 0 ? 'Overpaid in total' : 'Saved in total'}
            value={t.paidVsMarket != null ? money(Math.abs(t.paidVsMarket)) : '–'}
            sub={t.paidVsMarket != null ? 'paid vs market, bottles with both' : 'enter both prices on a bottle'}
          />
        </div>
      )}

      {s.lowBottles.length > 0 && (
        <Section title="Running low" hint="Below the low-level threshold.">
          <ul className="space-y-1 text-sm">
            {s.lowBottles.map((b) => (
              <li key={b.bottleId} className="flex justify-between">
                <button className="text-left hover:text-brass-400" onClick={() => onOpen?.(b.fragranceId)}>
                  {b.name}
                </button>
                <span className="text-red-300">
                  {b.percent}% · {formatMl(b.remainingMl)}
                  {b.wearsLeft != null && ` · ≈ ${b.wearsLeft} wears`}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Wears and spray usage per month" hint="Last 12 months. Hover for the amount of fragrance used.">
        {hasWears ? (
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={s.perMonth.map((m) => ({ ...m, label: monthLabel(m.month) }))} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--chart-text)', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--chart-text)', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#ffffff10' }}
                  contentStyle={{ background: 'var(--color-ink-800)', border: '1px solid var(--color-ink-600)', color: 'var(--color-cream)', fontSize: 12 }}
                  formatter={(v, _n, item) => [`${v} wears · ${(item.payload as { mlUsed: number }).mlUsed} ml`, '']}
                  labelStyle={{ color: '#d9b26f' }}
                />
                <Bar dataKey="wears" fill="#c4964a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-cream/45">No wears yet. Log your first wear from a bottle's detail view.</p>
        )}
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Most worn">
          <Board rows={s.mostWorn} format={(v) => `${v} wear${v === 1 ? '' : 's'}`} empty="Nothing worn yet." />
        </Section>
        <Section title="Neglected bottles" hint="In your collection, longest since last worn.">
          {s.neglected.length === 0 ? (
            <p className="text-sm text-cream/45">Your collection is empty.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {s.neglected.map((n) => (
                <li key={n.id} className="flex justify-between gap-2">
                  <button className="truncate text-left hover:text-brass-400" onClick={() => onOpen?.(n.id)}>
                    {n.name} <span className="text-cream/45">{n.house}</span>
                  </button>
                  <span className={`shrink-0 ${n.daysSinceWorn === null ? 'text-red-300' : 'text-cream/60'}`}>
                    {n.daysSinceWorn === null ? 'never worn' : n.daysSinceWorn === 0 ? 'today' : `${n.daysSinceWorn} d ago`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Section title="Longest lasting" hint="Average hours, 2+ rated wears.">
          <Board rows={s.leaderboards.longevity} format={(v) => `${v} h`} empty="Log longevity on at least 2 wears of a fragrance." />
        </Section>
        <Section title="Strongest projection" hint="Average projection, 2+ rated wears.">
          <Board rows={s.leaderboards.projection} format={(v) => `${v} · ${PROJECTION_LABELS[Math.round(v)] ?? ''}`} empty="Rate projection on at least 2 wears of a fragrance." />
        </Section>
        <Section title="Most compliments">
          <Board rows={s.leaderboards.compliments} format={(v) => String(v)} empty="No compliments logged yet." />
        </Section>
      </div>

      <Section title="Paid vs market price" hint="Market prices are typed by hand on each bottle, so check the date. Per ml uses the bottle size.">
        {s.priceRows.length === 0 ? (
          <p className="text-sm text-cream/45">Add a market price to a bottle (in its detail view) to compare it with what you paid.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-cream/50">
              <tr>
                <th className="py-1 font-normal">Fragrance</th>
                <th className="py-1 text-right font-normal">Paid</th>
                <th className="py-1 text-right font-normal">Market</th>
                <th className="py-1 text-right font-normal">Difference</th>
                <th className="py-1 text-right font-normal">Per ml (paid)</th>
                <th className="py-1 text-right font-normal">Checked</th>
              </tr>
            </thead>
            <tbody>
              {s.priceRows.map((r) => (
                <tr key={r.bottleId} className="border-t border-ink-700">
                  <td className="py-1.5">
                    <button className="hover:text-brass-400" onClick={() => onOpen?.(r.fragranceId)}>
                      {r.name} <span className="text-cream/45">{r.house} · {formatMl(r.sizeMl)}</span>
                    </button>
                  </td>
                  <td className="py-1.5 text-right">{r.paid != null ? money(r.paid) : '–'}</td>
                  <td className="py-1.5 text-right">{r.market != null ? money(r.market) : '–'}</td>
                  <td className={`py-1.5 text-right ${r.saved == null ? '' : r.saved >= 0 ? 'text-emerald-400' : 'text-red-300'}`}>
                    {r.saved == null || r.savedPercent == null ? '–' : r.saved >= 0 ? `saved ${money(r.saved)} (${r.savedPercent}%)` : `overpaid ${money(-r.saved)} (${-r.savedPercent}%)`}
                  </td>
                  <td className="py-1.5 text-right">{r.paidPerMl != null ? money(r.paidPerMl) : '–'}</td>
                  <td className="py-1.5 text-right text-xs text-cream/50">{r.checkedOn ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Cost per wear" hint="Price of a fragrance's bottles divided by how often you wore it.">
        {s.costPerWear.length === 0 ? (
          <p className="text-sm text-cream/45">Add a price to a bottle (in its detail view) to see this.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-cream/50">
              <tr>
                <th className="py-1 font-normal">Fragrance</th>
                <th className="py-1 text-right font-normal">Spent</th>
                <th className="py-1 text-right font-normal">Wears</th>
                <th className="py-1 text-right font-normal">Per wear</th>
              </tr>
            </thead>
            <tbody>
              {s.costPerWear.map((c) => (
                <tr key={c.id} className="border-t border-ink-700">
                  <td className="py-1.5">
                    <button className="hover:text-brass-400" onClick={() => onOpen?.(c.id)}>
                      {c.name} <span className="text-cream/45">{c.house}</span>
                    </button>
                  </td>
                  <td className="py-1.5 text-right">{money(c.spent)}</td>
                  <td className="py-1.5 text-right">{c.wears}</td>
                  <td className="py-1.5 text-right text-brass-400">{c.costPerWear != null ? money(c.costPerWear) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
