import { useEffect, useState } from 'react'
import type { Bottle } from '@shared/types'

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'JPY', 'MXN', 'BRL', 'INR', 'AED', 'SAR', 'TRY'] as const
export const DEFAULT_CURRENCY = 'USD'
const SETTING = 'ui.currency'
const EVENT = 'scent:currency-changed'

/** Formats an amount in the given ISO currency code; falls back to "12.50 XYZ" for a code the runtime does not know. */
export function formatMoney(n: number, currency: string = DEFAULT_CURRENCY): string {
  // Round to cents first and drop a negative zero, so -0.001 does not show up as "-$0.00".
  n = Math.round(n * 100) / 100 + 0
  try {
    return n.toLocaleString(undefined, { style: 'currency', currency, maximumFractionDigits: 2 })
  } catch {
    return `${n.toFixed(2)} ${currency}`
  }
}

export const isCurrencyCode = (c: string): boolean => /^[A-Z]{3}$/.test(c)

/** The saved currency, kept up to date when Settings changes it. */
export function useCurrency(): string {
  const [c, setC] = useState(DEFAULT_CURRENCY)
  useEffect(() => {
    let live = true
    void window.api.settings.get(SETTING).then((v) => live && v && isCurrencyCode(v) && setC(v))
    const on = (e: Event) => setC((e as CustomEvent<string>).detail)
    window.addEventListener(EVENT, on)
    return () => {
      live = false
      window.removeEventListener(EVENT, on)
    }
  }, [])
  return c
}

export async function saveCurrency(code: string): Promise<boolean> {
  const r = await window.api.settings.set(SETTING, code)
  if (r.ok) window.dispatchEvent(new CustomEvent(EVENT, { detail: code }))
  return r.ok
}

export interface PriceComparison {
  paid: number | null
  market: number | null
  /** market - paid; positive = saved, negative = overpaid. Null unless both prices exist. */
  saved: number | null
  savedPercent: number | null
  paidPerMl: number | null
  marketPerMl: number | null
}

export function compareBottle(b: Pick<Bottle, 'price' | 'marketPrice' | 'sizeMl'>): PriceComparison {
  const paid = b.price
  const market = b.marketPrice
  const both = paid != null && market != null
  return {
    paid,
    market,
    saved: both ? Math.round((market - paid) * 100) / 100 + 0 : null,
    savedPercent: both && market > 0 ? Math.round(((market - paid) / market) * 1000) / 10 + 0 : null,
    paidPerMl: paid != null && b.sizeMl > 0 ? Math.round((paid / b.sizeMl) * 100) / 100 : null,
    marketPerMl: market != null && b.sizeMl > 0 ? Math.round((market / b.sizeMl) * 100) / 100 : null
  }
}
