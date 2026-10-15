import { useCallback, useEffect, useRef, useState } from 'react'
import type { WearEntry } from '@shared/types'
import { PROJECTION_LABELS } from '../lib/performance'
import { ghostBtn, Modal, primaryBtn } from './Dialogs'

const CHIPS = [1, 2, 3, 4, 6, 8, 10, 12]
const CHECK_EVERY_MS = 10 * 60 * 1000

function describeWhen(wornAt: string): string {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  const y = new Date(today.getTime() - 86_400_000)
  const yStr = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`
  const day = wornAt.slice(0, 10)
  const label = day === todayStr ? 'today' : day === yStr ? 'yesterday' : `on ${day}`
  return `${label} at ${wornAt.slice(11, 16)}`
}

/**
 * Asks "How long did it last?" for wears logged without a longevity, once their day is over (or the next time the
 * app is opened). Answers are saved onto the wear; "Skip" stops asking about it, "Later" only hides it for now.
 */
export default function FollowUpPrompt({ onAnswered }: { onAnswered: () => void }) {
  const [queue, setQueue] = useState<WearEntry[]>([])
  const snoozed = useRef(new Set<number>())
  const [hours, setHours] = useState('')
  const [projection, setProjection] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    const pending = await window.api.wears.pendingFollowUps()
    setQueue(pending.filter((w) => !snoozed.current.has(w.id)))
  }, [])

  useEffect(() => {
    void check()
    const t = window.setInterval(check, CHECK_EVERY_MS)
    window.addEventListener('focus', check)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('focus', check)
    }
  }, [check])

  const current = queue[0]
  useEffect(() => {
    setHours('')
    setProjection(current?.projection ?? null)
    setError(null)
  }, [current?.id, current?.projection])

  if (!current) return null

  const next = async () => {
    onAnswered()
    await check()
  }

  const save = async () => {
    const h = hours.trim() === '' ? null : parseFloat(hours)
    if (h == null || !(h >= 0 && h <= 72)) return setError('Enter a number of hours between 0 and 72.')
    const r = await window.api.wears.completeFollowUp(current.id, { longevityHours: h, projection })
    if (!r.ok) return setError(r.message)
    await next()
  }

  return (
    <Modal title="How long did it last?" onClose={() => { snoozed.current.add(current.id); void check() }}>
      <p className="text-sm text-cream/80">
        You wore <span className="font-medium text-cream">{current.title}</span> {describeWhen(current.wornAt)}. How many hours could you still smell it?
      </p>
      {queue.length > 1 && <p className="mt-1 text-xs text-cream/45">{queue.length - 1} more to go after this one.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {CHIPS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHours(String(h))}
            className={`rounded-full border px-3 py-1 text-xs ${hours === String(h) ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
          >
            {h === 12 ? '12+ h' : `${h} h`}
          </button>
        ))}
        <input
          type="number"
          step="any"
          min={0}
          max={72}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          className="w-20 rounded border border-ink-600 bg-ink-900 px-2 py-1 text-sm text-cream"
          aria-label="Hours it lasted"
          autoFocus
        />
      </div>
      {current.projection == null && (
        <div className="mt-4">
          <div className="mb-1 text-xs text-cream/60">Projection (optional)</div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((p) => (
              <button key={p} type="button" onClick={() => setProjection(projection === p ? null : p)} className={`flex-1 rounded-md border px-1 py-1.5 text-xs ${projection === p ? 'border-brass-400 bg-brass-500/25 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}>
                {PROJECTION_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
      <div className="mt-6 flex items-center justify-between">
        <button
          className="text-xs text-cream/50 underline hover:text-cream"
          onClick={async () => {
            await window.api.wears.dismissFollowUp(current.id)
            await next()
          }}
        >
          Skip, don't ask again
        </button>
        <div className="flex gap-2">
          <button className={ghostBtn} onClick={() => { snoozed.current.add(current.id); void check() }}>
            Later
          </button>
          <button className={primaryBtn} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}
