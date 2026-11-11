import { app, BrowserWindow, dialog } from 'electron'
import { writeFileSync } from 'fs'
import { join } from 'path'
import type { Result } from '@shared/types'
import type { Db } from './db'
import { giftListCsv, listGiftLists, resultsCsv, type ExportRow } from './db/discoverGifts'
import { fail, toResult } from './db/repo'

const safeName = (s: string) => s.replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'ideas'

async function save(title: string, fileBase: string, csv: string, rows: number): Promise<Result<{ path: string; rows: number } | null>> {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const r = await dialog.showSaveDialog(win, { title, defaultPath: join(app.getPath('documents'), `${safeName(fileBase)}.csv`), filters: [{ name: 'CSV (opens in Excel)', extensions: ['csv'] }] })
  if (r.canceled || !r.filePath) return { ok: true, data: null }
  return toResult(() => {
    writeFileSync(r.filePath!, '﻿' + csv, 'utf8') // BOM so Excel reads accents correctly
    return { path: r.filePath!, rows }
  })
}

export function exportResultsAs(title: string, rows: ExportRow[]): Promise<Result<{ path: string; rows: number } | null>> {
  if (!Array.isArray(rows) || rows.length === 0) return Promise.resolve(fail('INVALID', 'There is nothing to export.'))
  const { csv, rows: n } = resultsCsv(String(title ?? ''), rows)
  return save('Save these ideas as CSV', `Scent-Wardrobe-${String(title ?? 'ideas')}`, csv, n)
}

export function exportGiftAs(db: Db, listId: number): Promise<Result<{ path: string; rows: number } | null>> {
  const list = listGiftLists(db).find((l) => l.id === listId)
  if (!list) return Promise.resolve(fail('NOT_FOUND', 'That list no longer exists.'))
  return save('Save this gift list as CSV', `Gift-list-${list.name}`, giftListCsv(list), list.items.length)
}
