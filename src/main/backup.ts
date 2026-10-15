import { app, BrowserWindow, dialog, shell } from 'electron'
import { rmSync, statSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { BackupInfo, Result } from '@shared/types'
import {
  applyRestore,
  AUTO_PREFIX,
  autoBackupDue,
  autoBackupsToPrune,
  BackupError,
  createBackup,
  discardRestore,
  listBackupFiles,
  prepareRestore,
  timeStamp,
  type BackupPaths
} from './backupCore'
import type { Db } from './db'
import { buildCollectionCsv } from './db/exportCsv'
import { fail, toResult } from './db/repo'
import { getSetting } from './db/settings'

const AUTO_SETTING = 'backup.auto'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FIRST_CHECK_MS = 45_000

export const backupsDir = () => join(app.getPath('userData'), 'backups')

const kindOf = (name: string): BackupInfo['kind'] => (name.startsWith(AUTO_PREFIX) ? 'auto' : name.startsWith('pre-restore-') ? 'pre-restore' : 'manual')

export function listBackups(): BackupInfo[] {
  return listBackupFiles(backupsDir()).map((f) => ({ name: f.name, bytes: f.bytes, modified: new Date(f.mtimeMs).toISOString(), kind: kindOf(f.name) }))
}

export const autoBackupEnabled = (db: Db) => getSetting(db, AUTO_SETTING) !== '0'

/** Makes a weekly automatic backup when one is due, then trims old automatic ones. Failures are logged, never thrown. */
export async function runAutoBackupIfDue(db: Db, paths: BackupPaths): Promise<string | null> {
  try {
    if (!autoBackupEnabled(db)) return null
    const files = listBackupFiles(backupsDir())
    if (!autoBackupDue(files, Date.now())) return null
    const name = `${AUTO_PREFIX}${timeStamp()}.zip`
    await createBackup(db, paths, join(backupsDir(), name), { appVersion: app.getVersion() })
    for (const old of autoBackupsToPrune(listBackupFiles(backupsDir()))) rmSync(join(backupsDir(), old.name), { force: true })
    return name
  } catch (e) {
    console.error('Automatic backup failed:', e)
    return null
  }
}

export function startAutoBackup(db: Db, paths: BackupPaths): void {
  setTimeout(() => void runAutoBackupIfDue(db, paths), FIRST_CHECK_MS)
  setInterval(() => void runAutoBackupIfDue(db, paths), CHECK_EVERY_MS).unref()
}

const win = () => BrowserWindow.getAllWindows()[0]

export async function createManualBackup(db: Db, paths: BackupPaths, includeDataset: boolean): Promise<Result<{ path: string; bytes: number }>> {
  try {
    const r = await createBackup(db, paths, join(backupsDir(), `manual-${timeStamp()}.zip`), { includeDataset, appVersion: app.getVersion() })
    return { ok: true, data: { path: r.path, bytes: r.bytes } }
  } catch (e) {
    return fail('UNKNOWN', `The backup could not be created: ${(e as Error).message}`)
  }
}

/** Lets the user pick where to save a backup (for example a USB drive or cloud folder). */
export async function exportBackupAs(db: Db, paths: BackupPaths, includeDataset: boolean): Promise<Result<{ path: string; bytes: number } | null>> {
  const r = await dialog.showSaveDialog(win(), {
    title: 'Save a backup of my fragrance data',
    defaultPath: join(app.getPath('documents'), `Scent-Wardrobe-backup-${timeStamp()}.zip`),
    filters: [{ name: 'Backup (zip)', extensions: ['zip'] }]
  })
  if (r.canceled || !r.filePath) return { ok: true, data: null }
  try {
    const made = await createBackup(db, paths, r.filePath, { includeDataset, appVersion: app.getVersion() })
    return { ok: true, data: { path: made.path, bytes: made.bytes } }
  } catch (e) {
    return fail('UNKNOWN', `The backup could not be saved: ${(e as Error).message}`)
  }
}

/**
 * Restores a backup zip: checks it, asks for confirmation, keeps a safety backup of the current data, swaps the
 * files and restarts the app (the open database handle cannot be reused).
 */
export async function restoreBackup(db: Db, paths: BackupPaths, zipPath: string | null): Promise<Result<{ restarting: boolean } | null>> {
  let file = zipPath
  if (!file) {
    const pick = await dialog.showOpenDialog(win(), {
      title: 'Choose a backup to restore',
      defaultPath: backupsDir(),
      properties: ['openFile'],
      filters: [{ name: 'Backup (zip)', extensions: ['zip'] }]
    })
    if (pick.canceled || !pick.filePaths[0]) return { ok: true, data: null }
    file = pick.filePaths[0]
  }

  let prepared
  try {
    prepared = await prepareRestore(file)
  } catch (e) {
    return fail('INVALID', e instanceof BackupError ? e.message : `Could not read the backup: ${(e as Error).message}`)
  }

  const m = prepared.manifest
  // Test hook for scripted checks (skips the dialog); ignored in packaged builds.
  const skipConfirm = !app.isPackaged && !!process.env['SCENT_TEST_CONFIRM']
  const answer = skipConfirm ? { response: 0 } : await dialog.showMessageBox(win(), {
    type: 'warning',
    buttons: ['Restore and restart', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Restore backup',
    message: 'Replace your current data with this backup?',
    detail: `Backup from ${new Date(m.createdAt).toLocaleString()}: ${m.fragrances} fragrances, ${m.images} images.\n\nA safety copy of your current data is saved first, in the backups folder, so you can undo this. The app restarts when it is done.`
  })
  if (answer.response !== 0) {
    discardRestore(prepared)
    return { ok: true, data: null }
  }

  try {
    const safety = await createBackup(db, paths, join(backupsDir(), `pre-restore-${timeStamp()}.zip`), { appVersion: app.getVersion() })
    // A plain copy of the live database: its imported dataset is carried over if the backup has none.
    const live = join(backupsDir(), '.live-copy.db')
    await db.backup(live)
    db.close()
    applyRestore(prepared, paths, live)
    rmSync(live, { force: true })
    void safety
    app.relaunch()
    app.exit(0)
    return { ok: true, data: { restarting: true } }
  } catch (e) {
    discardRestore(prepared)
    return fail('UNKNOWN', `The restore failed: ${(e as Error).message}. Your previous data is still in the backups folder.`)
  }
}

export async function exportCsv(db: Db, scope: 'all' | 'collection'): Promise<Result<{ path: string; rows: number } | null>> {
  const label = scope === 'collection' ? 'collection' : 'library'
  const r = await dialog.showSaveDialog(win(), {
    title: 'Export my fragrances as CSV',
    defaultPath: join(app.getPath('documents'), `my-fragrance-${label}.csv`),
    filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }]
  })
  if (r.canceled || !r.filePath) return { ok: true, data: null }
  return toResult(() => {
    const { csv, rows } = buildCollectionCsv(db, scope)
    writeFileSync(r.filePath!, '﻿' + csv, 'utf8') // BOM so Excel reads accents correctly
    return { path: r.filePath!, rows }
  })
}

export function openBackupsFolder(): Promise<string> {
  return shell.openPath(backupsDir())
}

function folderSize(dir: string): number {
  try {
    return readdirSync(dir).reduce((s, f) => {
      try {
        return s + statSync(join(dir, f)).size
      } catch {
        return s
      }
    }, 0)
  } catch {
    return 0
  }
}

export function appPaths(paths: BackupPaths) {
  const fileSize = (p: string) => {
    try {
      return statSync(p).size
    } catch {
      return 0
    }
  }
  return {
    version: app.getVersion(),
    userData: app.getPath('userData'),
    database: paths.dbPath,
    images: paths.imagesDir,
    backups: backupsDir(),
    databaseBytes: fileSize(paths.dbPath),
    imagesBytes: folderSize(paths.imagesDir),
    packaged: app.isPackaged
  }
}
