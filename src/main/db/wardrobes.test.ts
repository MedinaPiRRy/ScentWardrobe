import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { WardrobeKind } from '@shared/types'
import { layerCandidates } from './layering'
import { createFragrance, setImpression, addJournal, setRating } from './editing'
import { buildCollectionCsv } from './exportCsv'
import { openDatabase } from './index'
import { migrations, runMigrations } from './migrations'
import { recommendCandidates } from './recommend'
import { applyMove, getFragrance, listFragrances, listPastBottles, moveToWardrobe, setWardrobeDetails } from './repo'
import { searchLocal } from './../data/catalog'
import { computeOverview } from './stats'
import { logWear } from './wears'

const ALL: WardrobeKind[] = ['collection', 'wishlist', 'to_try', 'had', 'garbage']

function setup() {
  const db = openDatabase(':memory:')
  const mk = (name: string, to: WardrobeKind = 'collection') => {
    const r = createFragrance(
      db,
      { name, house: 'H', notes: [{ name: 'Cedar', layer: 'base' }], accords: [{ name: 'woody', strength: 100 }] },
      to === 'collection' ? { to, bottle: { type: 'full bottle', sizeMl: 100 } } : to === 'wishlist' ? { to, impression: 'nice' } : { to }
    )
    if (!r.ok) throw new Error(r.message)
    return r.data.id
  }
  return { db, mk }
}
const move = (db: ReturnType<typeof openDatabase>, id: number, to: WardrobeKind, extra: object = {}) => moveToWardrobe(db, { fragranceId: id, to, ...extra })

describe('migration 5 (five wardrobes)', () => {
  it('rebuilds the table, keeps existing rows and keeps the wishlist rule', () => {
    const old = new Database(':memory:')
    old.pragma('foreign_keys = ON')
    runMigrations(old, migrations.filter((m) => m.version <= 4))
    old.exec(`
      INSERT INTO fragrances (id, name, house) VALUES (1, 'A', 'H'), (2, 'B', 'H'), (3, 'C', 'H');
      INSERT INTO smell_impression (fragrance_id, text) VALUES (2, 'sweet');
      INSERT INTO wardrobe_items (fragrance_id, wardrobe, shelf_position, rating, desired_size_ml) VALUES (1, 'collection', 4, 8, NULL), (2, 'wishlist', 0, NULL, 50), (3, 'to_try', 1, NULL, NULL);
    `)
    // the old CHECK refused the new values
    expect(() => old.prepare("INSERT INTO fragrances (id, name, house) VALUES (4, 'D', 'H')").run()).not.toThrow()
    expect(() => old.prepare("INSERT INTO wardrobe_items (fragrance_id, wardrobe) VALUES (4, 'garbage')").run()).toThrow()

    runMigrations(old)
    expect(old.pragma('user_version', { simple: true })).toBe(migrations[migrations.length - 1].version)
    expect(old.prepare('SELECT fragrance_id, wardrobe, shelf_position, rating, desired_size_ml, imported FROM wardrobe_items ORDER BY fragrance_id').all()).toEqual([
      { fragrance_id: 1, wardrobe: 'collection', shelf_position: 4, rating: 8, desired_size_ml: null, imported: 0 },
      { fragrance_id: 2, wardrobe: 'wishlist', shelf_position: 0, rating: null, desired_size_ml: 50, imported: 0 },
      { fragrance_id: 3, wardrobe: 'to_try', shelf_position: 1, rating: null, desired_size_ml: null, imported: 0 }
    ])
    old.prepare("INSERT INTO wardrobe_items (fragrance_id, wardrobe) VALUES (4, 'garbage')").run()
    old.prepare("UPDATE wardrobe_items SET wardrobe = 'had' WHERE fragrance_id = 4").run()
    expect(() => old.prepare("UPDATE wardrobe_items SET wardrobe = 'nonsense' WHERE fragrance_id = 4").run()).toThrow()

    // triggers were recreated and still enforce the rule
    expect(() => old.prepare("UPDATE wardrobe_items SET wardrobe = 'wishlist' WHERE fragrance_id = 3").run()).toThrow(/WISHLIST_IMPRESSION_REQUIRED/)
    expect(() => old.prepare("UPDATE smell_impression SET text = '' WHERE fragrance_id = 2").run()).toThrow(/WISHLIST_IMPRESSION_REQUIRED/)
    expect(() => old.prepare('DELETE FROM smell_impression WHERE fragrance_id = 2').run()).toThrow(/WISHLIST_IMPRESSION_REQUIRED/)
    expect(old.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((r) => (r as { name: string }).name)).toEqual(
      expect.arrayContaining(['wishlist_needs_impression_insert', 'wishlist_needs_impression_update', 'impression_cannot_be_blanked', 'impression_cannot_be_deleted'])
    )
    old.close()
  })

  it('does not break foreign keys or cascade deletes', () => {
    const { db, mk } = setup()
    const id = mk('A')
    expect(db.pragma('foreign_key_check')).toEqual([])
    db.prepare('DELETE FROM wardrobe_items WHERE fragrance_id = ?').run(id)
    db.prepare('DELETE FROM fragrances WHERE id = ?').run(id)
    expect(db.prepare('SELECT count(*) AS c FROM bottles').get()).toEqual({ c: 0 })
  })
})

