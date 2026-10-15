export type WardrobeKind = 'collection' | 'wishlist' | 'to_try' | 'had' | 'garbage'
export type HadReason = 'finished' | 'sold' | 'gifted'
export type NoteLayer = 'top' | 'heart' | 'base' | 'general'
export type BottleType = 'full bottle' | 'travel/mini' | 'decant' | 'sample'
export type BottleStatus = 'active' | 'empty' | 'sold/gifted'

export interface AccordStrength {
  name: string
  color: string
  strength: number
}

export interface NoteEntry {
  id: number
  name: string
  family: string | null
  iconPath: string | null
  layer: NoteLayer
}

export interface CommunityData {
  winter: number
  spring: number
  summer: number
  fall: number
  day: number
  night: number
  longevity: number | null
  sillage: number | null
}

export interface Bottle {
  id: number
  fragranceId: number
  type: BottleType
  sizeMl: number
  remainingMl: number
  mlPerSpray: number
  purchaseDate: string | null
  price: number | null
  boughtAt: string | null
  batchCode: string | null
  openedDate: string | null
  status: BottleStatus
  /** Current price checked by hand, in the same currency as `price`. */
  marketPrice: number | null
  marketCheckedOn: string | null
  marketSource: string | null
}

export interface JournalEntry {
  id: number
  text: string
  createdAt: string
}

export type Season = 'winter' | 'spring' | 'summer' | 'fall'

export interface ShelfBottle {
  type: BottleType
  sizeMl: number
  remainingMl: number
}

/** Lightweight row used on shelves and in lists. */
export interface FragranceSummary {
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  imagePath: string | null
  wardrobe: WardrobeKind | null
  shelfPosition: number | null
  rating: number | null
  topAccords: AccordStrength[]
  activeBottleCount: number
  /** Active bottles only; drives bottle size and fill level on the shelf. */
  bottles: ShelfBottle[]
  desiredSizeMl: number | null
  wearCount: number
  lastWornAt: string | null
  /** Seasons whose community vote is within 60% of the top one. */
  seasons: Season[]
  accordNames: string[]
  noteNames: string[]
  isSample: boolean
  /** Garbage Perfumes: why I dislike it. */
  dislikeNote: string | null
  /** Had: years I wore it, a memory, why it left. */
  hadYears: string | null
  hadMemory: string | null
  hadReason: HadReason | null
  /** Wishlist item brought in by an importer that still needs "what it smells like to me". */
  importedPending: boolean
  /** How many sprays I usually use. */
  defaultSprays: number | null
  /** Worn but not owned: has no wardrobe. */
  isForeign: boolean
}

export interface PerformanceStats {
  wearCount: number
  avgProjection: number | null
  avgLongevity: number | null
  /** Average sprays per wear, or null when nothing is logged. */
  avgSprays: number | null
  compliments: number
  /** Average longevity (hours) per season of the wear date, and per recorded weather condition. */
  longevityBySeason: { label: string; avg: number; wears: number }[]
  longevityByWeather: { label: string; avg: number; wears: number }[]
  series: { date: string; projection: number | null; longevity: number | null }[]
}

export interface FragranceDetail extends FragranceSummary {
  performance: PerformanceStats
  perfumers: string | null
  gender: string | null
  description: string | null
  sourceUrl: string | null
  notes: NoteEntry[]
  accords: AccordStrength[]
  community: CommunityData | null
  impression: string | null
  pastBottles: PastBottle[]
  bottles: Bottle[]
  journal: JournalEntry[]
}

export interface NewBottleInput {
  type: BottleType
  sizeMl: number
  /** Defaults to a full bottle. */
  remainingMl?: number
}

export interface MoveRequest {
  fragranceId: number
  to: WardrobeKind
  /** Required when moving to the wishlist and no impression exists yet. */
  impression?: string
  /** Required when moving to the collection and the fragrance has no active bottle yet. */
  bottle?: NewBottleInput
  /** Optional desired size for wishlist items. */
  desiredSizeMl?: number
  /** Garbage Perfumes: why I dislike it (optional). */
  dislikeNote?: string
  /** Had: years, memory, why it left (all optional). */
  had?: HadDetails
}

export interface HadDetails {
  years?: string | null
  memory?: string | null
  reason?: HadReason | null
}

export interface PastBottle {
  id: number
  fragranceId: number
  years: string | null
  memory: string | null
  reason: HadReason | null
  createdAt: string
}

export type ErrorCode =
  | 'WISHLIST_IMPRESSION_REQUIRED'
  | 'BOTTLE_REQUIRED'
  | 'NOT_FOUND'
  | 'DUPLICATE'
  | 'NETWORK'
  | 'PARSE'
  | 'INVALID'
  | 'UNKNOWN'

export type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string }

export interface DbInfo {
  path: string
  schemaVersion: number
  fragranceCount: number
  sampleCount: number
}

