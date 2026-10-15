/** WMO weather interpretation codes, as returned by Open-Meteo, mapped onto the conditions used in the wear log. */
export function weatherCodeToCondition(code: number): string {
  if (code === 0) return 'Clear'
  if (code === 1 || code === 2) return 'Partly cloudy'
  if (code === 3) return 'Cloudy'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'Rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snow'
  if (code >= 95) return 'Thunderstorm'
  return 'Cloudy'
}

export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9

export type TempUnit = 'C' | 'F'

export function formatTemperature(c: number, unit: TempUnit): string {
  return unit === 'F' ? `${Math.round(cToF(c))} °F` : `${Math.round(c)} °C`
}
