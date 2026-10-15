/** Pure RGBA pixel processing for bottle photos. No Electron imports, so it can be unit-tested. */

export interface Rgba {
  data: Uint8Array
  width: number
  height: number
}

export interface BackgroundResult extends Rgba {
  /** True when a plain light background was found and removed. */
  removed: boolean
}

const isLight = (d: Uint8Array, i: number): boolean => {
  const a = d[i + 3]
  if (a < 10) return true
  const r = d[i]
  const g = d[i + 1]
  const b = d[i + 2]
  const hi = Math.max(r, g, b)
  const lo = Math.min(r, g, b)
  return lo >= 232 && hi - lo <= 16
}

/** Fraction of border pixels that look like plain light background. */
export function borderLightness(img: Rgba): number {
  const { data, width: w, height: h } = img
  let light = 0
  let total = 0
  const check = (x: number, y: number) => {
    total++
    if (isLight(data, (y * w + x) * 4)) light++
  }
  for (let x = 0; x < w; x++) {
    check(x, 0)
    check(x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    check(0, y)
    check(w - 1, y)
  }
  return total ? light / total : 0
}

/**
 * Makes a plain white / near-white background transparent by flood-filling inwards from the border, so white
 * labels or highlights inside the bottle are kept. Pixels on the edge are softened to avoid a white halo.
 * The image is returned unchanged when the border isn't mostly light.
 */
export function removeLightBackground(img: Rgba, minBorderLight = 0.9): BackgroundResult {
  const { width: w, height: h } = img
  if (w < 3 || h < 3 || borderLightness(img) < minBorderLight) return { ...img, removed: false }

  const data = new Uint8Array(img.data)
  const bg = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  const push = (x: number, y: number) => {
    const p = y * w + x
    if (bg[p] || !isLight(data, p * 4)) return
    bg[p] = 1
    queue[tail++] = p
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (head < tail) {
    const p = queue[head++]
    const x = p % w
    const y = (p - x) / w
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }

  const out = new Uint8Array(data)
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    if (bg[p]) {
      out[i + 3] = 0
      continue
    }
    // Soften pixels that touch the removed area, in proportion to how white they are.
    const x = p % w
    const y = (p - x) / w
    let touches = false
    for (let dy = -1; dy <= 1 && !touches; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) {
          touches = true
          break
        }
      }
    }
    if (touches) {
      const whiteness = Math.min(Math.max((Math.min(data[i], data[i + 1], data[i + 2]) - 190) / 55, 0), 1)
      out[i + 3] = Math.round(out[i + 3] * (1 - whiteness * 0.85))
    }
  }
  return { data: out, width: w, height: h, removed: true }
}

/** Crops transparent margins (keeping `pad` pixels). Returns the input if nothing is opaque or nothing to trim. */
export function trimTransparent(img: Rgba, pad = 2): Rgba {
  const { data, width: w, height: h } = img
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return img
  minX = Math.max(minX - pad, 0)
  minY = Math.max(minY - pad, 0)
  maxX = Math.min(maxX + pad, w - 1)
  maxY = Math.min(maxY + pad, h - 1)
  const nw = maxX - minX + 1
  const nh = maxY - minY + 1
  if (nw === w && nh === h) return img
  const out = new Uint8Array(nw * nh * 4)
  for (let y = 0; y < nh; y++) {
    const src = ((minY + y) * w + minX) * 4
    out.set(data.subarray(src, src + nw * 4), y * nw * 4)
  }
  return { data: out, width: nw, height: nh }
}

/** BGRA <-> RGBA (Electron's bitmaps are BGRA on Windows). Swaps in place on a copy. */
export function swapRedBlue(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data)
  for (let i = 0; i < out.length; i += 4) {
    const t = out[i]
    out[i] = out[i + 2]
    out[i + 2] = t
  }
  return out
}
