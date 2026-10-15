import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { createFragrance } from '../db/editing'
import { clearDataset, datasetCount, datasetEntry, previewImport, runImport, searchLocal } from './catalog'
import { suggestMapping } from './mapping'
import { openSource } from './sources'

const CSV = [
  'url;Perfume;Brand;Gender;Year;Top;Middle;Base;Perfumer1;mainaccord1;mainaccord2',
  'https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html;sauvage-dior;dior;for men;2015;"Bergamot, Pepper";Lavender;Ambroxan;François Demachy;fresh spicy;amber',
  'https://www.fragrantica.com/perfume/Creed/Aventus-9828.html;aventus-creed;creed;for men;2010;"Bergamot, Apple";Birch;Musk;Olivier Creed;fruity;woody',
  ';;;;;;;;;;', // blank row
  'https://x/y;tihota-indult;indult;unisex;2016;Rose;Vanilla;Sandalwood;Unknown;sweet;woody'
].join('\n')

const tmpFile = (name: string, content: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'scent-'))
  const p = join(dir, name)
  writeFileSync(p, content)
  return p
}

describe('dataset import', () => {
  it('reads a semicolon CSV and previews mapped rows', () => {
    const p = tmpFile('fra.csv', CSV)
    const src = openSource(p)
    const mapping = suggestMapping(src.columns)
    const prev = previewImport(p, null, mapping)
    expect(prev.total).toBe(4)
    expect(prev.skipped).toBe(1)
    expect(prev.entries.map((e) => `${e.name} / ${e.house}`)).toEqual(['Sauvage / Dior', 'Aventus / Creed', 'Tihota / Indult'])
  })

  it('imports, searches fuzzily and returns full entries', async () => {
    const db = openDatabase(':memory:')
    const p = tmpFile('fra.csv', CSV)
    const mapping = suggestMapping(openSource(p).columns)
    const r = await runImport(db, p, null, mapping, false)
    expect(r).toMatchObject({ imported: 3, skipped: 1, totalInCatalog: 3 })

    const hits = searchLocal(db, 'sauvge dior')
    expect(hits[0]).toMatchObject({ source: 'dataset', name: 'Sauvage', house: 'Dior' })
    const entry = datasetEntry(db, hits[0].id)!
    expect(entry.notes.filter((n) => n.layer === 'top').map((n) => n.name)).toEqual(['Bergamot', 'Pepper'])
    expect(entry.accords[0]).toEqual({ name: 'fresh spicy', strength: 100 })
  })

  it('does not import duplicates twice, and can replace or clear', async () => {
    const db = openDatabase(':memory:')
    const p = tmpFile('fra.csv', CSV)
    const mapping = suggestMapping(openSource(p).columns)
    await runImport(db, p, null, mapping, false)
    const again = await runImport(db, p, null, mapping, false)
    expect(again.imported).toBe(0)
    expect(datasetCount(db)).toBe(3)
    const replaced = await runImport(db, p, null, mapping, true)
    expect(replaced.imported).toBe(3)
    clearDataset(db)
    expect(datasetCount(db)).toBe(0)
    expect(searchLocal(db, 'sauvage')).toEqual([])
  })

  it('lists my own fragrances first and hides dataset duplicates of them', async () => {
    const db = openDatabase(':memory:')
    const p = tmpFile('fra.csv', CSV)
    await runImport(db, p, null, suggestMapping(openSource(p).columns), false)
    createFragrance(db, { name: 'Sauvage', house: 'Dior', concentration: 'EDT', notes: [], accords: [] }, { to: 'to_try' })
    const hits = searchLocal(db, 'sauvage')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ source: 'mine', wardrobe: 'to_try' })
  })

  it('reads JSONL and SQLite sources too', async () => {
    const jl = tmpFile('x.jsonl', '{"name":"Layton","brand":"Parfums de Marly","accords":["vanilla","fruity"],"year":2016}\n{"name":"Herod","brand":"Parfums de Marly","accords":{"tobacco":100}}\n')
    const src = openSource(jl)
    expect(src.columns).toEqual(['name', 'brand', 'accords', 'year'])
    const prev = previewImport(jl, null, suggestMapping(src.columns))
    expect(prev.entries[0].accords.map((a) => a.name)).toEqual(['vanilla', 'fruity'])
    expect(prev.entries[1].accords).toEqual([{ name: 'tobacco', strength: 100 }])

    const sqlite = join(mkdtempSync(join(tmpdir(), 'scent-')), 'f.db')
    const Database = (await import('better-sqlite3')).default
    const sdb = new Database(sqlite)
    sdb.exec("CREATE TABLE perfumes (name TEXT, brand TEXT, year INTEGER); INSERT INTO perfumes VALUES ('Layton','Parfums de Marly',2016);")
    sdb.close()
    const ss = openSource(sqlite)
    expect(ss.tables).toEqual(['perfumes'])
    expect([...ss.rows()]).toEqual([{ name: 'Layton', brand: 'Parfums de Marly', year: '2016' }])
    ss.close()
  })

  it('rejects unsupported files with a helpful message', () => {
    expect(() => openSource('C:/x/data.zip')).toThrow(/Unzip/)
  })
})
