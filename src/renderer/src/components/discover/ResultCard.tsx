import { useState } from 'react'
import type { DiscoverCard } from '@shared/discover/dto'
import { accordColor } from '@shared/accordColors'
import { ghostBtn } from '../Dialogs'
import { WARDROBE_LABEL } from '../../lib/shelf'

const FRAGRANTICA = /^https:\/\/([a-z0-9-]+\.)*fragrantica\.[a-z.]+\/perfume\//i

const STATUS: Record<string, { mark: string; word: string; tone: string }> = {
  met: { mark: '✓', word: 'met', tone: 'text-emerald-300' },
  partial: { mark: '◐', word: 'partly met', tone: 'text-amber-300' },
  unmet: { mark: '✕', word: 'not met', tone: 'text-red-300' },
  unknown: { mark: '?', word: 'unknown', tone: 'text-cream/70' }
}

function Score({ score }: { score: number }) {
  const color = score >= 75 ? '#7fd18f' : score >= 55 ? '#e0b24f' : '#e07a6a'
  return (
    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 text-cream" style={{ borderColor: color }} title="Score out of 100" aria-label={`Score ${score} out of 100`}>
      <span className="font-display text-xl leading-none">{score}</span>
      <span className="text-[8px] uppercase tracking-wider text-cream/70">score</span>
    </div>
  )
}

interface Props {
  card: DiscoverCard
  onAdd: (card: DiscoverCard, to: 'wishlist' | 'to_try') => void
  onIgnore: (card: DiscoverCard) => void
  onMoreLike: (card: DiscoverCard) => void
  onOpenMine: (id: number) => void
  /** Open these (both in My Collection) together in the Layering Lab. */
  onOpenLab?: (ids: number[]) => void
}

/** One suggestion: why it was suggested, what I can do with it. */
export default function ResultCard({ card, onAdd, onIgnore, onMoreLike, onOpenMine, onOpenLab }: Props) {
  const [open, setOpen] = useState(false)
  const mine = card.inWardrobes.map((w) => WARDROBE_LABEL[w])
  const fragrantica = card.sourceUrl && FRAGRANTICA.test(card.sourceUrl) ? card.sourceUrl : null
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label={`${card.name} by ${card.house}`}>
      <div className="flex items-start gap-3">
        <Score score={card.score} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg leading-tight text-cream">{card.name}</h3>
          <div className="text-sm text-brass-400">
            {card.house}
            <span className="text-cream/70">{[card.year, card.concentration].filter(Boolean).length ? ` · ${[card.year, card.concentration].filter(Boolean).join(' · ')}` : ''}</span>
          </div>
          {mine.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {mine.map((m) => (
                <span key={m} className="rounded-full border border-brass-500/50 bg-brass-500/15 px-2 text-[11px] text-cream">
                  Already in {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {card.reasons.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-cream/90">
          {card.reasons.map((r, i) => (
            <li key={i} className={r.kind === 'warn' ? 'text-amber-300' : undefined}>
              {r.text}
            </li>
          ))}
        </ul>
      )}

      {card.layer && (
        <div className="rounded-lg border border-ink-600 bg-ink-900 p-3 text-sm">
          <div className="font-medium text-cream">
            {card.layer.verdict} <span className="text-cream/70">· pair score {card.layer.score}/100</span>
          </div>
          {card.layer.reasons.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-cream/85">
              {card.layer.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          {card.labIds == null && <p className="mt-1 text-xs text-cream/70">Not in My Collection yet, so it cannot be mixed in the Layering Lab. A sample or decant added to My Collection can.</p>}
        </div>
      )}
      {card.evidence && card.evidence.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-cream/90" aria-label="Votes behind this link">
          {card.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {card.money && card.money.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-cream/80" aria-label="Value">
          {card.money.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
      {card.trial && <p className="rounded-lg border border-brass-500/40 bg-brass-500/10 p-3 text-sm text-cream/90">{card.trial}</p>}

      {card.topAccords.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Main accords">
          {card.topAccords.map((a) => (
            <span key={a.name} className="inline-flex items-center gap-1.5 rounded-full border border-ink-600 px-2 py-0.5 text-xs text-cream/90">
              <span className="h-2 w-2 rounded-full" style={{ background: accordColor(a.name) }} aria-hidden />
              {a.name}
            </span>
          ))}
        </div>
      )}

      {card.criteria && card.criteria.length > 0 && (
        <div>
          <button type="button" className="text-sm text-brass-400 underline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide' : 'Show'} what it meets ({card.criteria.filter((c) => c.status === 'met').length} of {card.criteria.length})
          </button>
          {open && (
            <ul className="mt-2 space-y-1 text-sm">
              {card.criteria.map((c) => {
                const s = STATUS[c.status]
                return (
                  <li key={c.key} className="flex gap-2">
                    <span className={`w-4 shrink-0 text-center ${s.tone}`} aria-hidden>
                      {s.mark}
                    </span>
                    <span>
                      <span className="sr-only">{s.word}: </span>
                      <span className="text-cream">{c.label}</span> <span className="text-cream/70">· {c.detail}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        {card.labIds && onOpenLab && (
          <button className={ghostBtn} onClick={() => onOpenLab(card.labIds!)}>
            Open in the Layering Lab
          </button>
        )}
        {card.fragranceId != null && (
          <button className={ghostBtn} onClick={() => onOpenMine(card.fragranceId!)}>
            Open in my library
          </button>
        )}
        {card.source === 'dataset' && card.fragranceId == null && (
          <>
            <button className={ghostBtn} onClick={() => onAdd(card, 'wishlist')}>
              + Wishlist
            </button>
            <button className={ghostBtn} onClick={() => onAdd(card, 'to_try')}>
              + To Try
            </button>
          </>
        )}
        <button className={ghostBtn} onClick={() => onMoreLike(card)}>
          More like this
        </button>
        {fragrantica && (
          <a className={`${ghostBtn} inline-block`} href={fragrantica} target="_blank" rel="noreferrer">
            Open on Fragrantica<span className="sr-only"> (opens in your browser)</span>
          </a>
        )}
        {card.source === 'dataset' && card.fragranceId == null && (
          <button className="rounded-md px-3 py-2 text-sm text-cream/70 hover:text-cream" onClick={() => onIgnore(card)} title="Hide it from suggestions. You can bring it back from the list at the bottom.">
            Not interested
          </button>
        )}
      </div>
    </article>
  )
}
