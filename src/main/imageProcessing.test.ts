import { describe, expect, it } from 'vitest'
import { borderLightness, removeLightBackground, swapRedBlue, trimTransparent, type Rgba } from './imageProcessing'

/** Builds a w x h image of white with a coloured rectangle, optionally with a white "label" inside it. */
function bottle(w = 20, h = 30, opts: { label?: boolean; bg?: [number, number, number] } = {}): Rgba {
  const data = new Uint8Array(w * h * 4)
  const [br, bgc, bb] = opts.bg ?? [255, 255, 255]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const body = x >= 6 && x < 14 && y >= 5 && y < 25
      const label = opts.label && x >= 8 && x < 12 && y >= 12 && y < 16
      const [r, g, b] = label ? [255, 255, 255] : body ? [180, 40, 20] : [br, bgc, bb]
      data.set([r, g, b, 255], i)
    }
  }
  return { data, width: w, height: h }
}
const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]

describe('removeLightBackground', () => {
  it('makes the white background transparent and keeps the bottle', () => {
    const r = removeLightBackground(bottle())
    expect(r.removed).toBe(true)
    expect(alphaAt(r, 0, 0)).toBe(0)
    expect(alphaAt(r, 2, 15)).toBe(0)
    expect(alphaAt(r, 10, 8)).toBe(255)
  })

  it('keeps enclosed white areas such as a label', () => {
    const r = removeLightBackground(bottle(20, 30, { label: true }))
    expect(alphaAt(r, 10, 14)).toBe(255)
    expect(alphaAt(r, 0, 0)).toBe(0)
  })

  it('leaves photos with a non-white background alone', () => {
    const img = bottle(20, 30, { bg: [40, 90, 60] })
    expect(borderLightness(img)).toBe(0)
    const r = removeLightBackground(img)
    expect(r.removed).toBe(false)
    expect(alphaAt(r, 0, 0)).toBe(255)
  })

  it('does not modify its input', () => {
    const img = bottle()
    const copy = new Uint8Array(img.data)
    removeLightBackground(img)
    expect(img.data).toEqual(copy)
  })

  it('softens edge pixels that are close to white', () => {
    const img = bottle()
    // a light-grey pixel at the bottle edge
    img.data.set([225, 225, 225, 255], (10 * 20 + 6) * 4)
    const r = removeLightBackground(img)
    expect(alphaAt(r, 6, 10)).toBeLessThan(255)
    expect(alphaAt(r, 6, 10)).toBeGreaterThan(0)
  })
})

describe('trimTransparent', () => {
  it('crops to the opaque area plus padding', () => {
    const r = trimTransparent(removeLightBackground(bottle()), 1)
    expect(r.width).toBe(8 + 2)
    expect(r.height).toBe(20 + 2)
    expect(r.data.length).toBe(r.width * r.height * 4)
  })
  it('returns a fully transparent image unchanged', () => {
    const img: Rgba = { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 }
    expect(trimTransparent(img)).toBe(img)
  })
})

describe('swapRedBlue', () => {
  it('swaps channels', () => {
    expect([...swapRedBlue(new Uint8Array([1, 2, 3, 4]))]).toEqual([3, 2, 1, 4])
  })
})