describe('moving between five wardrobes', () => {
  it('keeps notes, wears, bottles and journal through every move', () => {
    const { db, mk } = setup()
    const id = mk('A')
    logWear(db, { fragranceId: id, wornAt: '2026-05-01 10:00', sprays: 4 })
    addJournal(db, id, 'remember this')
    setRating(db, id, 7)
    for (const to of ['had', 'garbage', 'to_try', 'wishlist', 'garbage', 'had', 'collection'] as WardrobeKind[]) {
      const r = move(db, id, to, to === 'wishlist' ? { impression: 'sweet' } : {})
      expect(r.ok, to).toBe(true)
      const d = getFragrance(db, id)!
      expect(d.wardrobe).toBe(to)
      expect(d.journal).toHaveLength(1)
      expect(d.performance.wearCount).toBe(1)
      expect(d.bottles).toHaveLength(1)
      expect(d.notes).toHaveLength(1)
    }
    expect(getFragrance(db, id)!.rating).toBe(7)
  })

  it('every wardrobe lists its own members', () => {
    const { db, mk } = setup()
    ALL.forEach((w) => mk(`In ${w}`, w))
    for (const w of ALL) expect(listFragrances(db, { wardrobe: w }).map((f) => f.name)).toEqual([`In ${w}`])
  })

  it('still demands a note for the wishlist and a bottle for the collection', () => {
    const { db, mk } = setup()
    const id = mk('A', 'garbage')
    expect(move(db, id, 'wishlist')).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    const hadItem = mk('B', 'had')
    expect(move(db, hadItem, 'collection')).toMatchObject({ ok: false, code: 'BOTTLE_REQUIRED' })
  })
})

describe('Garbage Perfumes', () => {
  it('stores and edits the dislike note, and remembers it across moves', () => {
    const { db, mk } = setup()
    const id = mk('Awful', 'to_try')
    move(db, id, 'garbage', { dislikeNote: '  smells like a pool  ' })
    expect(getFragrance(db, id)!.dislikeNote).toBe('smells like a pool')
    setWardrobeDetails(db, id, { dislikeNote: 'too aquatic' })
    expect(getFragrance(db, id)!.dislikeNote).toBe('too aquatic')
    move(db, id, 'to_try')
    expect(getFragrance(db, id)!.dislikeNote).toBe('too aquatic') // history kept
    move(db, id, 'garbage')
    expect(getFragrance(db, id)!.dislikeNote).toBe('too aquatic')
    setWardrobeDetails(db, id, { dislikeNote: '' })
    expect(getFragrance(db, id)!.dislikeNote).toBeNull()
  })

  it('stays searchable, with its note, so it is not bought again', () => {
    const { db, mk } = setup()
    const id = mk('Pool Party', 'to_try')
    move(db, id, 'garbage', { dislikeNote: 'chlorine' })
    const hit = searchLocal(db, 'pool party')[0]
    expect(hit).toMatchObject({ source: 'mine', wardrobe: 'garbage', dislikeNote: 'chlorine' })
  })

  it('is excluded from recommendations, the layering lab and collection stats', () => {
    const { db, mk } = setup()
    const keep = mk('Keeper')
    const bin = mk('Binned')
    logWear(db, { fragranceId: keep, wornAt: '2026-05-01 10:00', sprays: 2 })
    logWear(db, { fragranceId: bin, wornAt: '2026-05-02 10:00', sprays: 2, longevityHours: 5, projection: 3 })
    logWear(db, { fragranceId: bin, wornAt: '2026-05-03 10:00', sprays: 2, longevityHours: 5, projection: 3 })
    db.prepare('UPDATE bottles SET price = 100, remaining_ml = 5 WHERE fragrance_id = ?').run(bin)
    db.prepare('UPDATE bottles SET price = 50 WHERE fragrance_id = ?').run(keep)
    move(db, bin, 'garbage')

    expect(layerCandidates(db).map((c) => c.name)).toEqual(['Keeper'])
    expect(recommendCandidates(db).map((c) => c.name)).toEqual(['Keeper'])
    const o = computeOverview(db, new Date(2026, 4, 10))
    expect(o.totals).toMatchObject({ collectionCount: 1, mlOwned: 100, totalSpent: 50 })
    expect(o.mostWorn.map((r) => r.name)).toEqual(['Keeper'])
    expect(o.leaderboards.longevity).toEqual([])
    expect(o.costPerWear.map((c) => c.name)).toEqual(['Keeper'])
    expect(o.lowBottles).toEqual([]) // its nearly-empty bottle does not nag
    expect(o.neglected.map((n) => n.name)).toEqual(['Keeper'])
  })
})

