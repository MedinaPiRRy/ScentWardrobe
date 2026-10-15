import { useEffect, useRef, useState } from 'react'
import type { FragranceInput, LocalHit } from '@shared/types'
import { WARDROBE_LABEL } from '../lib/shelf'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

interface Props {
  onClose: () => void
  /** Open an existing fragrance of mine. */
  onOpenMine: (id: number) => void
  /** Open the form, pre-filled (or empty for manual entry). */
  onPrefill: (input: FragranceInput | null) => void
  onImportDataset: () => void
}

/** Step 1 of adding: search what I already have and the imported dataset, paste a Fragrantica link, or enter by hand. */
export default function AddFragranceDialog({ onClose, onOpenMine, onPrefill, onImportDataset }: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<LocalHit[]>([])
  const [datasetCount, setDatasetCount] = useState<number | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const seq = useRef(0)

  useEffect(() => {
    void window.api.search.datasetInfo().then((i) => setDatasetCount(i.count))
  }, [])

  useEffect(() => {
    const mine = ++seq.current
    if (!query.trim()) {
      setHits([])
      return
    }
    const t = window.setTimeout(async () => {
      const r = await window.api.search.local(query)
      if (mine === seq.current) setHits(r)
    }, 120)
    return () => window.clearTimeout(t)
  }, [query])

  const pickHit = async (h: LocalHit) => {
    if (h.source === 'mine') return onOpenMine(h.id)
    const entry = await window.api.search.datasetEntry(h.id)
    if (entry) onPrefill(entry)
  }

  const importUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const r = await window.api.fragrantica.importUrl(url)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    setWarnings(r.data.warnings)
    onPrefill(r.data.input)
  }

  return (
    <Modal title="Add a fragrance" onClose={busy ? () => undefined : onClose} wide>
      <label className="block text-sm text-cream/80">Search by name or house</label>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={datasetCount ? `Search your collection and ${datasetCount.toLocaleString()} imported fragrances…` : 'Search your collection…'}
        className="mt-1 w-full rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-cream"
      />

      {query.trim() && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-ink-600 bg-ink-900/60">
          {hits.length === 0 ? (
            <p className="p-3 text-sm text-cream/50">Nothing found{datasetCount === 0 ? ' in your collection (no dataset imported yet)' : ''}. Try the Fragrantica link below, or enter it by hand.</p>
          ) : (
            hits.map((h) => (
              <button key={`${h.source}-${h.id}`} onClick={() => pickHit(h)} className="flex w-full items-center justify-between gap-3 border-b border-ink-700 px-3 py-2 text-left text-sm last:border-0 hover:bg-ink-700">
                <span>
                  <span className="font-medium">{h.name}</span> <span className="text-cream/60">{h.house}</span>
                  {(h.year || h.concentration) && <span className="ml-2 text-xs text-cream/40">{[h.year, h.concentration].filter(Boolean).join(' · ')}</span>}
                  {h.wardrobe === 'garbage' && <span className="mt-0.5 block text-xs italic text-red-300">You disliked this{h.dislikeNote ? `: “${h.dislikeNote}”` : ''}</span>}
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${h.wardrobe === 'garbage' ? 'bg-red-900/60 text-red-200' : h.source === 'mine' ? 'bg-brass-500/25 text-brass-400' : 'bg-ink-600 text-cream/70'}`}>
                  {h.source === 'mine' ? `${h.wardrobe === 'garbage' ? 'In the bin' : 'Already in'} ${h.wardrobe === 'garbage' ? '⚠' : h.wardrobe ? WARDROBE_LABEL[h.wardrobe] : 'library'}` : 'Dataset'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="my-5 flex items-center gap-3 text-xs text-cream/40">
        <div className="h-px flex-1 bg-ink-600" />
        or import one page from Fragrantica
        <div className="h-px flex-1 bg-ink-600" />
      </div>

      <form onSubmit={importUrl} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
          placeholder="https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html"
          className="flex-1 rounded border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-cream placeholder:text-cream/30"
        />
        <button type="submit" className={primaryBtn} disabled={busy || !url.trim()}>
          {busy ? 'Loading…' : 'Import'}
        </button>
      </form>
      {busy && <p className="mt-2 text-xs text-cream/60">Loading the page in a background browser. This takes a few seconds. If a check appears, complete it.</p>}
      {error && (
        <p className="mt-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      )}
      {warnings.length > 0 && <p className="mt-2 text-xs text-brass-400">{warnings.join(' ')}</p>}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <button className="text-xs text-cream/50 underline hover:text-cream" onClick={onImportDataset} disabled={busy}>
          {datasetCount ? `Dataset: ${datasetCount.toLocaleString()} fragrances. Re-import or clear…` : 'Import a dataset file (CSV, JSONL or .db)…'}
        </button>
        <div className="flex gap-2">
          <button className={ghostBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={ghostBtn} onClick={() => onPrefill(null)} disabled={busy}>
            Enter manually
          </button>
        </div>
      </div>
    </Modal>
  )
}
