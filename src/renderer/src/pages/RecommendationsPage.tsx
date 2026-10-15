import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FragranceSummary, SavedLocation, WeatherReading } from '@shared/types'
import { buildAffinity, type AffinityMatrix, type RatedCombo } from '@shared/layering'
import { recommend, type BreakdownLine, type RecItem, type Recommendation, type TimeOfDay } from '@shared/recommend'
import { cToF, formatTemperature, fToC, type TempUnit } from '@shared/weather'
import BottleSvg from '../components/BottleSvg'
import { ghostBtn, primaryBtn } from '../components/Dialogs'
import LocationPicker from '../components/LocationPicker'
import { WEATHER_CONDITIONS } from '../components/WearForm'

const TIMES: { key: TimeOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening', label: 'Evening' },
  { key: 'night', label: 'Night' }
]

const pad = (n: number) => String(n).padStart(2, '0')
const nowLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const timeOfDayNow = (d = new Date()): TimeOfDay => {
  const h = d.getHours()
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 21 ? 'evening' : 'night'
}

const field = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* optional */
    }
  }
}

type WeatherState = { status: 'loading' } | { status: 'ok'; reading: WeatherReading } | { status: 'none' } | { status: 'error'; message: string }

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? '#7fd18f' : score >= 55 ? '#e0b24f' : '#e07a6a'
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2" style={{ borderColor: color, color }} title="Match score out of 100">
      <span className="font-display text-xl leading-none">{score}</span>
      <span className="text-[8px] uppercase tracking-wider opacity-70">match</span>
    </div>
  )
}

