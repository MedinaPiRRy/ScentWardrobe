import type { GeoResult, SavedLocation, WeatherReading } from '@shared/types'
import { weatherCodeToCondition } from '@shared/weather'

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const GEOCODING = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const CACHE_MS = 10 * 60 * 1000

interface GeoJson {
  results?: { name: string; latitude: number; longitude: number; country?: string; admin1?: string }[]
}

export function parseGeocoding(json: unknown): GeoResult[] {
  const results = (json as GeoJson)?.results ?? []
  return results
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number' && r.name)
    .map((r) => {
      const detail = [r.name, r.admin1, r.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ')
      return { label: detail, detail, latitude: r.latitude, longitude: r.longitude }
    })
}

interface ForecastJson {
  current?: { time?: string; temperature_2m?: number; relative_humidity_2m?: number; weather_code?: number }
}

export function parseCurrent(json: unknown, location: string): WeatherReading | null {
  const c = (json as ForecastJson)?.current
  if (!c || typeof c.temperature_2m !== 'number') return null
  return {
    temperatureC: Math.round(c.temperature_2m * 10) / 10,
    humidity: typeof c.relative_humidity_2m === 'number' ? Math.round(c.relative_humidity_2m) : 50,
    condition: weatherCodeToCondition(c.weather_code ?? 3),
    observedAt: c.time ?? new Date().toISOString(),
    location
  }
}

export async function searchCities(query: string, fetcher: FetchLike): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const res = await fetcher(`${GEOCODING}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`)
  if (!res.ok) throw new Error(`The location search failed (${res.status}).`)
  return parseGeocoding(await res.json())
}

const cache = new Map<string, { at: number; reading: WeatherReading }>()

export async function currentWeather(loc: SavedLocation, fetcher: FetchLike, now = Date.now()): Promise<WeatherReading> {
  const key = `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.reading
  const url = `${FORECAST}?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`
  const res = await fetcher(url)
  if (!res.ok) throw new Error(`The weather service answered ${res.status}.`)
  const reading = parseCurrent(await res.json(), loc.label)
  if (!reading) throw new Error('The weather service sent an unexpected answer.')
  cache.set(key, { at: now, reading })
  return reading
}

export const clearWeatherCache = () => cache.clear()
