import { useState } from 'react'
import type { NoteEntry, NoteLayer } from '@shared/types'
import { useImageSrc } from '../../lib/images'

const FAMILY_COLORS: Record<string, string> = {
  citrus: '#f4d93b',
  woody: '#a8743c',
  floral: '#e58fb5',
  spicy: '#c9553a',
  gourmand: '#d9a45f',
  resinous: '#b88a4a',
  fresh: '#7fd1c0',
  fruity: '#e8743b'
}

const TIERS: { layer: NoteLayer; label: string }[] = [
  { layer: 'top', label: 'Top notes' },
  { layer: 'heart', label: 'Heart notes' },
  { layer: 'base', label: 'Base notes' }
]

function Chip({ n, active, onClick }: { n: NoteEntry; active: boolean; onClick: () => void }) {
  const [iconFailed, setIconFailed] = useState(false)
  const icon = useImageSrc(n.iconPath)
  return (
    <button
      onClick={onClick}
      title={n.family ? `${n.name} (${n.family})` : n.name}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active ? 'border-brass-400 bg-brass-500/25 text-brass-400' : 'border-ink-600 bg-ink-900/70 text-cream/90 hover:border-brass-500/60'
      }`}
    >
      {icon && !iconFailed ? (
        <img src={icon} alt="" className="h-5 w-5 rounded-sm object-contain" onError={() => setIconFailed(true)} />
      ) : (
        <span className="h-2 w-2 rounded-full" style={{ background: (n.family && FAMILY_COLORS[n.family]) || '#8a7f70' }} />
      )}
      {n.name}
    </button>
  )
}

function Tier({ label, notes, width, selectedId, onSelect }: { label: string; notes: NoteEntry[]; width: string; selectedId: number | null; onSelect: (n: NoteEntry) => void }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-gradient-to-b from-ink-700/80 to-ink-800/80 px-3 py-2 text-center" style={{ width }}>
      <div className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-brass-400/80">{label}</div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {notes.map((n) => (
          <Chip key={n.id} n={n} active={selectedId === n.id} onClick={() => onSelect(n)} />
        ))}
      </div>
    </div>
  )
}

/** Pyramid of top / heart / base tiers, or a flat block for fragrances with no published pyramid. */
export default function NotesPyramid({ notes, selectedId, onSelect }: { notes: NoteEntry[]; selectedId: number | null; onSelect: (n: NoteEntry) => void }) {
  if (notes.length === 0) return <p className="text-sm text-cream/50">No notes entered yet. Use Edit to add them.</p>
  const general = notes.filter((n) => n.layer === 'general')
  const tiers = TIERS.map((t) => ({ ...t, items: notes.filter((n) => n.layer === t.layer) })).filter((t) => t.items.length)

  return (
    <div className="flex flex-col items-center gap-1.5">
      {tiers.map((t, i) => (
        <Tier
          key={t.layer}
          label={t.label}
          notes={t.items}
          width={tiers.length === 1 ? '100%' : `${58 + (i * 42) / (tiers.length - 1)}%`}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
      {general.length > 0 && (
        <Tier label={tiers.length ? 'Other notes' : 'Notes'} notes={general} width="100%" selectedId={selectedId} onSelect={onSelect} />
      )}
    </div>
  )
}
