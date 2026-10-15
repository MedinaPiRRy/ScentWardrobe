import type { MixItem } from './types'

/** How an accord reads on the skin, for the template-based description. */
const ACCORD_WORDS: Record<string, string> = {
  citrus: 'bright citrus',
  fresh: 'clean freshness',
  'fresh spicy': 'sparkling spice',
  aromatic: 'aromatic herbs',
  aquatic: 'airy, marine notes',
  woody: 'dry woods',
  amber: 'glowing amber',
  musky: 'soft musk',
  fruity: 'juicy fruit',
  smoky: 'smoke',
  sweet: 'sweetness',
  vanilla: 'creamy vanilla',
  coffee: 'roasted coffee',
  'warm spicy': 'warm spice',
  'white floral': 'creamy white florals',
  'yellow floral': 'sunny florals',
  floral: 'florals',
  powdery: 'soft powder',
  tobacco: 'tobacco leaf',
  leather: 'supple leather',
  earthy: 'earthy depth',
  boozy: 'boozy warmth',
  rose: 'rose',
  oud: 'dark oud',
  patchouli: 'patchouli',
  lavender: 'lavender',
  green: 'green freshness',
  herbal: 'herbs',
  balsamic: 'balsamic resins',
  caramel: 'caramel',
  honey: 'honey',
  coconut: 'coconut',
  tropical: 'tropical fruit',
  cinnamon: 'cinnamon',
  iris: 'iris',
  animalic: 'animalic warmth',
  mossy: 'moss',
  ozonic: 'airy ozone',
  salty: 'a salty edge'
}

const word = (accord: string) => ACCORD_WORDS[accord] ?? accord

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

const uniq = <T>(xs: T[]) => [...new Set(xs)]

/** Picks one of several phrasings, deterministically for a given set of fragrances so the text does not flicker. */
function pick<T>(options: T[], seed: number, salt: number): T {
  return options[(seed + salt) % options.length]
}

/**
 * 2-4 sentences describing the opening, the character, who dominates and the drydown. Template-based: it only
 * restates what the data says (notes, blended accords, shares) in plain words.
 */
export function describeBlend(
  mix: MixItem[],
  blend: { name: string; strength: number }[],
  shares: { id: number; name: string; share: number }[]
): string {
  if (mix.length < 2) return ''
  const seed = mix.reduce((s, m) => s + m.item.id, 0)
  const byShare = [...shares].sort((a, b) => b.share - a.share)
  const sentences: string[] = []

  // Opening: top notes, most dominant fragrance first.
  const order = byShare.map((s) => mix.find((m) => m.item.id === s.id)!)
  const tops = uniq(order.flatMap((m) => m.item.notes.filter((n) => n.layer === 'top').map((n) => n.name))).slice(0, 3)
  const topWords = tops.length ? list(tops.map((t) => t.toLowerCase())) : list(blend.slice(0, 2).map((a) => word(a.name)))
  sentences.push(
    pick(
      [`The opening is led by ${topWords}.`, `Expect ${topWords} on the first spray.`, `It opens with ${topWords}.`],
      seed,
      0
    )
  )

  // Character of the whole blend.
  const [a1, a2, a3] = blend.map((a) => word(a.name))
  if (a1 && a2) {
    sentences.push(
      pick(
        [
          `Together they read as ${a1} and ${a2}${a3 ? `, with ${a3} in the background` : ''}.`,
          `The overall impression is ${a1} with ${a2}${a3 ? ` and a hint of ${a3}` : ''}.`
        ],
        seed,
        1
      )
    )
  }

  // Who dominates.
  const [first, second] = byShare
  if (first.share - second.share < 0.15) {
    sentences.push(`${first.name} and ${second.name} share the stage fairly evenly.`)
  } else {
    const support = mix.find((m) => m.item.id === second.id)!.item
    const sAccord = [...support.accords].sort((a, b) => b.strength - a.strength)[0]
    sentences.push(
      `${first.name} dominates, at about ${Math.round(first.share * 100)}% of the blend, while ${second.name} ${pick(['adds', 'contributes', 'supplies'], seed, 2)} ${sAccord ? word(sAccord.name.toLowerCase()) : 'its own character'}.`
    )
  }

  // Drydown: base notes, with the first-sprayed fragrance as the base layer.
  const bases = uniq(mix.flatMap((m) => m.item.notes.filter((n) => n.layer === 'base' || n.layer === 'general').map((n) => n.name))).slice(0, 3)
  if (bases.length > 0 && sentences.length < 4) {
    sentences.push(`In the drydown, ${list(bases.map((b) => b.toLowerCase()))} settle in, with ${mix[0].item.name} as the base layer.`)
  }
  return sentences.join(' ')
}