describe('Had', () => {
  it('stores years, memory and why it left, and keeps them when edited', () => {
    const { db, mk } = setup()
    const id = mk('Old Flame')
    move(db, id, 'had', { had: { years: '1998-2003', memory: 'my first date', reason: 'finished' } })
    expect(getFragrance(db, id)).toMatchObject({ wardrobe: 'had', hadYears: '1998-2003', hadMemory: 'my first date', hadReason: 'finished' })
    setWardrobeDetails(db, id, { had: { years: '1998-2004', memory: 'my first date', reason: 'gifted' } })
    expect(getFragrance(db, id)).toMatchObject({ hadYears: '1998-2004', hadReason: 'gifted' })
    expect(setWardrobeDetails(db, id, { had: { reason: 'lost' as never } })).toMatchObject({ ok: false, code: 'INVALID' })
  })

  it('is not part of recommendations or collection stats', () => {
    const { db, mk } = setup()
    mk('Current')
    const gone = mk('Gone')
    move(db, gone, 'had', { had: { years: '2010' } })
    expect(recommendCandidates(db).map((c) => c.name)).toEqual(['Current'])
    expect(computeOverview(db).totals.collectionCount).toBe(1)
  })

  it('a rebuy keeps one entry: the old bottle becomes a "previous bottle" record', () => {
    const { db, mk } = setup()
    const id = mk('Rebuy')
    move(db, id, 'had', { had: { years: '2015-2018', memory: 'summer in Rome', reason: 'finished' } })
    const r = move(db, id, 'collection', { bottle: { type: 'full bottle', sizeMl: 50 } })
    expect(r.ok).toBe(true)
    const d = getFragrance(db, id)!
    expect(d.wardrobe).toBe('collection')
    expect(d.hadYears).toBeNull()
    expect(d.pastBottles).toHaveLength(1)
    expect(d.pastBottles[0]).toMatchObject({ years: '2015-2018', memory: 'summer in Rome', reason: 'finished' })
    expect(listFragrances(db).filter((f) => f.name === 'Rebuy')).toHaveLength(1) // not duplicated
    expect(listPastBottles(db)).toHaveLength(1)
    // a second round trip adds a second record
    move(db, id, 'had', { had: { years: '2020-2022', reason: 'sold' } })
    move(db, id, 'collection', { bottle: { type: 'full bottle', sizeMl: 30 } })
    expect(getFragrance(db, id)!.pastBottles.map((p) => p.years)).toEqual(['2015-2018', '2020-2022'])
  })

  it('does not archive an empty record when nothing was filled in', () => {
    const { db, mk } = setup()
    const id = mk('Plain')
    move(db, id, 'had')
    move(db, id, 'collection', { bottle: { type: 'full bottle', sizeMl: 50 } })
    expect(getFragrance(db, id)!.pastBottles).toEqual([])
  })
})

