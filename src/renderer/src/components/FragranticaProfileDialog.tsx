import { useEffect, useMemo, useState } from 'react'
import type { MemberImportProgress, MemberImportResult, MemberPreview, MemberPreviewItem, WardrobeKind } from '@shared/types'
import { WARDROBE_LABEL } from '../lib/shelf'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

type Step = 'start' | 'looking' | 'preview' | 'importing' | 'done'
const SECONDS_PER_PAGE = 4
const ORDER: WardrobeKind[] = ['collection', 'wishlist', 'had', 'to_try']

export default function FragranticaProfileDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>('start')
  const [username, setUsername] = useState('')
  const [pasting, setPasting] = useState(false)
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<MemberPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [withDetails, setWithDetails] = useState(true)
  const [progress, setProgress] = useState<MemberImportProgress | null>(null)
  const [result, setResult] = useState<MemberImportResult | null>(null)

  useEffect(() => {
    void window.api.settings.get('fragrantica.username').then((v) => v && setUsername(v))
    return window.api.fragrantica.onMemberProgress(setProgress)
  }, [])

  const fresh = useMemo(() => preview?.items.filter((i) => i.status === 'new') ?? [], [preview])
  const withUrl = fresh.filter((i) => i.url).length

  const lookUp = async () => {
    setError(null)
    setStep('looking')
    const name = username.trim().replace(/^@/, '')
    const r = pasting ? await window.api.fragrantica.listPreview(text) : await window.api.fragrantica.memberPreview(name)
    if (!r.ok) {
      setError(r.message)
      return setStep('start')
    }
    if (!pasting) void window.api.settings.set('fragrantica.username', name)
    setPreview(r.data)
    setStep('preview')
  }

  const loadFile = async () => {
    const r = await window.api.fragrantica.pickListFile()
    if (!r) return
    if (!r.ok) return setError(r.message)
    setText(r.data)
    setError(null)
  }

  const run = async () => {
    if (!preview) return
    setStep('importing')
    setProgress({ done: 0, total: fresh.length, current: '' })
    const r = await window.api.fragrantica.memberImport(preview.items, withDetails)
    if (!r.ok) {
      setError(r.message)
      return setStep('preview')
    }
    setResult(r.data)
    setStep('done')
    onDone()
  }

  const busy = step === 'looking' || step === 'importing'

  return (
    <Modal title="Import from Fragrantica" onClose={busy ? () => undefined : onClose} wide>
      {(step === 'start' || step === 'looking') && (
        <div className="space-y-3 text-sm text-cream/80">
          {!pasting ? (
            <>
              <p>
                Reads the lists on a public Fragrantica profile (Have, Want, Had and custom shelves) so you can add them here. You see everything before anything is added.
              </p>
              <label className="block">
                Fragrantica username
                <div className="mt-1 flex items-center gap-1">
                  <span className="text-cream/50">@</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="your_username" disabled={step === 'looking'} className="w-64 rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-cream" onKeyDown={(e) => e.key === 'Enter' && username.trim() && void lookUp()} />
                </div>
              </label>
              <ul className="list-disc space-y-1 pl-5 text-xs text-cream/55">
                <li>Only pages anyone can see are read, one at a time with a pause between them.</li>
                <li>If Fragrantica asks for a login or a check, a window appears. Do it there; this app never sees or stores your password.</li>
                <li>Fragrantica does not show a wear diary on public profiles, so only the lists are imported.</li>
              </ul>
            </>
          ) : (
            <>
              <p>
                Paste your lists as headings (Have, Want, Had, For Test) followed by fragrance links from Fragrantica, one per line. Or use a CSV with the columns <b>List, House, Name</b>.
              </p>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={'Have\nhttps://www.fragrantica.com/perfume/Dior/Sauvage-31861.html\nWant\n…'} className="w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 font-mono text-xs text-cream" />
              <button className={ghostBtn} onClick={() => void loadFile()}>
                Load a CSV or text file…
              </button>
            </>
          )}
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          {step === 'looking' && <p className="text-cream/60">Reading the profile… if a window asks you to log in or pass a check, do that there.</p>}
          <div className="flex items-center justify-between pt-2">
            <button className="text-xs text-cream/55 underline hover:text-cream" disabled={step === 'looking'} onClick={() => (setPasting((p) => !p), setError(null))}>
              {pasting ? 'Read a profile instead' : 'Paste links or load a CSV instead'}
            </button>
            <div className="flex gap-2">
              <button className={ghostBtn} onClick={onClose} disabled={step === 'looking'}>
                Cancel
              </button>
              <button className={primaryBtn} disabled={step === 'looking' || (pasting ? !text.trim() : !username.trim())} onClick={() => void lookUp()}>
                {step === 'looking' ? 'Reading…' : pasting ? 'Preview' : 'Look up'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3 text-sm text-cream/80">
          <div className="flex flex-wrap gap-2">
            {ORDER.map((w) => {
              const mine = preview.items.filter((i) => i.target === w)
              const n = mine.filter((i) => i.status === 'new').length
              return mine.length === 0 ? null : (
                <div key={w} className="rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-cream/50">→ {WARDROBE_LABEL[w]}</div>
                  <div className="font-display text-xl text-brass-400">{n} new</div>
                  <div className="text-xs text-cream/50">{mine.length - n} already here or repeated</div>
                </div>
              )
            })}
          </div>
          {preview.lists.length > 0 && (
            <p className="text-xs text-cream/55">On the profile: {preview.lists.map((l) => `${l.label} ${l.expected}`).join(' · ')}</p>
          )}
          {preview.notes.map((n) => (
            <p key={n} className="rounded border border-brass-500/40 bg-brass-500/10 px-3 py-1.5 text-xs">
              {n}
            </p>
          ))}

          <div className="max-h-56 overflow-y-auto rounded-lg border border-ink-600">
            {preview.items.map((i, k) => (
              <Row key={k} i={i} />
            ))}
          </div>

          {fresh.length > 0 ? (
            <>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={withDetails} onChange={(e) => setWithDetails(e.target.checked)} className="mt-1" />
                <span>
                  Also read each fragrance page for notes, accords and the picture
                  <span className="block text-xs text-cream/50">About {Math.ceil((withUrl * SECONDS_PER_PAGE) / 60)} minutes for {withUrl} pages. You can stop at any time. Anything that cannot be read is added with just its name.</span>
                </span>
              </label>
              <ul className="list-disc space-y-1 pl-5 text-xs text-cream/55">
                <li>Items in My Collection get a 100 ml bottle as a placeholder (Fragrantica has no bottle sizes). Edit them as you go.</li>
                <li>Wishlist items arrive without a note and are marked "needs a note". Write one and the usual rule applies again.</li>
              </ul>
            </>
          ) : (
            <p className="text-cream/60">Nothing new to add.</p>
          )}
          {error && (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button className={ghostBtn} onClick={() => setStep('start')}>
              Back
            </button>
            <button className={primaryBtn} disabled={fresh.length === 0} onClick={() => void run()}>
              Add {fresh.length} fragrance{fresh.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-3 text-sm text-cream/80">
          <div className="h-2 rounded bg-ink-900">
            <div className="h-2 rounded bg-brass-500" style={{ width: `${progress && progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          <p aria-live="polite">
            {progress?.done ?? 0} of {progress?.total ?? fresh.length}
            {progress?.current ? ` · ${progress.current}` : ''}
          </p>
          <div className="flex justify-end">
            <button className={ghostBtn} onClick={() => void window.api.fragrantica.memberCancel()}>
              Stop after this one
            </button>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-3 text-sm text-cream/80">
          <p className="font-display text-lg text-brass-400">{result.cancelled ? 'Stopped. What was added is kept.' : 'Done.'}</p>
          <ul className="list-disc space-y-1 pl-5">
            {result.added.map((a) => (
              <li key={a.wardrobe}>
                {a.count} added to {WARDROBE_LABEL[a.wardrobe]}
              </li>
            ))}
            {result.added.length === 0 && <li>Nothing was added.</li>}
            {result.skipped > 0 && <li>{result.skipped} skipped (already here or repeated)</li>}
            {result.withoutDetails > 0 && <li>{result.withoutDetails} added with only a name, because the page could not be read</li>}
          </ul>
          {result.failed.length > 0 && (
            <div>
              <p className="text-red-300">{result.failed.length} could not be added:</p>
              <ul className="list-disc pl-5 text-xs text-cream/60">
                {result.failed.slice(0, 8).map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <button className={primaryBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Row({ i }: { i: MemberPreviewItem }) {
  const tag = i.status === 'new' ? 'New' : i.status === 'exists' ? 'Already here' : 'Repeated'
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-ink-700 px-3 py-1.5 last:border-0 ${i.status === 'new' ? '' : 'opacity-75'}`}>
      <span className="min-w-0 truncate">
        {i.name} <span className="text-cream/45">{i.house}</span>
      </span>
      <span className="shrink-0 text-xs text-cream/60">
        {WARDROBE_LABEL[i.target]} · <span className={i.status === 'new' ? 'text-brass-400' : ''}>{tag}</span>
      </span>
    </div>
  )
}
