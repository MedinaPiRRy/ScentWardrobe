import { useEffect, useState } from 'react'
import type { DiscoverCard } from '@shared/discover/dto'
import { accordColor } from '@shared/accordColors'
import type { CommunityData, FragranceInput, NoteEntry } from '@shared/types'
import AccordBars from '../detail/AccordBars'
import CommunityCharts from '../detail/CommunityCharts'
import NotesPyramid from '../detail/NotesPyramid'
import { ghostBtn, Modal, primaryBtn } from '../Dialogs'
import { WARDROBE_LABEL } from '../../lib/shelf'
import type { CardActions } from './CardGrid'

const FRAGRANTICA = /^https:\/\/([a-z0-9-]+\.)*fragrantica\.[a-z.]+\/perfume\//i

const h3 = 'mt-5 border-b border-ink-600 pb-1 font-display text-lg text-brass-400'

/** The full card of a suggestion: what it smells like, what the community says, why it was suggested, and the same actions as the list. */
export default function DetailDialog({ card, actions, onClose }: { card: DiscoverCard; actions: CardActions; onClose: () => void }) {
  const [input, setInput] = useState<FragranceInput | null>(null)
  const [community, setCommunity] = useState<CommunityData | null>(null)
  const [picture, setPicture] = useState<string | null>(null)
  const [pictureDone, setPictureDone] = useState(false)
  const [state, setState] = useState<'loading' | 'ready' | 'none'>('loading')

  useEffect(() => {
    let current = true
    setState('loading')
    setPicture(null)
    setPictureDone(false)
    ;(async () => {
      let data: FragranceInput | null = null
      let comm: CommunityData | null = null
      if (card.catalogId != null) {
        data = await window.api.search.datasetEntry(card.catalogId)
        comm = data?.community ?? null
      } else if (card.fragranceId != null) {
        const d = await window.api.fragrances.get(card.fragranceId)
        if (d) {
          data = { name: d.name, house: d.house, year: d.year, concentration: d.concentration, perfumers: d.perfumers, gender: d.gender, description: d.description, notes: d.notes.map((n) => ({ name: n.name, layer: n.layer })), accords: d.accords.map((a) => ({ name: a.name, strength: a.strength, color: a.color })) }
          comm = d.community
        }
      }
      if (!current) return
      setInput(data)
      setCommunity(comm)
      setState(data ? 'ready' : 'none')
      if (data?.imageUrl) {
        const url = await window.api.browse.previewImage(data.imageUrl)
        if (current) setPicture(url)
      }
      if (current) setPictureDone(true)
    })()
    return () => {
      current = false
    }
  }, [card.catalogId, card.fragranceId])

  const fragrantica = card.sourceUrl && FRAGRANTICA.test(card.sourceUrl) ? card.sourceUrl : null
  const mine = card.inWardrobes.map((w) => WARDROBE_LABEL[w])
  const done = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <Modal title={`${card.name} by ${card.house}`} onClose={onClose} xl>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex h-40 w-24 shrink-0 items-center justify-center" aria-hidden>
          {picture ? <img src={picture} alt="" className="max-h-40 max-w-24 object-contain" /> : <span className="text-xs text-cream/70">{input?.imageUrl && !pictureDone ? 'Loading picture…' : 'No picture'}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-brass-400">{card.house}</div>
          <div className="mt-1 text-xs text-cream/80">{[card.year, card.concentration, input?.gender].filter(Boolean).join(' · ')}</div>
          {input?.perfumers && <div className="mt-0.5 text-xs text-cream/70">Perfumer: {input.perfumers}</div>}
          {mine.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {mine.map((m) => (
                <span key={m} className="rounded-full border border-brass-500/50 bg-brass-500/15 px-2 text-[11px] text-cream">
                  Already in {m}
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {card.fragranceId != null && (
              <button className={primaryBtn} onClick={done(() => actions.onOpenMine(card.fragranceId!))}>
                Open in my library
              </button>
            )}
            {card.source === 'dataset' && card.fragranceId == null && (
              <>
                <button className={primaryBtn} onClick={done(() => actions.onAdd(card, 'wishlist'))}>
                  + Wishlist
                </button>
                <button className={ghostBtn} onClick={done(() => actions.onAdd(card, 'to_try'))}>
                  + To Try
                </button>
              </>
            )}
            {card.labIds && actions.onOpenLab && (
              <button className={ghostBtn} onClick={done(() => actions.onOpenLab!(card.labIds!))}>
                Open in the Layering Lab
              </button>
            )}
            <button className={ghostBtn} onClick={done(() => actions.onMoreLike(card))}>
              More like this
            </button>
            {fragrantica && (
              <a className={`${ghostBtn} inline-block`} href={fragrantica} target="_blank" rel="noreferrer">
                Open on Fragrantica<span className="sr-only"> (opens in your browser)</span>
              </a>
            )}
            {card.source === 'dataset' && card.fragranceId == null && (
              <button className="rounded-md px-3 py-2 text-sm text-cream/70 hover:text-cream" onClick={done(() => actions.onIgnore(card))}>
                Not interested
              </button>
            )}
          </div>
        </div>
      </div>

      <h3 className={h3}>Why it was suggested</h3>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-cream/90">
        <li>Score {card.score} out of 100.</li>
        {card.reasons.map((r, i) => (
          <li key={i}>{r.text}</li>
        ))}
        {card.layer && (
          <li>
            {card.layer.verdict}, pair score {card.layer.score}/100{card.layer.reasons.length ? `: ${card.layer.reasons.join('; ')}` : ''}.
          </li>
        )}
        {card.evidence?.map((e, i) => (
          <li key={`e${i}`}>{e}</li>
        ))}
        {card.money?.map((e, i) => (
          <li key={`m${i}`}>{e}</li>
        ))}
      </ul>
      {card.trial && <p className="mt-2 rounded-lg border border-brass-500/40 bg-brass-500/10 p-3 text-sm text-cream/90">{card.trial}</p>}
      {card.criteria && card.criteria.length > 0 && (
        <>
          <h3 className={h3}>What it meets</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {card.criteria.map((c) => (
              <li key={c.key}>
                <span className="text-cream">{c.label}</span> <span className="text-cream/70">· {c.status === 'met' ? 'met' : c.status === 'partial' ? 'partly met' : c.status === 'unmet' ? 'not met' : 'unknown'} · {c.detail}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {state === 'loading' && <p className="mt-5 text-sm text-cream/80" role="status">Loading its notes and community votes…</p>}
      {state === 'none' && <p className="mt-5 text-sm text-cream/80">There are no more details on file for this one.</p>}
      {state === 'ready' && input && (
        <>
          {input.description && <p className="mt-5 text-sm text-cream/85">{input.description}</p>}
          <h3 className={h3}>Notes</h3>
          <div className="mt-3">
            {input.notes.length === 0 ? <p className="text-sm text-cream/70">No notes listed.</p> : <NotesPyramid notes={input.notes.map((n, i): NoteEntry => ({ id: i + 1, name: n.name, family: null, iconPath: null, layer: n.layer }))} selectedId={null} onSelect={() => undefined} />}
          </div>
          <h3 className={h3}>Main accords</h3>
          <div className="mt-3">
            <AccordBars accords={input.accords.map((a) => ({ name: a.name, strength: a.strength, color: a.color ?? accordColor(a.name) }))} />
          </div>
          <h3 className={h3}>Community</h3>
          <div className="mt-3">
            <CommunityCharts c={community} />
          </div>
        </>
      )}
      <div className="mt-6 flex justify-end">
        <button className={ghostBtn} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
