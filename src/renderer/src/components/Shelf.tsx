import { useEffect, useRef, useState } from 'react'
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FragranceSummary } from '@shared/types'
import BottleSvg, { bottleDims } from './BottleSvg'
import type { ShelfTheme } from './themes'
import { arrayMove } from '../lib/shelf'

interface Props {
  items: FragranceSummary[]
  theme: ShelfTheme
  tone: 'dark' | 'light'
  /** Width of one bottle slot. */
  slot?: number
  scale?: number
  showLevel: boolean
  draggable: boolean
  /** Vintage look for the Had cabinet: sepia bottles and aged paper tags. */
  sepia?: boolean
  /** Text for a small paper tag under a bottle, by fragrance id. */
  captions?: Map<number, string>
  onReorder: (orderedIds: number[]) => void
  onOpen: (f: FragranceSummary) => void
  onContextMenu: (f: FragranceSummary, x: number, y: number) => void
}

export default function Shelf({ items, theme, tone, slot = 152, scale = 1, showLevel, draggable, sepia, captions, onReorder, onOpen, onContextMenu }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [perRow, setPerRow] = useState(6)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setPerRow(Math.max(1, Math.floor((el.clientWidth - 32) / slot)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [slot])

  const rows: FragranceSummary[][] = []
  for (let i = 0; i < items.length; i += perRow) rows.push(items.slice(i, i + perRow))
  const rowHeight = Math.round(176 * scale) + 44

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((x) => x.id === e.active.id)
    const to = items.findIndex((x) => x.id === e.over!.id)
    if (from < 0 || to < 0) return
    onReorder(arrayMove(items, from, to).map((x) => x.id))
  }

  return (
    <div ref={ref}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy} disabled={!draggable}>
          {rows.map((row, r) => (
            <div key={r} className="relative" style={theme.back}>
              <div className="pointer-events-none absolute inset-0" style={{ background: theme.glow }} />
              <div className="relative" style={{ height: rowHeight }}>
                <div className="relative flex h-full items-end gap-0 px-4 pb-0" style={{ paddingBottom: 14 }}>
                  {row.map((f) => (
                    <Slot key={f.id} vialTag={!captions} f={f} slot={slot} scale={scale} tone={tone} sepia={sepia} showLevel={showLevel} draggable={draggable} onOpen={onOpen} onContextMenu={onContextMenu} />
                  ))}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-3.5" style={theme.plank} />
              </div>
              {captions && (
                <div className="relative flex px-4 pt-1.5 pb-2.5">
                  {row.map((f) => (
                    <div key={f.id} className="flex shrink-0 justify-center" style={{ width: slot }}>
                      {captions.get(f.id) && (
                        <span
                          className="line-clamp-2 max-w-[calc(100%-6px)] break-words rounded-[2px] px-2 py-0.5 text-center font-display text-[11px] italic leading-tight"
                          style={{ background: 'linear-gradient(180deg,#e6d3a8,#cdb581)', color: '#4a3820', boxShadow: '0 1px 2px rgba(0,0,0,.5)', transform: `rotate(${((f.id * 7) % 5) - 2}deg)` }}
                          title={captions.get(f.id)}
                        >
                          {captions.get(f.id)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

function Slot({ f, slot, scale, tone, sepia, showLevel, draggable, vialTag, onOpen, onContextMenu }: {
  vialTag: boolean
  f: FragranceSummary
  slot: number
  scale: number
  tone: 'dark' | 'light'
  sepia?: boolean
  showLevel: boolean
  draggable: boolean
  onOpen: Props['onOpen']
  onContextMenu: Props['onContextMenu']
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.id, disabled: !draggable })
  const [hover, setHover] = useState(false)
  const { h } = bottleDims(f, scale)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ width: slot, transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 30 : hover ? 20 : 1, touchAction: 'none' }}
      className="relative flex shrink-0 justify-center outline-none"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(f)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(f)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu(f, e.clientX, e.clientY)
      }}
      role="button"
      aria-label={`${f.name} by ${f.house}`}
    >
      <div
        className="origin-bottom cursor-pointer transition-transform duration-200 ease-out"
        style={{
          transform: hover && !isDragging ? 'translateY(-8px) scale(1.04)' : undefined,
          WebkitBoxReflect: `below 0px linear-gradient(transparent 72%, rgba(255,255,255,${tone === 'light' ? 0.18 : 0.28}))`,
          filter: `${sepia ? 'sepia(0.85) saturate(0.7) contrast(0.92) brightness(0.9) ' : ''}drop-shadow(0 6px 4px rgba(0,0,0,${tone === 'light' ? 0.3 : 0.55}))`
        }}
      >
        <BottleSvg fragrance={f} showLevel={showLevel} scale={scale} />
      </div>
      {vialTag && (f.wardrobe === 'wishlist' || f.wardrobe === 'to_try') && f.activeBottleCount > 0 && (
        <span className="absolute left-3 top-1 z-10 rounded-full bg-ink-950/85 px-1.5 text-[10px] font-medium text-cream ring-1 ring-brass-500/50" title={`I have ${f.bottles.map((b) => `${b.sizeMl} ml ${b.type}`).join(', ')}`}>
          {f.bottles.some((b) => b.type === 'sample' || b.type === 'decant') ? 'have a vial' : 'have one'}
        </span>
      )}
      {f.importedPending && (
        <span className="absolute right-3 top-1 z-10 rounded-full bg-brass-500 px-1.5 text-[10px] font-bold text-[#17110b]" title="Imported without a note. Open it and write what it smells like to you.">
          ✎
        </span>
      )}
      {hover && !isDragging && (
        <div
          className="pointer-events-none absolute left-1/2 z-40 w-max max-w-[220px] -translate-x-1/2 rounded-md border border-brass-500/40 bg-ink-950/95 px-3 py-1.5 text-center shadow-xl"
          style={{ bottom: h + 22 }}
        >
          <div className="text-sm font-medium text-cream">{f.name}</div>
          <div className="text-xs text-brass-400">{f.house}</div>
        </div>
      )}
    </div>
  )
}