export interface BottleInput {
  type: BottleType
  sizeMl: number
  remainingMl?: number
  mlPerSpray?: number
  purchaseDate?: string | null
  price?: number | null
  boughtAt?: string | null
  batchCode?: string | null
  openedDate?: string | null
  status?: BottleStatus
  marketPrice?: number | null
  marketCheckedOn?: string | null
  marketSource?: string | null
}

export interface FragranceInput {
  name: string
  house: string
  year?: number | null
  concentration?: string | null
  perfumers?: string | null
  gender?: string | null
  description?: string | null
  sourceUrl?: string | null
  /** Local cached file name (see images.ts). */
  imagePath?: string | null
  /** Remote image to download and cache when the fragrance is saved. */
  imageUrl?: string | null
  notes: { name: string; layer: NoteLayer; iconUrl?: string | null; iconPath?: string | null }[]
  accords: { name: string; color?: string; strength: number }[]
  community?: CommunityData | null
}

export type Placement = Omit<MoveRequest, 'fragranceId'>

export interface CatalogItem {
  id: number
  name: string
  /** Note family or accord colour. */
  extra: string | null
}

// ---- local search and dataset import ------------------------------------------------------

export interface LocalHit {
  source: 'mine' | 'dataset'
  /** fragrances.id for 'mine', catalog id for 'dataset'. */
  id: number
  name: string
  house: string
  year: number | null
  concentration: string | null
  wardrobe: WardrobeKind | null
  /** For Garbage Perfumes: why I dislike it, so I do not buy it again. */
  dislikeNote?: string | null
  score: number
}

export type MappingField =
  | 'name'
  | 'house'
  | 'year'
  | 'concentration'
  | 'perfumers'
  | 'gender'
  | 'description'
  | 'imageUrl'
  | 'sourceUrl'
  | 'notesTop'
  | 'notesHeart'
  | 'notesBase'
  | 'notesGeneral'
  | 'accords'
  | 'externalId'
  | 'popularity'
  | 'seasonWinter'
  | 'seasonSpring'
  | 'seasonSummer'
  | 'seasonFall'
  | 'dayVotes'
  | 'nightVotes'
  | 'longevity'
  | 'sillage'

/** Target field -> source column names (several columns are joined / merged). */
export type ColumnMapping = Partial<Record<MappingField, string[]>>

export interface ImportAnalysis {
  path: string
  format: 'csv' | 'jsonl' | 'sqlite'
  tables: string[] | null
  table: string | null
  columns: string[]
  sample: Record<string, string>[]
  suggested: ColumnMapping
  /** Set when the file is a known layout that needs no column mapping. */
  preset: 'fragrantica-dump' | null
}

export interface ImportPreview {
  /** Rows inspected (previews only read the start of a large file). */
  total: number
  truncated: boolean
  /** Rows without a usable name or house. */
  skipped: number
  entries: FragranceInput[]
}

export interface ImportProgress {
  done: number
}

export interface ImportResult {
  imported: number
  skipped: number
  totalInCatalog: number
}

export interface DatasetInfo {
  count: number
}

export interface FragranticaResult {
  input: FragranceInput
  warnings: string[]
}

// ---- wear log and stats ---------------------------------------------------------------------

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export interface WearInput {
  /** A single fragrance... */
  fragranceId?: number
  /** ...or a saved layer combo. Exactly one of the two. */
  comboId?: number
  /** Which bottle the sprays came from. Defaults to the oldest active bottle. Ignored for combos. */
  bottleId?: number | null
  /** Local time, 'YYYY-MM-DD HH:MM'. */
  wornAt: string
  timeOfDay?: TimeOfDay | null
  sprays: number
  activity?: string | null
  temperatureC?: number | null
  humidity?: number | null
  weather?: string | null
  /** 1 intimate ... 5 enormous */
  projection?: number | null
  longevityHours?: number | null
  compliments?: number
  notes?: string | null
  /**
   * An entry added after the fact. By default a wear dated before today is backfilled. Backfilled wears never trigger
   * the "How long did it last?" prompt and do not take sprays from a bottle unless `takeFromBottle` is true.
   */
  backfilled?: boolean
  /** Subtract the sprays from the bottle. Defaults to true for ordinary wears and false for backfilled ones. */
  takeFromBottle?: boolean
}

export interface WearEntry extends Required<Pick<WearInput, 'wornAt' | 'sprays'>> {
  id: number
  fragranceId: number | null
  comboId: number | null
  /** Fragrance name, or the names of a combo joined with " + ". */
  title: string
  house: string | null
  bottleId: number | null
  timeOfDay: TimeOfDay | null
  activity: string | null
  temperatureC: number | null
  humidity: number | null
  weather: string | null
  projection: number | null
  longevityHours: number | null
  compliments: number
  notes: string | null
  mlUsed: number
  backfilled: boolean
  /** The fragrances in this wear: just one, or every member of a layer combo. */
  memberIds: number[]
}

