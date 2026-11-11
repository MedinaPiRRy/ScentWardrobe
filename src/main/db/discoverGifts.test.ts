import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { addToGiftList, deleteGiftList, giftListCsv, listGiftLists, removeFromGiftList, resultsCsv } from './discoverGifts'

const item = (n: number) => ({ key: `d:${n}`, name: `Fragrance ${n}`, house: 'House', note: null })

describe('gift lists', () => {
  it('creates a list by name, remembers the description, adds and removes fragrances', () => {
    const db = openDatabase(':memory:')
    const persona = { lifestyle: 'office', experience: 'new' }
    const r = addToGiftList(db, { name: '  Mum, birthday ', persona, item: item(1) })
    expect(r.ok && r.data).toHaveLength(1)
    const list = listGiftLists(db)[0]
    expect(list).toMatchObject({ name: 'Mum, birthday', persona })
    expect(list.items).toEqual([{ key: 'd:1', name: 'Fragrance 1', house: 'House', note: null }])
    addToGiftList(db, { name: 'Mum, birthday', item: item(2) })
    addToGiftList(db, { name: 'Mum, birthday', item: item(2) }) // the same one twice is one
    expect(listGiftLists(db)[0].items.map((i) => i.key)).toEqual(['d:1', 'd:2'])
    // adding without a description keeps the one it has
    expect(listGiftLists(db)[0].persona).toEqual(persona)
    const rm = removeFromGiftList(db, list.id, 'd:1')
    expect(rm.ok && rm.data[0].items.map((i) => i.key)).toEqual(['d:2'])
    const del = deleteGiftList(db, list.id)
    expect(del.ok && del.data).toEqual([])
    expect((db.prepare('SELECT count(*) AS c FROM discover_gift_items').get() as { c: number }).c).toBe(0)
  })
  it('needs a name and holds up to 100 fragrances', () => {
    const db = openDatabase(':memory:')
    expect(addToGiftList(db, { name: '   ' }).ok).toBe(false)
    for (let i = 0; i < 100; i++) addToGiftList(db, { name: 'Big', item: item(i) })
    const r = addToGiftList(db, { name: 'Big', item: item(500) })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toMatch(/up to 100/)
  })
})

describe('CSV of results and gift lists', () => {
  it('has a header, one row per result and neutralises anything that could run as a formula', () => {
    const { csv, rows } = resultsCsv('For you', [
      { name: '=HYPERLINK("http://x")', house: '+cmd', year: 2020, concentration: 'EDP', score: 71, reasons: ['shares citrus with A', 'rated 4.40/5'], inWardrobes: ['Wishlist'], sourceUrl: 'https://www.fragrantica.com/perfume/X/Y-1.html' },
      { name: 'Plain, with comma', house: 'H "q"', sourceUrl: 'https://evil.example/x' }
    ])
    expect(rows).toBe(2)
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('Scent Wardrobe: For you')
    expect(lines[1]).toBe('Name,House,Year,Concentration,Score,Why,Already in my,Fragrantica page')
    expect(lines[2]).toBe("'=HYPERLINK(\"\"http://x\"\")\",'+cmd,2020,EDP,71,shares citrus with A | rated 4.40/5,Wishlist,https://www.fragrantica.com/perfume/X/Y-1.html".replace("'=HYPERLINK", "\"'=HYPERLINK"))
    expect(lines[3]).toBe('"Plain, with comma","H ""q""",,,,,,') // a page that is not Fragrantica is not written
  })
  it('writes at most 500 rows and ignores values of the wrong type', () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ name: `N${i}`, house: 'H' }))
    expect(resultsCsv('x', many).rows).toBe(500)
    const odd = resultsCsv('x', [{ name: 5 as never, house: null as never, reasons: 'no' as never, year: 'x' as never }])
    expect(odd.csv.trim().split('\r\n')[2]).toBe(',,,,,,,')
  })
  it('lists a gift list with its notes', () => {
    const db = openDatabase(':memory:')
    addToGiftList(db, { name: 'Dad', item: { key: 'k', name: 'Cologne', house: 'Old House', note: 'he liked this one' } })
    expect(giftListCsv(listGiftLists(db)[0]).trim().split('\r\n')).toEqual(['Gift list: Dad', 'Name,House,Note', 'Cologne,Old House,he liked this one'])
  })
})
