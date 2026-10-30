import { describe, expect, it } from 'vitest'
import type { MoveRequest, WardrobeKind } from '@shared/types'
import { searchLocal } from '../data/catalog'
import { addBottle, createFragrance, deleteFragrance, setImpression, setRating } from './editing'
import { buildCollectionCsv } from './exportCsv'
import { openDatabase } from './index'
import { layerCandidates } from './layering'
import { moveToWardrobe, removeFromWardrobe, reorderWardrobe, setWardrobeDetails, wardrobesOf } from './memberships'
import { recommendCandidates } from './recommend'
import { getFragrance, listFragrances, listPastBottles } from './repo'
import { computeOverview } from './stats'
import { logWear } from './wears'

function setup() {
  const db = openDatabase(':memory:')
  /** A fragrance in one starting wardrobe. */
  const mk = (name: string, to: WardrobeKind = 'collection') => {
    const placement = to === 'collection' ? { to, bottle: { type: 'full bottle' as const, sizeMl: 100 } } : to === 'wishlist' ? { to, impression: 'warm and sweet' } : { to }
    const r = createFragrance(db, { name, house: 'H', notes: [{ name: 'cedar', layer: 'base' as const }], accords: [{ name: 'woody', strength: 80 }] }, placement)
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  const add = (id: number, to: WardrobeKind, extra: Partial<MoveRequest> = {}) => moveToWardrobe(db, { fragranceId: id, to, ...extra })
  return { db, mk, add }
}
const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return (r as unknown as { data: T }).data
}

describe('adding a wardrobe next to the ones a fragrance is in', () => {
  it.each<[WardrobeKind, WardrobeKind, Partial<MoveRequest>]>([
    ['collection', 'wishlist', { impression: 'creamy' }],
    ['collection', 'to_try', {}],
    ['collection', 'had', {}],
    ['wishlist', 'collection', { bottle: { type: 'decant', sizeMl: 10 } }],
    ['wishlist', 'to_try', {}],
    ['wishlist', 'had', {}],
    ['to_try', 'wishlist', { impression: 'smoky' }],
    ['to_try', 'collection', { bottle: { type: 'sample', sizeMl: 2 } }],
    ['to_try', 'had', {}],
    ['had', 'collection', { bottle: { type: 'full bottle', sizeMl: 50 } }],
    ['had', 'wishlist', { impression: 'I miss it' }],
    ['had', 'to_try', {}]
  ])('%s + %s: both memberships, one fragrance', (first, second, extra) => {
    const { db, mk, add } = setup()
    const id = mk('Twice', first)
    const s = ok<{ wardrobes: WardrobeKind[]; wardrobe: WardrobeKind }>(add(id, second, extra))
    expect(new Set(s.wardrobes)).toEqual(new Set([first, second]))
    expect(wardrobesOf(db, id)).toHaveLength(2)
    expect(listFragrances(db).filter((f) => f.name === 'Twice')).toHaveLength(1)
    // listing a wardrobe finds it in each
    expect(listFragrances(db, { wardrobe: first }).map((f) => f.id)).toContain(id)
    expect(listFragrances(db, { wardrobe: second }).map((f) => f.id)).toContain(id)
  })

  it('the main wardrobe is Collection first, then Wishlist, To Try, Had', () => {
    const { mk, add } = setup()
    const id = mk('Many', 'had')
    expect(ok<{ wardrobe: WardrobeKind }>(add(id, 'to_try')).wardrobe).toBe('to_try')
    expect(ok<{ wardrobe: WardrobeKind }>(add(id, 'wishlist', { impression: 'x' })).wardrobe).toBe('wishlist')
    const s = ok<{ wardrobe: WardrobeKind; wardrobes: WardrobeKind[] }>(add(id, 'collection', { bottle: { type: 'decant', sizeMl: 5 } }))
    expect(s.wardrobe).toBe('collection')
    expect(s.wardrobes).toEqual(['collection', 'wishlist', 'to_try', 'had'])
  })

  it('adding the same wardrobe again changes nothing and creates no duplicate', () => {
    const { db, mk, add } = setup()
    const id = mk('Same', 'to_try')
    ok(add(id, 'to_try'))
    expect(wardrobesOf(db, id)).toEqual(['to_try'])
  })

  it('keeps notes, wears and bottles, and the vial of a wanted fragrance shows on both', () => {
    const { db, mk, add } = setup()
    const id = mk('Wanted', 'wishlist')
    ok(addBottle(db, id, { type: 'sample', sizeMl: 2 }) as never)
    ok(logWear(db, { fragranceId: id, wornAt: '2026-10-01 09:00', sprays: 3 }) as never)
    ok(add(id, 'collection'))
    const d = getFragrance(db, id)!
    expect(d.wardrobes).toEqual(['collection', 'wishlist'])
    expect(d.bottles).toHaveLength(1)
    expect(d.wearCount).toBe(1)
    expect(d.impression).toBe('warm and sweet')
  })
})

