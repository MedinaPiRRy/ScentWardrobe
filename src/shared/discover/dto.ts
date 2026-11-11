import type { Brief, Criterion } from './brief'
import type { Hide, Reason } from './rank'
import type { Seed, Sliders } from './similar'
import type { LibraryItem, Override, TasteProfile, WardrobeName } from './taste'
import type { Season } from './vocab'

/** What the window shows for one suggestion. */
export interface DiscoverCard {
  /** Stable key for lists: "d:<catalog id>" or "l:<fragrance id>". */
  key: string
  source: 'dataset' | 'library'
  catalogId: number | null
  /** Set when the fragrance is already in my library (any wardrobe, or not mine). */
  fragranceId: number | null
  name: string
  house: string
  year: number | null
  concentration: string | null
  sourceUrl: string | null
  imageUrl: string | null
  topAccords: { name: string; strength: number }[]
  /** 0-100 */
  score: number
  reasons: Reason[]
  inWardrobes: WardrobeName[]
  criteria?: Criterion[]
}

export interface DiscoverStatus {
  /** Fragrances in the imported dataset (0 = none imported). */
  datasetCount: number
  /** Rows of the Discovery index that are built. */
  indexed: number
  complete: boolean
  building: boolean
  /** The index was made by an older version of the app and will be rebuilt. */
  stale: boolean
  /** How many dataset rows carry the extra facts (note weights, ratings, votes). */
  withExtras: number
  /** The date the dataset votes were captured, when the file said (YYYY-MM-DD). */
  datasetDate: string | null
  /** Whether the index is loaded in memory for fast queries. */
  loaded: boolean
}

export interface DiscoverFilters {
  limit?: number
  offset?: number
  season?: Season | null
  minVotes?: number
  genderLean?: number | null
  hide?: Hide
}

export interface DiscoverResults {
  mode: 'dataset' | 'library' | 'none'
  cards: DiscoverCard[]
  total: number
  hidden: Record<string, number>
  ms: number
  /** Why there is nothing to show, in plain words. */
  message: string | null
}

export type SeedRef = { catalogId: number } | { fragranceId: number }

export interface SimilarRequest {
  seeds: SeedRef[]
  sliders: Sliders
  filters: DiscoverFilters
}

export interface SimilarResults extends DiscoverResults {
  seeds: { name: string; house: string }[]
  /** The seed accords before and after the sliders, and what changed, in words. */
  before: { name: string; weight: number }[]
  after: { name: string; weight: number }[]
  changes: string[]
}

export interface BriefRequest {
  brief: Brief
  filters: DiscoverFilters
}

export interface BriefResults extends DiscoverResults {
  /** Dealbreakers removed this many fragrances. */
  excluded: number
  excludedExamples: string[]
  /** How many separate things the brief asks for. */
  active: number
}

export interface SavedBrief {
  id: number
  name: string
  brief: Brief
  updatedAt: string
}

export interface IgnoredItem {
  key: string
  name: string
  house: string
}

export interface TasteResult {
  taste: TasteProfile
  overrides: { accords: Record<string, Override>; notes: Record<string, Override> }
}

/** What the main process needs from a seed it resolved (for tests). */
export type ResolvedSeed = Seed & { house: string }
export type { LibraryItem }
