import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FragranceSummary, SavedCombo, WearEntry } from '@shared/types'
import BottleSvg from '../components/BottleSvg'
import DayPanel, { type LogTarget } from '../components/DayPanel'
import { ghostBtn, primaryBtn } from '../components/Dialogs'
import UsualSpraysDialog from '../components/UsualSpraysDialog'
import WearForm from '../components/WearForm'
import { dateKeyOf, fragrancesOfDay, groupByDay, heatLevel, monthGrid, monthName, shiftMonth, usageCounts, weekdayNames } from '../lib/calendar'

type View = 'month' | 'year'

const HEAT = ['', 'bg-brass-500/25', 'bg-brass-500/50', 'bg-brass-500/75', 'bg-brass-400']

interface FormState {
  fragranceId?: number
  comboId?: number
  comboTitle?: string
  defaultSprays?: number
  date: string
  entry?: WearEntry
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [view, setView] = useState<View>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month0, setMonth0] = useState(now.getMonth())
  const [wears, setWears] = useState<WearEntry[]>([])
  const [fragrances, setFragrances] = useState<Map<number, FragranceSummary>>(new Map())
  const [combos, setCombos] = useState<SavedCombo[]>([])
  const [day, setDay] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [sprays, setSprays] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 4000)
  }, [])

  const grid = useMemo(() => monthGrid(year, month0), [year, month0])
  const range = useMemo(() => (view === 'month' ? { from: grid[0][0].date, to: grid[grid.length - 1][6].date } : { from: `${year}-01-01`, to: `${year}-12-31` }), [view, grid, year])

  const load = useCallback(async () => {
    const [w, list, c] = await Promise.all([window.api.wears.range(range.from, range.to), window.api.fragrances.list(), window.api.layering.combos()])
    setWears(w)
    setFragrances(new Map(list.map((f) => [f.id, f])))
    setCombos(c)
  }, [range.from, range.to])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => groupByDay(wears), [wears])
  const periodWears = useMemo(() => (view === 'month' ? wears.filter((w) => w.wornAt.slice(0, 7) === `${year}-${String(month0 + 1).padStart(2, '0')}`) : wears), [wears, view, year, month0])
  const usage = useMemo(() => usageCounts(periodWears), [periodWears])
  const missingSprays = useMemo(() => [...fragrances.values()].filter((f) => f.wardrobe === 'collection' && f.defaultSprays == null).length, [fragrances])
  const todayKey = dateKeyOf(new Date())

  const go = (by: number) => {
    if (view === 'month') {
      const n = shiftMonth(year, month0, by)
      setYear(n.year)
      setMonth0(n.month0)
    } else setYear((y) => y + by)
  }
  const goToday = () => {
    setYear(now.getFullYear())
    setMonth0(now.getMonth())
  }

  const logFrom = async (t: LogTarget) => {
    if (!day) return
    if ('comboId' in t) return setForm({ comboId: t.comboId, comboTitle: t.title, defaultSprays: t.sprays, date: day })
    setForm({ fragranceId: t.fragranceId, date: day })
  }

  const dayWears = day ? (byDay.get(day) ?? []) : []
  const maxUsage = usage[0]?.count ?? 1
  const shownUsage = showAll ? usage : usage.slice(0, 10)
  const periodLabel = view === 'month' ? monthName(year, month0) : String(year)

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-2 font-display text-3xl text-brass-400">Calendar</h1>
        <div className="flex items-center gap-1">
          <button className={`${ghostBtn} px-3`} onClick={() => go(-1)} aria-label={view === 'month' ? 'Previous month' : 'Previous year'}>
            ‹
          </button>
          <div className="min-w-[10rem] text-center font-display text-xl" aria-live="polite">
            {periodLabel}
          </div>
          <button className={`${ghostBtn} px-3`} onClick={() => go(1)} aria-label={view === 'month' ? 'Next month' : 'Next year'}>
            ›
          </button>
        </div>
        <button className={ghostBtn} onClick={goToday}>
          Today
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div role="radiogroup" aria-label="View" className="inline-flex rounded-lg bg-ink-800 p-1">
            {(['month', 'year'] as const).map((v) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`rounded-md px-4 py-1.5 text-sm ${view === v ? 'bg-ink-600 text-brass-400' : 'text-cream/70 hover:text-cream'}`}>
                {v === 'month' ? 'Month' : 'Year'}
              </button>
            ))}
          </div>
          <button className={ghostBtn} onClick={() => setSprays(true)}>
            Usual sprays…
          </button>
        </div>
      </header>

      {missingSprays > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brass-500/40 bg-brass-500/10 px-4 py-2.5 text-sm">
          <span>
            {missingSprays} of your fragrances {missingSprays === 1 ? 'has' : 'have'} no usual spray count yet. It is used as the default when you log a wear, and for days you fill in afterwards.
          </span>
          <button className={primaryBtn} onClick={() => setSprays(true)}>
            Set them
          </button>
        </div>
      )}

      {view === 'month' ? (
        <section aria-label={`Wear calendar for ${periodLabel}`} className="overflow-hidden rounded-xl border border-ink-600 bg-ink-800">
          <div className="grid grid-cols-7 border-b border-ink-600 bg-ink-900/60 text-center text-[11px] uppercase tracking-wider text-cream/55">
            {weekdayNames().map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((c) => {
                const ids = fragrancesOfDay(byDay.get(c.date) ?? [])
                const shown = ids.slice(0, 3)
                const isToday = c.date === todayKey
                return (
                  <button
                    key={c.date}
                    onClick={() => setDay(c.date)}
                    aria-label={`${c.date}${ids.length ? `, ${ids.length} fragrance${ids.length === 1 ? '' : 's'} worn` : ''}`}
                    className={`relative min-h-[104px] border-b border-r border-ink-700 p-1.5 text-left transition-colors hover:bg-ink-700/60 ${c.inMonth ? '' : 'bg-ink-900/40 opacity-55'}`}
                  >
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${isToday ? 'bg-brass-500 font-bold text-[#17110b]' : 'text-cream/70'}`}>{c.day}</span>
                    <div className="mt-1 flex items-end gap-1">
                      {shown.map((id) => {
                        const f = fragrances.get(id)
                        return (
                          <div key={id} className="flex h-[52px] w-[30px] items-end justify-center" title={f?.name} style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,.45))' }}>
                            {f && <BottleSvg fragrance={f} showLevel={false} fixedHeight={50} />}
                          </div>
                        )
                      })}
                      {ids.length > shown.length && <span className="mb-1 rounded-full bg-ink-600 px-1.5 py-0.5 text-[10px] font-medium text-cream/85">+{ids.length - shown.length}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </section>
      ) : (
        <section aria-label={`Wear heatmap for ${year}`} className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, m0) => {
            const g = monthGrid(year, m0)
            const total = wears.filter((w) => w.wornAt.slice(0, 7) === `${year}-${String(m0 + 1).padStart(2, '0')}`).length
            return (
              <div key={m0} className="rounded-xl border border-ink-600 bg-ink-800 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <button
                    className="font-display text-base text-brass-400 hover:underline"
                    onClick={() => {
                      setMonth0(m0)
                      setView('month')
                    }}
                  >
                    {new Date(year, m0, 1).toLocaleDateString(undefined, { month: 'long' })}
                  </button>
                  <span className="text-xs text-cream/50">{total} wear{total === 1 ? '' : 's'}</span>
                </div>
                <div className="grid grid-cols-7 gap-[3px]">
                  {g.flat().map((c) => {
                    const n = (byDay.get(c.date) ?? []).length
                    return c.inMonth ? (
                      <button
                        key={c.date}
                        onClick={() => setDay(c.date)}
                        title={`${c.date}: ${n} wear${n === 1 ? '' : 's'}`}
                        aria-label={`${c.date}: ${n} wears`}
                        className={`aspect-square rounded-[3px] border text-[9px] ${c.date === todayKey ? 'border-brass-400' : 'border-transparent'} ${n === 0 ? 'bg-ink-900' : HEAT[heatLevel(n)]} hover:ring-1 hover:ring-brass-400`}
                      />
                    ) : (
                      <span key={c.date} className="aspect-square" />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      )}

      <section className="rounded-xl border border-ink-600 bg-ink-800 p-5" aria-label="Scents used">
        <h2 className="font-display text-lg text-brass-400">Scents used {view === 'month' ? `in ${monthName(year, month0)}` : `in ${year}`}</h2>
        <p className="mb-2 text-xs text-cream/50">
          {periodWears.length} wear{periodWears.length === 1 ? '' : 's'} · {usage.length} different fragrance{usage.length === 1 ? '' : 's'}
        </p>
        {usage.length === 0 ? (
          <p className="text-sm text-cream/50">Nothing logged in this period. Click a day to add a wear.</p>
        ) : (
          <>
            <ol className="grid gap-x-8 gap-y-1.5 md:grid-cols-2">
              {shownUsage.map((u) => {
                const f = fragrances.get(u.id)
                return (
                  <li key={u.id} className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-6 shrink-0 items-end justify-center">{f && <BottleSvg fragrance={f} showLevel={false} fixedHeight={30} />}</div>
                    <button className="min-w-0 flex-1 truncate text-left hover:text-brass-400" onClick={() => navigate(`/?open=${u.id}`)}>
                      {f?.name ?? 'Unknown'} <span className="text-cream/45">{f?.house}</span>{f?.isForeign && <span className="ml-2 rounded border border-cream/30 px-1 text-[10px] uppercase text-cream/60">not mine</span>}
                    </button>
                    <div className="h-1.5 w-24 rounded bg-ink-900">
                      <div className="h-1.5 rounded bg-brass-500/80" style={{ width: `${(u.count / maxUsage) * 100}%` }} />
                    </div>
                    <span className="w-8 text-right tabular-nums text-brass-400">{u.count}×</span>
                  </li>
                )
              })}
            </ol>
            {usage.length > 10 && (
              <button className="mt-2 text-xs text-cream/60 underline hover:text-cream" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${usage.length}`}
              </button>
            )}
          </>
        )}
      </section>

      {day && (
        <DayPanel
          date={day}
          wears={dayWears}
          fragrances={fragrances}
          combos={combos}
          onClose={() => setDay(null)}
          onChanged={() => void load()}
          onLog={(t) => void logFrom(t)}
          onEdit={(entry) => setForm({ date: day, entry, fragranceId: entry.fragranceId ?? undefined })}
          say={say}
        />
      )}
      {form && (
        <WearForm
          fragranceId={form.fragranceId}
          comboId={form.comboId}
          comboTitle={form.comboTitle}
          defaultSprays={form.defaultSprays}
          entry={form.entry}
          datePrefill={form.date}
          onClose={() => setForm(null)}
          onSaved={(result, label) => {
            setForm(null)
            say(result ? `Logged ${label}.` : 'Wear updated.')
            void load()
          }}
        />
      )}
      {sprays && (
        <UsualSpraysDialog
          onClose={() => setSprays(false)}
          onSaved={() => {
            setSprays(false)
            say('Usual sprays saved.')
            void load()
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}
