import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  sql: string
}

const WARDROBES = `('collection','wishlist','to_try')`

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE fragrances (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  house TEXT NOT NULL,
  year INTEGER,
  concentration TEXT,
  perfumers TEXT,
  gender TEXT,
  description TEXT,
  image_path TEXT,
  source_url TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX ux_fragrance_identity
  ON fragrances (lower(name), lower(house), coalesce(lower(concentration), ''));

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  family TEXT,
  icon_path TEXT
);

CREATE TABLE fragrance_notes (
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  note_id INTEGER NOT NULL REFERENCES notes(id),
  layer TEXT NOT NULL CHECK (layer IN ('top','heart','base','general')),
  PRIMARY KEY (fragrance_id, note_id, layer)
);
CREATE INDEX ix_fragrance_notes_note ON fragrance_notes (note_id);

CREATE TABLE accords (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#888888'
);

CREATE TABLE fragrance_accords (
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  accord_id INTEGER NOT NULL REFERENCES accords(id),
  strength INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100),
  PRIMARY KEY (fragrance_id, accord_id)
);

CREATE TABLE fragrance_community (
  fragrance_id INTEGER PRIMARY KEY REFERENCES fragrances(id) ON DELETE CASCADE,
  winter INTEGER NOT NULL DEFAULT 0,
  spring INTEGER NOT NULL DEFAULT 0,
  summer INTEGER NOT NULL DEFAULT 0,
  fall INTEGER NOT NULL DEFAULT 0,
  day INTEGER NOT NULL DEFAULT 0,
  night INTEGER NOT NULL DEFAULT 0,
  longevity REAL,
  sillage REAL
);

