import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { getFragrance, listFragrances } from './repo'
import { migrations, runMigrations } from './migrations'

const latest = migrations[migrations.length - 1].version

/** A small but complete library written with columns that exist from the very first schema onwards. */
function seed(db: Database.Database, start: number): void {
  const memberships = start >= 10
  db.exec(`
    INSERT INTO fragrances (id, name, house, year, concentration) VALUES (1, 'Alpha', 'House A', 2015, 'EDP'), (2, 'Beta', 'House B', NULL, NULL), (3, 'Gamma', 'House C', 2020, 'Parfum');
    INSERT INTO notes (id, name, family) VALUES (1, 'bergamot', 'citrus'), (2, 'vanilla', 'sweet');
    INSERT INTO accords (id, name, color) VALUES (1, 'fresh', '#83c928');
    INSERT INTO fragrance_notes (fragrance_id, note_id, layer) VALUES (1, 1, 'top'), (1, 2, 'base'), (2, 2, 'base');
    INSERT INTO fragrance_accords (fragrance_id, accord_id, strength) VALUES (1, 1, 90);
    INSERT INTO smell_impression (fragrance_id, text) VALUES (2, 'warm and creamy');
    ${memberships ? "INSERT INTO wardrobe_memberships (fragrance_id, wardrobe, shelf_position) VALUES (1, 'collection', 0), (2, 'wishlist', 0), (3, 'to_try', 0); UPDATE fragrances SET rating = 8 WHERE id = 1;" : "INSERT INTO wardrobe_items (fragrance_id, wardrobe, shelf_position, rating) VALUES (1, 'collection', 0, 8), (2, 'wishlist', 0, NULL), (3, 'to_try', 0, NULL);"}
    INSERT INTO bottles (id, fragrance_id, type, size_ml, remaining_ml, price, bought_at) VALUES (1, 1, 'full bottle', 100, 62.5, 89.99, 'Shop');
    INSERT INTO wear_log (id, fragrance_id, bottle_id, worn_at, sprays, projection, longevity_hours, compliments, notes) VALUES (1, 1, 1, '2026-01-05 09:30', 5, 4, 7.5, 2, 'office');
    INSERT INTO layer_combos (id, spray_ratio, my_rating) VALUES (1, '1:1', 9);
    INSERT INTO layer_combo_items (combo_id, fragrance_id, position, spray_weight) VALUES (1, 1, 0, 1), (1, 2, 1, 1);
    INSERT INTO personal_notes (fragrance_id, text) VALUES (1, 'my signature');
    INSERT INTO settings (key, value) VALUES ('ui.theme', 'dark');
  `)
  // An imported dataset row exists from schema 2 on; Discovery (schema 11) must leave it alone.
  if (start >= 2) db.exec("INSERT INTO catalog_fragrances (id, name, house, data) VALUES (1, 'Imported', 'Some House', '{}')")
}