describe('rules per membership', () => {
  it('the wishlist note applies to the wishlist membership, even when it is also in Collection', () => {
    const { db, mk, add } = setup()
    const id = mk('NoNote') // collection, no impression
    const r = add(id, 'wishlist')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.code).toBe('WISHLIST_IMPRESSION_REQUIRED')
    expect(wardrobesOf(db, id)).toEqual(['collection'])
    ok(add(id, 'wishlist', { impression: 'now I know' }))
    // the note cannot be blanked while the wishlist membership exists...
    expect(setImpression(db, id, '').ok).toBe(false)
    // ...and can once it is removed
    ok(removeFromWardrobe(db, id, 'wishlist'))
    expect(setImpression(db, id, '').ok).toBe(true)
  })

  it('the importer exemption belongs to the wishlist membership only and ends when a note is written', () => {
    const { db, mk } = setup()
    const id = mk('Imported')
    db.prepare("INSERT INTO wardrobe_memberships (fragrance_id, wardrobe, imported) VALUES (?, 'wishlist', 1)").run(id)
    let d = getFragrance(db, id)!
    expect(d.importedPending).toBe(true)
    expect(d.memberships.find((m) => m.wardrobe === 'collection')!.importedPending).toBe(false)
    setImpression(db, id, 'written at last')
    d = getFragrance(db, id)!
    expect(d.importedPending).toBe(false)
    expect(db.prepare("SELECT imported FROM wardrobe_memberships WHERE fragrance_id = ? AND wardrobe = 'wishlist'").get(id)).toEqual({ imported: 0 })
    // the database refuses blanking it now
    expect(setImpression(db, id, '').ok).toBe(false)
  })

  it('a collection membership still needs a bottle', () => {
    const { mk, add } = setup()
    const id = mk('Bottleless', 'wishlist')
    const r = add(id, 'collection')
    expect(!r.ok && r.code).toBe('BOTTLE_REQUIRED')
  })

  it('there is one rating, whichever wardrobes it is in', () => {
    const { db, mk, add } = setup()
    const id = mk('Rated')
    ok(add(id, 'to_try'))
    ok(setRating(db, id, 8) as never)
    const d = getFragrance(db, id)!
    expect(d.rating).toBe(8)
    expect(d.memberships).toHaveLength(2)
    expect(listFragrances(db, { wardrobe: 'to_try' })[0].rating).toBe(8)
    expect(listFragrances(db, { wardrobe: 'collection' })[0].rating).toBe(8)
  })

  it('shelf positions are separate per wardrobe', () => {
    const { db, mk, add } = setup()
    const a = mk('A')
    const b = mk('B')
    ok(add(a, 'to_try'))
    ok(add(b, 'to_try'))
    ok(reorderWardrobe(db, 'to_try', [b, a]) as never)
    expect(listFragrances(db, { wardrobe: 'to_try' }).map((f) => f.name)).toEqual(['B', 'A'])
    expect(listFragrances(db, { wardrobe: 'collection' }).map((f) => f.name)).toEqual(['A', 'B'])
  })

  it('Had details and the dislike note belong to their own membership', () => {
    const { db, mk, add } = setup()
    const id = mk('Keepsake')
    ok(add(id, 'had', { had: { years: '2018', memory: 'summer', reason: 'finished' } }))
    const d = getFragrance(db, id)!
    expect(d.memberships.find((m) => m.wardrobe === 'had')).toMatchObject({ hadYears: '2018', hadMemory: 'summer', hadReason: 'finished' })
    expect(d.memberships.find((m) => m.wardrobe === 'collection')).toMatchObject({ hadYears: null, hadMemory: null })
    expect(setWardrobeDetails(db, id, { dislikeNote: 'x' }).ok).toBe(false) // not in Garbage
    ok(setWardrobeDetails(db, id, { had: { years: '2018-2020' } }) as never)
    expect(getFragrance(db, id)!.memberships.find((m) => m.wardrobe === 'had')!.hadYears).toBe('2018-2020')
  })
})

