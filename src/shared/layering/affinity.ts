import type { AffinityMatrix } from './types'

/** [accord, accord, affinity -1..1, why]. Order does not matter. Unlisted pairs are neutral (0). */
export type AffinityRule = [string, string, number, string]

export const DEFAULT_RULES: AffinityRule[] = [
  // ---- pairs that work -------------------------------------------------------------------
  ['vanilla', 'citrus', 0.5, 'warm vanilla softens sharp citrus'],
  ['amber', 'woody', 0.7, 'amber adds warmth and glow to dry woods'],
  ['vanilla', 'woody', 0.6, 'creamy vanilla rounds off dry woods'],
  ['amber', 'vanilla', 0.5, 'amber and vanilla deepen each other'],
  ['leather', 'tobacco', 0.7, 'leather and tobacco are a classic smoky duo'],
  ['tobacco', 'vanilla', 0.6, 'sweet vanilla smooths tobacco'],
  ['citrus', 'aromatic', 0.5, 'citrus lifts aromatic herbs'],
  ['citrus', 'woody', 0.4, 'citrus brightens the woods'],
  ['fresh spicy', 'woody', 0.5, 'a spicy sparkle on top of woods'],
  ['fresh spicy', 'amber', 0.4, 'spice and amber share a warm side'],
  ['fruity', 'vanilla', 0.5, 'fruit and vanilla make a soft, sweet blend'],
  ['fruity', 'musky', 0.3, 'musk keeps fruit clean'],
  ['rose', 'woody', 0.5, 'rose gains structure from woods'],
  ['rose', 'amber', 0.5, 'rose and amber are a rich oriental pairing'],
  ['rose', 'oud', 0.6, 'rose and oud are a classic Arabian pairing'],
  ['white floral', 'vanilla', 0.4, 'vanilla adds creaminess to white florals'],
  ['floral', 'musky', 0.4, 'musk cushions florals'],
  ['musky', 'woody', 0.4, 'musk smooths woods'],
  ['coffee', 'vanilla', 0.7, 'coffee and vanilla read as a latte'],
  ['coffee', 'tobacco', 0.5, 'coffee and tobacco share a dark, roasted side'],
  ['caramel', 'coffee', 0.6, 'caramel and coffee are a gourmand classic'],
  ['powdery', 'vanilla', 0.5, 'powder and vanilla are soft and comforting'],
  ['iris', 'woody', 0.5, 'iris and woods feel elegant and dry'],
  ['lavender', 'vanilla', 0.6, 'lavender and vanilla is a familiar, cosy pair'],
  ['lavender', 'woody', 0.4, 'lavender sits well on woods'],
  ['lavender', 'citrus', 0.4, 'fresh lavender with citrus feels clean'],
  ['oud', 'amber', 0.6, 'amber warms oud'],
  ['oud', 'leather', 0.6, 'oud and leather are dark and animalic together'],
  ['patchouli', 'vanilla', 0.5, 'patchouli and vanilla feel earthy-sweet'],
  ['patchouli', 'rose', 0.5, 'rose and patchouli are a chypre staple'],
  ['smoky', 'leather', 0.6, 'smoke and leather reinforce each other'],
  ['smoky', 'woody', 0.5, 'smoke deepens woods'],
  ['honey', 'tobacco', 0.6, 'honey and tobacco are warm and sticky-sweet'],
  ['warm spicy', 'vanilla', 0.6, 'warm spices and vanilla are cosy'],
  ['warm spicy', 'amber', 0.6, 'spice and amber share a warm core'],
  ['cinnamon', 'vanilla', 0.6, 'cinnamon and vanilla taste like baking'],
  ['coconut', 'vanilla', 0.5, 'coconut and vanilla are creamy together'],
  ['coconut', 'tropical', 0.5, 'coconut and tropical fruit feel like summer'],
  ['aquatic', 'citrus', 0.5, 'citrus brightens aquatic freshness'],
  ['aquatic', 'aromatic', 0.5, 'aquatic and aromatic accords share a fresh, herbal feel'],
  ['ozonic', 'aquatic', 0.4, 'ozonic and aquatic notes extend each other'],
  ['green', 'citrus', 0.4, 'green notes and citrus feel crisp'],
  ['herbal', 'citrus', 0.4, 'herbs and citrus are a fresh pairing'],
  ['fresh', 'citrus', 0.3, 'both are fresh and bright'],
  ['tuberose', 'vanilla', 0.3, 'vanilla softens tuberose'],
  // ---- pairs that tend to fight ----------------------------------------------------------
  ['aquatic', 'sweet', -0.5, 'airy aquatic notes get weighed down by heavy sweetness'],
  ['aquatic', 'vanilla', -0.4, 'aquatic freshness and vanilla pull in opposite directions'],
  ['aquatic', 'coffee', -0.6, 'aquatic and coffee clash'],
  ['aquatic', 'caramel', -0.5, 'aquatic and caramel clash'],
  ['aquatic', 'chocolate', -0.5, 'aquatic and chocolate clash'],
  ['aquatic', 'tobacco', -0.5, 'sea air and tobacco do not mix'],
  ['aquatic', 'leather', -0.4, 'aquatic notes and leather feel mismatched'],
  ['aquatic', 'oud', -0.6, 'aquatic freshness is crushed by oud'],
  ['aquatic', 'amber', -0.3, 'aquatic and heavy amber pull apart'],
  ['aquatic', 'animalic', -0.5, 'aquatic and animalic notes clash'],
  ['oud', 'white floral', -0.5, 'heavy oud smothers white florals, and the florals turn sharp'],
  ['oud', 'floral', -0.4, 'oud and florals compete'],
  ['oud', 'powdery', -0.4, 'oud and powder feel muddy'],
  ['oud', 'citrus', -0.3, 'citrus vanishes beside oud'],
  ['oud', 'fruity', -0.3, 'fruit sours next to oud'],
  ['oud', 'soapy', -0.5, 'soapy notes and oud clash'],
  ['aldehydic', 'oud', -0.4, 'aldehydes and oud pull in opposite directions'],
  ['soapy', 'leather', -0.4, 'soapy and leather clash'],
  ['animalic', 'powdery', -0.3, 'animalic notes muddy powdery ones'],
  ['fresh', 'tobacco', -0.3, 'fresh notes and tobacco feel at odds'],
  ['citrus', 'tobacco', -0.2, 'citrus and tobacco are an awkward pair'],
  ['rubber', 'sweet', -0.4, 'rubber and sweetness clash'],
  ['tuberose', 'aquatic', -0.4, 'tuberose and aquatic notes clash'],
  ['savory', 'sweet', -0.4, 'savory and sweet notes fight'],
  ['metallic', 'warm spicy', -0.2, 'metallic edges grate against warm spice']
]

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)
const norm = (s: string) => s.trim().toLowerCase()