describe.each(migrations.map((m) => m.version))('a database created at schema version %i', (start) => {
  it('upgrades to the current version without losing anything', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    runMigrations(db, migrations.filter((m) => m.version <= start))
    expect(db.pragma('user_version', { simple: true })).toBe(start)
    seed(db, start)

    expect(runMigrations(db)).toBe(latest)
    expect(db.pragma('user_version', { simple: true })).toBe(latest)

    const rows = (sql: string) => db.prepare(sql).all()
    expect(rows('SELECT name FROM fragrances ORDER BY id')).toEqual([{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }])
    expect(rows('SELECT fragrance_id AS id, wardrobe, shelf_position AS pos FROM wardrobe_memberships ORDER BY fragrance_id')).toEqual([
      { id: 1, wardrobe: 'collection', pos: 0 },
      { id: 2, wardrobe: 'wishlist', pos: 0 },
      { id: 3, wardrobe: 'to_try', pos: 0 }
    ])
    // one rating per fragrance now lives on the fragrance
    expect(rows('SELECT id, rating FROM fragrances ORDER BY id')).toEqual([{ id: 1, rating: 8 }, { id: 2, rating: null }, { id: 3, rating: null }])
    expect(rows('SELECT size_ml, remaining_ml, price, bought_at FROM bottles')).toEqual([{ size_ml: 100, remaining_ml: 62.5, price: 89.99, bought_at: 'Shop' }])
    expect(rows('SELECT worn_at, sprays, projection, longevity_hours, compliments, notes FROM wear_log')).toEqual([{ worn_at: '2026-01-05 09:30', sprays: 5, projection: 4, longevity_hours: 7.5, compliments: 2, notes: 'office' }])
    expect((db.prepare('SELECT count(*) AS c FROM layer_combo_items').get() as { c: number }).c).toBe(2)
    expect(rows('SELECT text FROM personal_notes')).toEqual([{ text: 'my signature' }])
    expect(rows("SELECT value FROM settings WHERE key = 'ui.theme'")).toEqual([{ value: 'dark' }])
    expect((db.prepare('SELECT count(*) AS c FROM fragrance_notes').get() as { c: number }).c).toBe(3)

    // Ratings that existed before rating history (schema 9) become its first entries.
    const history = rows('SELECT fragrance_id AS id, rating, source FROM rating_history')
    expect(history).toEqual(start < 9 ? [{ id: 1, rating: 8, source: 'earlier' }] : [])

    // Discovery tables (schema 11) exist, start empty, and the imported dataset row is untouched.
    for (const t of ['catalog_extra', 'discover_features', 'discover_ignored', 'discover_briefs']) expect((db.prepare(`SELECT count(*) AS c FROM ${t}`).get() as { c: number }).c).toBe(0)
    if (start >= 2) expect(rows('SELECT id, name, house FROM catalog_fragrances')).toEqual([{ id: 1, name: 'Imported', house: 'Some House' }])
    if (start >= 2) {
      // extras and features follow their dataset row when it goes away
      db.prepare("INSERT INTO catalog_extra (catalog_id, extra) VALUES (1, '{}')").run()
      db.prepare("INSERT INTO discover_features (catalog_id, house_key, name_key, accords, notes) VALUES (1, 'h', 'n', '', '')").run()
      db.prepare('DELETE FROM catalog_fragrances WHERE id = 1').run()
      expect((db.prepare('SELECT (SELECT count(*) FROM catalog_extra) + (SELECT count(*) FROM discover_features) AS c').get() as { c: number }).c).toBe(0)
    }

    // Structural health.
    expect(db.pragma('foreign_key_check')).toEqual([])
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok')

    // The app's own queries work on the upgraded data.
    expect(listFragrances(db as never).map((f) => f.name)).toEqual(['Alpha', 'Beta', 'Gamma'])
    const alpha = getFragrance(db as never, 1)!
    expect(alpha.bottles[0]).toMatchObject({ sizeMl: 100, remainingMl: 62.5, price: 89.99, marketPrice: null })
    expect(alpha.defaultSprays).toBeNull()
    expect(alpha.isForeign).toBe(false)
    expect(getFragrance(db as never, 2)!.impression).toBe('warm and creamy')

    // The wishlist rule still holds after the upgrade, and cascades still work.
    expect(() => db.prepare("UPDATE wardrobe_memberships SET wardrobe = 'wishlist' WHERE fragrance_id = 3").run()).toThrow(/WISHLIST_IMPRESSION_REQUIRED/)
    db.prepare('DELETE FROM wardrobe_memberships WHERE fragrance_id = 1').run()
    db.prepare('DELETE FROM fragrances WHERE id = 1').run()
    expect((db.prepare('SELECT count(*) AS c FROM bottles').get() as { c: number }).c).toBe(0)
    expect((db.prepare('SELECT count(*) AS c FROM wear_log').get() as { c: number }).c).toBe(0)
    db.close()
  })
})
