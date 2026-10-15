import Database from 'better-sqlite3'
import { copyFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { pipeline } from 'stream/promises'
import yauzl from 'yauzl'
import yazl from 'yazl'
import type { Db } from './db'
import { migrations, runMigrations } from './db/migrations'

export const BACKUP_FORMAT = 'scent-wardrobe-backup'
const DB_ENTRY = 'scent-wardrobe.db'
const MANIFEST_ENTRY = 'manifest.json'
const IMAGE_PREFIX = 'images/'

export interface Manifest {
  format: typeof BACKUP_FORMAT
  version: 1
  appVersion: string
  schemaVersion: number
  createdAt: string
  fragrances: number
  images: number
  includesDataset: boolean
}

export interface BackupPaths {
  dbPath: string
  imagesDir: string
}

export interface BackupResult {
  path: string
  bytes: number
  manifest: Manifest
}

const latestSchema = () => migrations[migrations.length - 1].version
const count = (db: { prepare(sql: string): { get(): unknown } }, sql: string) => (db.prepare(sql).get() as { c: number }).c

/**
 * Writes one .zip with a consistent snapshot of the database plus all cached images. The snapshot uses SQLite's online
 * backup, so it is safe while the app is running. The imported dataset (which can be 150 MB and is re-importable from
 * the original file) is left out unless asked for.
 */
export async function createBackup(db: Db, paths: BackupPaths, destZip: string, opts: { includeDataset?: boolean; appVersion?: string } = {}): Promise<BackupResult> {
  const work = mkdtempSync(join(tmpdir(), 'scent-backup-'))
  const snapshot = join(work, DB_ENTRY)
  try {
    await db.backup(snapshot)
    const copy = new Database(snapshot)
    try {
      if (!opts.includeDataset) {
        copy.prepare('DELETE FROM catalog_fragrances').run()
        copy.exec('VACUUM')
      }
      const manifest: Manifest = {
        format: BACKUP_FORMAT,
        version: 1,
        appVersion: opts.appVersion ?? '0',
        schemaVersion: copy.pragma('user_version', { simple: true }) as number,
        createdAt: new Date().toISOString(),
        fragrances: count(copy, 'SELECT count(*) AS c FROM fragrances'),
        images: 0,
        includesDataset: !!opts.includeDataset
      }
      copy.close()

      const images = existsSync(paths.imagesDir) ? readdirSync(paths.imagesDir).filter((f) => statSync(join(paths.imagesDir, f)).isFile()) : []
      manifest.images = images.length

      const zip = new yazl.ZipFile()
      zip.addFile(snapshot, DB_ENTRY)
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2)), MANIFEST_ENTRY)
      for (const f of images) zip.addFile(join(paths.imagesDir, f), IMAGE_PREFIX + f)
      zip.end()

      mkdirSync(join(destZip, '..'), { recursive: true })
      const partial = `${destZip}.partial`
      await pipeline(zip.outputStream, createWriteStream(partial))
      renameSync(partial, destZip) // a half-written backup never has the real name
      return { path: destZip, bytes: statSync(destZip).size, manifest }
    } finally {
      try {
        copy.close()
      } catch {
        /* already closed */
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---- restore ------------------------------------------------------------------------------------

export class BackupError extends Error {}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: true }, (e, z) => (e || !z ? reject(new BackupError('That file is not a valid zip archive.')) : resolve(z))))
}

export interface PreparedRestore {
  dir: string
  dbFile: string
  imagesDir: string
  manifest: Manifest
}

