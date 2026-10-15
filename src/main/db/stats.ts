import type { LeaderRow, LowBottleWarning, PriceRow, StatsOverview } from '@shared/types'
import type { Db } from './index'
import { getNumberSetting } from './settings'
import { DEFAULT_LOW_THRESHOLD, localDate } from './wears'

const DAY_MS = 86_400_000
const MIN_WEARS_FOR_LEADERBOARD = 2

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** The last `n` calendar months ending with the current one, oldest first. */
export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) out.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  return out
}

export function daysBetween(fromDate: string, now: Date): number {
  const [y, m, d] = fromDate.slice(0, 10).split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(Math.round((today - then) / DAY_MS), 0)
}

interface PerFragrance {
  id: number
  name: string
  house: string
  wears: number
  last_worn: string | null
  avg_longevity: number | null
  avg_projection: number | null
  compliments: number
  longevity_n: number
  projection_n: number
}

export function computeOverview(db: Db, now = new Date()): StatsOverview {
  const threshold = getNumberSetting(db, 'bottle.lowThreshold', DEFAULT_LOW_THRESHOLD)

  const per = db
    .prepare(
      `SELECT f.id, f.name, f.house, count(w.id) AS wears, max(w.worn_at) AS last_worn,
              avg(w.longevity_hours) AS avg_longevity, avg(w.projection) AS avg_projection, coalesce(sum(w.compliments), 0) AS compliments,
              count(w.longevity_hours) AS longevity_n, count(w.projection) AS projection_n
       FROM fragrances f LEFT JOIN wear_log w ON w.fragrance_id = f.id GROUP BY f.id`
    )
    .all() as PerFragrance[]
  const collectionIds = new Set((db.prepare(`SELECT fragrance_id AS id FROM wardrobe_items WHERE wardrobe = 'collection'`).all() as { id: number }[]).map((r) => r.id))

  const row = (p: PerFragrance, value: number): LeaderRow => ({ id: p.id, name: p.name, house: p.house, value, wears: p.wears })
  const byValueDesc = (a: LeaderRow, b: LeaderRow) => b.value - a.value || b.wears - a.wears || a.name.localeCompare(b.name)
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

  const mostWorn = per.filter((p) => collectionIds.has(p.id) && p.wears > 0).map((p) => row(p, p.wears)).sort(byValueDesc).slice(0, 10)

  const neglected = per
    .filter((p) => collectionIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, house: p.house, daysSinceWorn: p.last_worn ? daysBetween(p.last_worn, now) : null }))
    // Never-worn first, then the longest since last worn.
    .sort((a, b) => (a.daysSinceWorn === null ? 0 : 1) - (b.daysSinceWorn === null ? 0 : 1) || (b.daysSinceWorn ?? 0) - (a.daysSinceWorn ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 10)

  const months = lastMonths(now, 12)
  const wearsByMonth = new Map((db.prepare(`SELECT substr(worn_at, 1, 7) AS m, count(*) AS n FROM wear_log GROUP BY m`).all() as { m: string; n: number }[]).map((r) => [r.m, r.n]))
  const mlByMonth = new Map(
    (db.prepare(`SELECT substr(w.worn_at, 1, 7) AS m, sum(d.ml) AS ml FROM wear_deductions d JOIN wear_log w ON w.id = d.wear_id GROUP BY m`).all() as { m: string; ml: number }[]).map((r) => [r.m, r.ml])
  )
  const perMonth = months.map((m) => ({ month: m, wears: wearsByMonth.get(m) ?? 0, mlUsed: round(mlByMonth.get(m) ?? 0, 1) }))

  const eligible = (n: number) => n >= MIN_WEARS_FOR_LEADERBOARD
  const leaderboards = {
    longevity: per.filter((p) => collectionIds.has(p.id) && eligible(p.longevity_n) && p.avg_longevity != null).map((p) => row(p, round(p.avg_longevity!))).sort(byValueDesc).slice(0, 5),
    projection: per.filter((p) => collectionIds.has(p.id) && eligible(p.projection_n) && p.avg_projection != null).map((p) => row(p, round(p.avg_projection!))).sort(byValueDesc).slice(0, 5),
    compliments: per.filter((p) => collectionIds.has(p.id) && p.compliments > 0).map((p) => row(p, p.compliments)).sort(byValueDesc).slice(0, 5)
  }

  // Money: only bottles with a price count, and cost per wear divides by the wears of that fragrance.
  const priced = db
    .prepare(`SELECT f.id, f.name, f.house, sum(b.price) AS spent FROM bottles b JOIN fragrances f ON f.id = b.fragrance_id WHERE b.price IS NOT NULL AND f.id IN (SELECT fragrance_id FROM wardrobe_items WHERE wardrobe = 'collection') GROUP BY f.id`)
    .all() as { id: number; name: string; house: string; spent: number }[]
  const wearsOf = new Map(per.map((p) => [p.id, p.wears]))
  const costPerWear = priced
    .map((p) => {
      const wears = wearsOf.get(p.id) ?? 0
      return { id: p.id, name: p.name, house: p.house, spent: round(p.spent, 2), wears, costPerWear: wears > 0 ? round(p.spent / wears, 2) : null }
    })
    .sort((a, b) => (a.costPerWear ?? Infinity) - (b.costPerWear ?? Infinity) || a.name.localeCompare(b.name))
  const spent = priced.reduce((s, p) => s + p.spent, 0)
  const pricedWorn = costPerWear.filter((c) => c.wears > 0)
  const wornSpend = pricedWorn.reduce((s, c) => s + c.spent, 0)
  const wornWears = pricedWorn.reduce((s, c) => s + c.wears, 0)

  const ml = db.prepare(`SELECT coalesce(sum(size_ml), 0) AS owned, coalesce(sum(remaining_ml), 0) AS remaining FROM bottles WHERE status = 'active' AND fragrance_id IN (SELECT fragrance_id FROM wardrobe_items WHERE wardrobe = 'collection')`).get() as { owned: number; remaining: number }
  const cutoff = localDate(new Date(now.getTime() - 30 * DAY_MS))
  const wears30 = (db.prepare('SELECT count(*) AS n FROM wear_log WHERE substr(worn_at, 1, 10) >= ?').get(cutoff) as { n: number }).n

  const round2 = (n: number) => Math.round(n * 100) / 100
  const priceRows: PriceRow[] = (
    db
      .prepare(
        `SELECT b.id AS bottleId, f.id AS fragranceId, f.name, f.house, b.size_ml AS sizeMl, b.price AS paid, b.market_price AS market,
                b.market_checked_on AS checkedOn, b.market_source AS source
         FROM bottles b JOIN fragrances f ON f.id = b.fragrance_id
         WHERE (b.price IS NOT NULL OR b.market_price IS NOT NULL) AND f.id IN (SELECT fragrance_id FROM wardrobe_items WHERE wardrobe = 'collection')`
      )
      .all() as { bottleId: number; fragranceId: number; name: string; house: string; sizeMl: number; paid: number | null; market: number | null; checkedOn: string | null; source: string | null }[]
  )
    .map((r) => {
      const both = r.paid != null && r.market != null
      return {
        ...r,
        saved: both ? round2(r.market! - r.paid!) : null,
        savedPercent: both && r.market! > 0 ? round(((r.market! - r.paid!) / r.market!) * 100, 1) : null,
        paidPerMl: r.paid != null ? round2(r.paid / r.sizeMl) : null,
        marketPerMl: r.market != null ? round2(r.market / r.sizeMl) : null
      }
    })
    .sort((a, b) => (b.savedPercent ?? -Infinity) - (a.savedPercent ?? -Infinity) || a.name.localeCompare(b.name))
  const activeMarket = db
    .prepare(`SELECT count(*) AS n, coalesce(sum(market_price), 0) AS total FROM bottles WHERE market_price IS NOT NULL AND status = 'active' AND fragrance_id IN (SELECT fragrance_id FROM wardrobe_items WHERE wardrobe = 'collection')`)
    .get() as { n: number; total: number }
  const compared = priceRows.filter((r) => r.saved != null)

  const lowRows = db
    .prepare(
      `SELECT b.id AS bottleId, f.id AS fragranceId, f.name, b.size_ml, b.remaining_ml, b.ml_per_spray,
              (SELECT avg(sprays) FROM wear_log w WHERE w.fragrance_id = f.id AND w.sprays > 0) AS avg_sprays
       FROM bottles b JOIN fragrances f ON f.id = b.fragrance_id
       WHERE b.status = 'active' AND b.size_ml > 0 AND f.id IN (SELECT fragrance_id FROM wardrobe_items WHERE wardrobe = 'collection') AND b.remaining_ml * 1.0 / b.size_ml < ? ORDER BY b.remaining_ml * 1.0 / b.size_ml`
    )
    .all(threshold) as { bottleId: number; fragranceId: number; name: string; size_ml: number; remaining_ml: number; ml_per_spray: number; avg_sprays: number | null }[]
  const lowBottles: LowBottleWarning[] = lowRows.map((r) => {
    const perWear = (r.avg_sprays && r.avg_sprays > 0 ? r.avg_sprays : 4) * r.ml_per_spray
    return { bottleId: r.bottleId, fragranceId: r.fragranceId, name: r.name, percent: Math.round((r.remaining_ml / r.size_ml) * 100), remainingMl: r.remaining_ml, wearsLeft: perWear > 0 ? Math.floor(r.remaining_ml / perWear) : null }
  })

  return {
    totals: {
      collectionCount: collectionIds.size,
      wears: (db.prepare('SELECT count(*) AS n FROM wear_log').get() as { n: number }).n,
      wearsLast30Days: wears30,
      mlOwned: round(ml.owned, 1),
      mlRemaining: round(ml.remaining, 1),
      totalSpent: round(spent, 2),
      avgCostPerWear: wornWears > 0 ? round(wornSpend / wornWears, 2) : null,
      marketValue: round2(activeMarket.total),
      marketPricedBottles: activeMarket.n,
      paidVsMarket: compared.length > 0 ? round2(-compared.reduce((s, r) => s + r.saved!, 0)) + 0 : null
    },
    mostWorn,
    neglected,
    perMonth,
    leaderboards,
    costPerWear,
    lowBottles,
    priceRows
  }
}
