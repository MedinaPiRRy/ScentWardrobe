import type { WeatherReading } from '@shared/types'
import { cToF, fToC, type TempUnit } from '@shared/weather'

/** Whether the wear form should look up the live weather: only for a new wear dated today, and only if nothing was supplied. */
export function shouldFetchLiveWeather(o: { editing: boolean; day: string; today: string; prefilled: boolean }): boolean {
  return !o.editing && !o.prefilled && o.day === o.today
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** A live reading as the text for the three weather fields, in the person's own temperature unit. */
export function liveWeatherFields(r: Pick<WeatherReading, 'temperatureC' | 'humidity' | 'condition'>, unit: TempUnit): { temp: string; humidity: string; weather: string } {
  const t = unit === 'F' ? cToF(r.temperatureC) : r.temperatureC
  return { temp: String(Math.round(t)), humidity: String(Math.round(Math.min(Math.max(r.humidity, 0), 100))), weather: r.condition }
}

/** The number typed in the temperature box, converted back to Celsius for storage; null when blank or not a number. */
export function typedTempToC(text: string, unit: TempUnit): number | null {
  const v = parseFloat(text.replace(',', '.'))
  if (text.trim() === '' || !Number.isFinite(v)) return null
  return round1(unit === 'F' ? fToC(v) : v)
}

/** A stored Celsius value as the text for the temperature box. */
export function storedTempToText(c: number | null | undefined, unit: TempUnit): string {
  if (c == null) return ''
  return String(unit === 'F' ? Math.round(cToF(c)) : c)
}
