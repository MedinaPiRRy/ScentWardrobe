import { warmthIndex } from './activities'
import { daysSince } from './engine'
import type { RecContext, RecItem, Recommendation } from './types'

const TIME_WORD = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' } as const

export function temperatureWord(c: number): string {
  if (c >= 30) return 'Hot'
  if (c >= 24) return 'Warm'
  if (c >= 16) return 'Mild'
  if (c >= 8) return 'Cool'
  if (c >= 0) return 'Cold'
  return 'Freezing'
}

export function humidityWord(h: number): string | null {
  if (h >= 70) return 'humid'
  if (h <= 35) return 'dry'
  return null
}

export function projectionWord(p: number): string {
  if (p < 1.6) return 'soft projection'
  if (p < 2.7) return 'moderate projection'
  if (p < 3.5) return 'strong projection'
  return 'very strong projection'
}

function rotationPhrase(days: number | null): string {
  if (days === null) return 'not worn yet'
  if (days === 0) return 'already worn today'
  if (days === 1) return 'worn yesterday'
  if (days <= 3) return `worn ${days} days ago`
  return `not worn in ${days} days`
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/**
 * One sentence in the shape "Cold and dry evening, date night: warm vanilla-amber profile, moderate projection,
 * not worn in 9 days." The first part says what the day is like, the rest says why this fragrance fits.
 */
export function explain(item: RecItem, rec: Pick<Recommendation, 'breakdown'>, ctx: RecContext, tempC: number, humidity: number, tempAssumed: boolean): string {
  const tod = TIME_WORD[ctx.timeOfDay]
  const hum = humidityWord(humidity)
  const day = tempAssumed ? `${tod.charAt(0).toUpperCase()}${tod.slice(1)}` : `${temperatureWord(tempC)}${hum ? ` and ${hum}` : ''} ${tod}`
  const occasion = ctx.activity ? `, ${lower(ctx.activity)}` : ''

  const top = [...item.accords].sort((a, b) => b.strength - a.strength).slice(0, 2).map((a) => a.name.toLowerCase())
  const w = warmthIndex(item.accords)
  const warmth = w >= 0.25 ? 'warm ' : w <= -0.25 ? 'fresh ' : ''
  const profile = top.length === 0 ? 'versatile profile' : `${warmth}${top.join('-')} profile`

  const parts = [profile, projectionWord(item.projection ?? 2.5), rotationPhrase(daysSince(item.lastWornAt, ctx.now))]

  // Mention the weakest weighted component when it is clearly a compromise.
  const weak = rec.breakdown.filter((b) => b.fit !== null && b.fit < 0.3).sort((a, b) => (a.fit ?? 1) - (b.fit ?? 1))[0]
  const caveat = weak ? ` (a compromise on ${weak.key === 'daynight' ? 'time of day' : weak.key})` : ''
  return `${day}${occasion}: ${parts.join(', ')}${caveat}.`
}