-- One row per fragrance: a fragrance lives in exactly one wardrobe, and moving it keeps all history.
CREATE TABLE wardrobe_items (
  fragrance_id INTEGER PRIMARY KEY REFERENCES fragrances(id) ON DELETE CASCADE,
  wardrobe TEXT NOT NULL CHECK (wardrobe IN ${WARDROBES}),
  shelf_position INTEGER NOT NULL DEFAULT 0,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  desired_size_ml REAL,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_wardrobe_items_wardrobe ON wardrobe_items (wardrobe, shelf_position);

CREATE TABLE bottles (
  id INTEGER PRIMARY KEY,
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('full bottle','travel/mini','decant','sample')),
  size_ml REAL NOT NULL CHECK (size_ml > 0),
  remaining_ml REAL NOT NULL CHECK (remaining_ml >= 0),
  ml_per_spray REAL NOT NULL DEFAULT 0.1 CHECK (ml_per_spray > 0),
  purchase_date TEXT,
  price REAL,
  bought_at TEXT,
  batch_code TEXT,
  opened_date TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','empty','sold/gifted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_bottles_fragrance ON bottles (fragrance_id);

CREATE TABLE personal_notes (
  id INTEGER PRIMARY KEY,
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_personal_notes_fragrance ON personal_notes (fragrance_id);

CREATE TABLE smell_impression (
  fragrance_id INTEGER PRIMARY KEY REFERENCES fragrances(id) ON DELETE CASCADE,
  text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE layer_combos (
  id INTEGER PRIMARY KEY,
  spray_ratio TEXT,
  predicted_score INTEGER,
  my_rating INTEGER CHECK (my_rating BETWEEN 1 AND 10),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE layer_combo_items (
  combo_id INTEGER NOT NULL REFERENCES layer_combos(id) ON DELETE CASCADE,
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  spray_weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (combo_id, fragrance_id)
);

CREATE TABLE wear_log (
  id INTEGER PRIMARY KEY,
  fragrance_id INTEGER REFERENCES fragrances(id) ON DELETE CASCADE,
  layer_combo_id INTEGER REFERENCES layer_combos(id) ON DELETE CASCADE,
  bottle_id INTEGER REFERENCES bottles(id) ON DELETE SET NULL,
  worn_at TEXT NOT NULL DEFAULT (datetime('now')),
  time_of_day TEXT CHECK (time_of_day IN ('morning','afternoon','evening','night')),
  sprays INTEGER NOT NULL DEFAULT 1,
  activity TEXT,
  temperature_c REAL,
  humidity REAL,
  weather TEXT,
  projection INTEGER CHECK (projection BETWEEN 1 AND 5),
  longevity_hours REAL,
  compliments INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  CHECK (fragrance_id IS NOT NULL OR layer_combo_id IS NOT NULL)
);
CREATE INDEX ix_wear_log_fragrance ON wear_log (fragrance_id, worn_at);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Wishlist rule, enforced in the database as a last line of defence (the API checks it first).
CREATE TRIGGER wishlist_needs_impression_insert
BEFORE INSERT ON wardrobe_items
WHEN NEW.wardrobe = 'wishlist' AND NOT EXISTS (
  SELECT 1 FROM smell_impression WHERE fragrance_id = NEW.fragrance_id AND length(trim(text)) > 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER wishlist_needs_impression_update
BEFORE UPDATE OF wardrobe ON wardrobe_items
WHEN NEW.wardrobe = 'wishlist' AND NOT EXISTS (
  SELECT 1 FROM smell_impression WHERE fragrance_id = NEW.fragrance_id AND length(trim(text)) > 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER impression_cannot_be_blanked
BEFORE UPDATE OF text ON smell_impression
WHEN length(trim(NEW.text)) = 0 AND EXISTS (
  SELECT 1 FROM wardrobe_items WHERE fragrance_id = NEW.fragrance_id AND wardrobe = 'wishlist'
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER impression_cannot_be_deleted
BEFORE DELETE ON smell_impression
WHEN EXISTS (
  SELECT 1 FROM wardrobe_items WHERE fragrance_id = OLD.fragrance_id AND wardrobe = 'wishlist'
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;
`
  }
,
  {
    version: 2,
    name: 'imported dataset catalog',
    sql: `
-- Rows imported from a public dataset. Kept apart from "fragrances" so searching never pollutes the collection.
CREATE TABLE catalog_fragrances (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  house TEXT NOT NULL,
  year INTEGER,
  concentration TEXT,
  data TEXT NOT NULL
);
CREATE INDEX ix_catalog_name ON catalog_fragrances (name);
`
  }
,
  {
    version: 3,
    name: 'catalog popularity',
    sql: `
-- Ranks dataset search results (popular fragrances first among equally good matches).
ALTER TABLE catalog_fragrances ADD COLUMN popularity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE catalog_fragrances ADD COLUMN source_url TEXT;
CREATE INDEX ix_catalog_source_url ON catalog_fragrances (source_url);
`
  }
,
  {
    version: 4,
    name: 'wear deductions and follow-ups',
    sql: `
-- Exactly how much each wear took from which bottle, so editing or deleting a wear restores the right amount.
CREATE TABLE wear_deductions (
  wear_id INTEGER NOT NULL REFERENCES wear_log(id) ON DELETE CASCADE,
  bottle_id INTEGER NOT NULL REFERENCES bottles(id) ON DELETE CASCADE,
  ml REAL NOT NULL,
  PRIMARY KEY (wear_id, bottle_id)
);
-- 1 once the "how long did it last?" prompt was skipped for this wear.
ALTER TABLE wear_log ADD COLUMN followup_dismissed INTEGER NOT NULL DEFAULT 0;
`
  }
,
  {
    version: 5,
    name: 'five wardrobes',
    // SQLite cannot alter a CHECK constraint, so wardrobe_items is rebuilt. Its triggers (and the two on
    // smell_impression that look at it) are dropped first and recreated, now aware of the "imported" flag.
    sql: `
DROP TRIGGER wishlist_needs_impression_insert;
DROP TRIGGER wishlist_needs_impression_update;
DROP TRIGGER impression_cannot_be_blanked;
DROP TRIGGER impression_cannot_be_deleted;

CREATE TABLE wardrobe_items_new (
  fragrance_id INTEGER PRIMARY KEY REFERENCES fragrances(id) ON DELETE CASCADE,
  wardrobe TEXT NOT NULL CHECK (wardrobe IN ('collection','wishlist','to_try','garbage','had')),
  shelf_position INTEGER NOT NULL DEFAULT 0,
  rating INTEGER CHECK (rating BETWEEN 1 AND 10),
  desired_size_ml REAL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- 1 for wishlist items brought in by an importer, which cannot have a smell note yet.
  imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0, 1)),
  -- Garbage Perfumes: why I dislike it.
  dislike_note TEXT,
  -- Had: years I wore it, a memory, and why it left.
  had_years TEXT,
  had_memory TEXT,
  had_reason TEXT CHECK (had_reason IN ('finished','sold','gifted'))
);
INSERT INTO wardrobe_items_new (fragrance_id, wardrobe, shelf_position, rating, desired_size_ml, added_at)
  SELECT fragrance_id, wardrobe, shelf_position, rating, desired_size_ml, added_at FROM wardrobe_items;
DROP TABLE wardrobe_items;
ALTER TABLE wardrobe_items_new RENAME TO wardrobe_items;
CREATE INDEX ix_wardrobe_items_wardrobe ON wardrobe_items (wardrobe, shelf_position);

-- A bottle I owned before and have since bought again: the old bottle's story, kept with the fragrance.
CREATE TABLE past_bottles (
  id INTEGER PRIMARY KEY,
  fragrance_id INTEGER NOT NULL REFERENCES fragrances(id) ON DELETE CASCADE,
  years TEXT,
  memory TEXT,
  reason TEXT CHECK (reason IN ('finished','sold','gifted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_past_bottles_fragrance ON past_bottles (fragrance_id);

CREATE TRIGGER wishlist_needs_impression_insert
BEFORE INSERT ON wardrobe_items
WHEN NEW.wardrobe = 'wishlist' AND NEW.imported = 0 AND NOT EXISTS (
  SELECT 1 FROM smell_impression WHERE fragrance_id = NEW.fragrance_id AND length(trim(text)) > 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER wishlist_needs_impression_update
BEFORE UPDATE OF wardrobe, imported ON wardrobe_items
WHEN NEW.wardrobe = 'wishlist' AND NEW.imported = 0 AND NOT EXISTS (
  SELECT 1 FROM smell_impression WHERE fragrance_id = NEW.fragrance_id AND length(trim(text)) > 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER impression_cannot_be_blanked
BEFORE UPDATE OF text ON smell_impression
WHEN length(trim(NEW.text)) = 0 AND EXISTS (
  SELECT 1 FROM wardrobe_items WHERE fragrance_id = NEW.fragrance_id AND wardrobe = 'wishlist' AND imported = 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;

CREATE TRIGGER impression_cannot_be_deleted
BEFORE DELETE ON smell_impression
WHEN EXISTS (
  SELECT 1 FROM wardrobe_items WHERE fragrance_id = OLD.fragrance_id AND wardrobe = 'wishlist' AND imported = 0
)
BEGIN SELECT RAISE(ABORT, 'WISHLIST_IMPRESSION_REQUIRED'); END;
`
  }
,
  {
    version: 6,
    name: 'default sprays and backfilled wears',
    sql: `
-- How many sprays I usually use of this fragrance. Used as the default in the wear form and for backfilled wears.
ALTER TABLE fragrances ADD COLUMN default_sprays INTEGER CHECK (default_sprays IS NULL OR default_sprays BETWEEN 1 AND 60);
-- 1 for wears entered after the fact (imported, or dated before today). They are diary entries: they never trigger the
-- "How long did it last?" prompt, and they only touch a bottle's level if I explicitly say so.
ALTER TABLE wear_log ADD COLUMN backfilled INTEGER NOT NULL DEFAULT 0 CHECK (backfilled IN (0, 1));
CREATE INDEX ix_wear_log_day ON wear_log (substr(worn_at, 1, 10));
`
  },
  {
    version: 7,
    name: 'market prices',
    sql: `
-- What the bottle costs now, entered by hand, with the day I looked and where. Compared with price (what I paid).
ALTER TABLE bottles ADD COLUMN market_price REAL CHECK (market_price IS NULL OR market_price >= 0);
ALTER TABLE bottles ADD COLUMN market_checked_on TEXT;
ALTER TABLE bottles ADD COLUMN market_source TEXT;
`
  },
  {
    version: 8,
    name: 'foreign fragrances',
    sql: `
-- 1 for a fragrance I wore but do not own (a friend's, a shop tester). It has no wardrobe, and moving it into one clears the flag.
ALTER TABLE fragrances ADD COLUMN is_foreign INTEGER NOT NULL DEFAULT 0 CHECK (is_foreign IN (0, 1));
`
  }
]

export function currentVersion(db: Database.Database): number {
  return (db.pragma('user_version', { simple: true }) as number) ?? 0
}

export function runMigrations(db: Database.Database, list: Migration[] = migrations): number {
  let version = currentVersion(db)
  for (const m of list.filter((x) => x.version > version).sort((a, b) => a.version - b.version)) {
    db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })()
    version = m.version
  }
  return version
}
