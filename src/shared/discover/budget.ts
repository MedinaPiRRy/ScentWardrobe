/** What I have paid, as the reference for a budget: nothing here is the price of a fragrance I do not own. */
export interface PricedBottle {
  type: string
  sizeMl: number
  price: number | null
  marketPrice: number | null
}

export interface PriceReference {
  /** How many bottles it is based on, and whether it is from what I paid or market prices I looked up. */
  n: number
  basis: 'paid' | 'market' | 'none'
  /** Price per ml: lower quartile, median, upper quartile (the quartiles equal the median with fewer than 4 bottles). */
  low: number
  mid: number
  high: number
}

const quantile = (sorted: number[], q: number): number => {
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

/** Per-ml prices of my full bottles of at least 30 ml (decants and samples distort per-ml prices), from what I paid, else market prices. */
export function priceReference(bottles: PricedBottle[]): PriceReference {
  const full = bottles.filter((b) => b.type === 'full bottle' && b.sizeMl >= 30)
  const perMl = (get: (b: PricedBottle) => number | null) =>
    full
      .map((b) => get(b))
      .map((p, i) => (p != null && p > 0 ? p / full[i].sizeMl : null))
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b)
  const paid = perMl((b) => b.price)
  const market = perMl((b) => b.marketPrice)
  const [basis, list] = paid.length > 0 ? (['paid', paid] as const) : market.length > 0 ? (['market', market] as const) : (['none', []] as const)
  if (list.length === 0) return { n: 0, basis: 'none', low: 0, mid: 0, high: 0 }
  const mid = quantile([...list], 0.5)
  return { n: list.length, basis, low: list.length >= 4 ? quantile([...list], 0.25) : mid, mid, high: list.length >= 4 ? quantile([...list], 0.75) : mid }
}

export interface CostEstimate {
  sizeMl: number
  low: number
  mid: number
  high: number
}

export const costFor = (ref: PriceReference, sizeMl: number): CostEstimate | null =>
  ref.n === 0 ? null : { sizeMl, low: round2(ref.low * sizeMl), mid: round2(ref.mid * sizeMl), high: round2(ref.high * sizeMl) }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Where a budget stands against what a bottle of that size usually costs me. */
export function budgetVerdict(budget: number, est: CostEstimate | null): { label: string; text: string } {
  if (!est) return { label: 'unknown', text: 'You have not entered prices for your bottles, so there is nothing to compare a budget with. Add what you paid on your bottles.' }
  // With fewer than four priced bottles there is only a middle value: do not claim a range.
  if (est.low === est.mid && est.mid === est.high) {
    if (budget >= est.mid) return { label: 'typical', text: 'Your budget covers what a bottle of this size has cost you per ml (based on very few bottles).' }
    return budget >= est.mid * 0.8 ? { label: 'tight', text: 'Your budget is a little under what you have paid per ml for this size (based on very few bottles).' } : { label: 'below', text: 'This is under what you have paid per ml for a bottle this size: a smaller bottle or a decant is the realistic route.' }
  }
  if (budget >= est.high) return { label: 'comfortable', text: 'Your budget covers a bottle of this size at the top of what you have paid per ml.' }
  if (budget >= est.mid) return { label: 'typical', text: 'Your budget matches a typical bottle of this size for you.' }
  if (budget >= est.low) return { label: 'tight', text: 'Your budget is at the low end of what you have paid per ml for this size: look for a smaller bottle or a sale.' }
  return { label: 'below', text: 'This is under what you have paid per ml for a bottle this size: a smaller bottle or a decant is the realistic route.' }
}

/** What a 10 ml decant costs at my usual price per ml is not the price of a decant (those are sold at a premium): the hint only says it is much less than a bottle. */
export function trialHint(sizeMl: number, est: CostEstimate | null, currency: string): string {
  const base = 'You have no sample or decant of it yet: try it on skin first, for much less than a full bottle.'
  return est ? `${base} At your usual price per ml a ${sizeMl} ml bottle is about ${currency} ${est.mid.toFixed(0)}.` : base
}
