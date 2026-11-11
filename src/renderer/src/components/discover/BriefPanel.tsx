import { useEffect, useState } from 'react'
import { ACTIVITY_CHOICES, EMPTY_BRIEF, type Brief } from '@shared/discover/brief'
import type { SavedBrief } from '@shared/discover/dto'
import { ghostBtn, primaryBtn } from '../Dialogs'
import { cToF, fToC, type TempUnit } from '@shared/weather'
import ChipInput from './ChipInput'

const ACCORD_SUGGESTIONS = ['citrus', 'woody', 'fresh', 'amber', 'vanilla', 'aromatic', 'fresh spicy', 'warm spicy', 'musky', 'floral', 'white floral', 'powdery', 'leather', 'tobacco', 'aquatic', 'green', 'fruity', 'oud', 'rose', 'earthy', 'smoky', 'balsamic', 'herbal', 'lavender', 'iris', 'sweet', 'coconut', 'caramel', 'coffee', 'mineral']
const NOTE_SUGGESTIONS = ['bergamot', 'lemon', 'vetiver', 'cedar', 'sandalwood', 'patchouli', 'vanilla', 'tonka bean', 'amber', 'musk', 'jasmine', 'rose', 'lavender', 'pepper', 'cardamom', 'cinnamon', 'leather', 'tobacco', 'oakmoss', 'ambroxan', 'iris', 'orange', 'grapefruit', 'mint', 'sage', 'incense', 'oud', 'coffee']

