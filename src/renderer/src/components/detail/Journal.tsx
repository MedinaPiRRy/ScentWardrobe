import { useState } from 'react'
import type { FragranceDetail } from '@shared/types'
import { ghostBtn, primaryBtn } from '../Dialogs'

const area = 'w-full rounded border border-ink-600 bg-ink-900 p-2 text-sm text-cream'

export function ImpressionEditor({ d, onChanged }: { d: FragranceDetail; onChanged: () => void }) {
  const [text, setText] = useState(d.impression ?? '')
  const [error, setError] = useState<string | null>(null)
  const dirty = text.trim() !== (d.impression ?? '').trim()

  const save = async () => {
    const r = await window.api.fragrances.setImpression(d.id, text)
    setError(r.ok ? null : r.message)
    if (r.ok) onChanged()
  }

  return (
    <div>
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What it smells like to me…" className={area} />
      {d.wardrobe === 'wishlist' && <p className="text-[11px] text-cream/40">Required for wishlist items.</p>}
      {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
      {dirty && (
        <div className="mt-1 flex gap-2">
          <button className={primaryBtn} onClick={save}>
            Save impression
          </button>
          <button className={ghostBtn} onClick={() => { setText(d.impression ?? ''); setError(null) }}>
            Revert
          </button>
        </div>
      )}
    </div>
  )
}

export default function Journal({ d, onChanged, say }: { d: FragranceDetail; onChanged: () => void; say: (m: string) => void }) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const run = async (p: Promise<{ ok: boolean; message?: string }>) => {
    const r = await p
    if (!r.ok) say(r.message ?? 'Something went wrong.')
    else onChanged()
    return r.ok
  }

  return (
    <div>
      <div className="flex gap-2">
        <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a journal entry…" className={area} />
        <button
          className={`${primaryBtn} self-start`}
          disabled={!draft.trim()}
          onClick={async () => {
            if (await run(window.api.journal.add(d.id, draft))) setDraft('')
          }}
        >
          Add
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {d.journal.length === 0 && <p className="text-sm text-cream/50">No entries yet.</p>}
        {d.journal.map((j) => (
          <div key={j.id} className="rounded-lg border border-ink-600 bg-ink-900/60 p-3 text-sm">
            {editingId === j.id ? (
              <>
                <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} className={area} autoFocus />
                <div className="mt-2 flex gap-2">
                  <button
                    className={primaryBtn}
                    onClick={async () => {
                      if (await run(window.api.journal.update(j.id, editText))) setEditingId(null)
                    }}
                  >
                    Save
                  </button>
                  <button className={ghostBtn} onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-wrap">{j.text}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-cream/45">
                  <span>{j.createdAt}</span>
                  {confirmId === j.id ? (
                    <span className="flex items-center gap-2">
                      Delete this entry?
                      <button className="text-red-300 underline" onClick={() => run(window.api.journal.delete(j.id))}>
                        Yes, delete
                      </button>
                      <button className="underline" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="flex gap-3">
                      <button className="underline hover:text-cream" onClick={() => { setEditingId(j.id); setEditText(j.text) }}>
                        Edit
                      </button>
                      <button className="underline hover:text-cream" onClick={() => setConfirmId(j.id)}>
                        Delete
                      </button>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
