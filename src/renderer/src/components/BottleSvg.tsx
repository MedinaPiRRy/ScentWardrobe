import { useEffect, useId, useState } from 'react'
import type { FragranceSummary } from '@shared/types'
import { useImageSrc } from '../lib/images'
import { bottleHeightPx, fillLevel, shelfBottle } from '../lib/shelf'

// Three body silhouettes in a 100x200 box. Body spans y 84..192.
const BODIES = [
  'M18 90 a8 8 0 0 1 8-8 h48 a8 8 0 0 1 8 8 v94 a8 8 0 0 1-8 8 h-48 a8 8 0 0 1-8-8z',
  'M28 88 a6 6 0 0 1 6-6 h32 a6 6 0 0 1 6 6 v98 a6 6 0 0 1-6 6 h-32 a6 6 0 0 1-6-6z',
  'M38 82 h24 c0 10 22 14 22 34 v66 a10 10 0 0 1-10 10 h-48 a10 10 0 0 1-10-10 v-66 c0-20 22-24 22-34z'
]
const CAPS = ['#c9a45c', '#2b2b2f', '#b8bcc4']
const BODY_TOP = 82
const BODY_BOTTOM = 192

interface Props {
  fragrance: FragranceSummary
  /** Show the liquid level (owned bottles). Others are drawn full. */
  showLevel?: boolean
  /** Scale on top of the real-size height, e.g. for the decant rack. */
  scale?: number
  /** Draw at exactly this height in px, ignoring the real size (thumbnails). */
  fixedHeight?: number
}

export function bottleDims(f: FragranceSummary, scale = 1, fixedHeight?: number): { w: number; h: number } {
  const h = fixedHeight ?? Math.round(bottleHeightPx(shelfBottle(f).sizeMl) * scale)
  return { w: Math.round(h / 2), h }
}

export default function BottleSvg({ fragrance: f, showLevel = true, scale = 1, fixedHeight }: Props) {
  const uid = useId().replace(/:/g, '')
  const { w, h } = bottleDims(f, scale, fixedHeight)
  const [photoFailed, setPhotoFailed] = useState(false)
  // A photo that fails to load is retried several times (about 15 seconds) before the drawn bottle is used, since a single hiccup at
  // start-up must not hide it for the rest of the session.
  const [tries, setTries] = useState(0)
  useEffect(() => {
    setPhotoFailed(false)
    setTries(0)
  }, [f.imagePath])
  const loaded = useImageSrc(f.imagePath)
  const photo = photoFailed || !loaded ? null : tries > 0 && !loaded.startsWith('data:') ? `${loaded}?r=${tries}` : loaded
  if (photo) {
    // A real photo: drawn at the same real-size height, never wider than the slot allows. The fill level is only
    // available for the generated bottle.
    return <img src={photo} alt="" draggable={false} onError={() => (void window.api.images.report(f.imagePath ?? '', `img error, attempt ${tries}`), tries < 8 ? window.setTimeout(() => setTries((t) => t + 1), Math.min(500 * (tries + 1), 3000)) : setPhotoFailed(true))} style={{ height: h, maxWidth: Math.round(h * 0.75), width: 'auto', objectFit: 'contain', display: 'block' }} />
  }
  const variant = f.id % 3
  const level = showLevel ? fillLevel(shelfBottle(f)) : 1
  const liquid = f.topAccords[0]?.color ?? '#c9a45c'
  const liquid2 = f.topAccords[1]?.color ?? liquid
  const liquidTop = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * level
  const cap = CAPS[(f.id >> 1) % CAPS.length]

  return (
    <svg width={w} height={h} viewBox="0 0 100 200" style={{ overflow: 'visible' }} aria-hidden>
      <defs>
        <clipPath id={`body-${uid}`}>
          <path d={BODIES[variant]} />
        </clipPath>
        <linearGradient id={`liq-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={liquid} stopOpacity="0.85" />
          <stop offset="1" stopColor={liquid2} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`gloss-${uid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.05" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      {/* cap + neck */}
      <rect x="36" y="22" width="28" height="42" rx="4" fill={cap} />
      <rect x="42" y="62" width="16" height="22" fill="#d9d4cc" fillOpacity="0.55" />
      {/* glass */}
      <path d={BODIES[variant]} fill="#e8eef0" fillOpacity="0.16" />
      <g clipPath={`url(#body-${uid})`}>
        <rect x="0" y={liquidTop} width="100" height={200 - liquidTop} fill={`url(#liq-${uid})`} />
        {level < 1 && <rect x="0" y={liquidTop} width="100" height="2.5" fill="#fff" fillOpacity="0.45" />}
      </g>
      {/* label */}
      <rect x="30" y="118" width="40" height="34" rx="2" fill="#f4efe4" fillOpacity="0.82" />
      <rect x="35" y="126" width="30" height="3" fill="#2b2b2f" fillOpacity="0.6" />
      <rect x="38" y="134" width="24" height="2" fill="#2b2b2f" fillOpacity="0.35" />
      <rect x="40" y="141" width="20" height="2" fill="#2b2b2f" fillOpacity="0.25" />
      <path d={BODIES[variant]} fill={`url(#gloss-${uid})`} />
      <path d={BODIES[variant]} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  )
}
