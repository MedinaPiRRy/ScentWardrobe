import Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyRestore, AUTO_KEEP, autoBackupDue, autoBackupsToPrune, BackupError, createBackup, dateStamp, discardRestore, listBackupFiles, prepareRestore, timeStamp, type BackupFile } from './backupCore'
import { openDatabase } from './db'
import { createFragrance } from './db/editing'
import { buildCollectionCsv, csvField, toCsv } from './db/exportCsv'
import { logWear } from './db/wears'
import { seedSampleData } from './db/seed'

const dirs: string[] = []
const open: { close(): void }[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'scent-test-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  // Windows cannot delete a database file that is still open.
  for (const d of open.splice(0)) {
    try {
      d.close()
    } catch {
      /* already closed */
    }
  }
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

/** A real file-backed database, because the online backup needs one. */
function liveApp() {
  const root = tmp()
  const paths = { dbPath: join(root, 'scent-wardrobe.db'), imagesDir: join(root, 'images') }
  mkdirSync(paths.imagesDir)
  const db = openDatabase(paths.dbPath)
  open.push(db)
  return { root, paths, db }
}

const addFragrance = (db: ReturnType<typeof openDatabase>, name: string) => {
  const r = createFragrance(db, { name, house: 'H', notes: [{ name: 'Cedar', layer: 'base' }], accords: [{ name: 'woody', strength: 100 }] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 50 } })
  if (!r.ok) throw new Error(r.message)
  return r.data.id
}

