import type { LayerItem, RatedCombo } from './layering/types'
import type { RecItem } from './recommend/types'
import type {
  BottleInput,
  AppPaths,
  BackupInfo,
  CatalogItem,
  ColumnMapping,
  ComboInput,
  DatasetInfo,
  FragranticaResult,
  HadDetails,
  PastBottle,
  ImportAnalysis,
  ImportProgress,
  MemberImportProgress,
  MemberImportResult,
  MemberItem,
  MemberPreview,
  ImportPreview,
  ImportResult,
  LocalHit,
  DbInfo,
  FragranceDetail,
  FragranceInput,
  GeoResult,
  FollowUpInput,
  FragranceSummary,
  MoveRequest,
  Placement,
  Result,
  SavedCombo,
  SavedLocation,
  StatsOverview,
  WardrobeKind,
  WeatherReading,
  WearEntry,
  WearInput,
  WearLogged
} from './types'

/** The single typed contract between renderer and main. Add new calls here first. */
export interface Api {
  app: {
    dbInfo(): Promise<DbInfo>
    paths(): Promise<AppPaths>
    /** Opens the data folder in Explorer. */
    openDataFolder(): Promise<void>
  }
  backup: {
    list(): Promise<BackupInfo[]>
    /** Saves a backup into the backups folder. */
    create(includeDataset: boolean): Promise<Result<{ path: string; bytes: number }>>
    /** Asks where to save a backup. null when cancelled. */
    exportAs(includeDataset: boolean): Promise<Result<{ path: string; bytes: number } | null>>
    /** Asks for a backup file (or uses \`path\`), confirms, restores and restarts the app. */
    restore(path?: string): Promise<Result<{ restarting: boolean } | null>>
    openFolder(): Promise<void>
  }
  export: {
    collectionCsv(scope: 'all' | 'collection'): Promise<Result<{ path: string; rows: number } | null>>
  }
  fragrances: {
    list(filter?: { wardrobe?: WardrobeKind }): Promise<FragranceSummary[]>
    get(id: number): Promise<FragranceDetail | null>
    /** Creates a fragrance and places it in a wardrobe in one transaction. */
    create(input: FragranceInput, placement: Placement): Promise<Result<FragranceSummary>>
    update(id: number, input: FragranceInput): Promise<Result<FragranceSummary>>
    /** Adds a fragrance I wore but do not own (no wardrobe, marked foreign). Returns the existing one if the name and house match. */
    addForeign(input: FragranceInput): Promise<Result<FragranceSummary>>
    delete(id: number): Promise<Result<null>>
    setImpression(id: number, text: string): Promise<Result<null>>
    /** Sets (or clears, with null) how many sprays I usually use of each fragrance. */
    setDefaultSprays(entries: { fragranceId: number; sprays: number | null }[]): Promise<Result<null>>
    /** Fragrances in My Collection (other than `excludeId`) that contain the note. */
    ownedWithNote(noteId: number, excludeId: number): Promise<FragranceSummary[]>
  }
  wardrobe: {
    move(req: MoveRequest): Promise<Result<FragranceSummary>>
    /** Persists a manual shelf order for one wardrobe. */
    setRating(fragranceId: number, rating: number | null): Promise<Result<null>>
    /** Edits the wardrobe-specific notes: why I dislike it (Garbage) or the Had details. */
    setDetails(fragranceId: number, details: { dislikeNote?: string | null; had?: HadDetails }): Promise<Result<null>>
    /** Previous bottles of fragrances I have bought again. */
    pastBottles(): Promise<PastBottle[]>
    reorder(wardrobe: WardrobeKind, orderedIds: number[]): Promise<Result<null>>
  }
  journal: {
    add(fragranceId: number, text: string): Promise<Result<null>>
    update(entryId: number, text: string): Promise<Result<null>>
    delete(entryId: number): Promise<Result<null>>
  }
  bottles: {
    add(fragranceId: number, input: BottleInput): Promise<Result<null>>
    update(bottleId: number, input: BottleInput): Promise<Result<null>>
    markEmpty(bottleId: number): Promise<Result<null>>
  }
  catalog: {
    notes(): Promise<CatalogItem[]>
    accords(): Promise<CatalogItem[]>
  }
  search: {
    /** Fuzzy search over my fragrances and the imported dataset. */
    local(query: string): Promise<LocalHit[]>
    /** Full data of an imported dataset entry, ready to prefill the form. */
    datasetEntry(id: number): Promise<FragranceInput | null>
    datasetInfo(): Promise<DatasetInfo>
  }
  importer: {
    /** Opens a file picker (starting in the project's data/ folder) and analyses the chosen file. */
    pickFile(): Promise<Result<ImportAnalysis> | null>
    analyze(path: string, table?: string): Promise<Result<ImportAnalysis>>
    preview(path: string, table: string | null, mapping: ColumnMapping): Promise<Result<ImportPreview>>
    run(path: string, table: string | null, mapping: ColumnMapping, replace: boolean): Promise<Result<ImportResult>>
    clearDataset(): Promise<Result<null>>
    /** Subscribes to progress while `run` is working. Returns an unsubscribe function. */
    onProgress(cb: (p: ImportProgress) => void): () => void
  }
  fragrantica: {
    /** Loads one Fragrantica page in a hidden window and parses it. */
    importUrl(url: string): Promise<Result<FragranticaResult>>
    /** Reads the public Have / Want / Had / custom shelf lists of a member and says what would be added. */
    memberPreview(username: string): Promise<Result<MemberPreview>>
    /** The same preview from pasted text (headings and fragrance links) or the text of a CSV (List, House, Name). */
    listPreview(text: string): Promise<Result<MemberPreview>>
    /** Lets the user choose a CSV or text file and returns its text. Null if cancelled. */
    pickListFile(): Promise<Result<string> | null>
    /** Adds what the preview marked as new. With details, each fragrance page is read too (one every few seconds). */
    memberImport(items: MemberItem[], withDetails: boolean): Promise<Result<MemberImportResult>>
    memberCancel(): Promise<null>
    onMemberProgress(cb: (p: MemberImportProgress) => void): () => void
  }
  images: {
    /** Lets the user choose their own photo for a fragrance. Returns false if cancelled. */
    replace(fragranceId: number, removeBackground: boolean): Promise<Result<boolean>>
    /** A cached picture as a data URL, read in the main process. Null if the file is missing or unreadable. */
    read(file: string): Promise<string | null>
    /** Records a picture that failed to load, in image-errors.log, so the cause can be found. */
    report(file: string, detail: string): Promise<null>
  }
  wears: {
    log(input: WearInput): Promise<Result<WearLogged>>
    update(id: number, input: WearInput): Promise<Result<null>>
    delete(id: number): Promise<Result<null>>
    list(filter?: { fragranceId?: number; limit?: number }): Promise<WearEntry[]>
    /** Wears between two local dates, inclusive ('YYYY-MM-DD'), oldest first. For the calendar. */
    range(from: string, to: string): Promise<WearEntry[]>
    /** Wears still missing a longevity figure whose day is over. */
    pendingFollowUps(): Promise<WearEntry[]>
    completeFollowUp(id: number, input: FollowUpInput): Promise<Result<null>>
    dismissFollowUp(id: number): Promise<Result<null>>
  }
  stats: {
    overview(): Promise<StatsOverview>
  }
  layering: {
    /** My collection as engine input (accords, notes, seasons, projection). */
    candidates(): Promise<LayerItem[]>
    /** Combos I have rated, for the engine's taste learning. */
    history(): Promise<RatedCombo[]>
    saveCombo(input: ComboInput): Promise<Result<{ id: number; existing: boolean }>>
    combos(): Promise<SavedCombo[]>
    rateCombo(id: number, rating: number | null, notes?: string | null): Promise<Result<null>>
    deleteCombo(id: number): Promise<Result<null>>
  }
  recommend: {
    /** The collection with rotation, rating and longevity data for the recommender. */
    candidates(): Promise<RecItem[]>
  }
  weather: {
    /** Searches cities through Open-Meteo's geocoding. */
    search(query: string): Promise<Result<GeoResult[]>>
    /** Current conditions at the saved location. Fails (offline, or no location yet) with a message. */
    current(): Promise<Result<WeatherReading>>
    location(): Promise<SavedLocation | null>
    setLocation(loc: SavedLocation | null): Promise<Result<null>>
  }
  settings: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<Result<null>>
    /** Built-in activities plus the ones I added. */
    activities(): Promise<string[]>
    addActivity(name: string): Promise<Result<string[]>>
  }
  dev: {
    seedSampleData(): Promise<Result<{ added: number }>>
    clearSampleData(): Promise<Result<{ removed: number }>>
  }
}

/** Channel names such as `fragrances:list`, derived from the promise-returning methods of `Api`. */
export type ChannelName = {
  [G in keyof Api & string]: {
    [M in keyof Api[G] & string]: Api[G][M] extends (...a: never[]) => Promise<unknown> ? `${G}:${M}` : never
  }[keyof Api[G] & string]
}[keyof Api & string]
