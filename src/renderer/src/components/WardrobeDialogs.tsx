import { useState } from 'react'
import type { FragranceSummary, HadDetails, HadReason } from '@shared/types'
import { HAD_REASON_LABEL } from '../lib/shelf'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

const field = 'mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'

/** Moving something to Garbage Perfumes: an optional note on why, so I do not buy it again. */
export function GarbageDialog({ fragrance, initial, onCancel, onSubmit }: { fragrance: FragranceSummary; initial: string; onCancel: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState(initial)
  return (
    <Modal title={`Throw ${fragrance.name} in the bin?`} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit(note.trim())
        }}
      >
        <label className="block text-sm text-cream/80">
          Why I dislike it <span className="text-cream/45">(optional)</span>
          <textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Sour opening, headache-inducing drydown…" className={field} />
        </label>
        <p className="mt-2 text-xs text-cream/50">It stays searchable with this note, so you will not buy it again by accident. It is left out of recommendations, the Layering Lab and your collection stats.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn}>
            Move to Garbage Perfumes
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Moving something to Had: years, a memory and why it left. All optional. Also edits those details later. */
export function HadDialog({
  title,
  intro,
  initial,
  submitLabel,
  onCancel,
  onSubmit
}: {
  title: string
  intro?: string
  initial: HadDetails
  submitLabel: string
  onCancel: () => void
  onSubmit: (had: HadDetails) => void
}) {
  const [years, setYears] = useState(initial.years ?? '')
  const [memory, setMemory] = useState(initial.memory ?? '')
  const [reason, setReason] = useState<HadReason | null>(initial.reason ?? null)
  return (
    <Modal title={title} onClose={onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({ years: years.trim() || null, memory: memory.trim() || null, reason })
        }}
      >
        {intro && <p className="mb-3 text-sm text-cream/70">{intro}</p>}
        <label className="block text-sm text-cream/80">
          Years I wore it <span className="text-cream/45">(optional)</span>
          <input autoFocus value={years} onChange={(e) => setYears(e.target.value)} placeholder="e.g. 2012–2015" className={field} />
        </label>
        <label className="mt-3 block text-sm text-cream/80">
          A memory <span className="text-cream/45">(optional)</span>
          <textarea rows={3} value={memory} onChange={(e) => setMemory(e.target.value)} placeholder="Where it takes you back to…" className={field} />
        </label>
        <div className="mt-3 text-sm text-cream/80">Why it left</div>
        <div className="mt-1 flex gap-1.5">
          {(['finished', 'sold', 'gifted'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(reason === r ? null : r)}
              className={`rounded-md border px-3 py-1.5 text-sm ${reason === r ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
            >
              {HAD_REASON_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Asked after the last active bottle is marked empty or sold. */
export function OfferHadDialog({ fragrance, reason, onNo, onYes }: { fragrance: { name: string }; reason: HadReason; onNo: () => void; onYes: (reason: HadReason) => void }) {
  return (
    <Modal title="Move it to Had?" onClose={onNo}>
      <p className="text-sm text-cream/80">
        That was the last bottle of <span className="font-medium text-cream">{fragrance.name}</span>. Keep it as a memory in the Had cabinet? Its history, notes and wears stay with it.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button className={ghostBtn} onClick={onNo}>
          Leave it in My Collection
        </button>
        <button className={primaryBtn} onClick={() => onYes(reason)}>
          Move to Had
        </button>
      </div>
    </Modal>
  )
}
