/** "Similar to what I own": how alike two fragrances are by their accords and notes. Pure, no framework. */

export interface Profile {
  accords: { name: string; strength: number }[]
  notes: { name: string }[]
}

const norm = (s: string) => s.trim().toLowerCase()

function cosine(a: { name: string; strength: number }[], b: { name: string; strength: number }[]): number {
  const va = new Map(a.map((x) => [norm(x.name), Math.max(x.strength, 0)]))
  const vb = new Map(b.map((x) => [norm(x.name), Math.max(x.strength, 0)]))
  let dot = 0
  for (const [k, v] of va) dot += v * (vb.get(k) ?? 0)
  const len = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0))
  const d = len(va) * len(vb)
  return d === 0 ? 0 : dot / d
}

function jaccard(a: { name: string }[], b: { name: string }[]): number {
  const sa = new Set(a.map((x) => norm(x.name)))
  const sb = new Set(b.map((x) => norm(x.name)))
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const x of sa) if (sb.has(x)) inter++
  return inter / (sa.size + sb.size - inter)
}

/** 0 (nothing in common) to 1 (the same). Accords count a little more than notes, since they are weighted. */
export function similarity(a: Profile, b: Profile): number {
  const parts: [number, number][] = []
  if (a.accords.length && b.accords.length) parts.push([cosine(a.accords, b.accords), 0.65])
  if (a.notes.length && b.notes.length) parts.push([jaccard(a.notes, b.notes), 0.35])
  const w = parts.reduce((s, [, x]) => s + x, 0)
  return w === 0 ? 0 : parts.reduce((s, [v, x]) => s + v * x, 0) / w
}

export interface SimilarHit<T> {
  item: T
  /** 0-100 */
  percent: number
  /** What they share, for a short explanation. */
  sharedAccords: string[]
  sharedNotes: string[]
}

/** The owned fragrances most like `target`, best first, leaving out weak matches and the target itself. */
export function similarOwned<T extends Profile & { id: number }>(target: Profile & { id?: number }, owned: T[], limit = 4, minPercent = 25): SimilarHit<T>[] {
  const tAcc = new Set(target.accords.map((x) => norm(x.name)))
  const tNotes = new Set(target.notes.map((x) => norm(x.name)))
  return owned
    .filter((o) => o.id !== target.id)
    .map((o) => ({
      item: o,
      percent: Math.round(similarity(target, o) * 100),
      sharedAccords: o.accords.filter((x) => tAcc.has(norm(x.name))).sort((a, b) => b.strength - a.strength).map((x) => x.name).slice(0, 3),
      sharedNotes: o.notes.filter((x) => tNotes.has(norm(x.name))).map((x) => x.name).slice(0, 3)
    }))
    .filter((h) => h.percent >= minPercent)
    .sort((a, b) => b.percent - a.percent || a.item.id - b.item.id)
    .slice(0, limit)
}