describe('backup and restore', () => {
  it('round-trips the database and images through a zip', async () => {
    const a = liveApp()
    const id = addFragrance(a.db, 'Alpha')
    logWear(a.db, { fragranceId: id, wornAt: '2026-05-01 10:00', sprays: 5, backfilled: false })
    writeFileSync(join(a.paths.imagesDir, '0123456789abcdef.png'), 'PNGDATA')
    const zip = join(a.root, 'backups', 'manual.zip')

    const made = await createBackup(a.db, a.paths, zip, { appVersion: '1.2.3' })
    expect(existsSync(zip)).toBe(true)
    expect(existsSync(zip + '.partial')).toBe(false)
    expect(made.manifest).toMatchObject({ format: 'scent-wardrobe-backup', appVersion: '1.2.3', fragrances: 1, images: 1, includesDataset: false })

    // restore into a completely fresh install
    const b = liveApp()
    b.db.close()
    const prepared = await prepareRestore(zip)
    expect(prepared.manifest.fragrances).toBe(1)
    applyRestore(prepared, b.paths)
    const restored = openDatabase(b.paths.dbPath)
    open.push(restored)
    expect(restored.prepare('SELECT name FROM fragrances').all()).toEqual([{ name: 'Alpha' }])
    expect(restored.prepare('SELECT remaining_ml AS r FROM bottles').get()).toEqual({ r: 49.5 })
    expect(restored.prepare('SELECT count(*) AS c FROM wear_log').get()).toEqual({ c: 1 })
    expect(readFileSync(join(b.paths.imagesDir, '0123456789abcdef.png'), 'utf8')).toBe('PNGDATA')
    restored.close()
    expect(existsSync(prepared.dir)).toBe(false) // temp files cleaned up
  })

  it('snapshots a database that is still being written to (WAL mode)', async () => {
    const a = liveApp()
    for (let i = 0; i < 20; i++) addFragrance(a.db, `F${i}`)
    const made = await createBackup(a.db, a.paths, join(a.root, 'b.zip'))
    expect(made.manifest.fragrances).toBe(20)
  })

  it('leaves the dataset out by default and carries the existing one over on restore', async () => {
    const a = liveApp()
    addFragrance(a.db, 'Alpha')
    a.db.prepare("INSERT INTO catalog_fragrances (name, house, data, popularity) VALUES ('Imported', 'X', '{}', 5)").run()
    const lean = await createBackup(a.db, a.paths, join(a.root, 'lean.zip'))
    const full = await createBackup(a.db, a.paths, join(a.root, 'full.zip'), { includeDataset: true })
    expect(lean.manifest.includesDataset).toBe(false)
    expect(lean.bytes).toBeLessThanOrEqual(full.bytes)

    // restoring the lean backup must not drop the dataset that is currently imported
    a.db.close()
    const prepared = await prepareRestore(lean.path)
    const keep = join(a.root, 'before-restore.db')
    require('fs').copyFileSync(a.paths.dbPath, keep) // what the app does: keep a copy of the live db
    applyRestore(prepared, a.paths, keep)
    const restored = openDatabase(a.paths.dbPath)
    open.push(restored)
    expect(restored.prepare('SELECT name FROM catalog_fragrances').all()).toEqual([{ name: 'Imported' }])
    restored.close()
  })

  it('brings an older backup up to the current schema', async () => {
    const a = liveApp()
    addFragrance(a.db, 'Alpha')
    const zip = (await createBackup(a.db, a.paths, join(a.root, 'x.zip'))).path
    // rewrite the zip's db as if made by an old version: drop to schema 1 tables only is complex, so just downgrade the stamp
    const prepared = await prepareRestore(zip)
    const old = new Database(prepared.dbFile)
    old.exec('DROP TABLE past_bottles; DROP TABLE wear_deductions; DROP INDEX ix_catalog_source_url; DROP INDEX ix_wear_log_day; ALTER TABLE fragrances DROP COLUMN default_sprays; ALTER TABLE wear_log DROP COLUMN backfilled; ALTER TABLE bottles DROP COLUMN market_price; ALTER TABLE bottles DROP COLUMN market_checked_on; ALTER TABLE bottles DROP COLUMN market_source; ALTER TABLE fragrances DROP COLUMN is_foreign; ALTER TABLE catalog_fragrances DROP COLUMN source_url; ALTER TABLE catalog_fragrances DROP COLUMN popularity; ALTER TABLE wear_log DROP COLUMN followup_dismissed;')
    old.pragma('user_version = 2')
    old.close()
    a.db.close()
    applyRestore(prepared, a.paths)
    const restored = openDatabase(a.paths.dbPath)
    open.push(restored)
    expect(restored.pragma('user_version', { simple: true })).toBeGreaterThanOrEqual(5)
    expect(() => restored.prepare('SELECT * FROM wear_deductions').all()).not.toThrow()
    restored.close()
  })

  it('rejects things that are not backups, with readable messages', async () => {
    const root = tmp()
    const notZip = join(root, 'x.zip')
    writeFileSync(notZip, 'definitely not a zip')
    await expect(prepareRestore(notZip)).rejects.toThrow(BackupError)
    await expect(prepareRestore(notZip)).rejects.toThrow(/not a valid zip/)

    // a zip that is valid but is something else
    const yazl = (await import('yazl')).default
    const other = join(root, 'other.zip')
    const z = new yazl.ZipFile()
    z.addBuffer(Buffer.from('hello'), 'readme.txt')
    z.end()
    await new Promise<void>((resolve) => z.outputStream.pipe(require('fs').createWriteStream(other)).on('close', resolve))
    await expect(prepareRestore(other)).rejects.toThrow(/not a Scent Wardrobe backup/)
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith('scent-restore-') && existsSync(join(tmpdir(), f, 'readme.txt')))).toEqual([])
  })

  it('refuses a backup from a newer schema', async () => {
    const a = liveApp()
    const zip = (await createBackup(a.db, a.paths, join(a.root, 'n.zip'))).path
    const prepared = await prepareRestore(zip)
    discardRestore(prepared)
    // forge a manifest with a future schema
    const yauzlMod = await import('yauzl')
    expect(yauzlMod).toBeTruthy()
    const forged = join(a.root, 'forged.zip')
    const yazl = (await import('yazl')).default
    const z = new yazl.ZipFile()
    z.addFile(a.paths.dbPath, 'scent-wardrobe.db')
    z.addBuffer(Buffer.from(JSON.stringify({ format: 'scent-wardrobe-backup', version: 1, schemaVersion: 999, appVersion: '9', createdAt: '', fragrances: 0, images: 0, includesDataset: false })), 'manifest.json')
    z.end()
    await new Promise<void>((resolve) => z.outputStream.pipe(require('fs').createWriteStream(forged)).on('close', resolve))
    await expect(prepareRestore(forged)).rejects.toThrow(/newer version/)
  })

  it('flattens image paths from the archive so nothing is written outside the images folder', async () => {
    const a = liveApp()
    const yazl = (await import('yazl')).default
    const nested = join(a.root, 'nested.zip')
    const z = new yazl.ZipFile()
    z.addFile(a.paths.dbPath, 'scent-wardrobe.db')
    z.addBuffer(Buffer.from(JSON.stringify({ format: 'scent-wardrobe-backup', version: 1, schemaVersion: 1, appVersion: '1', createdAt: '', fragrances: 0, images: 0, includesDataset: false })), 'manifest.json')
    z.addBuffer(Buffer.from('x'), 'images/sub/dir/aaaaaaaaaaaaaaaa.png')
    z.addBuffer(Buffer.from('y'), 'somewhere/else.txt')
    z.addBuffer(Buffer.from('z'), 'images/evil.exe')
    z.addBuffer(Buffer.from('z'), 'images/..\..\escape.png')
    z.end()
    await new Promise<void>((resolve) => z.outputStream.pipe(require('fs').createWriteStream(nested)).on('close', resolve))
    const prepared = await prepareRestore(nested)
    expect(readdirSync(prepared.imagesDir)).toEqual(['aaaaaaaaaaaaaaaa.png']) // anything not named like the app's own pictures is dropped
    expect(readdirSync(prepared.dir).filter((f) => !f.endsWith('-wal') && !f.endsWith('-shm')).sort()).toEqual(['images', 'manifest.json', 'scent-wardrobe.db'])
    discardRestore(prepared)
  })
})