describe('Garbage Perfumes is exclusive', () => {
  it('refuses to join Garbage while in another wardrobe until confirmed, then keeps the fragrance, bottles and wears', () => {
    const { db, mk, add } = setup()
    const id = mk('Binned')
    ok(add(id, 'to_try'))
    ok(logWear(db, { fragranceId: id, wornAt: '2026-10-01 09:00', sprays: 3 }) as never)
    const refused = add(id, 'garbage')
    expect(!refused.ok && refused.code).toBe('GARBAGE_CONFLICT')
    expect(!refused.ok && refused.message).toMatch(/My Collection, To Try/)
    expect(wardrobesOf(db, id)).toEqual(['collection', 'to_try'])
    const s = ok<{ wardrobes: WardrobeKind[] }>(add(id, 'garbage', { confirmExclusive: true, dislikeNote: 'headache' }))
    expect(s.wardrobes).toEqual(['garbage'])
    const d = getFragrance(db, id)!
    expect(d.bottles).toHaveLength(1)
    expect(d.wearCount).toBe(1)
    expect(d.dislikeNote).toBe('headache')
  })

  it('refuses to leave the bin for another wardrobe until confirmed, and remembers why it was disliked', () => {
    const { db, mk, add } = setup()
    const id = mk('Rescued', 'to_try')
    ok(add(id, 'garbage', { confirmExclusive: true, dislikeNote: 'too sweet' }))
    const refused = add(id, 'wishlist', { impression: 'maybe I was wrong' })
    expect(!refused.ok && refused.code).toBe('GARBAGE_CONFLICT')
    expect(wardrobesOf(db, id)).toEqual(['garbage'])
    ok(add(id, 'wishlist', { impression: 'maybe I was wrong', confirmExclusive: true }))
    expect(wardrobesOf(db, id)).toEqual(['wishlist'])
    // back in the bin it recalls the old reason
    ok(add(id, 'garbage', { confirmExclusive: true }))
    expect(getFragrance(db, id)!.dislikeNote).toBe('too sweet')
  })

  it('a move into Garbage needs no confirmation for the wardrobe it leaves, only for others', () => {
    const { db, mk, add } = setup()
    const id = mk('OnlyOne')
    ok(moveToWardrobe(db, { fragranceId: id, from: 'collection', to: 'garbage' }))
    expect(wardrobesOf(db, id)).toEqual(['garbage'])
    const two = mk('Two')
    ok(add(two, 'to_try'))
    const r = moveToWardrobe(db, { fragranceId: two, from: 'to_try', to: 'garbage' })
    expect(!r.ok && r.code).toBe('GARBAGE_CONFLICT') // still in Collection
    expect(wardrobesOf(db, two)).toEqual(['collection', 'to_try'])
  })

  it('is excluded from stats, recommendations and layering like before', () => {
    const { db, mk } = setup()
    mk('Keeper')
    const bin = mk('Bin')
    ok(moveToWardrobe(db, { fragranceId: bin, from: 'collection', to: 'garbage' }))
    expect(layerCandidates(db).map((c) => c.name)).toEqual(['Keeper'])
    expect(recommendCandidates(db).map((c) => c.name)).toEqual(['Keeper'])
    expect(computeOverview(db).totals.collectionCount).toBe(1)
  })
})

describe('removing and moving', () => {
  it('removing one membership leaves the others and all history; the last one cannot be removed', () => {
    const { db, mk, add } = setup()
    const id = mk('Both')
    ok(add(id, 'to_try'))
    const s = ok<{ wardrobes: WardrobeKind[] }>(removeFromWardrobe(db, id, 'to_try'))
    expect(s.wardrobes).toEqual(['collection'])
    const last = removeFromWardrobe(db, id, 'collection')
    expect(!last.ok && last.code).toBe('INVALID')
    expect(removeFromWardrobe(db, id, 'had').ok).toBe(false)
    expect(getFragrance(db, id)!.bottles).toHaveLength(1)
  })

  it('a move is add + remove in one step, and a failed move changes nothing', () => {
    const { db, mk } = setup()
    const id = mk('Mover')
    const bad = moveToWardrobe(db, { fragranceId: id, from: 'collection', to: 'wishlist' }) // no note
    expect(bad.ok).toBe(false)
    expect(wardrobesOf(db, id)).toEqual(['collection'])
    ok(moveToWardrobe(db, { fragranceId: id, from: 'collection', to: 'wishlist', impression: 'sweet' }))
    expect(wardrobesOf(db, id)).toEqual(['wishlist'])
    expect(moveToWardrobe(db, { fragranceId: id, from: 'had', to: 'to_try' }).ok).toBe(false)
  })

  it('moving from Had to Collection still turns the Had details into a previous bottle', () => {
    const { db, mk } = setup()
    const id = mk('Rebuy', 'had')
    ok(setWardrobeDetails(db, id, { had: { years: '2015-2018', memory: 'first love', reason: 'finished' } }) as never)
    ok(moveToWardrobe(db, { fragranceId: id, from: 'had', to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } }))
    const d = getFragrance(db, id)!
    expect(d.wardrobes).toEqual(['collection'])
    expect(listPastBottles(db, id)).toMatchObject([{ years: '2015-2018', memory: 'first love', reason: 'finished' }])
  })

  it('adding Collection while it stays in Had keeps the Had details where they are', () => {
    const { db, mk, add } = setup()
    const id = mk('Both', 'had')
    ok(setWardrobeDetails(db, id, { had: { years: '2015' } }) as never)
    ok(add(id, 'collection', { bottle: { type: 'full bottle', sizeMl: 100 } }))
    const d = getFragrance(db, id)!
    expect(d.wardrobes).toEqual(['collection', 'had'])
    expect(d.memberships.find((m) => m.wardrobe === 'had')!.hadYears).toBe('2015')
    expect(listPastBottles(db, id)).toEqual([])
  })

  it('deleting a fragrance removes all its memberships', () => {
    const { db, mk, add } = setup()
    const id = mk('Gone')
    ok(add(id, 'to_try'))
    ok(deleteFragrance(db, id) as never)
    expect((db.prepare('SELECT count(*) AS c FROM wardrobe_memberships').get() as { c: number }).c).toBe(0)
  })

  it('adding any membership to a "not mine" fragrance clears the mark', async () => {
    const { db, add } = setup()
    const { addForeignFragrance } = await import('./editing')
    const f = addForeignFragrance(db, { name: 'Borrowed', house: 'H', notes: [], accords: [] })
    if (!f.ok) throw new Error(f.message)
    expect(f.data.isForeign).toBe(true)
    ok(add(f.data.id, 'to_try'))
    expect(getFragrance(db, f.data.id)).toMatchObject({ isForeign: false, wardrobes: ['to_try'] })
  })
})

