import { parseAccords, parseNotes, type FeatureRow } from './features'
import { LAYER_FROM_CODE, type Layer, type Season } from './vocab'

export * from './extra'
export * from './features'
export * from './vocab'

const NAN = Number.NaN
const f = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : NAN)

/**
 * Every dataset fragrance in struct-of-arrays form: scoring 140,000 rows is a few tight loops over typed arrays, with no
 * per-row objects or JSON. Built once from the derived table (see main/db/discover.ts) and kept in memory.
 */
export class FeatureIndex {
  readonly n: number
  readonly accordNames: string[] = []
  readonly accordIds = new Map<string, number>()
  readonly noteNames: string[] = []
  readonly noteIds = new Map<string, number>()

  readonly catalogId: Int32Array
  readonly fid: Int32Array
  readonly houseKey: string[]
  readonly nameKey: string[]
  readonly concKey: string[]
  readonly year: Int32Array

  readonly accOff: Int32Array
  readonly accIdx: Int32Array
  readonly accVal: Uint8Array
  readonly accNorm: Float32Array
  readonly noteOff: Int32Array
  readonly noteIdx: Int32Array
  readonly noteVal: Uint8Array
  readonly noteLayer: Uint8Array
  readonly noteNorm: Float32Array

  /** Votes per row: winter, spring, summer, fall, day, night (NaN when the dataset has none). */
  readonly votes: Float32Array
  readonly longevity: Float32Array
  readonly sillage: Float32Array
  readonly rating: Float32Array
  readonly ratingN: Float32Array
  readonly valueAvg: Float32Array
  readonly valueN: Float32Array
  readonly people: Float32Array
  readonly haveN: Float32Array
  readonly wantN: Float32Array
  readonly popularity: Float32Array
  readonly popRecent: Float32Array
  /** 0 (least popular) to 1 (most popular) among the rows that have a popularity score. */
  readonly popRank: Float32Array
  /** 0-1 rank of recent activity relative to total popularity (NaN without both numbers): the "trending" view. */
  readonly trendRank: Float32Array
  readonly genderLean: Float32Array

  private constructor(rows: FeatureRow[]) {
    const n = (this.n = rows.length)
    this.catalogId = new Int32Array(n)
    this.fid = new Int32Array(n)
    this.houseKey = new Array<string>(n)
    this.nameKey = new Array<string>(n)
    this.concKey = new Array<string>(n)
    this.year = new Int32Array(n)
    this.accOff = new Int32Array(n + 1)
    this.noteOff = new Int32Array(n + 1)
    this.accNorm = new Float32Array(n)
    this.noteNorm = new Float32Array(n)
    this.votes = new Float32Array(n * 6).fill(NAN)
    const nan = () => new Float32Array(n).fill(NAN)
    this.longevity = nan()
    this.sillage = nan()
    this.rating = nan()
    this.ratingN = nan()
    this.valueAvg = nan()
    this.valueN = nan()
    this.people = nan()
    this.haveN = nan()
    this.wantN = nan()
    this.popularity = nan()
    this.popRecent = nan()
    this.genderLean = nan()
    this.popRank = new Float32Array(n)
    this.trendRank = new Float32Array(n).fill(NAN)

    const parsedA = rows.map((r) => parseAccords(r.accords))
    const parsedN = rows.map((r) => parseNotes(r.notes))
    const totalA = parsedA.reduce((s, a) => s + a.length, 0)
    const totalN = parsedN.reduce((s, a) => s + a.length, 0)
    this.accIdx = new Int32Array(totalA)
    this.accVal = new Uint8Array(totalA)
    this.noteIdx = new Int32Array(totalN)
    this.noteVal = new Uint8Array(totalN)
    this.noteLayer = new Uint8Array(totalN)

    let ai = 0
    let ni = 0
    for (let i = 0; i < n; i++) {
      const r = rows[i]
      this.catalogId[i] = r.catalogId
      this.fid[i] = r.fid ?? 0
      this.houseKey[i] = r.houseKey
      this.nameKey[i] = r.nameKey
      this.concKey[i] = r.concKey
      this.year[i] = r.year ?? 0
      this.accOff[i] = ai
      let an = 0
      for (const a of parsedA[i]) {
        this.accIdx[ai] = this.idOf(this.accordIds, this.accordNames, a.name)
        this.accVal[ai] = a.strength
        an += (a.strength / 100) ** 2
        ai++
      }
      this.accNorm[i] = Math.sqrt(an)
      this.noteOff[i] = ni
      let nn = 0
      for (const x of parsedN[i]) {
        this.noteIdx[ni] = this.idOf(this.noteIds, this.noteNames, x.name)
        this.noteVal[ni] = x.weight
        this.noteLayer[ni] = LAYER_FROM_CODE.indexOf(x.layer)
        nn += noteFactor(x.weight) ** 2
        ni++
      }
      this.noteNorm[i] = Math.sqrt(nn)
      const v = this.votes
      v[i * 6] = f(r.vWinter)
      v[i * 6 + 1] = f(r.vSpring)
      v[i * 6 + 2] = f(r.vSummer)
      v[i * 6 + 3] = f(r.vFall)
      v[i * 6 + 4] = f(r.vDay)
      v[i * 6 + 5] = f(r.vNight)
      this.longevity[i] = f(r.longevity)
      this.sillage[i] = f(r.sillage)
      this.rating[i] = f(r.rating)
      this.ratingN[i] = f(r.ratingN)
      this.valueAvg[i] = f(r.valueAvg)
      this.valueN[i] = f(r.valueN)
      this.people[i] = f(r.people)
      this.haveN[i] = f(r.haveN)
      this.wantN[i] = f(r.wantN)
      this.popularity[i] = f(r.popularity)
      this.popRecent[i] = f(r.popRecent)
      this.genderLean[i] = f(r.genderLean)
    }
    this.accOff[n] = ai
    this.noteOff[n] = ni

    const order = Array.from({ length: n }, (_, i) => i).filter((i) => this.popularity[i] > 0)
    order.sort((a, b) => this.popularity[a] - this.popularity[b])
    order.forEach((i, rank) => {
      this.popRank[i] = order.length > 1 ? rank / (order.length - 1) : 0.5
    })
    const trend = order.filter((i) => this.popRecent[i] > 0)
    const ratio = (i: number) => this.popRecent[i] / this.popularity[i]
    trend.sort((a, b) => ratio(a) - ratio(b))
    trend.forEach((i, rank) => {
      this.trendRank[i] = trend.length > 1 ? rank / (trend.length - 1) : 0.5
    })
  }