describe('restore limits', () => {
  it('refuses an archive with an oversized file or too many entries, before extracting it', async () => {
    const a = liveApp()
    const yazl = (await import('yazl')).default
    const make = async (name: string, entries: [Buffer, string][]) => {
      const file = join(a.root, name)
      const z = new yazl.ZipFile()
      for (const [buf, n] of entries) z.addBuffer(buf, n)
      z.end()
      await new Promise<void>((resolve) => z.outputStream.pipe(require('fs').createWriteStream(file)).on('close', resolve))
      return file
    }
    const manifest = Buffer.from('{}')
    const big = await make('big.zip', [[Buffer.alloc(5000), 'scent-wardrobe.db'], [manifest, 'manifest.json']])
    await expect(prepareRestore(big, { dbBytes: 1000, imageBytes: 1000, manifestBytes: 1000, entries: 10 })).rejects.toThrow(/larger than a backup/)
    const many = await make('many.zip', [[Buffer.from('a'), 'a.txt'], [Buffer.from('b'), 'b.txt'], [Buffer.from('c'), 'c.txt']])
    await expect(prepareRestore(many, { dbBytes: 1000, imageBytes: 1000, manifestBytes: 1000, entries: 2 })).rejects.toThrow(/too many files/)
  })

  it('swaps the database in through a temporary file and leaves nothing behind', async () => {
    const a = liveApp()
    addFragrance(a.db, 'Original')
    const b = liveApp()
    addFragrance(b.db, 'Restored')
    const zip = (await createBackup(b.db, b.paths, join(b.root, 'b.zip'))).path
    const prepared = await prepareRestore(zip)
    a.db.close()
    applyRestore(prepared, a.paths)
    expect(readdirSync(a.root).filter((f) => f.includes('.restoring'))).toEqual([])
    const after = openDatabase(a.paths.dbPath)
    open.push(after)
    expect(after.prepare('SELECT name FROM fragrances').all()).toEqual([{ name: 'Restored' }])
  })
})