/** Extracts a backup into a temp folder and checks it. Nothing of the live data is touched yet. */
export async function prepareRestore(zipPath: string): Promise<PreparedRestore> {
  const dir = mkdtempSync(join(tmpdir(), 'scent-restore-'))
  const imagesDir = join(dir, 'images')
  mkdirSync(imagesDir)
  const dbFile = join(dir, DB_ENTRY)
  let manifest: Manifest | null = null
  let gotDb = false

  try {
    const zip = await openZip(zipPath)
    await new Promise<void>((resolve, reject) => {
      zip.on('error', reject)
      zip.on('end', resolve)
      zip.on('entry', (entry: yauzl.Entry) => {
        const name = entry.fileName
        const done = () => zip.readEntry()
        if (name.endsWith('/')) return done()
        const target = name === DB_ENTRY ? dbFile : name === MANIFEST_ENTRY ? join(dir, MANIFEST_ENTRY) : name.startsWith(IMAGE_PREFIX) ? join(imagesDir, basename(name)) : null // never trust paths from an archive
        if (!target) return done()
        zip.openReadStream(entry, (err, stream) => {
          if (err || !stream) return reject(err ?? new Error('Cannot read the archive.'))
          pipeline(stream, createWriteStream(target)).then(() => {
            if (name === DB_ENTRY) gotDb = true
            done()
          }, reject)
        })
      })
      zip.readEntry()
    })

    const manifestFile = join(dir, MANIFEST_ENTRY)
    if (!gotDb || !existsSync(manifestFile)) throw new BackupError('This zip is not a Scent Wardrobe backup.')
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as Manifest
    if (manifest.format !== BACKUP_FORMAT) throw new BackupError('This zip is not a Scent Wardrobe backup.')
    if (manifest.schemaVersion > latestSchema()) throw new BackupError('This backup was made by a newer version of Scent Wardrobe. Update the app first.')

    const check = new Database(dbFile, { readonly: true })
    try {
      const result = check.pragma('integrity_check', { simple: true })
      if (result !== 'ok') throw new BackupError('The database inside this backup is damaged.')
    } finally {
      check.close()
    }
    return { dir, dbFile, imagesDir, manifest }
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    if (e instanceof BackupError) throw e
    throw new BackupError(`Could not read the backup: ${(e as Error).message}`)
  }
}

/**
 * Replaces the live database and merges the backup's images in. The current database handle must be closed by the
 * caller first (the app restarts afterwards). If the backup has no dataset but the current database has one, the
 * dataset is carried over so a restore never silently drops a 140k-row import.
 */
export function applyRestore(prepared: PreparedRestore, paths: BackupPaths, keepDatasetFrom?: string): void {
  // Bring an older backup up to the current schema before it goes live.
  const restored = new Database(prepared.dbFile)
  try {
    restored.pragma('foreign_keys = ON')
    runMigrations(restored)
    if (keepDatasetFrom && existsSync(keepDatasetFrom) && count(restored, 'SELECT count(*) AS c FROM catalog_fragrances') === 0) {
      restored.prepare('ATTACH DATABASE ? AS old').run(keepDatasetFrom)
      restored.exec(
        `INSERT INTO catalog_fragrances (name, house, year, concentration, data, popularity, source_url)
         SELECT name, house, year, concentration, data, popularity, source_url FROM old.catalog_fragrances`
      )
      restored.exec('DETACH DATABASE old')
    }
    restored.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    restored.close()
  }

  for (const ext of ['', '-wal', '-shm']) rmSync(paths.dbPath + ext, { force: true })
  copyFileSync(prepared.dbFile, paths.dbPath)

  mkdirSync(paths.imagesDir, { recursive: true })
  for (const f of readdirSync(prepared.imagesDir)) copyFileSync(join(prepared.imagesDir, f), join(paths.imagesDir, f))
  rmSync(prepared.dir, { recursive: true, force: true })
}

export function discardRestore(prepared: PreparedRestore): void {
  rmSync(prepared.dir, { recursive: true, force: true })
}

// ---- automatic weekly backups -----------------------------------------------------------------------

export const AUTO_PREFIX = 'auto-'
export const AUTO_EVERY_DAYS = 7
export const AUTO_KEEP = 8

export interface BackupFile {
  name: string
  mtimeMs: number
  bytes: number
}

export function listBackupFiles(dir: string): BackupFile[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .map((name) => {
      const s = statSync(join(dir, name))
      return { name, mtimeMs: s.mtimeMs, bytes: s.size }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** True when there is no automatic backup from the last `days` days. */
export function autoBackupDue(files: BackupFile[], now: number, days = AUTO_EVERY_DAYS): boolean {
  const newest = Math.max(...files.filter((f) => f.name.startsWith(AUTO_PREFIX)).map((f) => f.mtimeMs), -Infinity)
  return now - newest >= days * 86_400_000
}

/** Automatic backups beyond the newest `keep`. Manual and pre-restore backups are never pruned. */
export function autoBackupsToPrune(files: BackupFile[], keep = AUTO_KEEP): BackupFile[] {
  return files.filter((f) => f.name.startsWith(AUTO_PREFIX)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(keep)
}

export const dateStamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const timeStamp = (d = new Date()) => `${dateStamp(d)}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
