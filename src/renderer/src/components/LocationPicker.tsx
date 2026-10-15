import { useEffect, useState } from 'react'
import type { GeoResult, SavedLocation } from '@shared/types'
import { ghostBtn, Modal } from './Dialogs'

/** Search a city through Open-Meteo and save it as the weather location. Also used from Settings. */
export default function LocationPicker({ current, onClose, onSaved }: { current: SavedLocation | null; onClose: () => void; onSaved: (loc: SavedLocation | null) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeoResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    let live = true
    const t = window.setTimeout(async () => {
      setBusy(true)
      const r = await window.api.weather.search(query)
      if (!live) return
      setBusy(false)
      setSearched(true)
      if (r.ok) {
        setResults(r.data)
        setError(null)
      } else setError(r.message)
    }, 350)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [query])

  const choose = async (loc: SavedLocation) => {
    const r = await window.api.weather.setLocation({ label: loc.label, latitude: loc.latitude, longitude: loc.longitude })
    if (!r.ok) return setError(r.message)
    onSaved(loc)
  }

  return (
    <Modal title="Where are you?" onClose={onClose}>
      <p className="text-sm text-cream/70">Used only to look up the current temperature and humidity (Open-Meteo, no account needed). Nothing else is sent.</p>
      {current && <p className="mt-2 text-xs text-cream/50">Current: {current.label}</p>}
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a city…"
        className="mt-3 w-full rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-cream"
      />
      <div className="mt-2 min-h-[2rem]">
        {busy && <p className="text-xs text-cream/50">Searching…</p>}
        {error && (
          <p className="text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        {searched && !busy && !error && results.length === 0 && <p className="text-sm text-cream/50">No matching city. Try a different spelling.</p>}
        <ul className="divide-y divide-ink-700 rounded-lg border border-ink-600 empty:hidden">
          {results.map((r) => (
            <li key={`${r.latitude},${r.longitude}`}>
              <button className="w-full px-3 py-2 text-left text-sm hover:bg-ink-700" onClick={() => choose(r)}>
                {r.detail} <span className="text-xs text-cream/40">{r.latitude.toFixed(2)}, {r.longitude.toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 flex justify-between">
        {current ? (
          <button
            className="text-xs text-cream/50 underline hover:text-cream"
            onClick={async () => {
              await window.api.weather.setLocation(null)
              onSaved(null)
            }}
          >
            Remove location
          </button>
        ) : (
          <span />
        )}
        <button className={ghostBtn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
