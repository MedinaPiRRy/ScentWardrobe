import { net } from 'electron'
import type { GeoResult, SavedLocation, WeatherReading } from '@shared/types'
import { currentWeather as currentCore, searchCities as searchCore, type FetchLike } from './weatherCore'

const TIMEOUT_MS = 8000

/** Plain `fetch` through Electron's network stack with a timeout. */
const electronFetch: FetchLike = async (url) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await net.fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export const searchCities = (query: string): Promise<GeoResult[]> => searchCore(query, electronFetch)
export const currentWeather = (loc: SavedLocation): Promise<WeatherReading> => currentCore(loc, electronFetch)
