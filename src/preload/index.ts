import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '@shared/ipc'

const call =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

const c = <T>(channel: string) => call(channel) as T

const api: Api = {
  app: { dbInfo: c('app:dbInfo'), paths: c('app:paths'), openDataFolder: c('app:openDataFolder') },
  backup: { list: c('backup:list'), create: c('backup:create'), exportAs: c('backup:exportAs'), restore: c('backup:restore'), openFolder: c('backup:openFolder') },
  export: { collectionCsv: c('export:collectionCsv') },
  fragrances: {
    list: c('fragrances:list'),
    get: c('fragrances:get'),
    create: c('fragrances:create'),
    update: c('fragrances:update'),
    delete: c('fragrances:delete'),
    setImpression: c('fragrances:setImpression'),
    setDefaultSprays: c('fragrances:setDefaultSprays'),
    addForeign: c('fragrances:addForeign'),
    ownedWithNote: c('fragrances:ownedWithNote')
  },
  wardrobe: {
    move: c('wardrobe:move'),
    setRating: c('wardrobe:setRating'),
    setDetails: c('wardrobe:setDetails'),
    pastBottles: c('wardrobe:pastBottles'),
    reorder: c('wardrobe:reorder')
  },
  journal: { add: c('journal:add'), update: c('journal:update'), delete: c('journal:delete') },
  bottles: { add: c('bottles:add'), update: c('bottles:update'), markEmpty: c('bottles:markEmpty') },
  catalog: { notes: c('catalog:notes'), accords: c('catalog:accords') },
  search: { local: c('search:local'), datasetEntry: c('search:datasetEntry'), datasetInfo: c('search:datasetInfo') },
  importer: {
    pickFile: c('importer:pickFile'),
    analyze: c('importer:analyze'),
    preview: c('importer:preview'),
    run: c('importer:run'),
    clearDataset: c('importer:clearDataset'),
    onProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: { done: number }) => cb(p)
      ipcRenderer.on('importer:progress', listener)
      return () => ipcRenderer.removeListener('importer:progress', listener)
    }
  },
  fragrantica: {
    importUrl: c('fragrantica:importUrl'),
    memberPreview: c('fragrantica:memberPreview'),
    listPreview: c('fragrantica:listPreview'),
    pickListFile: c('fragrantica:pickListFile'),
    memberImport: c('fragrantica:memberImport'),
    memberCancel: c('fragrantica:memberCancel'),
    onMemberProgress: (cb) => {
      const listener = (_e: Electron.IpcRendererEvent, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('fragrantica:memberProgress', listener)
      return () => ipcRenderer.removeListener('fragrantica:memberProgress', listener)
    }
  },
  images: { replace: c('images:replace'), read: c('images:read'), report: c('images:report') },
  wears: {
    log: c('wears:log'),
    update: c('wears:update'),
    delete: c('wears:delete'),
    list: c('wears:list'),
    range: c('wears:range'),
    pendingFollowUps: c('wears:pendingFollowUps'),
    completeFollowUp: c('wears:completeFollowUp'),
    dismissFollowUp: c('wears:dismissFollowUp')
  },
  layering: {
    candidates: c('layering:candidates'),
    history: c('layering:history'),
    saveCombo: c('layering:saveCombo'),
    combos: c('layering:combos'),
    rateCombo: c('layering:rateCombo'),
    deleteCombo: c('layering:deleteCombo')
  },
  recommend: { candidates: c('recommend:candidates') },
  weather: { search: c('weather:search'), current: c('weather:current'), location: c('weather:location'), setLocation: c('weather:setLocation') },
  stats: { overview: c('stats:overview') },
  settings: { get: c('settings:get'), set: c('settings:set'), activities: c('settings:activities'), addActivity: c('settings:addActivity') },
  dev: {
    seedSampleData: c('dev:seedSampleData'),
    clearSampleData: c('dev:clearSampleData')
  }
}

contextBridge.exposeInMainWorld('api', api)