describe('automatic backups', () => {
  const day = 86_400_000
  const f = (name: string, daysAgo: number, now = 1_000_000 * day): BackupFile => ({ name, mtimeMs: now - daysAgo * day, bytes: 1 })
  const now = 1_000_000 * day

  it('is due when there is no automatic backup, or the newest is a week old', () => {
    expect(autoBackupDue([], now)).toBe(true)
    expect(autoBackupDue([f('manual.zip', 1)], now)).toBe(true) // manual backups do not count
    expect(autoBackupDue([f('auto-2026-05-01.zip', 3)], now)).toBe(false)
    expect(autoBackupDue([f('auto-2026-05-01.zip', 7)], now)).toBe(true)
    expect(autoBackupDue([f('auto-a.zip', 30), f('auto-b.zip', 2)], now)).toBe(false)
  })

  it('prunes only old automatic backups', () => {
    const files = [
      ...Array.from({ length: AUTO_KEEP + 3 }, (_, i) => f(`auto-${i}.zip`, i)),
      f('manual-keep.zip', 100),
      f('pre-restore-1.zip', 100)
    ]
    const prune = autoBackupsToPrune(files)
    expect(prune).toHaveLength(3)
    expect(prune.every((p) => p.name.startsWith('auto-'))).toBe(true)
    expect(prune.map((p) => p.name)).toEqual(['auto-8.zip', 'auto-9.zip', 'auto-10.zip'])
  })

  it('lists backup files newest first, ignoring other files', () => {
    const dir = tmp()
    writeFileSync(join(dir, 'old.zip'), 'a')
    writeFileSync(join(dir, 'new.zip'), 'b')
    writeFileSync(join(dir, 'notes.txt'), 'c')
    utimesSync(join(dir, 'old.zip'), new Date(2020, 0, 1), new Date(2020, 0, 1))
    expect(listBackupFiles(dir).map((x) => x.name)).toEqual(['new.zip', 'old.zip'])
    expect(listBackupFiles(join(dir, 'missing'))).toEqual([])
  })

  it('formats stamps for file names', () => {
    expect(dateStamp(new Date(2026, 4, 3))).toBe('2026-05-03')
    expect(timeStamp(new Date(2026, 4, 3, 9, 5))).toBe('2026-05-03_0905')
  })
})

describe('CSV export', () => {
  it('escapes fields per RFC 4180', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('two\nlines')).toBe('"two\nlines"')
    expect(csvField(null)).toBe('')
    expect(csvField(0)).toBe('0')
    expect(toCsv([['a', 'b'], [1, 'x,y']])).toBe('a,b\r\n1,"x,y"\r\n')
  })

  it('exports one row per fragrance with stats, notes and my impression', () => {
    const { db } = liveApp()
    const id = addFragrance(db, 'Alpha, the "First"')
    db.prepare("INSERT INTO smell_impression (fragrance_id, text) VALUES (?, 'Dry cedar,\nsmoky')").run(id)
    logWear(db, { fragranceId: id, wornAt: '2026-05-01 10:00', sprays: 4, projection: 3, longevityHours: 6, compliments: 2, backfilled: false })
    const wish = createFragrance(db, { name: 'Wishful', house: 'Z', notes: [], accords: [] }, { to: 'wishlist', impression: 'Sweet' })
    expect(wish.ok).toBe(true)

    const all = buildCollectionCsv(db, 'all')
    expect(all.rows).toBe(2)
    const lines = all.csv.split('\r\n')
    expect(lines[0]).toMatch(/^Wardrobe,Name,House,/)
    expect(all.csv).toContain('"Alpha, the ""First"""')
    expect(all.csv).toContain('"Dry cedar,\nsmoky"')
    expect(all.csv).toContain('Cedar') // base notes column
    expect(all.csv).toMatch(/My Collection,"Alpha, the ""First""",H,,,,,,1,50,49\.6,1,2026-05-01 10:00,,4,3,6,2,woody/)
    expect(all.csv.indexOf('My Collection')).toBeLessThan(all.csv.indexOf('Wishlist'))

    const mine = buildCollectionCsv(db, 'collection')
    expect(mine.rows).toBe(1)
    expect(mine.csv).not.toContain('Wishful')
  })

  it('exports a header-only file for an empty library', () => {
    const { db } = liveApp()
    expect(buildCollectionCsv(db).rows).toBe(0)
    expect(buildCollectionCsv(db).csv.split('\r\n')).toHaveLength(2)
  })

  it('exports the sample library without errors', () => {
    const { db } = liveApp()
    seedSampleData(db)
    expect(buildCollectionCsv(db).rows).toBe(12)
  })
})
