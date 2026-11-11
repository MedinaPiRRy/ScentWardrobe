import { useState } from 'react'
import type { DiscoverCard } from '@shared/discover/dto'
import { ghostBtn } from '../Dialogs'
import { WARDROBE_LABEL } from '../../lib/shelf'
import ResultCard from './ResultCard'

export interface CardActions {
  onAdd: (card: DiscoverCard, to: 'wishlist' | 'to_try') => void
  onIgnore: (card: DiscoverCard) => void
  onMoreLike: (card: DiscoverCard) => void
  onOpenMine: (id: number) => void
  onOpenLab?: (ids: number[]) => void
  /** Add to the current gift list (Gifts mode only). */
  onGift?: (card: DiscoverCard) => void
  /** Open the full card of a suggestion. */
  onDetails?: (card: DiscoverCard) => void
}

/** The cards of a result list, two to a row on a wide window, with a button that saves them as CSV. */
export default function CardGrid({ cards, actions, exportTitle }: { cards: DiscoverCard[]; actions: CardActions; exportTitle?: string }) {
  const [note, setNote] = useState<string | null>(null)
  const exportCsv = async () => {
    const r = await window.api.discover.exportResults(
      exportTitle ?? 'Discovery',
      cards.map((c) => ({ name: c.name, house: c.house, year: c.year, concentration: c.concentration, score: c.score, reasons: [...c.reasons.map((x) => x.text), ...(c.layer ? [c.layer.verdict] : []), ...(c.evidence ?? [])], inWardrobes: c.inWardrobes.map((w) => WARDROBE_LABEL[w]), sourceUrl: c.sourceUrl }))
    )
    setNote(r.ok ? (r.data ? `Saved ${r.data.rows} rows to ${r.data.path}.` : null) : r.message)
  }
  return (
    <div>
      {cards.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-3">
          {note && (
            <span className="text-xs text-cream/80" role="status">
              {note}
            </span>
          )}
          <button type="button" className={ghostBtn} onClick={() => void exportCsv()}>
            Save these as CSV
          </button>
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((c) => (
          <ResultCard key={c.key} card={c} {...actions} />
        ))}
      </div>
    </div>
  )
}
