import { beforeEach, describe, expect, it } from 'vitest'
import { cToF, formatTemperature, fToC, weatherCodeToCondition } from '@shared/weather'
import { clearWeatherCache, currentWeather, parseCurrent, parseGeocoding, searchCities, type FetchLike } from './weatherCore'

const reply = (body: unknown, ok = true, status = 200): FetchLike => async () => ({ ok, status, json: async () => body })

// Shapes copied from real Open-Meteo responses
const GEO = {
  results: [
    { id: 2950159, name: 'Berlin', latitude: 52.52437, longitude: 13.41053, country: 'Germany', admin1: 'Berlin' },
    { id: 4517009, name: 'Berlin', latitude: 39.79123, longitude: -75.0, country: 'United States', admin1: 'New Jersey' },
    { id: 1, name: 'Nowhere' }
  ]
}
const FORECAST = { latitude: 52.52, longitude: 13.41, current: { time: '2026-10-12T14:00', interval: 900, temperature_2m: 14.26, relative_humidity_2m: 71, weather_code: 61 } }

describe('weather codes', () => {
  it('maps WMO codes to wear-log conditions', () => {
    expect([0, 1, 3, 45, 53, 63, 81, 73, 86, 95, 99, 4].map(weatherCodeToCondition)).toEqual(['Clear', 'Partly cloudy', 'Cloudy', 'Fog', 'Drizzle', 'Rain', 'Rain', 'Snow', 'Snow', 'Thunderstorm', 'Thunderstorm', 'Cloudy'])
  })
  it('converts and formats temperatures', () => {
    expect(cToF(0)).toBe(32)
    expect(cToF(100)).toBe(212)
    expect(fToC(cToF(21.5))).toBeCloseTo(21.5)
    expect(formatTemperature(21.4, 'C')).toBe('21 °C')
    expect(formatTemperature(21.4, 'F')).toBe('71 °F')
  })
})

describe('geocoding', () => {
  it('parses results with a readable label and drops incomplete ones', () => {
    const r = parseGeocoding(GEO)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual({ label: 'Berlin, Germany', detail: 'Berlin, Germany', latitude: 52.52437, longitude: 13.41053 })
    expect(r[1].detail).toBe('Berlin, New Jersey, United States')
  })
  it('handles no results and junk', () => {
    expect(parseGeocoding({})).toEqual([])
    expect(parseGeocoding(null)).toEqual([])
  })
  it('searches only for real queries and reports failures', async () => {
    expect(await searchCities(' b ', reply(GEO))).toEqual([])
    expect(await searchCities('Berlin', reply(GEO))).toHaveLength(2)
    await expect(searchCities('Berlin', reply({}, false, 503))).rejects.toThrow(/503/)
  })
  it('puts the query in the request', async () => {
    let url = ''
    await searchCities('São Paulo', async (u) => ((url = u), { ok: true, status: 200, json: async () => ({}) }))
    expect(url).toContain('name=S%C3%A3o%20Paulo')
  })
})

describe('current weather', () => {
  beforeEach(() => clearWeatherCache())
  const loc = { label: 'Berlin', latitude: 52.52, longitude: 13.41 }

  it('parses temperature, humidity and condition', () => {
    expect(parseCurrent(FORECAST, 'Berlin')).toEqual({ temperatureC: 14.3, humidity: 71, condition: 'Rain', observedAt: '2026-10-12T14:00', location: 'Berlin' })
    expect(parseCurrent({}, 'x')).toBeNull()
    expect(parseCurrent({ current: { temperature_2m: 20 } }, 'x')?.humidity).toBe(50) // missing humidity: neutral
  })

  it('asks for the right fields and caches for ten minutes', async () => {
    let calls = 0
    let url = ''
    const f: FetchLike = async (u) => ((calls++, (url = u)), { ok: true, status: 200, json: async () => FORECAST })
    const t0 = 1_000_000
    const a = await currentWeather(loc, f, t0)
    await currentWeather(loc, f, t0 + 5 * 60_000)
    expect(calls).toBe(1)
    await currentWeather(loc, f, t0 + 11 * 60_000)
    expect(calls).toBe(2)
    expect(a.temperatureC).toBe(14.3)
    expect(url).toContain('latitude=52.52')
    expect(url).toContain('current=temperature_2m,relative_humidity_2m,weather_code')
  })

  it('throws readable errors when the service fails or answers oddly', async () => {
    await expect(currentWeather(loc, reply({}, false, 500), 1)).rejects.toThrow(/500/)
    await expect(currentWeather(loc, reply({ nonsense: true }), 2)).rejects.toThrow(/unexpected/)
    await expect(currentWeather(loc, async () => { throw new Error('offline') }, 3)).rejects.toThrow(/offline/)
  })
})