const sel = 'w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
const lab = 'mb-1 block text-xs uppercase tracking-wider text-cream/70'

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-ink-600 p-3">
      <legend className="px-1 text-sm text-brass-400">{title}</legend>
      {hint && <p className="mb-2 text-xs text-cream/70">{hint}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

/** One brief: context, performance, social, wanted notes and accords, and dealbreakers, all combinable. */
export default function BriefPanel({ brief, onBrief, saved, onSaved, unit }: { brief: Brief; onBrief: (b: Brief) => void; saved: SavedBrief[]; onSaved: (s: SavedBrief[]) => void; unit: TempUnit }) {
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [weatherNote, setWeatherNote] = useState<string | null>(null)
  const [tempText, setTempText] = useState('')
  const set = (patch: Partial<Brief>) => onBrief({ ...brief, ...patch })

  // The temperature box shows my own unit; the brief always stores degrees Celsius. A loaded or cleared brief refreshes the box.
  useEffect(() => {
    const parsed = parseFloat(tempText.replace(',', '.'))
    const typed = Number.isFinite(parsed) ? Math.round((unit === 'F' ? fToC(parsed) : parsed) * 10) / 10 : null
    if (typed !== brief.temperatureC) setTempText(brief.temperatureC == null ? '' : String(Math.round(unit === 'F' ? cToF(brief.temperatureC) : brief.temperatureC)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.temperatureC, unit])

  const useWeather = async () => {
    setWeatherNote('Looking up the weather…')
    const r = await window.api.weather.current()
    if (!r.ok) return setWeatherNote(r.message)
    set({ temperatureC: Math.round(r.data.temperatureC), humidity: Math.round(r.data.humidity) })
    setTempText(String(Math.round(unit === 'F' ? cToF(r.data.temperatureC) : r.data.temperatureC)))
    setWeatherNote(`Using the weather in ${r.data.location}: ${r.data.condition}.`)
  }

  const save = async () => {
    const r = await window.api.discover.saveBrief(name, brief)
    if (!r.ok) return setMsg(r.message)
    onSaved(r.data)
    setMsg(`Saved "${name.trim()}".`)
  }

  return (
    <section className="space-y-3 rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Brief">
      <p className="text-sm text-cream/80">Describe what you need. Everything you fill in is combined; leave the rest empty. Results show what each fragrance meets and what it only partly meets.</p>

      <Group title="Context" hint="The dataset has season and day/night votes; temperature and humidity are matched with a rule of thumb from each fragrance's accords (an estimate).">
        <div>
          <label className={lab} htmlFor="b-season">Season</label>
          <select id="b-season" className={sel} value={brief.season ?? ''} onChange={(e) => set({ season: (e.target.value || null) as Brief['season'] })}>
            <option value="">Any</option>
            <option value="spring">Spring</option>
            <option value="summer">Summer</option>
            <option value="fall">Fall</option>
            <option value="winter">Winter</option>
          </select>
        </div>
        <div>
          <label className={lab} htmlFor="b-time">Time of day</label>
          <select id="b-time" className={sel} value={brief.timeOfDay ?? ''} onChange={(e) => set({ timeOfDay: (e.target.value || null) as Brief['timeOfDay'] })}>
            <option value="">Any</option>
            <option value="day">Day</option>
            <option value="night">Night</option>
          </select>
        </div>
        <div>
          <label className={lab} htmlFor="b-temp">Temperature (°{unit})</label>
          <input
            id="b-temp"
            inputMode="decimal"
            className={sel}
            value={tempText}
            placeholder="not set"
            onChange={(e) => {
              setTempText(e.target.value)
              const v = parseFloat(e.target.value.replace(',', '.'))
              set({ temperatureC: Number.isFinite(v) ? Math.round((unit === 'F' ? fToC(v) : v) * 10) / 10 : null })
            }}
          />
        </div>
        <div>
          <label className={lab} htmlFor="b-hum">Humidity (%)</label>
          <input id="b-hum" inputMode="numeric" className={sel} value={brief.humidity ?? ''} placeholder="not set" onChange={(e) => set({ humidity: e.target.value === '' || !Number.isFinite(Number(e.target.value)) ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" className={ghostBtn} onClick={useWeather}>
            Use today's weather
          </button>
          <span className="text-xs text-cream/70" role="status">{weatherNote}</span>
        </div>
        <div className="sm:col-span-2">
          <label className={lab} htmlFor="b-act">Occasion or activity</label>
          <input id="b-act" list="b-act-list" className={sel} value={brief.activity} placeholder="office, date night, gym, wedding..." onChange={(e) => set({ activity: e.target.value })} />
          <datalist id="b-act-list">
            {ACTIVITY_CHOICES.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
      </Group>

      <Group title="Performance">
        <div>
          <label className={lab} htmlFor="b-long">Lasts</label>
          <select id="b-long" className={sel} value={brief.longevity ?? ''} onChange={(e) => set({ longevity: (e.target.value || null) as Brief['longevity'] })}>
            <option value="">Any</option>
            <option value="short">A few hours</option>
            <option value="moderate">A work day</option>
            <option value="long">All day</option>
          </select>
        </div>
        <div>
          <label className={lab} htmlFor="b-proj">Projection</label>
          <select id="b-proj" className={sel} value={brief.projection ?? ''} onChange={(e) => set({ projection: (e.target.value || null) as Brief['projection'] })}>
            <option value="">Any</option>
            <option value="skin">Stays close to the skin</option>
            <option value="moderate">Moderate</option>
            <option value="room">Fills a room</option>
          </select>
        </div>
      </Group>

      <Group title="Social" hint="Crowd-pleaser is an estimate from ratings, how well known it is and a moderate sillage. There is no data on compliments for fragrances you do not own.">
        <div>
          <label className={lab} htmlFor="b-crowd">Reaction</label>
          <select id="b-crowd" className={sel} value={brief.crowd ?? ''} onChange={(e) => set({ crowd: (e.target.value || null) as Brief['crowd'] })}>
            <option value="">No preference</option>
            <option value="pleaser">A crowd-pleaser (estimate)</option>
            <option value="stand_out">Stands out, not what everyone owns</option>
          </select>
        </div>
        <div>
          <label className={lab} htmlFor="b-pop">Popularity</label>
          <select id="b-pop" className={sel} value={brief.popularity} onChange={(e) => set({ popularity: e.target.value as Brief['popularity'] })}>
            <option value="any">Any</option>
            <option value="hidden_gems">Hidden gems (less common, well rated)</option>
            <option value="popular">Popular</option>
            <option value="trending">Trending (recent activity)</option>
          </select>
        </div>
      </Group>

      <Group title="Must have, and dealbreakers">
        <ChipInput label="Wanted accords" value={brief.wantAccords} onChange={(v) => set({ wantAccords: v })} suggestions={ACCORD_SUGGESTIONS} placeholder="e.g. citrus" />
        <ChipInput label="Wanted notes" value={brief.wantNotes} onChange={(v) => set({ wantNotes: v })} suggestions={NOTE_SUGGESTIONS} placeholder="e.g. bergamot" />
        <ChipInput label="No prominent accord" value={brief.avoidAccords} onChange={(v) => set({ avoidAccords: v })} suggestions={ACCORD_SUGGESTIONS} placeholder="e.g. sweet" />
        <ChipInput label="No prominent note" value={brief.avoidNotes} onChange={(v) => set({ avoidNotes: v })} suggestions={NOTE_SUGGESTIONS} placeholder="e.g. vetiver" />
        <label className="flex items-center gap-2 text-sm text-cream">
          <input type="checkbox" checked={brief.notSyrupy} onChange={(e) => set({ notSyrupy: e.target.checked })} className="accent-[#c4964a]" />
          Not syrupy sweet
        </label>
        <div>
          <label className={lab} htmlFor="b-gender">Gender lean (a soft preference, off by default)</label>
          <select id="b-gender" className={sel} value={brief.genderLean == null ? '' : brief.genderLean > 0.3 ? 'm' : brief.genderLean < -0.3 ? 'f' : 'u'} onChange={(e) => set({ genderLean: e.target.value === '' ? null : e.target.value === 'm' ? 1 : e.target.value === 'f' ? -1 : 0 })}>
            <option value="">Ignore</option>
            <option value="m">Leans masculine</option>
            <option value="f">Leans feminine</option>
            <option value="u">Unisex</option>
          </select>
        </div>
      </Group>

      <div className="flex flex-wrap items-end gap-3 border-t border-ink-600 pt-3">
        <div className="min-w-[12rem] flex-1">
          <label className={lab} htmlFor="b-name">Save this brief as</label>
          <input id="b-name" className={sel} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer office" />
        </div>
        <button type="button" className={primaryBtn} disabled={!name.trim()} onClick={save}>
          Save
        </button>
        <button type="button" className={ghostBtn} onClick={() => onBrief(EMPTY_BRIEF)}>
          Clear
        </button>
      </div>
      {msg && <p className="text-sm text-cream/80" role="status">{msg}</p>}
      {saved.length > 0 && (
        <div>
          <div className={lab}>Saved briefs</div>
          <ul className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <li key={s.id} className="inline-flex items-center overflow-hidden rounded-full border border-ink-600 text-sm">
                <button type="button" className="px-3 py-1 text-cream hover:bg-ink-700" onClick={() => (onBrief(s.brief), setName(s.name))}>
                  {s.name}
                </button>
                <button
                  type="button"
                  className="border-l border-ink-600 px-2 py-1 text-cream/70 hover:bg-ink-700 hover:text-cream"
                  aria-label={`Delete the brief ${s.name}`}
                  onClick={async () => {
                    const r = await window.api.discover.deleteBrief(s.id)
                    if (r.ok) onSaved(r.data)
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
