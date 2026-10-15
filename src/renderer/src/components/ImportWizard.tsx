import { useEffect, useState } from 'react'
import type { ColumnMapping, ImportAnalysis, ImportPreview, MappingField } from '@shared/types'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

const FIELDS: { field: MappingField; label: string; multi?: boolean; required?: boolean }[] = [
  { field: 'name', label: 'Name', required: true },
  { field: 'house', label: 'House / brand', required: true },
  { field: 'year', label: 'Year' },
  { field: 'concentration', label: 'Concentration' },
  { field: 'perfumers', label: 'Perfumer(s)', multi: true },
  { field: 'gender', label: 'Gender' },
  { field: 'description', label: 'Description' },
  { field: 'imageUrl', label: 'Image URL' },
  { field: 'sourceUrl', label: 'Source URL' },
  { field: 'notesTop', label: 'Top notes' },
  { field: 'notesHeart', label: 'Heart / middle notes' },
  { field: 'notesBase', label: 'Base notes' },
  { field: 'notesGeneral', label: 'General notes' },
  { field: 'accords', label: 'Main accords', multi: true },
  { field: 'externalId', label: 'Fragrantica id (builds photo links)' },
  { field: 'popularity', label: 'Popularity (ranks search results)' },
  { field: 'seasonWinter', label: 'Winter votes' },
  { field: 'seasonSpring', label: 'Spring votes' },
  { field: 'seasonSummer', label: 'Summer votes' },
  { field: 'seasonFall', label: 'Fall / autumn votes' },
  { field: 'dayVotes', label: 'Day votes' },
  { field: 'nightVotes', label: 'Night votes' },
  { field: 'longevity', label: 'Community longevity (1-5)' },
  { field: 'sillage', label: 'Community sillage (1-4)' }
]

const sel = 'rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream'