export function defaultAffinity(): AffinityMatrix {
  const m: AffinityMatrix = {}
  for (const [a, b, v] of DEFAULT_RULES) m[key(a, b)] = v
  return m
}

const WHY = new Map(DEFAULT_RULES.map(([a, b, , why]) => [key(a, b), why]))
export const ruleReason = (a: string, b: string): string | undefined => WHY.get(key(norm(a), norm(b)))

/** Defaults with the user's overrides applied (an override of 0 means "neutral", so it still wins over a default). */
export function buildAffinity(overrides: AffinityMatrix = {}): AffinityMatrix {
  const m = defaultAffinity()
  for (const [k, v] of Object.entries(overrides)) {
    const [a, b] = k.split('|')
    if (a && b && Number.isFinite(v)) m[key(norm(a), norm(b))] = Math.max(-1, Math.min(1, v))
  }
  return m
}

/** Same accord on both sides counts as mildly positive; everything unlisted is neutral. */
export const SAME_ACCORD_AFFINITY = 0.3

export function affinityOf(m: AffinityMatrix, a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (x === y) return m[key(x, y)] ?? SAME_ACCORD_AFFINITY
  return m[key(x, y)] ?? 0
}

export const pairKey = key

/**
 * Only the entries that differ from the defaults (changed values and the user's own extra pairs) need storing, so
 * future improvements to the default rules still reach users who edited a few of them.
 */
export function overridesFrom(edited: AffinityMatrix): AffinityMatrix {
  const defaults = defaultAffinity()
  const out: AffinityMatrix = {}
  for (const [k, v] of Object.entries(edited)) {
    const [a, b] = k.split('|')
    if (!a || !b || !Number.isFinite(v)) continue
    const kk = key(norm(a), norm(b))
    const val = Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100
    if (defaults[kk] !== val) out[kk] = val
  }
  return out
}
