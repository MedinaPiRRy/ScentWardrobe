/** Display colours for accords, roughly following Fragrantica's palette. Unknown accords get a stable hashed colour. */
export const ACCORD_COLORS: Record<string, string> = {
  citrus: '#f9ff52',
  fresh: '#8fe3d0',
  'fresh spicy': '#83c928',
  aromatic: '#4fa38a',
  aquatic: '#4a9fd8',
  woody: '#774414',
  amber: '#bc4d10',
  musky: '#d8c8d8',
  fruity: '#fc5a1b',
  smoky: '#6b6b6b',
  sweet: '#d95f8f',
  vanilla: '#f3dda0',
  coffee: '#5b3a29',
  'warm spicy': '#b5452a',
  'white floral': '#f3eef0',
  'yellow floral': '#f5d36c',
  floral: '#e58fb5',
  powdery: '#e9d3d9',
  tobacco: '#7a4a1e',
  leather: '#4b3126',
  earthy: '#6d5a3c',
  boozy: '#a8431f',
  rose: '#e83b6a',
  iris: '#b7a6d8',
  lavender: '#a78bd4',
  herbal: '#3d9a4f',
  green: '#4caf50',
  balsamic: '#a2672c',
  ozonic: '#a6dcef',
  marine: '#3d8fc6',
  animalic: '#8a5a44',
  salty: '#c9d6df',
  mossy: '#5c7a3a',
  mineral: '#9aa5ab',
  metallic: '#b4bcc4',
  aldehydic: '#e6edf2',
  honey: '#e2a72e',
  caramel: '#c5812b',
  chocolate: '#5a3320',
  cacao: '#5a3320',
  cinnamon: '#a5502a',
  nutty: '#a8794a',
  coconut: '#f1ead9',
  cherry: '#b81f3a',
  almond: '#d8b48a',
  rum: '#7b3a1a',
  tropical: '#f59e2c',
  soapy: '#cde8f4',
  terpenic: '#5f8f5a',
  rubber: '#3b3b3b',
  savory: '#9c6b3a',
  camphor: '#d7efe9',
  patchouli: '#6a4a2a',
  oud: '#4a2e1c',
  sour: '#c6d93a',
  conifer: '#2f6b44',
  whiskey: '#9a5a1e',
  paint: '#c9c9c9',
  wine: '#7a1f3d',
  beeswax: '#e8c15a',
  anis: '#b9b36a',
  tuberose: '#f0e3d0',
  sand: '#d9c59a',
  violet: '#8a5fb0',
  vodka: '#dfe9ee',
  champagne: '#efdc9a',
  lactonic: '#f3e9d8',
  cedar: '#8b5a2b',
  incense: '#9a7b5a',
  spicy: '#c9553a'
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function accordColor(name: string): string {
  const known = ACCORD_COLORS[name.trim().toLowerCase()]
  if (known) return known
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return hslToHex(h % 360, 0.45, 0.55)
}