/** Pick a file, map its columns to the schema, preview, import. */
export default function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const [a, setA] = useState<ImportAnalysis | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [existing, setExisting] = useState(0)
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.search.datasetInfo().then((i) => setExisting(i.count))
    return window.api.importer.onProgress((p) => setProgress(p.done))
  }, [])

  // Refresh the preview whenever the mapping changes.
  useEffect(() => {
    if (!a) return
    let live = true
    const t = window.setTimeout(async () => {
      if (!a.preset && (!mapping.name?.length || !mapping.house?.length)) return setPreview(null)
      const r = await window.api.importer.preview(a.path, a.table, mapping)
      if (live) r.ok ? (setPreview(r.data), setError(null)) : setError(r.message)
    }, 200)
    return () => {
      live = false
      window.clearTimeout(t)
    }
  }, [a, mapping])

  const apply = (r: Awaited<ReturnType<typeof window.api.importer.analyze>> | null) => {
    if (!r) return
    if (!r.ok) return setError(r.message)
    setError(null)
    setA(r.data)
    setMapping(r.data.suggested)
  }

  const setCols = (field: MappingField, cols: string[]) => setMapping((m) => ({ ...m, [field]: cols.length ? cols : undefined }))

  const run = async () => {
    if (!a) return
    setBusy(true)
    setProgress(0)
    const r = await window.api.importer.run(a.path, a.table, mapping, replace)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    onDone(`Imported ${r.data.imported.toLocaleString()} fragrances (${r.data.skipped.toLocaleString()} skipped). The dataset now has ${r.data.totalInCatalog.toLocaleString()}.`)
  }

  const clear = async () => {
    if (!window.confirm('Remove the imported dataset? Your own fragrances are not affected.')) return
    await window.api.importer.clearDataset()
    setExisting(0)
    onDone('Imported dataset cleared.')
  }

  const ready = (!!a?.preset || (!!mapping.name?.length && !!mapping.house?.length)) && !!preview && preview.total > preview.skipped

  return (
    <Modal title="Import a dataset" onClose={busy ? () => undefined : onClose} xl>
      {!a ? (
        <div>
          <p className="text-sm text-cream/80">
            Choose a CSV, JSONL or SQLite (.db) file, for example a Fragrantica dataset downloaded from Kaggle. Unzip it first. Imported rows are used for search only, so they never clutter your wardrobes until you add them.
          </p>
          <p className="mt-2 text-xs text-cream/50">Tip: put the file in the project's data/ folder, which opens by default.</p>
          {existing > 0 && <p className="mt-3 text-sm text-brass-400">{existing.toLocaleString()} fragrances are already imported.</p>}
          {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
          <div className="mt-5 flex justify-between">
            {existing > 0 ? (
              <button className="text-xs text-red-300 underline" onClick={clear}>
                Clear imported dataset
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button className={ghostBtn} onClick={onClose}>
                Cancel
              </button>
              <button className={primaryBtn} onClick={async () => apply(await window.api.importer.pickFile())}>
                Choose file…
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-cream/60">{a.path.split(/[\\/]/).pop()}</span>
            <span className="rounded bg-ink-600 px-2 py-0.5 text-xs uppercase">{a.format}</span>
            {a.tables && a.tables.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-cream/70">
                Table
                <select className={sel} value={a.table ?? ''} onChange={async (e) => apply(await window.api.importer.analyze(a.path, e.target.value))}>
                  {a.tables.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
            )}
            <button className="text-xs text-cream/50 underline" onClick={() => { setA(null); setPreview(null) }}>
              Choose another file
            </button>
          </div>

          {a.preset && (
            <p className="rounded-lg border border-brass-500/40 bg-brass-500/10 p-3 text-sm text-cream/90">
              Recognised as a Fragrantica dump. Names, houses, notes (with their icons), accords, season and day/night votes, longevity and sillage are mapped automatically. No column mapping needed.
            </p>
          )}
          <div className={`grid grid-cols-2 gap-x-6 gap-y-2 ${a.preset ? 'hidden' : ''}`}>
            {FIELDS.map((f) => {
              const cols = mapping[f.field] ?? []
              return (
                <div key={f.field} className="text-sm">
                  <div className="text-cream/80">
                    {f.label} {f.required && <span className="text-brass-400">*</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {cols.map((c) => (
                      <span key={c} className="flex items-center gap-1 rounded-full bg-ink-600 px-2 py-0.5 text-xs">
                        {c}
                        <button aria-label={`Remove ${c}`} className="text-cream/50 hover:text-cream" onClick={() => setCols(f.field, cols.filter((x) => x !== c))}>
                          ×
                        </button>
                      </span>
                    ))}
                    {(f.multi || cols.length === 0) && (
                      <select
                        className={sel}
                        value=""
                        aria-label={`Column for ${f.label}`}
                        onChange={(e) => e.target.value && setCols(f.field, f.multi ? [...cols, e.target.value] : [e.target.value])}
                      >
                        <option value="">{cols.length ? '+ add column' : '(none)'}</option>
                        {a.columns.filter((c) => !cols.includes(c)).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-5">
            <div className="mb-1 text-sm text-cream/80">
              Preview {preview && <span className="text-cream/50">({preview.truncated ? 'first ' : ''}{preview.total.toLocaleString()} rows checked, {preview.skipped.toLocaleString()} without a name or house)</span>}
            </div>
            {!preview ? (
              <p className="text-sm text-cream/50">Map at least Name and House to see a preview.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-ink-600">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-700 text-cream/70">
                    <tr>
                      {['Name', 'House', 'Year', 'Conc.', 'Gender', 'Notes', 'Accords'].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.entries.map((e, i) => (
                      <tr key={i} className="border-t border-ink-700">
                        <td className="px-2 py-1.5">{e.name}</td>
                        <td className="px-2 py-1.5">{e.house}</td>
                        <td className="px-2 py-1.5">{e.year ?? ''}</td>
                        <td className="px-2 py-1.5">{e.concentration ?? ''}</td>
                        <td className="px-2 py-1.5">{e.gender ?? ''}</td>
                        <td className="px-2 py-1.5">{e.notes.length}</td>
                        <td className="px-2 py-1.5">{e.accords.map((x) => x.name).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}

          <div className="mt-5 flex items-center justify-between">
            {existing > 0 ? (
              <label className="flex items-center gap-2 text-xs text-cream/70">
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                Replace the {existing.toLocaleString()} already imported (otherwise new rows are added)
              </label>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button className={ghostBtn} onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className={primaryBtn} disabled={!ready || busy} onClick={run}>
                {busy ? `Importing… ${progress.toLocaleString()} rows` : preview && !preview.truncated ? `Import ${(preview.total - preview.skipped).toLocaleString()} fragrances` : 'Import all rows'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
