import { describe, expect, it } from 'vitest'
import type { MemberItem } from '@shared/types'
import { openDatabase } from '../db'
import { createFragrance, setImpression } from '../db/editing'
import { getFragrance, listFragrances } from '../db/repo'
import { runMemberImport } from './memberRun'

const item = (list: MemberItem['list'], house: string, name: string, id: number | null = null): MemberItem => ({
  list,
  url: id ? `https://www.fragrantica.com/perfume/${house.replace(/ /g, '-')}/${name.replace(/ /g, '-')}-${id}.html` : null,
  fragranticaId: id,
  house,
  name
})

const where = (db: ReturnType<typeof openDatabase>, name: string) => listFragrances(db).find((f) => f.name === name)!

describe('runMemberImport', () => {
  it('puts each list in its wardrobe, and lets a wishlist item in without a note', async () => {
    const db = openDatabase(':memory:')
    const r = await runMemberImport(db, [item('have', 'Dior', 'Homme'), item('want', 'Byredo', 'Gypsy Water'), item('had', 'Versace', 'Eros'), item('shelf', 'French Avenue', 'Liquid Brun')], { fetchPage: null })
    expect(r.failed).toEqual([])
    expect(r.skipped).toBe(0)
    expect(Object.fromEntries(r.added.map((a) => [a.wardrobe, a.count]))).toEqual({ collection: 1, wishlist: 1, had: 1, to_try: 1 })
    expect(where(db, 'Homme').wardrobe).toBe('collection')
    expect(where(db, 'Liquid Brun').wardrobe).toBe('to_try')
    const wish = where(db, 'Gypsy Water')
    expect(wish).toMatchObject({ wardrobe: 'wishlist', importedPending: true })
    // The collection entry has a placeholder bottle so it can sit on the shelf.
    expect(getFragrance(db, where(db, 'Homme').id)!.bottles).toHaveLength(1)
  })

  it('stops needing the note once one is written, and the rule applies to it again', async () => {
    const db = openDatabase(':memory:')
    await runMemberImport(db, [item('want', 'Byredo', 'Gypsy Water')], { fetchPage: null })
    const id = where(db, 'Gypsy Water').id
    expect(setImpression(db, id, 'soft and woody').ok).toBe(true)
    expect(where(db, 'Gypsy Water').importedPending).toBe(false)
    expect(setImpression(db, id, '').ok).toBe(false)
  })

  it('skips what already exists and does not add the same fragrance twice', async () => {
    const db = openDatabase(':memory:')
    createFragrance(db, { name: 'Homme', house: 'Dior', notes: [], accords: [] }, { to: 'collection', bottle: { type: 'full bottle', sizeMl: 50 } })
    const r = await runMemberImport(db, [item('have', 'Dior', 'Homme'), item('want', 'Byredo', 'Gypsy Water'), item('shelf', 'Byredo', 'Gypsy Water')], { fetchPage: null })
    expect(r.skipped).toBe(2)
    expect(listFragrances(db)).toHaveLength(2)
    // Running it again adds nothing.
    const again = await runMemberImport(db, [item('have', 'Dior', 'Homme'), item('want', 'Byredo', 'Gypsy Water')], { fetchPage: null })
    expect(again.added).toEqual([])
    expect(again.skipped).toBe(2)
  })

  it('uses the page details when they can be read, and falls back to the name when not', async () => {
    const db = openDatabase(':memory:')
    const fetched: string[] = []
    const r = await runMemberImport(db, [item('have', 'Dior', 'Sauvage', 31861), item('want', 'Byredo', 'Gypsy Water', 1234)], {
      fetchPage: async (url) => {
        fetched.push(url)
        return url.includes('31861')
          ? { ok: true, data: { warnings: [], input: { name: 'Sauvage', house: 'Dior', year: 2015, notes: [{ name: 'bergamot', layer: 'top' }], accords: [{ name: 'fresh', strength: 90 }] } } }
          : { ok: false, code: 'NETWORK', message: 'nope' }
      }
    })
    expect(fetched).toHaveLength(2)
    expect(r.withoutDetails).toBe(1)
    const sauvage = getFragrance(db, where(db, 'Sauvage').id)!
    expect(sauvage.year).toBe(2015)
    expect(sauvage.notes.map((n) => n.name)).toEqual(['bergamot'])
    expect(sauvage.sourceUrl).toContain('31861')
    expect(where(db, 'Gypsy Water').wardrobe).toBe('wishlist')
  })

  it('does not read pages when details are off', async () => {
    const db = openDatabase(':memory:')
    let calls = 0
    await runMemberImport(db, [item('have', 'Dior', 'Sauvage', 31861)], { fetchPage: null, onProgress: () => calls++ })
    expect(calls).toBeGreaterThan(0)
    expect(where(db, 'Sauvage').wardrobe).toBe('collection')
  })

  it('can be cancelled between items, keeping what was added', async () => {
    const db = openDatabase(':memory:')
    let n = 0
    const r = await runMemberImport(db, [item('have', 'A', 'One'), item('have', 'A', 'Two'), item('have', 'A', 'Three')], { fetchPage: null, cancelled: () => n++ >= 1 })
    expect(r.cancelled).toBe(true)
    expect(listFragrances(db)).toHaveLength(1)
  })

  it('reports a clash instead of failing the whole import', async () => {
    const db = openDatabase(':memory:')
    // Same identity once the page gives the concentration back, but a different list name.
    createFragrance(db, { name: 'Intense', house: 'Armani', concentration: 'EDP', notes: [], accords: [] }, { to: 'to_try' })
    const r = await runMemberImport(db, [item('have', 'Armani', 'Other'), item('have', 'Armani', 'Another', 7)], {
      fetchPage: async () => ({ ok: true, data: { warnings: [], input: { name: 'Intense', house: 'Armani', concentration: 'EDP', notes: [], accords: [] } } })
    })
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0].message).toMatch(/already have/i)
    expect(r.added.reduce((s, a) => s + a.count, 0)).toBe(1)
  })
})
