import type { CSSProperties } from 'react'
import type { WardrobeKind } from '@shared/types'

export interface ShelfTheme {
  /** Frame around the whole cabinet. */
  frame: CSSProperties
  /** Back panel behind the bottles of one shelf. */
  back: CSSProperties
  /** The plank the bottles stand on. */
  plank: CSSProperties
  /** Light cast from above onto the shelf. */
  glow: string
  accent: string
  caption: string
}

export const THEMES: Record<WardrobeKind, ShelfTheme> = {
  collection: {
    frame: {
      background: 'linear-gradient(180deg,#4a2f1a,#3a2413)',
      border: '10px solid #2b1a0d',
      boxShadow: 'inset 0 0 40px rgba(0,0,0,.6), 0 20px 50px rgba(0,0,0,.55)'
    },
    back: { background: 'linear-gradient(180deg,#24160c 0%,#1a100a 100%)' },
    plank: {
      background:
        'repeating-linear-gradient(90deg,rgba(0,0,0,.08) 0 2px,transparent 2px 7px),linear-gradient(180deg,#a56a35,#7a4a22 60%,#5b3515)',
      boxShadow: '0 6px 14px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,220,170,.35)'
    },
    glow: 'radial-gradient(ellipse 60% 90% at 50% -10%, rgba(255,200,120,.35), transparent 70%)',
    accent: '#d9b26f',
    caption: 'Warm oak'
  },
  wishlist: {
    frame: {
      background: 'linear-gradient(180deg,#10202a,#0a1620)',
      border: '10px solid #0b1118',
      boxShadow: 'inset 0 0 40px rgba(60,160,200,.12), 0 20px 50px rgba(0,0,0,.55)'
    },
    back: { background: 'linear-gradient(180deg,rgba(40,90,120,.28),rgba(10,25,38,.9))' },
    plank: {
      background: 'linear-gradient(180deg,rgba(170,225,245,.55),rgba(80,150,180,.35) 55%,rgba(40,90,115,.5))',
      boxShadow: '0 6px 16px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.55), 0 0 18px rgba(120,200,240,.15)',
      backdropFilter: 'blur(2px)'
    },
    glow: 'radial-gradient(ellipse 60% 90% at 50% -10%, rgba(150,220,255,.3), transparent 70%)',
    accent: '#8ccfe8',
    caption: 'Dark glass'
  },
  to_try: {
    frame: {
      background: 'linear-gradient(180deg,#d9d3c8,#bfb8aa)',
      border: '10px solid #a59d8e',
      boxShadow: 'inset 0 0 30px rgba(0,0,0,.18), 0 20px 50px rgba(0,0,0,.45)'
    },
    back: { background: 'linear-gradient(180deg,#ece7dd,#d6cfc2)' },
    plank: {
      background: 'linear-gradient(180deg,#fbf8f1,#e3dccd 60%,#c9c0ae)',
      boxShadow: '0 6px 12px rgba(0,0,0,.35), inset 0 1px 0 #fff'
    },
    glow: 'radial-gradient(ellipse 60% 90% at 50% -10%, rgba(255,255,255,.7), transparent 70%)',
    accent: '#8a7a55',
    caption: 'Light display'
  },
  // Had: a keepsake cabinet in sepia, warm lamp light and aged paper.
  had: {
    frame: {
      background: 'linear-gradient(180deg,#5b4630,#3f2f1f)',
      border: '10px solid #2f2216',
      boxShadow: 'inset 0 0 50px rgba(30,15,0,.65), 0 20px 50px rgba(0,0,0,.55)'
    },
    back: { background: 'linear-gradient(180deg,#3a2c1d 0%,#2a1f14 100%)' },
    plank: {
      background:
        'repeating-linear-gradient(90deg,rgba(0,0,0,.1) 0 2px,transparent 2px 9px),linear-gradient(180deg,#8d6a45,#6a4d2e 60%,#46321c)',
      boxShadow: '0 6px 14px rgba(0,0,0,.6), inset 0 1px 0 rgba(240,205,150,.3)'
    },
    glow: 'radial-gradient(ellipse 55% 90% at 50% -10%, rgba(255,214,150,.38), transparent 70%)',
    accent: '#d3b88a',
    caption: 'Keepsake cabinet'
  },
  // Garbage Perfumes is drawn as a bin (see GarbageBin); this only supplies colours for its frame and captions.
  garbage: {
    frame: { background: 'linear-gradient(180deg,#26302b,#161c19)', border: '10px solid #0e1210', boxShadow: 'inset 0 0 40px rgba(0,0,0,.6), 0 20px 50px rgba(0,0,0,.55)' },
    back: { background: 'linear-gradient(180deg,#1b221f,#101512)' },
    plank: { background: 'linear-gradient(180deg,#46524c,#2c3531)' },
    glow: 'radial-gradient(ellipse 55% 90% at 50% -10%, rgba(160,200,170,.18), transparent 70%)',
    accent: '#8fb39c',
    caption: 'Never again'
  }
}