export interface LowBottleWarning {
  bottleId: number
  fragranceId: number
  name: string
  percent: number
  remainingMl: number
  wearsLeft: number | null
}

export interface WearLogged {
  id: number
  /** Bottles that dropped below the low-level threshold because of this wear. */
  warnings: LowBottleWarning[]
}

export interface FollowUpInput {
  longevityHours: number | null
  projection?: number | null
}

export interface LeaderRow {
  id: number
  name: string
  house: string
  value: number
  wears: number
}

export interface StatsOverview {
  totals: {
    collectionCount: number
    wears: number
    wearsLast30Days: number
    /** Sum of the sizes of active bottles. */
    mlOwned: number
    mlRemaining: number
    totalSpent: number
    /** Spent on priced bottles / wears of those fragrances; null when nothing is priced or worn. */
    avgCostPerWear: number | null
    /** Current market price of the collection's active bottles that have one entered. */
    marketValue: number
    /** How many active collection bottles that covers. */
    marketPricedBottles: number
    /** Paid minus market for bottles with both prices (positive = overpaid). Null with no such bottle. */
    paidVsMarket: number | null
  }
  mostWorn: LeaderRow[]
  /** Collection fragrances not worn for the longest time (never-worn first). */
  neglected: { id: number; name: string; house: string; daysSinceWorn: number | null }[]
  perMonth: { month: string; wears: number; mlUsed: number }[]
  leaderboards: { longevity: LeaderRow[]; projection: LeaderRow[]; compliments: LeaderRow[] }
  costPerWear: { id: number; name: string; house: string; spent: number; wears: number; costPerWear: number | null }[]
  lowBottles: LowBottleWarning[]
  /** Bottles in the collection with a paid price, a market price or both, best deal first. */
  priceRows: PriceRow[]
}

export interface PriceRow {
  bottleId: number
  fragranceId: number
  name: string
  house: string
  sizeMl: number
  paid: number | null
  market: number | null
  /** market - paid: positive = saved, negative = overpaid. Null unless both prices exist. */
  saved: number | null
  /** saved / market * 100. */
  savedPercent: number | null
  paidPerMl: number | null
  marketPerMl: number | null
  checkedOn: string | null
  source: string | null
}

// ---- layering lab ---------------------------------------------------------------------------

export interface SavedCombo {
  id: number
  items: { fragranceId: number; name: string; house: string; sprays: number; position: number }[]
  /** "2:1" */
  sprayRatio: string
  predictedScore: number | null
  myRating: number | null
  notes: string | null
  createdAt: string
}

export interface ComboInput {
  /** In the order they are sprayed: the first one is the base layer. */
  items: { fragranceId: number; sprays: number }[]
  predictedScore?: number | null
  notes?: string | null
}

// ---- weather and recommendations ----------------------------------------------------------

export interface SavedLocation {
  label: string
  latitude: number
  longitude: number
}

export interface GeoResult extends SavedLocation {
  /** e.g. "Berlin, Berlin, Germany" */
  detail: string
}

export interface WeatherReading {
  temperatureC: number
  humidity: number
  condition: string
  /** ISO time of the observation. */
  observedAt: string
  location: string
}

// ---- settings, backup, export ---------------------------------------------------------------

export interface BackupInfo {
  name: string
  bytes: number
  modified: string
  kind: 'auto' | 'manual' | 'pre-restore'
}

export interface AppPaths {
  version: string
  userData: string
  database: string
  images: string
  backups: string
  databaseBytes: number
  imagesBytes: number
  packaged: boolean
}

// ---- Fragrantica member profile import -------------------------------------------------------

/** The lists on a public Fragrantica wardrobe: Have, Want, Had and any custom shelf (such as "For Test"). */
export type MemberList = 'have' | 'want' | 'had' | 'shelf'

export interface MemberItem {
  list: MemberList
  /** Name of the custom shelf, for list = 'shelf'. */
  shelf?: string
  /** Fragrance page, when known. */
  url: string | null
  fragranticaId: number | null
  house: string
  name: string
}

export interface MemberPreviewItem extends MemberItem {
  /** Where it will go. */
  target: WardrobeKind
  /** new = will be added; exists = already in the app (skipped); duplicate = also in a stronger list (skipped). */
  status: 'new' | 'exists' | 'duplicate'
  /** What it matched, for "exists". */
  existingName?: string
}

export interface MemberPreview {
  username: string
  items: MemberPreviewItem[]
  /** Per list, how many the profile says it has versus how many were read. */
  lists: { label: string; list: MemberList; expected: number; read: number }[]
  /** Things to tell the user, such as a list that did not load completely. */
  notes: string[]
}

export interface MemberImportProgress {
  done: number
  total: number
  current: string
}

export interface MemberImportResult {
  added: { wardrobe: WardrobeKind; count: number }[]
  skipped: number
  /** Added with only a name and house, because the page could not be read. */
  withoutDetails: number
  failed: { name: string; message: string }[]
  cancelled: boolean
}
