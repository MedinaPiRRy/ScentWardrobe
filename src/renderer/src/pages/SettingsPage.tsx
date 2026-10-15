import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { AppPaths, BackupInfo, DbInfo, SavedLocation } from '@shared/types'
import type { TempUnit } from '@shared/weather'
import AffinityEditor from '../components/AffinityEditor'
import { ghostBtn, primaryBtn } from '../components/Dialogs'
import ImportWizard from '../components/ImportWizard'
import LocationPicker from '../components/LocationPicker'
import FragranticaProfileDialog from '../components/FragranticaProfileDialog'
import UsualSpraysDialog from '../components/UsualSpraysDialog'
import { CURRENCIES, isCurrencyCode, saveCurrency, useCurrency } from '../lib/money'
import { applyTheme, storedTheme, type ThemeChoice } from '../lib/theme'

const card = 'rounded-xl border border-ink-600 bg-ink-800 p-5'

const bytes = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`)

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-display text-xl text-brass-400">{title}</h2>
      {hint && <p className="mt-1 text-sm text-cream/55">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-ink-900 p-1">
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={value === o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-4 py-1.5 text-sm ${value === o.key ? 'bg-ink-600 text-brass-400' : 'text-cream/70 hover:text-cream'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPage() {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme())
  const [unit, setUnit] = useState<TempUnit>('C')
  const [location, setLocation] = useState<SavedLocation | null>(null)
  const [pickLocation, setPickLocation] = useState(false)
  const [threshold, setThreshold] = useState(15)
  const [autoBackup, setAutoBackup] = useState(true)
  const [includeDataset, setIncludeDataset] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [paths, setPaths] = useState<AppPaths | null>(null)
  const [info, setInfo] = useState<DbInfo | null>(null)
  const [datasetCount, setDatasetCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [sprays, setSprays] = useState(false)
  const [profileImport, setProfileImport] = useState(false)
  const currency = useCurrency()
  const [customCode, setCustomCode] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const say = useCallback((m: string) => {
    setToast(m)
    window.setTimeout(() => setToast((t) => (t === m ? null : t)), 5000)
  }, [])

  const refresh = useCallback(async () => {
    const [b, p, i, d] = await Promise.all([window.api.backup.list(), window.api.app.paths(), window.api.app.dbInfo(), window.api.search.datasetInfo()])
    setBackups(b)
    setPaths(p)
    setInfo(i)
    setDatasetCount(d.count)
  }, [])

  useEffect(() => {
    void (async () => {
      setLocation(await window.api.weather.location())
      if ((await window.api.settings.get('units.temp')) === 'F') setUnit('F')
      const t = parseFloat((await window.api.settings.get('bottle.lowThreshold')) ?? '')
      if (Number.isFinite(t)) setThreshold(Math.round(t * 100))
      setAutoBackup((await window.api.settings.get('backup.auto')) !== '0')
      await refresh()
    })()
  }, [refresh])

  useEffect(() => applyTheme(theme), [theme])

  const run = async <T,>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(name)
    try {
      return await fn()
    } finally {
      setBusy(null)
    }
  }

  const makeBackup = async () => {
    const r = await run('backup', () => window.api.backup.create(includeDataset))
    if (!r) return
    say(r.ok ? `Backup saved (${bytes(r.data.bytes)}).` : r.message)
    await refresh()
  }

  const saveCopy = async () => {
    const r = await run('copy', () => window.api.backup.exportAs(includeDataset))
    if (r?.ok && r.data) say(`Saved ${bytes(r.data.bytes)} to ${r.data.path}`)
    else if (r && !r.ok) say(r.message)
    await refresh()
  }

  const restore = async (path?: string) => {
    const r = await run('restore', () => window.api.backup.restore(path))
    if (r && !r.ok) say(r.message)
  }

  const exportCsv = async (scope: 'all' | 'collection') => {
    const r = await run('csv', () => window.api.export.collectionCsv(scope))
    if (r?.ok && r.data) say(`Exported ${r.data.rows} fragrances to ${r.data.path}`)
    else if (r && !r.ok) say(r.message)
  }

  const savedSetting = async (key: string, value: string) => {
    const r = await window.api.settings.set(key, value)
    if (!r.ok) say(r.message)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="font-display text-3xl text-brass-400">Settings</h1>

      <Section title="Appearance and units">
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <div>
            <div className="mb-1 text-sm text-cream/70">Theme</div>
            <Choice
              label="Theme"
              value={theme}
              options={[
                { key: 'dark', label: 'Dark' },
                { key: 'light', label: 'Light' },
                { key: 'system', label: 'Match Windows' }
              ]}
              onChange={(t) => {
                setTheme(t)
                void savedSetting('ui.theme', t)
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-cream/70">Temperature</div>
            <Choice
              label="Temperature unit"
              value={unit}
              options={[
                { key: 'C', label: '°C' },
                { key: 'F', label: '°F' }
              ]}
              onChange={(u) => {
                setUnit(u)
                void savedSetting('units.temp', u)
              }}
            />
          </div>
          <div>
            <div className="mb-1 text-sm text-cream/70">Currency</div>
            <div className="flex items-center gap-2">
              <select
                aria-label="Currency"
                value={(CURRENCIES as readonly string[]).includes(currency) ? currency : 'custom'}
                onChange={(e) => e.target.value !== 'custom' && void saveCurrency(e.target.value)}
                className="rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {!(CURRENCIES as readonly string[]).includes(currency) && <option value="custom">{currency}</option>}
              </select>
              <input
                aria-label="Other currency code"
                placeholder="Other, e.g. NZD"
                maxLength={3}
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && isCurrencyCode(customCode) && void saveCurrency(customCode).then(() => setCustomCode(''))}
                className="w-32 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream"
              />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Weather location" hint="Used for the daily recommendations. Only the city's coordinates are sent to Open-Meteo.">
        <div className="flex items-center gap-3">
          <span className="text-sm">{location ? location.label : 'Not set'}</span>
          <button className={ghostBtn} onClick={() => setPickLocation(true)}>
            {location ? 'Change…' : 'Set location…'}
          </button>
        </div>
      </Section>

      <Section title="Usual sprays" hint="How many sprays you normally use of each fragrance. It is the default in the wear form and for wears you add for past days.">
        <button className={ghostBtn} onClick={() => setSprays(true)}>
          Set usual sprays…
        </button>
      </Section>

      <Section title="Bottle levels" hint="You get a warning when a bottle drops below this level after a wear.">
        <label className="flex items-center gap-4 text-sm">
          Warn below <span className="w-10 text-brass-400">{threshold}%</span>
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={threshold}
            onChange={(e) => setThreshold(+e.target.value)}
            onMouseUp={() => void savedSetting('bottle.lowThreshold', String(threshold / 100))}
            onKeyUp={() => void savedSetting('bottle.lowThreshold', String(threshold / 100))}
            className="w-64 accent-[#c4964a]"
            aria-label="Low level threshold"
          />
        </label>
      </Section>

      <Section title="Layering: accord affinity matrix" hint="How well accords pair. Edit it to match your own nose.">
        <details>
          <summary className="cursor-pointer text-sm text-brass-400">Show and edit the matrix</summary>
          <div className="mt-3">
            <AffinityEditor />
          </div>
        </details>
      </Section>

      <Section title="Backup and restore" hint="One zip holds your whole database and all cached images.">
        <div className="flex flex-wrap items-center gap-2">
          <button className={primaryBtn} disabled={busy !== null} onClick={makeBackup}>
            {busy === 'backup' ? 'Backing up…' : 'Back up now'}
          </button>
          <button className={ghostBtn} disabled={busy !== null} onClick={saveCopy}>
            Save a copy elsewhere…
          </button>
          <button className={ghostBtn} disabled={busy !== null} onClick={() => restore()}>
            Restore from a file…
          </button>
          <button className="text-sm text-cream/60 underline hover:text-cream" onClick={() => void window.api.backup.openFolder()}>
            Open backups folder
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2 text-sm text-cream/75">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => {
                setAutoBackup(e.target.checked)
                void savedSetting('backup.auto', e.target.checked ? '1' : '0')
              }}
            />
            Back up automatically once a week (keeps the last 8)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeDataset} onChange={(e) => setIncludeDataset(e.target.checked)} />
            Include the imported dataset in manual backups ({datasetCount.toLocaleString()} fragrances; makes the file much bigger and can be re-imported from the original file)
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-xs uppercase tracking-wider text-cream/50">Backups in the folder</div>
          {backups.length === 0 ? (
            <p className="text-sm text-cream/50">None yet.</p>
          ) : (
            <ul className="divide-y divide-ink-700 rounded-lg border border-ink-600">
              {backups.slice(0, 8).map((b) => (
                <li key={b.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  <span className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] uppercase text-cream/70">{b.kind === 'pre-restore' ? 'before restore' : b.kind}</span>
                  <span className="w-20 text-right text-xs text-cream/55">{bytes(b.bytes)}</span>
                  <span className="w-36 text-right text-xs text-cream/55">{new Date(b.modified).toLocaleString()}</span>
                  <button className="text-xs underline hover:text-brass-400" disabled={busy !== null} onClick={() => paths && restore(`${paths.backups}\\${b.name}`)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section title="Export" hint="A spreadsheet of your fragrances with notes, accords, bottle levels and wear statistics. Opens in Excel.">
        <div className="flex gap-2">
          <button className={ghostBtn} disabled={busy !== null} onClick={() => exportCsv('collection')}>
            Export My Collection (CSV)
          </button>
          <button className={ghostBtn} disabled={busy !== null} onClick={() => exportCsv('all')}>
            Export everything incl. wishlist and To Try (CSV)
          </button>
        </div>
      </Section>

      <Section title="Fragrance data" hint="The imported dataset is only used for searching when you add a fragrance.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{datasetCount > 0 ? `${datasetCount.toLocaleString()} fragrances imported` : 'No dataset imported'}</span>
          <button className={ghostBtn} onClick={() => setImporting(true)}>
            {datasetCount > 0 ? 'Re-import or clear…' : 'Import a dataset…'}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-cream/70">
          Add the lists from a Fragrantica profile (Have, Want, Had, custom shelves).
          <button className={ghostBtn} onClick={() => setProfileImport(true)}>
            Import from Fragrantica…
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-cream/70">
          Sample fragrances (for trying the app): {info ? info.sampleCount : 0} loaded.
          <button
            className={ghostBtn}
            onClick={async () => {
              const r = await window.api.dev.seedSampleData()
              say(r.ok ? `Added ${r.data.added} sample fragrances.` : r.message)
              await refresh()
            }}
          >
            Load sample data
          </button>
          <button
            className={ghostBtn}
            disabled={!info || info.sampleCount === 0}
            onClick={async () => {
              const r = await window.api.dev.clearSampleData()
              say(r.ok ? `Removed ${r.data.removed} sample fragrances.` : r.message)
              await refresh()
            }}
          >
            Remove sample data
          </button>
        </div>
      </Section>

      <Section title="About">
        {paths && (
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-cream/50">Version</dt>
            <dd>{paths.version}</dd>
            <dt className="text-cream/50">Data folder</dt>
            <dd className="break-all">
              {paths.userData}{' '}
              <button className="ml-2 text-xs underline hover:text-brass-400" onClick={() => void window.api.app.openDataFolder()}>
                Open
              </button>
            </dd>
            <dt className="text-cream/50">Database</dt>
            <dd>{bytes(paths.databaseBytes)}</dd>
            <dt className="text-cream/50">Cached images</dt>
            <dd>{bytes(paths.imagesBytes)}</dd>
            <dt className="text-cream/50">My library</dt>
            <dd>{info ? `${info.fragranceCount} fragrances (schema v${info.schemaVersion})` : ''}</dd>
          </dl>
        )}
        <p className="mt-3 text-xs text-cream/40">Everything stays on this computer. The only network requests are the weather lookup and, when you ask for it, a Fragrantica page import.</p>
      </Section>

      {pickLocation && (
        <LocationPicker
          current={location}
          onClose={() => setPickLocation(false)}
          onSaved={(loc) => {
            setLocation(loc)
            setPickLocation(false)
          }}
        />
      )}
      {sprays && (
        <UsualSpraysDialog
          onClose={() => setSprays(false)}
          onSaved={() => {
            setSprays(false)
            say('Usual sprays saved.')
          }}
        />
      )}
      {profileImport && (
        <FragranticaProfileDialog
          onClose={() => setProfileImport(false)}
          onDone={() => void refresh()}
        />
      )}
      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false)
            say(m)
            void refresh()
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
