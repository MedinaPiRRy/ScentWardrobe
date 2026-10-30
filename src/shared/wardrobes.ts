import type { WardrobeKind } from './types'

/** The order wardrobes are listed in; the first one a fragrance is in is its "main" wardrobe. */
export const WARDROBE_ORDER: WardrobeKind[] = ['collection', 'wishlist', 'to_try', 'had', 'garbage']

export const sortWardrobes = (list: WardrobeKind[]): WardrobeKind[] => [...list].sort((a, b) => WARDROBE_ORDER.indexOf(a) - WARDROBE_ORDER.indexOf(b))

export const primaryWardrobe = (list: WardrobeKind[]): WardrobeKind | null => sortWardrobes(list)[0] ?? null

/** Plain names for messages. */
export const WARDROBE_NAME: Record<WardrobeKind, string> = {
  collection: 'My Collection',
  wishlist: 'Wishlist',
  to_try: 'To Try',
  had: 'Had',
  garbage: 'Garbage Perfumes'
}
