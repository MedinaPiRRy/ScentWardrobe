import type { CSSProperties, ReactNode } from 'react'

const WOOD: CSSProperties = {
  background:
    'repeating-linear-gradient(90deg, rgba(0,0,0,.07) 0 2px, transparent 2px 9px), linear-gradient(180deg, #9b6a38 0%, #7a4c24 45%, #5a3516 100%)'
}

/** The inside of the drawer: dark felt with a soft light from above. Used as the shelf "back" panel of the tray. */
export const TRAY_THEME = {
  frame: {},
  back: {
    background: 'radial-gradient(ellipse 70% 120% at 50% 0%, rgba(120,80,50,.35), transparent 70%), linear-gradient(180deg,#2c1d14,#1b120c)',
    boxShadow: 'inset 0 10px 18px rgba(0,0,0,.65)'
  },
  plank: { background: 'linear-gradient(180deg,#5c3b1c,#3a2410)', boxShadow: '0 3px 6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,220,170,.25)' },
  glow: 'radial-gradient(ellipse 60% 100% at 50% -10%, rgba(255,200,130,.22), transparent 70%)',
  accent: '#d9b26f',
  caption: 'Drawer'
}

interface Props {
  open: boolean
  onToggle: () => void
  /** Number of vials inside (shown on the label plate). */
  count: number
  /** The vials. */
  children: ReactNode
}

/**
 * A front-facing drawer under the cabinet. Closed, you see its wooden front with a brass handle. Opening pulls the
 * front toward you (it slides down as the tray grows) and reveals the vials lying in the felt-lined tray.
 */
export default function Drawer({ open, onToggle, count, children }: Props) {
  return (
    <div className="relative mx-auto w-[calc(100%-36px)]" aria-label="Drawer for decants, samples and minis">
      {/* the tray (interior): its height animates from nothing to full */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 520ms cubic-bezier(.2,.8,.2,1)' }}
        aria-hidden={!open}
        // A closed drawer is not just hidden: nothing in it can be reached with Tab or read out.
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="relative border-x-[10px] border-t-[8px]"
            style={{ borderColor: '#6b4423', borderTopColor: '#4a2f17', boxShadow: 'inset 0 0 30px rgba(0,0,0,.6)', background: '#1b120c', opacity: open ? 1 : 0, transition: 'opacity 380ms ease' }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* the front panel of the drawer */}
      <div
        className="relative flex h-[64px] items-center rounded-b-lg px-5"
        style={{
          ...WOOD,
          borderTop: '3px solid #3b2410',
          boxShadow: open ? '0 14px 22px rgba(0,0,0,.6), inset 0 2px 0 rgba(255,225,180,.3), inset 0 -4px 0 rgba(0,0,0,.25)' : '0 6px 12px rgba(0,0,0,.5), inset 0 2px 0 rgba(255,225,180,.3), inset 0 -4px 0 rgba(0,0,0,.25)',
          transition: 'box-shadow 400ms ease'
        }}
      >
        {/* label plate */}
        <div
          className="rounded-[3px] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em]"
          style={{ background: 'linear-gradient(180deg,#f1d99a,#c9a458)', color: '#3b2810', boxShadow: '0 1px 2px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.5)' }}
        >
          Decants · Samples · Minis
        </div>
        <span className="ml-3 text-xs" style={{ color: '#f1d9a8' }}>
          {count === 0 ? 'empty' : `${count} ${count === 1 ? 'vial' : 'vials'}`}
        </span>

        {/* the handle */}
        <button
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Close the drawer' : 'Open the drawer'}
          title={open ? 'Close the drawer' : 'Open the drawer'}
          className="absolute left-1/2 top-1/2 h-[18px] w-[150px] -translate-x-1/2 -translate-y-1/2 rounded-full outline-none transition-transform duration-300 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-brass-400"
          style={{
            background: 'linear-gradient(180deg,#f6e3a6,#c79d45 45%,#8a6420)',
            boxShadow: '0 4px 6px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.6)',
            transform: `translate(-50%, calc(-50% + ${open ? 3 : 0}px))`
          }}
        >
          <span className="absolute -left-1 top-1/2 h-5 w-3 -translate-y-1/2 rounded-sm bg-[#8a6420]" />
          <span className="absolute -right-1 top-1/2 h-5 w-3 -translate-y-1/2 rounded-sm bg-[#8a6420]" />
        </button>

        <button className="ml-auto rounded-md px-3 py-1 text-xs hover:bg-black/15" style={{ color: '#f1d9a8' }} onClick={onToggle} tabIndex={-1} aria-hidden>
          {open ? 'Close ▴' : 'Open ▾'}
        </button>
      </div>
    </div>
  )
}
