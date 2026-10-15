import type { Result } from '@shared/types'
import type { Db } from './index'
import { AppError, toResult } from './repo'

export const DEFAULT_ACTIVITIES = ['Office / work', 'Gym', 'Casual day', 'Date night', 'Night out', 'Formal event', 'Wedding', 'Staying home', 'Travel']
const CUSTOM_ACTIVITIES_KEY = 'activities.custom'

export function getSetting(db: Db, key: string): string | null {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return r?.value ?? null
}

export function getNumberSetting(db: Db, key: string, fallback: number): number {
  const v = getSetting(db, key)
  const n = v == null ? NaN : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

export function setSetting(db: Db, key: string, value: string): Result<null> {
  return toResult(() => {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
    return null
  })
}

function customActivities(db: Db): string[] {
  try {
    const parsed = JSON.parse(getSetting(db, CUSTOM_ACTIVITIES_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const listActivities = (db: Db): string[] => [...DEFAULT_ACTIVITIES, ...customActivities(db)]

export function addActivity(db: Db, name: string): Result<string[]> {
  return toResult(() => {
    const n = name.trim()
    if (!n) throw new AppError('INVALID', 'Give the activity a name.')
    if (n.length > 40) throw new AppError('INVALID', 'Keep the name under 40 characters.')
    const all = listActivities(db)
    if (!all.some((a) => a.toLowerCase() === n.toLowerCase())) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(CUSTOM_ACTIVITIES_KEY, JSON.stringify([...customActivities(db), n]))
    }
    return listActivities(db)
  })
}
