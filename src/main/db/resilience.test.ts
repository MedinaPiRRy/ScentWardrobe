import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openDatabase } from './index'

const dir = mkdtempSync(join(tmpdir(), 'scent-res-'))
afterAll(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

describe('opening a bad database file', () => {
  it('refuses a file that is not a database, without touching it', () => {
    const p = join(dir, 'garbage.db')
    writeFileSync(p, 'this is definitely not a sqlite database file '.repeat(50))
    expect(() => openDatabase(p)).toThrow(/not a database|malformed|encrypted/i)
  })
  it('refuses a database from a newer version of the app instead of downgrading it', () => {
    const p = join(dir, 'newer.db')
    const db = openDatabase(p)
    db.pragma('user_version = 999')
    db.close()
    expect(() => openDatabase(p)).toThrow(/newer version/)
  })
  it('creates a new database when the file is missing', () => {
    const db = openDatabase(join(dir, 'fresh.db'))
    expect((db.prepare('SELECT count(*) AS c FROM fragrances').get() as { c: number }).c).toBe(0)
    db.close()
  })
})
