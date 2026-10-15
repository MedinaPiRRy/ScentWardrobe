import { describe, expect, it } from 'vitest'
import type { FragranceInput } from '@shared/types'
import {
  addBottle, addJournal, createFragrance, deleteFragrance, deleteJournal, markBottleEmpty, ownedWithNote,
  setRating, updateBottle, updateFragrance, updateJournal
} from './editing'
import { openDatabase } from './index'
import { getFragrance, listFragrances } from './repo'
import { seedSampleData } from './seed'

const input = (o: Partial<FragranceInput> = {}): FragranceInput => ({
  name: 'Test Scent', house: 'Test House', year: 2020, concentration: 'EDP',
  notes: [{ name: 'Bergamot', layer: 'top' }, { name: 'Cedar', layer: 'base' }],
  accords: [{ name: 'citrus', color: '#ffee00', strength: 90 }, { name: 'woody', strength: 60 }],
  community: { winter: 1, spring: 2, summer: 3, fall: 4, day: 5, night: 6, longevity: 3, sillage: 2 },
  ...o
})
const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  expect(r.ok, JSON.stringify(r)).toBe(true)
  return (r as unknown as { data: T }).data
}

describe('create / update / delete', () => {
  it('creates a fragrance with relations and places it', () => {
    const db = openDatabase(':memory:')
    const s = ok<{ id: number; wardrobe: string }>(
      createFragrance(db, input(), { to: 'collection', bottle: { type: 'full bottle', sizeMl: 50, remainingMl: 30 } })
    )
    expect(s.wardrobe).toBe('collection')
    const d = getFragrance(db, s.id)!
    expect(d.notes.map((n) => n.name).sort()).toEqual(['Bergamot', 'Cedar'])
    expect(d.accords[0]).toMatchObject({ name: 'citrus', strength: 90, color: '#ffee00' })
    expect(d.bottles[0].remainingMl).toBe(30)
    expect(d.community?.summer).toBe(3)
  })

  it('rolls everything back when the placement rule fails', () => {
    const db = openDatabase(':memory:')
    const r = createFragrance(db, input(), { to: 'wishlist', impression: '  ' })
    expect(r).toMatchObject({ ok: false, code: 'WISHLIST_IMPRESSION_REQUIRED' })
    expect(listFragrances(db)).toHaveLength(0)
  })

  it('rejects duplicates and invalid input', () => {
    const db = openDatabase(':memory:')
    ok(createFragrance(db, input(), { to: 'to_try' }))
    expect(createFragrance(db, input(), { to: 'to_try' })).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(createFragrance(db, input({ name: ' ' }), { to: 'to_try' })).toMatchObject({ ok: false, code: 'INVALID' })
    expect(createFragrance(db, input({ name: 'X', accords: [{ name: 'a', strength: 140 }] }), { to: 'to_try' })).toMatchObject({ ok: false, code: 'INVALID' })
  })

  it('updates fields and replaces relations', () => {
    const db = openDatabase(':memory:')
    const { id } = ok<{ id: number }>(createFragrance(db, input(), { to: 'to_try' }))
    ok(updateFragrance(db, id, input({ house: 'New House', notes: [{ name: 'Vanilla', layer: 'general' }], accords: [], community: null })))
    const d = getFragrance(db, id)!
    expect(d.house).toBe('New House')
    expect(d.notes.map((n) => n.name)).toEqual(['Vanilla'])
    expect(d.accords).toEqual([])
    expect(d.community).toBeNull()
  })

  it('deletes a wishlisted fragrance with its history', () => {
    const db = openDatabase(':memory:')
    const { id } = ok<{ id: number }>(createFragrance(db, input(), { to: 'wishlist', impression: 'Fresh.' }))
    addJournal(db, id, 'note')
    ok(deleteFragrance(db, id))
    expect(listFragrances(db)).toHaveLength(0)
    expect(db.prepare('SELECT count(*) AS c FROM personal_notes').get()).toEqual({ c: 0 })
  })
})

describe('rating, journal, bottles', () => {
  const setup = () => {
    const db = openDatabase(':memory:')
    const { id } = ok<{ id: number }>(createFragrance(db, input(), { to: 'collection', bottle: { type: 'full bottle', sizeMl: 100 } }))
    return { db, id }
  }

  it('validates ratings', () => {
    const { db, id } = setup()
    ok(setRating(db, id, 8))
    expect(getFragrance(db, id)!.rating).toBe(8)
    expect(setRating(db, id, 11)).toMatchObject({ ok: false, code: 'INVALID' })
    ok(setRating(db, id, null))
    expect(getFragrance(db, id)!.rating).toBeNull()
  })

  it('adds, edits and deletes journal entries', () => {
    const { db, id } = setup()
    ok(addJournal(db, id, 'first'))
    expect(addJournal(db, id, '  ')).toMatchObject({ ok: false })
    const e = getFragrance(db, id)!.journal[0]
    ok(updateJournal(db, e.id, 'edited'))
    expect(getFragrance(db, id)!.journal[0].text).toBe('edited')
    ok(deleteJournal(db, e.id))
    expect(getFragrance(db, id)!.journal).toHaveLength(0)
  })

  it('manages several bottles and marks one empty', () => {
    const { db, id } = setup()
    ok(addBottle(db, id, { type: 'decant', sizeMl: 10, price: 12.5, boughtAt: 'Shop' }))
    expect(addBottle(db, id, { type: 'decant', sizeMl: 0 })).toMatchObject({ ok: false, code: 'INVALID' })
    expect(addBottle(db, id, { type: 'decant', sizeMl: 10, remainingMl: 11 })).toMatchObject({ ok: false, code: 'INVALID' })
    let d = getFragrance(db, id)!
    expect(d.bottles).toHaveLength(2)
    expect(d.activeBottleCount).toBe(2)
    ok(updateBottle(db, d.bottles[1].id, { type: 'decant', sizeMl: 10, remainingMl: 4, mlPerSpray: 0.12 }))
    ok(markBottleEmpty(db, d.bottles[0].id))
    d = getFragrance(db, id)!
    expect(d.bottles[1]).toMatchObject({ remainingMl: 4, mlPerSpray: 0.12 })
    expect(d.bottles[0]).toMatchObject({ status: 'empty', remainingMl: 0 })
    expect(d.activeBottleCount).toBe(1)
  })
})

describe('note cross-reference and performance', () => {
  it('finds other owned fragrances sharing a note', () => {
    const db = openDatabase(':memory:')
    seedSampleData(db)
    const cedar = db.prepare("SELECT id FROM notes WHERE name = 'Cedar'").get() as { id: number }
    const bleu = listFragrances(db).find((f) => f.name === 'Bleu de Chanel')!
    const names = ownedWithNote(db, cedar.id, bleu.id).map((f) => f.name)
    expect(names).toContain('Sauvage')
    expect(names).not.toContain('Bleu de Chanel')
    expect(names).not.toContain('Aventus') // wishlist, not owned
  })

  it('summarises logged wears', () => {
    const db = openDatabase(':memory:')
    seedSampleData(db)
    const s = listFragrances(db).find((f) => f.name === 'Sauvage')!
    const p = getFragrance(db, s.id)!.performance
    expect(p.wearCount).toBe(7)
    expect(p.avgProjection).toBeGreaterThan(1)
    expect(p.series.length).toBe(7)
    const none = getFragrance(db, listFragrances(db).find((f) => f.name === 'Light Blue')!.id)!.performance
    expect(none).toMatchObject({ wearCount: 0, avgProjection: null, avgLongevity: null })
  })
})
