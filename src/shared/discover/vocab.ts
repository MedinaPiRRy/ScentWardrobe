/** Shared words for Discovery: name normalisation and the accord families the sliders and filters talk about. */

export const norm = (s: string): string => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export const SEASONS = ['winter', 'spring', 'summer', 'fall'] as const
export type Season = (typeof SEASONS)[number]

/** Accord families. Authored by hand; used for "less sweet", "fresher" and for describing a taste in words. */
export const FAMILIES: Record<string, string[]> = {
  sweet: ['sweet', 'vanilla', 'caramel', 'honey', 'chocolate', 'cacao', 'coconut', 'praline', 'cotton candy', 'marshmallow'],
  fresh: ['fresh', 'citrus', 'aquatic', 'green', 'ozonic', 'marine', 'herbal', 'aromatic', 'salty', 'fresh spicy', 'soapy'],
  warm: ['amber', 'vanilla', 'warm spicy', 'balsamic', 'tobacco', 'leather', 'oud', 'smoky', 'boozy', 'coffee'],
  woody: ['woody', 'earthy', 'mossy', 'oud', 'cedar'],
  floral: ['floral', 'white floral', 'yellow floral', 'rose', 'iris', 'lavender', 'powdery', 'violet', 'tuberose'],
  gourmand: ['sweet', 'vanilla', 'caramel', 'honey', 'chocolate', 'coffee', 'almond', 'nutty', 'boozy', 'rum'],
  unusual: ['oud', 'animalic', 'leather', 'smoky', 'mineral', 'metallic', 'rubber', 'earthy', 'tobacco', 'aldehydic']
}

export const inFamily = (family: keyof typeof FAMILIES, accord: string): boolean => FAMILIES[family].includes(norm(accord))

export type Layer = 'top' | 'heart' | 'base' | 'general'
export const LAYER_CODE: Record<Layer, number> = { general: 0, top: 1, heart: 2, base: 3 }
export const LAYER_FROM_CODE: Layer[] = ['general', 'top', 'heart', 'base']

/** Words for the community 1-5 longevity average. */
export function longevityWords(avg: number): string {
  return avg >= 4.2 ? 'very long lasting' : avg >= 3.6 ? 'long lasting' : avg >= 3 ? 'moderate' : avg >= 2.3 ? 'fairly short' : 'short lived'
}

/** Words for the community 1-4 sillage average. */
export function sillageWords(avg: number): string {
  return avg >= 3.3 ? 'fills a room' : avg >= 2.6 ? 'strong projection' : avg >= 2 ? 'moderate projection' : 'stays close to the skin'
}

export const plural = (n: number, one: string, many = `${one}s`): string => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