function Breakdown({ lines }: { lines: BreakdownLine[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {lines.map((l) => (
        <li key={l.key} className="flex items-center gap-2 text-[11px] text-cream/65">
          <span className="w-40 shrink-0 truncate">{l.label}</span>
          {l.fit !== null ? (
            <span className="h-1.5 flex-1 rounded bg-ink-900">
              <span className="block h-1.5 rounded" style={{ width: `${l.fit * 100}%`, background: l.fit >= 0.65 ? '#7fd18f' : l.fit >= 0.4 ? '#e0b24f' : '#e07a6a' }} />
            </span>
          ) : (
            <span className="flex-1" />
          )}
          <span className={`w-10 text-right tabular-nums ${l.points < 0 ? 'text-red-300' : 'text-cream/70'}`}>{l.points > 0 && l.fit === null ? '+' : ''}{l.points.toFixed(0)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function RecommendationsPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<RecItem[]>([])
  const [summaries, setSummaries] = useState<Map<number, FragranceSummary>>(new Map())
  const [history, setHistory] = useState<RatedCombo[]>([])
  const [affinity, setAffinity] = useState<AffinityMatrix>(() => buildAffinity())
  const [loaded, setLoaded] = useState(false)

  const [activities, setActivities] = useState<string[]>([])
  const [activity, setActivity] = useState(store.get('rec.activity') ?? 'Casual day')
  const [newActivity, setNewActivity] = useState<string | null>(null)
  const [tod, setTod] = useState<TimeOfDay>(timeOfDayNow())

  const [location, setLocation] = useState<SavedLocation | null>(null)
  const [weather, setWeather] = useState<WeatherState>({ status: 'loading' })
  const [unit, setUnit] = useState<TempUnit>('C')
  const [manual, setManual] = useState(false)
  const [mTemp, setMTemp] = useState('')
  const [mHum, setMHum] = useState('')
  const [mCond, setMCond] = useState('')
  const [pickLocation, setPickLocation] = useState(false)

  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null)
  const [busy, setBusy] = useState(false)

  const say = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo })
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 6000)
  }, [])

  const loadCandidates = useCallback(async () => {
    const [cand, list] = await Promise.all([window.api.recommend.candidates(), window.api.fragrances.list({ wardrobe: 'collection' })])
    setItems(cand)
    setSummaries(new Map(list.map((f) => [f.id, f])))
  }, [])

  const loadWeather = useCallback(async () => {
    setWeather({ status: 'loading' })
    const r = await window.api.weather.current()
    if (r.ok) setWeather({ status: 'ok', reading: r.data })
    else setWeather(r.code === 'NOT_FOUND' ? { status: 'none' } : { status: 'error', message: r.message })
  }, [])

  useEffect(() => {
    void (async () => {
      await loadCandidates()
      setLoaded(true)
      setActivities(await window.api.settings.activities())
      setHistory(await window.api.layering.history())
      setLocation(await window.api.weather.location())
      if ((await window.api.settings.get('units.temp')) === 'F') setUnit('F')
      try {
        const raw = await window.api.settings.get('layering.affinity')
        if (raw) setAffinity(buildAffinity(JSON.parse(raw) as AffinityMatrix))
      } catch {
        /* ignore a broken override */
      }
    })()
    void loadWeather()
  }, [loadCandidates, loadWeather])

  // Offline or no location: offer manual entry automatically.
  useEffect(() => {
    if (weather.status === 'error' || weather.status === 'none') setManual(true)
  }, [weather.status])

  const effective = useMemo(() => {
    if (manual) {
      const t = parseFloat(mTemp)
      const h = parseFloat(mHum)
      return { temperatureC: Number.isFinite(t) ? (unit === 'F' ? fToC(t) : t) : null, humidity: Number.isFinite(h) ? Math.min(Math.max(h, 0), 100) : null, condition: mCond || null }
    }
    if (weather.status === 'ok') return { temperatureC: weather.reading.temperatureC, humidity: weather.reading.humidity, condition: weather.reading.condition }
    return null
  }, [manual, mTemp, mHum, mCond, unit, weather])

  const result = useMemo(
    () => recommend(items, { activity, timeOfDay: tod, weather: effective, now: new Date() }, { history, affinity }),
    [items, activity, tod, effective, history, affinity]
  )

  const setActivityPersist = (a: string) => {
    setActivity(a)
    store.set('rec.activity', a)
  }

  const addActivity = async () => {
    const r = await window.api.settings.addActivity(newActivity ?? '')
    if (!r.ok) return say(r.message)
    setActivities(r.data)
    setActivityPersist(newActivity!.trim())
    setNewActivity(null)
  }

  /** Switch to hand entry, starting from what the live reading said. */
  const startManual = () => {
    if (weather.status === 'ok') {
      setMTemp(String(Math.round(unit === 'F' ? cToF(weather.reading.temperatureC) : weather.reading.temperatureC)))
      setMHum(String(weather.reading.humidity))
      setMCond(weather.reading.condition)
    }
    setManual(true)
  }

  const wearOne = async (r: Recommendation) => {
    setBusy(true)
    const detail = await window.api.fragrances.get(r.id)
    const sprays = Math.max(1, detail?.defaultSprays ?? Math.round(detail?.performance.avgSprays ?? 4))
    const res = await window.api.wears.log({
      fragranceId: r.id,
      wornAt: nowLocal(),
      timeOfDay: tod,
      sprays,
      activity,
      temperatureC: effective?.temperatureC ?? null,
      humidity: effective?.humidity ?? null,
      weather: effective?.condition ?? null
    })
    setBusy(false)
    if (!res.ok) return say(res.message)
    const low = res.data.warnings[0]
    say(`Logged ${r.name}${low ? `. It is running low: ${low.percent}% left.` : '.'}`, async () => {
      await window.api.wears.delete(res.data.id)
      await loadCandidates()
      say(`Removed the wear of ${r.name}.`)
    })
    await loadCandidates()
  }

  const wearCombo = async () => {
    const combo = result.combo
    if (!combo) return
    setBusy(true)
    const saved = await window.api.layering.saveCombo({ items: combo.ids.map((id) => ({ fragranceId: id, sprays: 2 })), predictedScore: combo.layerScore })
    if (!saved.ok) {
      setBusy(false)
      return say(saved.message)
    }
    const res = await window.api.wears.log({
      comboId: saved.data.id,
      wornAt: nowLocal(),
      timeOfDay: tod,
      sprays: combo.ids.length * 2,
      activity,
      temperatureC: effective?.temperatureC ?? null,
      humidity: effective?.humidity ?? null,
      weather: effective?.condition ?? null
    })
    setBusy(false)
    if (!res.ok) return say(res.message)
    say(`Logged the blend ${combo.names.join(' + ')}.`, async () => {
      await window.api.wears.delete(res.data.id)
      await loadCandidates()
      say('Removed that wear.')
    })
    await loadCandidates()
  }

  if (loaded && items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h1 className="font-display text-3xl text-brass-400">What should I wear today?</h1>
        <p className="mt-2 max-w-md text-cream/60">Recommendations come from the fragrances in My Collection. Add some bottles there first.</p>
      </div>
    )
  }

  const w = weather.status === 'ok' ? weather.reading : null

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <header>
        <h1 className="font-display text-3xl text-brass-400">What should I wear today?</h1>
        <p className="text-sm text-cream/55">Pick the occasion. I weigh the weather, the time of day, how each fragrance performs on you, and what you wore recently.</p>
      </header>

      <section className="grid gap-4 rounded-xl border border-ink-600 bg-ink-800 p-4 md:grid-cols-[1fr_1fr_1.3fr]" aria-label="Today">
        <div>
          <label className="text-xs uppercase tracking-wider text-cream/50" htmlFor="activity">
            Activity
          </label>
          <select
            id="activity"
            value={newActivity !== null ? '__new' : activity}
            onChange={(e) => (e.target.value === '__new' ? setNewActivity('') : (setNewActivity(null), setActivityPersist(e.target.value)))}
            className={`${field} mt-1 w-full`}
          >
            {!activities.includes(activity) && <option>{activity}</option>}
            {activities.map((a) => (
              <option key={a}>{a}</option>
            ))}
            <option value="__new">+ Add my own…</option>
          </select>
          {newActivity !== null && (
            <div className="mt-2 flex gap-2">
              <input autoFocus value={newActivity} onChange={(e) => setNewActivity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addActivity()} placeholder="Activity name" className={`${field} min-w-0 flex-1`} />
              <button className={primaryBtn} onClick={addActivity}>
                Add
              </button>
            </div>
          )}
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-cream/50">Time of day</div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {TIMES.map((t) => (
              <button key={t.key} onClick={() => setTod(t.key)} className={`rounded-md border px-2 py-1.5 text-sm ${tod === t.key ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/75 hover:bg-ink-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-cream/50">Weather</span>
            <span className="flex gap-3 text-[11px] text-cream/50">
              <button className="underline hover:text-cream" onClick={() => setPickLocation(true)}>
                {location ? location.label : 'Set location'}
              </button>
              {weather.status === 'ok' && (
                <button className="underline hover:text-cream" onClick={() => void loadWeather()}>
                  Refresh
                </button>
              )}
            </span>
          </div>

          {manual ? (
            <div className="mt-1">
              <div className="grid grid-cols-3 gap-1.5">
                <input type="number" step="any" placeholder={`°${unit}`} aria-label={`Temperature in °${unit}`} value={mTemp} onChange={(e) => setMTemp(e.target.value)} className={`${field} min-w-0`} />
                <input type="number" min={0} max={100} placeholder="RH %" aria-label="Humidity in percent" value={mHum} onChange={(e) => setMHum(e.target.value)} className={`${field} min-w-0`} />
                <select value={mCond} onChange={(e) => setMCond(e.target.value)} aria-label="Conditions" className={`${field} min-w-0`}>
                  <option value="">Conditions</option>
                  {WEATHER_CONDITIONS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-cream/50">
                <span>
                  {weather.status === 'error' ? weather.message : weather.status === 'none' ? 'Set a location to use live weather.' : 'Entered by hand.'}
                </span>
                {weather.status === 'ok' && (
                  <button className="underline hover:text-cream" onClick={() => setManual(false)}>
                    Use live weather
                  </button>
                )}
                {weather.status === 'error' && (
                  <button className="underline hover:text-cream" onClick={() => void loadWeather()}>
                    Retry
                  </button>
                )}
              </div>
            </div>
          ) : weather.status === 'loading' ? (
            <p className="mt-2 text-sm text-cream/50">Checking the weather…</p>
          ) : (
            w && (
              <div className="mt-1 flex items-center justify-between rounded-lg bg-ink-900 px-3 py-2">
                <div>
                  <div className="font-display text-2xl text-brass-400">{formatTemperature(w.temperatureC, unit)}</div>
                  <div className="text-xs text-cream/60">
                    {w.condition} · {w.humidity}% humidity
                  </div>
                </div>
                <button className="text-xs text-cream/50 underline hover:text-cream" onClick={startManual}>
                  Override
                </button>
              </div>
            )
          )}
        </div>
      </section>

      {result.assumptions.length > 0 && <p className="text-xs text-cream/45">{result.assumptions.join(' ')}</p>}

      <section aria-label="Top picks">
        <h2 className="mb-2 font-display text-xl text-brass-400">Your top {result.picks.length === 1 ? 'pick' : `${result.picks.length} picks`}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {result.picks.map((p, i) => {
            const s = summaries.get(p.id)
            return (
              <article key={p.id} className="flex flex-col rounded-xl border border-ink-600 bg-gradient-to-b from-ink-800 to-ink-900 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-36 w-20 shrink-0 items-end justify-center" style={{ filter: 'drop-shadow(0 6px 4px rgba(0,0,0,.55))' }}>
                    {s && <BottleSvg fragrance={s} scale={0.75} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-widest text-brass-400">#{i + 1}</div>
                        <div className="truncate font-display text-lg leading-tight">{p.name}</div>
                        <div className="truncate text-xs text-cream/55">{p.house}</div>
                      </div>
                      <ScoreBadge score={p.score} />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-snug text-cream/85">{p.explanation}</p>
                {open === p.id && <Breakdown lines={p.breakdown} />}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <button className="text-xs text-cream/50 underline hover:text-cream" onClick={() => setOpen(open === p.id ? null : p.id)}>
                    {open === p.id ? 'Hide details' : 'Why?'}
                  </button>
                  <div className="flex gap-2">
                    <button className={ghostBtn} onClick={() => navigate(`/?open=${p.id}`)}>
                      Open
                    </button>
                    <button className={primaryBtn} disabled={busy} onClick={() => wearOne(p)} title="Logs a wear with today's weather and activity filled in">
                      Wear this
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Layering suggestion">
        <h2 className="font-display text-lg text-brass-400">A layering idea</h2>
        {result.combo ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-base">
                {result.combo.names.join(' + ')} <span className="ml-1 text-xs text-cream/50">{result.combo.verdict} · {result.combo.layerScore}/100</span>
              </div>
              <p className="mt-1 text-sm text-cream/75">{result.combo.description}</p>
              <p className="mt-1 text-xs text-cream/50">{result.combo.note}</p>
            </div>
            <div className="flex gap-2">
              <button className={ghostBtn} onClick={() => navigate(`/layering?mix=${result.combo!.ids.join(',')}`)}>
                Open in Layering Lab
              </button>
              <button className={primaryBtn} disabled={busy} onClick={wearCombo}>
                Wear this blend
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-sm text-cream/50">None of today's top fragrances pair well enough to suggest a blend.</p>
        )}
      </section>

      <section>
        <button className="text-sm text-cream/60 underline hover:text-cream" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Hide the full ranking' : `Show all ${result.ranked.length} fragrances ranked`}
        </button>
        {showAll && (
          <ol className="mt-2 divide-y divide-ink-700 rounded-xl border border-ink-600 bg-ink-800">
            {result.ranked.map((r, i) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-6 text-cream/35">{i + 1}.</span>
                <span className="w-9 text-right font-display text-lg">{r.score}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.name} <span className="text-cream/45">{r.house}</span>
                </span>
                <span className="hidden flex-[2] truncate text-xs text-cream/50 md:block">{r.explanation}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {pickLocation && (
        <LocationPicker
          current={location}
          onClose={() => setPickLocation(false)}
          onSaved={(loc) => {
            setPickLocation(false)
            setLocation(loc)
            if (loc) {
              setManual(false)
              void loadWeather()
            } else setWeather({ status: 'none' })
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-brass-500/40 bg-ink-800 px-4 py-2 text-sm shadow-xl" role="status">
          {toast.text}
          {toast.undo && (
            <button
              className="text-brass-400 underline"
              onClick={() => {
                toast.undo?.()
                setToast(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