describe('imported wishlist items', () => {
  it('can skip the note only through the importer path, and are flagged', () => {
    const { db, mk } = setup()
    const id = mk('Wanted', 'to_try')
    expect(move(db, id, 'wishlist')).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    expect(() => applyMove(db, { fragranceId: id, to: 'wishlist' })).toThrow()
    const s = applyMove(db, { fragranceId: id, to: 'wishlist' }, { imported: true })
    expect(s.wardrobe).toBe('wishlist')
    expect(s.importedPending).toBe(true)
  })

  it('stop being "pending" when a note is written, and the rule applies again', () => {
    const { db, mk } = setup()
    const id = mk('Wanted', 'to_try')
    applyMove(db, { fragranceId: id, to: 'wishlist' }, { imported: true })
    setImpression(db, id, 'warm and boozy')
    expect(listFragrances(db).find((f) => f.id === id)!.importedPending).toBe(false)
    // blanking the note is now refused, like for any other wishlist item
    expect(setImpression(db, id, '')).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    expect(db.prepare('SELECT imported FROM wardrobe_items WHERE fragrance_id = ?').get(id)).toEqual({ imported: 0 })
  })

  it('may keep a blank note while imported, and lose the exemption when moved away and back', () => {
    const { db, mk } = setup()
    const id = mk('Wanted', 'to_try')
    applyMove(db, { fragranceId: id, to: 'wishlist' }, { imported: true })
    expect(setImpression(db, id, '')).toMatchObject({ ok: true })
    move(db, id, 'to_try')
    expect(db.prepare('SELECT imported FROM wardrobe_items WHERE fragrance_id = ?').get(id)).toEqual({ imported: 0 })
    expect(move(db, id, 'wishlist')).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
  })

  it('the database itself still refuses an unflagged wishlist item without a note', () => {
    const { db, mk } = setup()
    const id = mk('Wanted', 'to_try')
    expect(() => db.prepare("UPDATE wardrobe_items SET wardrobe = 'wishlist' WHERE fragrance_id = ?").run(id)).toThrow(/WISHLIST_IMPRESSION_REQUIRED/)
    expect(() => db.prepare("UPDATE wardrobe_items SET wardrobe = 'wishlist', imported = 1 WHERE fragrance_id = ?").run(id)).not.toThrow()
  })
})

describe('CSV export of the new wardrobes', () => {
  it('has all five wardrobe labels and the new columns', () => {
    const { db, mk } = setup()
    const g = mk('Bin', 'to_try')
    move(db, g, 'garbage', { dislikeNote: 'too sweet, "sickly"' })
    const h = mk('Keepsake', 'to_try')
    move(db, h, 'had', { had: { years: '1999-2001', memory: 'prom', reason: 'sold' } })
    const { csv } = buildCollectionCsv(db, 'all')
    expect(csv).toContain('Garbage Perfumes')
    expect(csv).toContain('"too sweet, ""sickly"""')
    expect(csv).toMatch(/Had,Keepsake,H,.*1999-2001,prom,sold/)
    expect(csv.split('\r\n')[0]).toContain('Why I dislike it,Years I wore it,Memory,Why it left')
    expect(buildCollectionCsv(db, 'collection').rows).toBe(0)
  })
})

describe('accord colours', () => {
  it('repairs grey placeholder colours, and upgrades them when an accord is reused', async () => {
    const { repairAccordColors } = await import('./index')
    const db = openDatabase(':memory:')
    db.prepare("INSERT INTO accords (name, color) VALUES ('woody', '#888888'), ('mystery accord', '#888888'), ('citrus', '#123456')").run()
    repairAccordColors(db)
    const colours = Object.fromEntries((db.prepare('SELECT name, color FROM accords').all() as { name: string; color: string }[]).map((a) => [a.name, a.color]))
    expect(colours.woody).toBe('#774414')
    expect(colours.citrus).toBe('#123456') // a colour someone chose is left alone
    expect(colours['mystery accord']).toMatch(/^#[0-9a-f]{6}$/)
    expect(colours['mystery accord']).not.toBe('#888888')

    db.prepare("INSERT INTO accords (name, color) VALUES ('amber', '#888888')").run()
    const r = createFragrance(db, { name: 'X', house: 'H', notes: [], accords: [{ name: 'amber', strength: 90 }] }, { to: 'to_try' })
    expect(r.ok).toBe(true)
    expect((db.prepare("SELECT color FROM accords WHERE name = 'amber'").get() as { color: string }).color).toBe('#bc4d10')
  })
})
