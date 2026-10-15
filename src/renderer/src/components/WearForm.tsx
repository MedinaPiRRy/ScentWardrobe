import { useEffect, useState } from 'react'
import type { FragranceDetail, TimeOfDay, WearEntry, WearInput, WearLogged } from '@shared/types'
import { PROJECTION_LABELS } from '../lib/performance'
import { formatMl } from '../lib/bottles'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

const fieldBase = 'rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
const field = `mt-1 w-full ${fieldBase}`
export const WEATHER_CONDITIONS = ['Clear', 'Partly cloudy', 'Cloudy', 'Fog', 'Drizzle', 'Rain', 'Snow', 'Thunderstorm', 'Windy']
const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']
const LONGEVITY_CHIPS = [1, 2, 3, 4, 6, 8, 10, 12]

const pad = (n: number) => String(n).padStart(2, '0')
/** 'YYYY-MM-DDTHH:MM' in local time, as a datetime-local input wants it. */
export const localInputValue = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
/** Noon on a past day (or now, if the day is today): a sensible starting time for an entry added later. */
export function prefillWhen(day: string): string {
  const today = localInputValue()
  return day === today.slice(0, 10) ? today : `${day}T12:00`
}

export const timeOfDayFor = (hour: number): TimeOfDay => (hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night')

export interface WeatherPrefill {
  temperatureC?: number | null
  humidity?: number | null
  weather?: string | null
}

interface Props {
  /** Log a wear of one fragrance... */
  fragranceId?: number
  /** ...or of a saved layer combo. */
  comboId?: number
  comboTitle?: string
  /** Sprays to start with when logging a combo (the total of its ratio). */
  defaultSprays?: number
  /** When set, the form edits this wear instead of logging a new one. */
  entry?: WearEntry
  activityPrefill?: string | null
  /** Start on this day ('YYYY-MM-DD'), for logging past wears from the calendar. */
  datePrefill?: string
  weatherPrefill?: WeatherPrefill
  onClose: () => void
  /** `label` is the fragrance name, or the combo's title. */
  onSaved: (result: WearLogged | null, label: string) => void
}

export default function WearForm({ fragranceId, comboId, comboTitle, defaultSprays, entry, activityPrefill, datePrefill, weatherPrefill, onClose, onSaved }: Props) {
  const isCombo = comboId != null || entry?.comboId != null
  const [d, setD] = useState<FragranceDetail | null>(null)
  const [activities, setActivities] = useState<string[]>([])
  const [when, setWhen] = useState(entry ? entry.wornAt.replace(' ', 'T').slice(0, 16) : datePrefill ? prefillWhen(datePrefill) : localInputValue())
  const [takeFromBottle, setTakeFromBottle] = useState(false)
  const [tod, setTod] = useState<TimeOfDay | 'auto'>('auto')
  const [sprays, setSprays] = useState(entry ? String(entry.sprays) : '')
  const [bottleId, setBottleId] = useState<number | null>(entry?.bottleId ?? null)
  const [activity, setActivity] = useState(entry?.activity ?? activityPrefill ?? '')
  const [newActivity, setNewActivity] = useState<string | null>(null)
  const [temp, setTemp] = useState(entry?.temperatureC != null ? String(entry.temperatureC) : weatherPrefill?.temperatureC != null ? String(weatherPrefill.temperatureC) : '')
  const [humidity, setHumidity] = useState(entry?.humidity != null ? String(entry.humidity) : weatherPrefill?.humidity != null ? String(weatherPrefill.humidity) : '')
  const [weather, setWeather] = useState(entry?.weather ?? weatherPrefill?.weather ?? '')
  const [projection, setProjection] = useState<number | null>(entry?.projection ?? null)
  const [longevity, setLongevity] = useState(entry?.longevityHours != null ? String(entry.longevityHours) : '')
  const [compliments, setCompliments] = useState(String(entry?.compliments ?? 0))
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.settings.activities().then(setActivities)
    if (isCombo || fragranceId == null) {
      if (!entry) setSprays(String(defaultSprays ?? 3))
      return
    }
    void (async () => {
      const detail = await window.api.fragrances.get(fragranceId)
      setD(detail)
      if (!detail) return
      if (!entry) {
        setSprays(String(Math.max(1, detail.defaultSprays ?? Math.round(detail.performance.avgSprays ?? 4))))
        const active = detail.bottles.filter((b) => b.status === 'active' && b.remainingMl > 0)
        const last = (await window.api.wears.list({ fragranceId, limit: 1 }))[0]
        setBottleId((active.find((b) => b.id === last?.bottleId) ?? active[0])?.id ?? null)
      }
    })()
  }, [fragranceId, entry, isCombo, defaultSprays])

  const isPast = when.slice(0, 10) < localInputValue().slice(0, 10)
  const num = (v: string) => (v.trim() === '' ? null : parseFloat(v))
  const activeBottles = d?.bottles.filter((b) => b.status === 'active' && (b.remainingMl > 0 || b.id === entry?.bottleId)) ?? []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseInt(sprays, 10)
    if (!Number.isInteger(n) || n < 0) return setError('Enter how many sprays you used.')
    const hour = parseInt(when.slice(11, 13), 10)
    const input: WearInput = {
      ...(isCombo ? { comboId: entry?.comboId ?? comboId } : { fragranceId }),
      bottleId: isCombo ? null : bottleId,
      wornAt: when.replace('T', ' '),
      timeOfDay: tod === 'auto' ? timeOfDayFor(hour) : tod,
      sprays: n,
      activity: activity || null,
      temperatureC: num(temp),
      humidity: num(humidity),
      weather: weather || null,
      projection,
      longevityHours: num(longevity),
      compliments: Math.max(0, parseInt(compliments, 10) || 0),
      notes: notes || null,
      // A past date is a diary entry: it leaves the bottle alone unless this box is ticked.
      ...(isPast && takeFromBottle ? { takeFromBottle: true } : {})
    }
    setSaving(true)
    const r = entry ? await window.api.wears.update(entry.id, input) : await window.api.wears.log(input)
    setSaving(false)
    if (!r.ok) return setError(r.message)
    onSaved(entry ? null : (r.data as WearLogged), comboTitle ?? entry?.title ?? d?.name ?? '')
  }

  const addActivity = async () => {
    const r = await window.api.settings.addActivity(newActivity ?? '')
    if (!r.ok) return setError(r.message)
    setActivities(r.data)
    setActivity(newActivity!.trim())
    setNewActivity(null)
  }

  const title = entry ? `Edit wear: ${entry.title}` : comboTitle ? `Log a wear: ${comboTitle}` : d ? `Log a wear: ${d.name}` : 'Log a wear'

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-cream/80">
        <label>
          When
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={field} required />
        </label>
        <label>
          Time of day
          <select value={tod} onChange={(e) => setTod(e.target.value as TimeOfDay | 'auto')} className={field}>
            <option value="auto">Automatic ({timeOfDayFor(parseInt(when.slice(11, 13), 10) || 0)})</option>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sprays
          <div className="mt-1 flex items-center gap-2">
            <button type="button" className={ghostBtn} onClick={() => setSprays(String(Math.max(0, (parseInt(sprays, 10) || 0) - 1)))} aria-label="Fewer sprays">
              −
            </button>
            <input type="number" min={0} max={60} value={sprays} onChange={(e) => setSprays(e.target.value)} className={`${fieldBase} w-20 text-center`} />
            <button type="button" className={ghostBtn} onClick={() => setSprays(String((parseInt(sprays, 10) || 0) + 1))} aria-label="More sprays">
              +
            </button>
          </div>
        </label>

        {!isCombo ? (
          <label>
            Bottle
            <select value={bottleId ?? ''} onChange={(e) => setBottleId(e.target.value ? +e.target.value : null)} className={field} disabled={!d}>
              {activeBottles.length === 0 && <option value="">No bottle (sample, gift or borrowed)</option>}
              {activeBottles.length > 0 && <option value="">Don't track a bottle</option>}
              {activeBottles.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.type} · {formatMl(b.sizeMl)} · {formatMl(b.remainingMl)} left
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="self-end text-xs text-cream/50">Layer wear: sprays are split across the layers by their ratio.</p>
        )}

        <div>
          <label>
            Activity
            <select
              value={newActivity !== null ? '__new' : activity}
              onChange={(e) => (e.target.value === '__new' ? setNewActivity('') : (setNewActivity(null), setActivity(e.target.value)))}
              className={field}
            >
              <option value="">(none)</option>
              {activity && !activities.includes(activity) && <option>{activity}</option>}
              {activities.map((a) => (
                <option key={a}>{a}</option>
              ))}
              <option value="__new">+ Add my own…</option>
            </select>
          </label>
          {newActivity !== null && (
            <div className="mt-2 flex gap-2">
              <input autoFocus value={newActivity} onChange={(e) => setNewActivity(e.target.value)} placeholder="Activity name" className={`${field} mt-0`} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), void addActivity())} />
              <button type="button" className={primaryBtn} onClick={addActivity}>
                Add
              </button>
            </div>
          )}
        </div>

        <div>
          <div>Weather</div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input type="number" step="any" placeholder="°C" aria-label="Temperature in °C" value={temp} onChange={(e) => setTemp(e.target.value)} className={`${field} mt-0`} />
            <input type="number" step="any" min={0} max={100} placeholder="RH %" aria-label="Humidity in percent" value={humidity} onChange={(e) => setHumidity(e.target.value)} className={`${field} mt-0`} />
            <select value={weather} onChange={(e) => setWeather(e.target.value)} className={`${field} mt-0`} aria-label="Conditions">
              <option value="">Conditions</option>
              {weather && !WEATHER_CONDITIONS.includes(weather) && <option>{weather}</option>}
              {WEATHER_CONDITIONS.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="col-span-2">
          Projection
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3, 4, 5].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProjection(projection === p ? null : p)}
                className={`flex-1 rounded-md border px-2 py-2 text-xs ${projection === p ? 'border-brass-400 bg-brass-500/25 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
              >
                {PROJECTION_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2">
          How long did it last? (hours)
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {LONGEVITY_CHIPS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setLongevity(String(h))}
                className={`rounded-full border px-3 py-1 text-xs ${longevity === String(h) ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
              >
                {h} h
              </button>
            ))}
            <input type="number" step="any" min={0} max={72} value={longevity} onChange={(e) => setLongevity(e.target.value)} className={`${fieldBase} w-24`} aria-label="Longevity in hours" />
            {longevity && (
              <button type="button" className="text-xs text-cream/50 underline" onClick={() => setLongevity('')}>
                clear
              </button>
            )}
          </div>
          {!longevity && !entry && <p className="mt-1 text-xs text-cream/45">Not sure yet? Leave it empty and I'll ask at the end of the day.</p>}
        </div>

        <label>
          Compliments
          <input type="number" min={0} value={compliments} onChange={(e) => setCompliments(e.target.value)} className={field} />
        </label>
        <div />
        {isPast && (
          <div className="col-span-2 rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-2 text-xs text-cream/70">
            This date is in the past, so it is saved as a diary entry: it will not ask how long it lasted, and it leaves bottle levels alone.
            {!isCombo && (
              <label className="mt-1.5 flex items-center gap-2 text-cream/80">
                <input type="checkbox" checked={takeFromBottle} onChange={(e) => setTakeFromBottle(e.target.checked)} />
                Also take the sprays from the bottle
              </label>
            )}
          </div>
        )}
        <label className="col-span-2">
          Notes
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </label>

        {error && (
          <p className="col-span-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={saving || (!isCombo && !d)}>
            {entry ? 'Save changes' : 'Log wear'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
