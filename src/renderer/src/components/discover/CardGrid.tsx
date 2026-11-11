import type { DiscoverCard } from '@shared/discover/dto'
import ResultCard from './ResultCard'

export interface CardActions {
  onAdd: (card: DiscoverCard, to: 'wishlist' | 'to_try') => void
  onIgnore: (card: DiscoverCard) => void
  onMoreLike: (card: DiscoverCard) => void
  onOpenMine: (id: number) => void
  onOpenLab?: (ids: number[]) => void
}

/** The cards of a result list, two to a row on a wide window. */
export default function CardGrid({ cards, actions }: { cards: DiscoverCard[]; actions: CardActions }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {cards.map((c) => (
        <ResultCard key={c.key} card={c} {...actions} />
      ))}
    </div>
  )
}
