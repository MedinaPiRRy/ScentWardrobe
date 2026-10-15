/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export const tokens = (text: string): string[] => normalize(text).split(' ').filter(Boolean)

/** Levenshtein distance, giving up (returning max + 1) once it must exceed `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

function tokenScore(q: string, t: string): number {
  if (q === t) return 1
  if (q.length >= 2 && t.startsWith(q)) return 0.9
  if (q.length >= 3 && t.includes(q)) return 0.7
  const allowed = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0
  if (allowed > 0 && editDistance(q, t, allowed) <= allowed) return 0.6
  // A typo in the middle of a longer word the user is still typing.
  if (q.length >= 5 && t.length > q.length && editDistance(q, t.slice(0, q.length), 1) <= 1) return 0.55
  return 0
}

export interface Searchable {
  /** Precomputed tokens of name + house. */
  tokens: string[]
  /** Normalised name, for the "starts with" bonus. */
  name: string
}

export function prepare(name: string, house: string): Searchable {
  return { tokens: tokens(`${name} ${house}`), name: normalize(name) }
}

/** Every query token must match some token of the target. Returns 0 when something doesn't match. */
export function score(query: string[], target: Searchable): number {
  if (query.length === 0) return 0
  let total = 0
  for (const q of query) {
    let best = 0
    for (const t of target.tokens) {
      const s = tokenScore(q, t)
      if (s > best) best = s
      if (best === 1) break
    }
    if (best === 0) return 0
    total += best
  }
  let s = total / query.length
  const joined = query.join(' ')
  if (target.name === joined) s += 0.5
  else if (target.name.startsWith(joined)) s += 0.2
  // Prefer shorter, tighter names when scores tie.
  s -= Math.max(target.tokens.length - query.length, 0) * 0.01
  return s
}
