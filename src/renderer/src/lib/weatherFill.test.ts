import { describe, expect, it } from 'vitest'
import { liveWeatherFields, shouldFetchLiveWeather, storedTempToText, typedTempToC } from './weatherFill'

describe('when to look up live weather', () => {
  const base = { editing: false, day: '2026-10-30', today: '2026-10-30', prefilled: false }
  it('does for a new wear today', () => expect(shouldFetchLiveWeather(base)).toBe(true))
  it('does not for a past or future day, an edit, or when weather was supplied', () => {
    expect(shouldFetchLiveWeather({ ...base, day: '2026-10-29' })).toBe(false)
    expect(shouldFetchLiveWeather({ ...base, day: '2026-10-31' })).toBe(false)
    expect(shouldFetchLiveWeather({ ...base, editing: true })).toBe(false)
    expect(shouldFetchLiveWeather({ ...base, prefilled: true })).toBe(false)
  })
})

describe('weather field text', () => {
  const reading = { temperatureC: 21.6, humidity: 55.4, condition: 'Partly cloudy' }
  it('fills in Celsius', () => expect(liveWeatherFields(reading, 'C')).toEqual({ temp: '22', humidity: '55', weather: 'Partly cloudy' }))
  it('fills in Fahrenheit for people who chose it', () => expect(liveWeatherFields(reading, 'F')).toEqual({ temp: '71', humidity: '55', weather: 'Partly cloudy' }))
  it('keeps humidity within 0-100', () => {
    expect(liveWeatherFields({ ...reading, humidity: 140 }, 'C').humidity).toBe('100')
    expect(liveWeatherFields({ ...reading, humidity: -3 }, 'C').humidity).toBe('0')
  })
  it('converts what was typed back to Celsius, and reads blanks and decimal commas', () => {
    expect(typedTempToC('68', 'F')).toBe(20)
    expect(typedTempToC('20,5', 'C')).toBe(20.5)
    expect(typedTempToC('', 'C')).toBeNull()
    expect(typedTempToC('warm', 'F')).toBeNull()
    expect(typedTempToC('32', 'F')).toBe(0)
  })
  it('shows stored Celsius values in the chosen unit', () => {
    expect(storedTempToText(20, 'C')).toBe('20')
    expect(storedTempToText(20, 'F')).toBe('68')
    expect(storedTempToText(null, 'F')).toBe('')
  })
})