describe('what counts as owned', () => {
  it('a fragrance counts in stats, recommendations and layering through its Collection membership, even when it is also wanted', () => {
    const { db, mk, add } = setup()
    const id = mk('Decanted', 'wishlist')
    expect(layerCandidates(db)).toEqual([])
    ok(add(id, 'collection', { bottle: { type: 'decant', sizeMl: 10 } })) // owns a decant, still wants the bottle
    expect(layerCandidates(db).map((c) => c.name)).toEqual(['Decanted'])
    expect(recommendCandidates(db).map((c) => c.name)).toEqual(['Decanted'])
    expect(computeOverview(db).totals).toMatchObject({ collectionCount: 1, mlOwned: 10 })
    expect(getFragrance(db, id)!.wardrobes).toEqual(['collection', 'wishlist'])
  })

  it('having a vial of a fragrance that is only wanted does not count as collection', () => {
    const { db, mk } = setup()
    const id = mk('JustVial', 'wishlist')
    ok(addBottle(db, id, { type: 'sample', sizeMl: 2 }) as never)
    expect(computeOverview(db).totals).toMatchObject({ collectionCount: 0, mlOwned: 0 })
    expect(layerCandidates(db)).toEqual([])
  })

  it('a fragrance in Had and Wishlist but not Collection is not counted', () => {
    const { db, mk, add } = setup()
    const id = mk('Past', 'had')
    ok(add(id, 'wishlist', { impression: 'want it again' }))
    expect(computeOverview(db).totals.collectionCount).toBe(0)
    expect(recommendCandidates(db)).toEqual([])
  })
})

describe('export and search', () => {
  it('the CSV has one row per fragrance listing all its wardrobes', () => {
    const { db, mk, add } = setup()
    const id = mk('Multi')
    ok(add(id, 'wishlist', { impression: 'creamy' }))
    ok(add(id, 'had', { had: { years: '2010', memory: 'old', reason: 'sold' } }))
    mk('Single', 'to_try')
    const { csv, rows } = buildCollectionCsv(db)
    expect(rows).toBe(2)
    const lines = csv.split('\r\n').filter(Boolean)
    expect(lines[0]).toMatch(/^Wardrobes,Name,/)
    const multi = lines.find((l) => l.includes(',Multi,'))!
    expect(multi.startsWith('My Collection; Wishlist; Had,Multi,')).toBe(true)
    expect(multi).toContain('2010')
    expect(lines.filter((l) => l.includes(',Multi,'))).toHaveLength(1)
    expect(buildCollectionCsv(db, 'collection').rows).toBe(1)
  })

  it('search lists a fragrance once with all its wardrobes', () => {
    const { db, mk, add } = setup()
    const id = mk('Searchable')
    ok(add(id, 'to_try'))
    const hits = searchLocal(db, 'searchable').filter((h) => h.source === 'mine')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ wardrobe: 'collection', wardrobes: ['collection', 'to_try'] })
  })
})
