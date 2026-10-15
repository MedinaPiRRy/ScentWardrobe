import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Api, ChannelName } from '@shared/ipc'
import type { WardrobeKind } from '@shared/types'
import type { Db } from './db'
import { clearDataset, datasetCount, datasetEntry, detectPreset, previewImport, runImport, searchLocal } from './data/catalog'
import { suggestMapping } from './data/mapping'
import { openSource } from './data/sources'
import { importFromUrl } from './fragrantica/fragranticaImport'
import { fetchMemberWardrobe } from './fragrantica/memberFetch'
import { isFragranticaUrl } from './fragrantica/fragranticaParser'
import { isTrustedSender } from './security'
import { buildPreview, parseListText, previewItems } from './fragrantica/memberParser'
import { existingFragrances, runMemberImport } from './fragrantica/memberRun'
import { importLocalImage, pickImageFile, readImageDataUrl, reportImageFailure, resolveRemoteImages } from './images'
import {
  setImagePath,
  addBottle,
  addForeignFragrance,
  addJournal,
  createFragrance,
  deleteFragrance,
  deleteJournal,
  listAccords,
  listNotes,
  markBottleEmpty,
  ownedWithNote,
  setDefaultSprays,
  setImpression,
  setRating,
  updateBottle,
  updateFragrance,
  updateJournal
} from './db/editing'
import { getLocation, recommendCandidates, setLocation } from './db/recommend'
import { currentWeather, searchCities } from './weather'
import { appPaths, createManualBackup, exportBackupAs, exportCsv, listBackups, openBackupsFolder, restoreBackup } from './backup'
import { deleteCombo, layerCandidates, listCombos, ratedHistory, rateCombo, saveCombo } from './db/layering'
import { addActivity, getSetting, listActivities, setSetting } from './db/settings'
import { computeOverview } from './db/stats'
import { completeFollowUp, deleteWear, dismissFollowUp, listWears, listWearsRange, logWear, pendingFollowUps, updateWear } from './db/wears'
import { AppError, dbInfo, fail, getFragrance, listFragrances, listPastBottles, moveToWardrobe, reorderWardrobe, setWardrobeDetails, toResult } from './db/repo'
import { clearSampleData, seedSampleData } from './db/seed'

function analyze(path: string, table?: string) {
  return toResult(() => {
    const src = openSource(path, table)
    try {
      const sample: Record<string, string>[] = []
      for (const row of src.rows()) {
        sample.push(row)
        if (sample.length >= 5) break
      }
      return { path, format: src.format, tables: src.tables, table: src.table, columns: src.columns, sample, suggested: suggestMapping(src.columns), preset: detectPreset(src) }
    } finally {
      src.close()
    }
  })
}

/** Registers every IPC channel. The record is keyed by `ChannelName`, so a new `Api` method forces a handler here. */
let memberBusy = false
let memberCancelled = false