  static fromRows(rows: FeatureRow[]): FeatureIndex {
    return new FeatureIndex(rows)
  }

  private idOf(ids: Map<string, number>, names: string[], name: string): number {
    let id = ids.get(name)
    if (id === undefined) {
      id = names.length
      names.push(name)
      ids.set(name, id)
    }
    return id
  }

  /** Votes for a season, or null when the dataset has none. */
  seasonVotes(i: number): { winter: number; spring: number; summer: number; fall: number; total: number } | null {
    const v = this.votes
    const w = v[i * 6]
    if (Number.isNaN(w)) return null
    const [a, b, c, d] = [v[i * 6], v[i * 6 + 1], v[i * 6 + 2], v[i * 6 + 3]]
    return { winter: a, spring: b, summer: c, fall: d, total: a + b + c + d }
  }

  /** Share (0-1) of the season votes that went to this season, and how many votes there were. */
  seasonShare(i: number, s: Season): { share: number; votes: number } | null {
    const sv = this.seasonVotes(i)
    if (!sv || sv.total <= 0) return null
    return { share: sv[s] / sv.total, votes: sv.total }
  }

  /** Share (0-1) of day vs. night votes that said day, and the vote count. */
  dayShare(i: number): { day: number; votes: number } | null {
    const d = this.votes[i * 6 + 4]
    const nt = this.votes[i * 6 + 5]
    if (Number.isNaN(d) || Number.isNaN(nt) || d + nt <= 0) return null
    return { day: d / (d + nt), votes: d + nt }
  }

  accords(i: number): { name: string; strength: number }[] {
    const out: { name: string; strength: number }[] = []
    for (let k = this.accOff[i]; k < this.accOff[i + 1]; k++) out.push({ name: this.accordNames[this.accIdx[k]], strength: this.accVal[k] })
    return out
  }

  notes(i: number): { name: string; layer: Layer; weight: number }[] {
    const out: { name: string; layer: Layer; weight: number }[] = []
    for (let k = this.noteOff[i]; k < this.noteOff[i + 1]; k++) out.push({ name: this.noteNames[this.noteIdx[k]], layer: LAYER_FROM_CODE[this.noteLayer[k]], weight: this.noteVal[k] })
    return out
  }

  /** The row index of a catalog id (linear; only used for a handful of seeds). */
  indexOfCatalog(catalogId: number): number {
    return this.catalogId.indexOf(catalogId)
  }

  /** Row index by Fragrantica id. */
  indexOfFid(fid: number): number {
    return fid ? this.fid.indexOf(fid) : -1
  }
}

/** Notes with no vote weight count as middling; voted ones count in proportion. */
export const noteFactor = (weight: number): number => (weight > 0 ? weight : 50) / 100
