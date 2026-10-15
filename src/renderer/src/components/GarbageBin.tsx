import { useState } from 'react'
import type { FragranceSummary } from '@shared/types'
import BottleSvg from './BottleSvg'

interface Props {
  items: FragranceSummary[]
  onOpen: (f: FragranceSummary) => void
  onContextMenu: (f: FragranceSummary, x: number, y: number) => void
}

/** A stable pseudo-random number in [0, 1) for a fragrance, so the pile looks tossed but does not reshuffle. */
const rnd = (id: number, salt: number) => {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const RIBS = 'repeating-linear-gradient(90deg, rgba(0,0,0,.28) 0 3px, transparent 3px 46px)'

/** Garbage Perfumes: a dumpster with the bottles tossed in. The front panel hides the lower half of the pile. */
export default function GarbageBin({ items, onOpen, onContextMenu }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const rows = Math.max(1, Math.ceil(items.length / 6))
  const pileMin = 200 + rows * 70

  return (
    <div className="relative mx-auto w-full max-w-[760px] px-6 pb-6 pt-28" aria-label="Garbage Perfumes bin">
      {/* open lid, hinged at the back */}
      <div
        className="absolute left-10 right-40 top-14 h-10 origin-bottom-left rounded-t-md"
        style={{ transform: 'rotate(-7deg)', background: 'linear-gradient(180deg,#2f5a3a,#1d3d27)', boxShadow: '0 8px 14px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,255,255,.12)', borderBottom: '4px solid #12261a' }}
      >
        <div className="absolute inset-0 rounded-t-md" style={{ background: RIBS, opacity: 0.5 }} />
        <div className="absolute -bottom-1 left-6 h-3 w-3 rounded-full bg-[#0c1a11]" />
        <div className="absolute -bottom-1 right-6 h-3 w-3 rounded-full bg-[#0c1a11]" />
      </div>

      <div className="relative" style={{ minHeight: pileMin }}>
        {/* the inside of the bin */}
        <div className="absolute inset-x-0 top-6 bottom-0 rounded-b-xl" style={{ background: 'linear-gradient(180deg,#050807,#0d1511)', boxShadow: 'inset 0 10px 30px rgba(0,0,0,.8)' }} />

        {/* the pile */}
        <div className="relative z-[1] flex flex-wrap items-end justify-center px-8 pt-4 pb-[100px]" style={{ minHeight: pileMin }}>
          {items.length === 0 && <p className="mb-20 self-center text-sm text-cream/45">Nothing in the bin. Good taste so far.</p>}
          {items.map((f, i) => {
            const angle = Math.round((rnd(f.id, 1) - 0.5) * 120)
            const dx = Math.round((rnd(f.id, 2) - 0.5) * 22)
            const dy = Math.round(rnd(f.id, 3) * 22)
            const active = hover === f.id
            return (
              <button
                key={f.id}
                onMouseEnter={() => setHover(f.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onOpen(f)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  onContextMenu(f, e.clientX, e.clientY)
                }}
                aria-label={`${f.name} by ${f.house}`}
                className="relative -mx-2 -mb-5 cursor-pointer outline-none"
                style={{ zIndex: active ? 30 : i + 2, transform: `translate(${dx}px, ${dy}px) rotate(${active ? Math.round(angle / 3) : angle}deg)`, transition: 'transform .18s ease-out', filter: 'drop-shadow(0 5px 4px rgba(0,0,0,.6)) saturate(.8)' }}
              >
                <BottleSvg fragrance={f} showLevel={false} scale={0.85} />
                {active && (
                  <span
                    className="pointer-events-none absolute left-1/2 top-0 z-50 w-max max-w-[240px] -translate-x-1/2 -translate-y-full rounded-md border border-brass-500/40 bg-ink-950/95 px-3 py-1.5 text-center shadow-xl"
                    style={{ transform: `translate(-50%, -100%) rotate(${-Math.round(angle / 3)}deg)` }}
                  >
                    <span className="block text-sm font-medium text-cream">{f.name}</span>
                    <span className="block text-xs text-brass-400">{f.house}</span>
                    {f.dislikeNote && <span className="mt-0.5 block text-[11px] italic text-red-300">“{f.dislikeNote}”</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* front panel: ribbed metal covering the bottom of the pile */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] h-[88px] rounded-b-xl" style={{ background: 'linear-gradient(180deg,#356943 0%,#2a5535 40%,#1f4028 100%)', boxShadow: '0 -6px 12px rgba(0,0,0,.45), inset 0 3px 0 rgba(255,255,255,.18)' }}>
          <div className="absolute inset-0 rounded-b-xl" style={{ background: RIBS }} />
          <div className="absolute inset-x-0 top-0 h-3 bg-[#173222]" style={{ boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.4)' }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[40%] rounded-sm border-2 border-white/35 px-4 py-1 font-mono text-sm font-bold uppercase tracking-[0.35em] text-white/45">Garbage</div>
        </div>
      </div>

      {/* wheels */}
      <div className="relative z-[41] mx-8 flex justify-between">
        {[0, 1].map((w) => (
          <div key={w} className="-mt-1 h-7 w-7 rounded-full border-4 border-[#0b0f0d] bg-[#1b2420]" style={{ boxShadow: 'inset 0 0 0 3px #303c36' }} />
        ))}
      </div>
    </div>
  )
}
