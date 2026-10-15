import Database from 'better-sqlite3'
import { accordColor } from '@shared/accordColors'
import { runMigrations } from './migrations'

export type Db = Database.Database

/** Opens (and migrates) a database. Pass ':memory:' in tests. */
export function openDatabase(file: string): Db {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  repairAccordColors(db)
  return db
}

/** Accords created before they had real colours are still the grey placeholder; give them their proper colour. */
export function repairAccordColors(db: Db): void {
  const grey = db.prepare("SELECT id, name FROM accords WHERE color = '#888888'").all() as { id: number; name: string }[]
  const set = db.prepare('UPDATE accords SET color = ? WHERE id = ?')
  for (const a of grey) set.run(accordColor(a.name), a.id)
}