export function registerIpc(db: Db, dbPath: string): void {
  const paths = { dbPath, imagesDir: join(app.getPath('userData'), 'images') }
  const handlers: Record<ChannelName, (...args: any[]) => unknown> = {
    'app:dbInfo': () => dbInfo(db, dbPath),
    'app:paths': () => appPaths(paths),
    'app:openDataFolder': async () => void (await shell.openPath(app.getPath('userData'))),
    'backup:list': () => listBackups(),
    'backup:create': (inc: boolean) => createManualBackup(db, paths, inc),
    'backup:exportAs': (inc: boolean) => exportBackupAs(db, paths, inc),
    'backup:restore': (p?: string) => restoreBackup(db, paths, p ?? null),
    'backup:openFolder': async () => void (await openBackupsFolder()),
    'export:collectionCsv': (scope: 'all' | 'collection') => exportCsv(db, scope),
    'fragrances:list': (filter?: Parameters<Api['fragrances']['list']>[0]) => listFragrances(db, filter),
    'fragrances:get': (id: number) => getFragrance(db, id),
    'fragrances:create': async (i: Parameters<Api['fragrances']['create']>[0], p: Parameters<Api['fragrances']['create']>[1]) => {
      await resolveRemoteImages(i)
      return createFragrance(db, i, p)
    },
    'fragrances:update': async (id: number, i: Parameters<Api['fragrances']['update']>[1]) => {
      await resolveRemoteImages(i)
      return updateFragrance(db, id, i)
    },
    'fragrances:delete': (id: number) => deleteFragrance(db, id),
    'fragrances:addForeign': async (i: Parameters<Api['fragrances']['addForeign']>[0]) => {
      await resolveRemoteImages(i)
      return addForeignFragrance(db, i)
    },
    'fragrances:setDefaultSprays': (e: Parameters<Api['fragrances']['setDefaultSprays']>[0]) => setDefaultSprays(db, e),
    'fragrances:setImpression': (id: number, t: string) => setImpression(db, id, t),
    'fragrances:ownedWithNote': (noteId: number, excl: number) => ownedWithNote(db, noteId, excl),
    'wardrobe:setRating': (id: number, r: number | null) => setRating(db, id, r),
    'journal:add': (id: number, t: string) => addJournal(db, id, t),
    'journal:update': (id: number, t: string) => updateJournal(db, id, t),
    'journal:delete': (id: number) => deleteJournal(db, id),
    'bottles:add': (id: number, b: Parameters<Api['bottles']['add']>[1]) => addBottle(db, id, b),
    'bottles:update': (id: number, b: Parameters<Api['bottles']['update']>[1]) => updateBottle(db, id, b),
    'bottles:markEmpty': (id: number) => markBottleEmpty(db, id),
    'catalog:notes': () => listNotes(db),
    'catalog:accords': () => listAccords(db),
    'wardrobe:move': (req: Parameters<Api['wardrobe']['move']>[0]) => moveToWardrobe(db, req),
    'wardrobe:setDetails': (id: number, d: Parameters<Api['wardrobe']['setDetails']>[1]) => setWardrobeDetails(db, id, d),
    'wardrobe:pastBottles': () => listPastBottles(db),
    'wardrobe:reorder': (w: WardrobeKind, ids: number[]) => reorderWardrobe(db, w, ids),
    'search:local': (q: string) => searchLocal(db, q),
    'search:datasetEntry': (id: number) => datasetEntry(db, id),
    'search:datasetInfo': () => ({ count: datasetCount(db) }),
    'importer:pickFile': async () => {
      // Test hook for scripted UI checks; ignored in packaged builds.
      if (!app.isPackaged && process.env['SCENT_PICK_FILE']) return analyze(process.env['SCENT_PICK_FILE'])
      const dataDir = join(app.getAppPath(), 'data')
      const r = await dialog.showOpenDialog({
        title: 'Choose a dataset file',
        defaultPath: existsSync(dataDir) ? dataDir : app.getPath('downloads'),
        properties: ['openFile'],
        filters: [{ name: 'Datasets', extensions: ['csv', 'tsv', 'jsonl', 'ndjson', 'json', 'db', 'sqlite', 'sqlite3'] }]
      })
      return r.canceled ? null : analyze(r.filePaths[0])
    },
    'importer:analyze': (path: string, table?: string) => analyze(path, table),
    'importer:preview': (path: string, table: string | null, m: Parameters<Api['importer']['preview']>[2]) => toResult(() => previewImport(path, table, m)),
    'importer:run': async (path: string, table: string | null, m: Parameters<Api['importer']['run']>[2], replace: boolean) => {
      try {
        const win = BrowserWindow.getAllWindows()[0]
        const data = await runImport(db, path, table, m, replace, (done) => win?.webContents.send('importer:progress', { done }))
        return { ok: true, data }
      } catch (e) {
        return fail('UNKNOWN', (e as Error).message)
      }
    },
    'importer:clearDataset': () => toResult(() => (clearDataset(db), null)),
    'fragrantica:importUrl': (url: string) => importFromUrl(url),
    'fragrantica:memberPreview': async (username: string) => {
      const r = await fetchMemberWardrobe(username)
      return r.ok ? { ok: true as const, data: buildPreview(username.trim().replace(/^@/, ''), r.data, existingFragrances(db)) } : r
    },
    'fragrantica:listPreview': (text: string) =>
      toResult(() => {
        const { items, problems } = parseListText(String(text).slice(0, 2_000_000))
        if (items.length === 0) throw new AppError('INVALID', problems[0] ?? 'Nothing to import was found in that text.')
        const items2 = previewItems(items, existingFragrances(db))
        return { username: '', items: items2, lists: [], notes: problems.slice(0, 5) }
      }),
    'fragrantica:pickListFile': async () => {
      const path = !app.isPackaged && process.env['SCENT_LIST_FILE'] ? process.env['SCENT_LIST_FILE'] : undefined
      let file = path
      if (!file) {
        const r = await dialog.showOpenDialog({ title: 'Choose a CSV or text file', properties: ['openFile'], filters: [{ name: 'CSV or text', extensions: ['csv', 'txt'] }] })
        if (r.canceled) return null
        file = r.filePaths[0]
      }
      try {
        return { ok: true as const, data: readFileSync(file, 'utf8') }
      } catch (e) {
        return fail('INVALID', `Could not read the file: ${(e as Error).message}`)
      }
    },
    'fragrantica:memberImport': async (items: Parameters<Api['fragrantica']['memberImport']>[0], withDetails: boolean) => {
      if (memberBusy) return fail('INVALID', 'An import is already running.')
      // Never trust the renderer with what to fetch: only plain names and Fragrantica fragrance pages go through.
      const clean = (Array.isArray(items) ? items : [])
        .filter((i) => i && typeof i.name === 'string' && typeof i.house === 'string' && i.name.trim() && i.house.trim() && ['have', 'want', 'had', 'shelf'].includes(i.list))
        .map((i) => ({ ...i, url: i.url && isFragranticaUrl(i.url) ? i.url : null }))
      const win = BrowserWindow.getAllWindows()[0]
      memberBusy = true
      memberCancelled = false
      try {
        const data = await runMemberImport(db, clean, {
          fetchPage: withDetails ? importFromUrl : null,
          resolveImages: resolveRemoteImages,
          onProgress: (p) => win?.webContents.send('fragrantica:memberProgress', p),
          cancelled: () => memberCancelled
        })
        return { ok: true as const, data }
      } catch (e) {
        return fail('UNKNOWN', (e as Error).message)
      } finally {
        memberBusy = false
      }
    },
    'fragrantica:memberCancel': async () => {
      memberCancelled = true
      return null
    },
    'images:read': (file: string) => readImageDataUrl(String(file)),
    'images:report': async (file: string, detail: string) => (reportImageFailure(file, detail), null),
    'images:replace': async (id: number, removeBackground: boolean) => {
      const file = await pickImageFile()
      if (!file) return { ok: true, data: false }
      try {
        const saved = importLocalImage(file, removeBackground)
        const r = setImagePath(db, id, saved)
        return r.ok ? { ok: true, data: true } : r
      } catch (e) {
        return fail('INVALID', (e as Error).message)
      }
    },
    'wears:log': (i: Parameters<Api['wears']['log']>[0]) => logWear(db, i),
    'wears:update': (id: number, i: Parameters<Api['wears']['update']>[1]) => updateWear(db, id, i),
    'wears:delete': (id: number) => deleteWear(db, id),
    'wears:list': (f?: Parameters<Api['wears']['list']>[0]) => listWears(db, f),
    'wears:range': (from: string, to: string) => listWearsRange(db, from, to),
    'wears:pendingFollowUps': () => pendingFollowUps(db),
    'wears:completeFollowUp': (id: number, i: Parameters<Api['wears']['completeFollowUp']>[1]) => completeFollowUp(db, id, i),
    'wears:dismissFollowUp': (id: number) => dismissFollowUp(db, id),
    'stats:overview': () => computeOverview(db),
    'layering:candidates': () => layerCandidates(db),
    'layering:history': () => ratedHistory(db),
    'layering:saveCombo': (i: Parameters<Api['layering']['saveCombo']>[0]) => saveCombo(db, i),
    'layering:combos': () => listCombos(db),
    'layering:rateCombo': (id: number, r: number | null, n?: string | null) => rateCombo(db, id, r, n),
    'layering:deleteCombo': (id: number) => deleteCombo(db, id),
    'recommend:candidates': () => recommendCandidates(db),
    'weather:search': async (q: string) => {
      try {
        return { ok: true, data: await searchCities(q) }
      } catch (e) {
        return fail('NETWORK', `Could not search for cities (${(e as Error).message}). Check your connection.`)
      }
    },
    'weather:current': async () => {
      const loc = getLocation(db)
      if (!loc) return fail('NOT_FOUND', 'Set your location to get the weather.')
      try {
        return { ok: true, data: await currentWeather(loc) }
      } catch (e) {
        return fail('NETWORK', `Could not reach the weather service (${(e as Error).message}). Enter the weather by hand instead.`)
      }
    },
    'weather:location': () => getLocation(db),
    'weather:setLocation': (loc: Parameters<Api['weather']['setLocation']>[0]) => setLocation(db, loc),
    'settings:get': (k: string) => getSetting(db, k),
    'settings:set': (k: string, v: string) => setSetting(db, k, v),
    'settings:activities': () => listActivities(db),
    'settings:addActivity': (n: string) => addActivity(db, n),
    'dev:seedSampleData': () => toResult(() => ({ added: seedSampleData(db) })),
    'dev:clearSampleData': () => toResult(() => ({ removed: clearSampleData(db) }))
  }
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      // Only the app's own page may call the main process, never a web page or a pop-up.
      if (!isTrustedSender(event.senderFrame?.url ?? '', process.env['ELECTRON_RENDERER_URL'])) throw new Error('Request refused: untrusted sender.')
      return fn(...args)
    })
  }
}
