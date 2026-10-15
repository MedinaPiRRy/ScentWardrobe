import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '../db'
import { datasetEntry, detectPreset, previewImport, runImport, searchLocal } from './catalog'
import { cleanName, isFragranticaDump, mapDumpRecord, mapRow, parseAccords, parseNotes, suggestMapping } from './mapping'
import { openSource, parseCsvRows } from './sources'

const tmp = (name: string, content: string) => {
  const p = join(mkdtempSync(join(tmpdir(), 'scent-')), name)
  writeFileSync(p, content)
  return p
}

// The column layout of the real perfumes.csv dump
const HEADER =
  'id,slug,name,brand,year,collection,gender,url,rating_avg,vote_count,longevity_avg,sillage_avg,winter,spring,summer,autumn,day,night,people,magnitude,accords,notes_top,notes_middle,notes_base,notes_flat,perfumers,description'
const ROW1 =
  '9828,Creed/Aventus,Aventus,Creed,2010,Aventus,male,https://www.fragrantica.com/perfume/Creed/Aventus-9828.html,4.32,26895,3.37,2.31,5660,12424,12708,9453,12660,8707,26895,119527,fruity:100|citrus:80|woody:70,Bergamot:100|Apple:61|Pineapple:40,Birch:80|Rose:22,Musk:100|Vanilla:0,,Erwin Creed|Olivier Creed,"Aventus by Creed, a ""fruity"" scent."'
const ROW2 =
  '31861,Dior/Sauvage-Eau-de-Parfum,Sauvage Eau de Parfum,Dior,2018,Sauvage,male,https://www.fragrantica.com/perfume/Dior/Sauvage-Eau-de-Parfum-48100.html,4.3,1000,4,3,100,200,300,400,500,600,900,5000,fresh spicy:100|amber:70,,,,Vanilla:50|Pepper:20|Ambroxan:10,François Demachy,'
const ROW3 =
  '1,Azzaro/Orange-Tonic,Orange Tonic,Azzaro,,TONIC,female,https://www.fragrantica.com/perfume/Azzaro/Orange-Tonic-1.html,3.4,97,,,,,,,,,,,citrus:100,Orange:100,,,,Nathalie Feisthauer,'

describe('value formats of the Fragrantica dump', () => {
  it('reads name:strength accords separated by pipes', () => {
    expect(parseAccords(['fruity:100|citrus:80|woody:70'])).toEqual([
      { name: 'fruity', strength: 100 },
      { name: 'citrus', strength: 80 },
      { name: 'woody', strength: 70 }
    ])
  })
  it('drops note weights and keeps names with dashes', () => {
    expect(parseNotes('Orange:100|Lily-of-the-Valley:3|Jasmine:0|Orange:5')).toEqual(['Orange', 'Lily-of-the-Valley', 'Jasmine'])
  })
  it('only strips full concentration phrases from the end of a name', () => {
    expect(cleanName('Sauvage Eau de Parfum', 'Dior')).toEqual({ name: 'Sauvage', concentration: 'EDP' })
    expect(cleanName('Cologne Indélébile', 'Frédéric Malle')).toEqual({ name: 'Cologne Indélébile', concentration: null })
    expect(cleanName('Mon Parfum', 'X')).toEqual({ name: 'Mon Parfum', concentration: 'Parfum' })
    expect(cleanName('Eau de Parfum', 'X')).toEqual({ name: 'Eau de Parfum', concentration: null })
  })
})

describe('CSV streaming', () => {
  it('parses identically however the text is split into chunks (quotes, CRLF, escaped quotes)', () => {
    const text = 'a,b\r\n"x ""q"" y","l1\nl2"\r\nz,"end"'
    const whole = [...parseCsvRows(text, ',')]
    for (let size = 1; size <= text.length; size++) {
      const chunks: string[] = []
      for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
      expect([...parseCsvRows(chunks, ',')]).toEqual(whole)
    }
    expect(whole).toEqual([
      ['a', 'b'],
      ['x "q" y', 'l1\nl2'],
      ['z', 'end']
    ])
  })

  it('keeps accented UTF-8 text intact even when it contains a literal replacement character', () => {
    const p = tmp('u.csv', 'id,name,brand\n1,Café Noir,Maison\n2,Ver�nica,Natura\n')
    const rows = [...openSource(p).rows()]
    expect(rows[0].name).toBe('Café Noir')
    expect(rows[1].name).toBe('Ver�nica')
  })
})

describe('the perfumes.csv layout', () => {
  const csv = [HEADER, ROW1, ROW2, ROW3].join('\n')

  it('is mapped automatically', () => {
    const m = suggestMapping(openSource(tmp('p.csv', csv)).columns)
    expect(m).toMatchObject({
      name: ['name'], house: ['brand'], year: ['year'], gender: ['gender'], sourceUrl: ['url'], externalId: ['id'],
      accords: ['accords'], notesTop: ['notes_top'], notesHeart: ['notes_middle'], notesBase: ['notes_base'], notesGeneral: ['notes_flat'],
      perfumers: ['perfumers'], seasonFall: ['autumn'], seasonWinter: ['winter'], dayVotes: ['day'], nightVotes: ['night'],
      longevity: ['longevity_avg'], sillage: ['sillage_avg'], popularity: ['magnitude']
    })
    expect(m.description).toBeUndefined()
  })

  it('maps a row completely, including community data and the photo link', () => {
    const src = openSource(tmp('p.csv', csv))
    const m = suggestMapping(src.columns)
    const [r1, r2, r3] = [...src.rows()].map((r) => mapRow(r, m)!)
    expect(r1).toMatchObject({ name: 'Aventus', house: 'Creed', year: 2010, gender: 'for men', perfumers: 'Erwin Creed, Olivier Creed', popularity: 119527 })
    expect(r1.imageUrl).toBe('https://fimgs.net/mdimg/perfume/375x500.9828.jpg')
    expect(r1.notes.map((n) => `${n.layer}:${n.name}`)).toEqual(['top:Bergamot', 'top:Apple', 'top:Pineapple', 'heart:Birch', 'heart:Rose', 'base:Musk', 'base:Vanilla'])
    expect(r1.community).toEqual({ winter: 5660, spring: 12424, summer: 12708, fall: 9453, day: 12660, night: 8707, longevity: 3.37, sillage: 2.31 })
    // flat notes become general notes; the concentration is split off the name
    expect(r2).toMatchObject({ name: 'Sauvage', concentration: 'EDP' })
    expect(r2.notes.every((n) => n.layer === 'general')).toBe(true)
    // missing votes -> no community block, missing year -> null
    expect(r3.community).toBeNull()
    expect(r3.year).toBeNull()
  })

  it('imports, ranks popular matches first and skips duplicates by source URL', async () => {
    const db = openDatabase(':memory:')
    const dup = [HEADER, ROW1, ROW2, ROW3, ROW1.replace('Aventus,Creed', 'Aventus Copy,Creed')].join('\n')
    const p = tmp('p.csv', dup)
    const mapping = suggestMapping(openSource(p).columns)
    const progress: number[] = []
    const r = await runImport(db, p, null, mapping, false, (d) => progress.push(d))
    expect(r).toMatchObject({ imported: 3, skipped: 1, totalInCatalog: 3 })
    expect(progress[progress.length - 1]).toBe(4)
    expect(detectPreset(openSource(p))).toBeNull()
    const hit = searchLocal(db, 'aventus')[0]
    expect(hit.name).toBe('Aventus')
    expect(datasetEntry(db, hit.id)?.community?.longevity).toBe(3.37)
  })

  it('previews only the start of large files', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ROW3.replace('Orange Tonic', `Tonic ${i}`).replace('Orange-Tonic-1', `T-${i}`))
    const p = tmp('big.csv', [HEADER, ...rows].join('\n'))
    const prev = previewImport(p, null, suggestMapping(openSource(p).columns), 10, 3)
    expect(prev).toMatchObject({ total: 10, truncated: true })
    expect(prev.entries).toHaveLength(3)
  })
})

describe('the perfumes.jsonl dump', () => {
  const record = {
    id: 9828,
    slug: 'Creed/Aventus',
    url: 'https://www.fragrantica.com/perfume/Creed/Aventus-9828.html',
    name: 'Aventus',
    brand: 'Creed',
    year: 2010,
    gender: 'male',
    picture: 'https://fimgs.net/mdimg/perfume/375x500.9828.jpg',
    perfumers: [{ name: 'Erwin Creed', image_id: 865 }],
    accords: [
      { name: 'fruity', strength: 100 },
      { name: 'woody', strength: 70 }
    ],
    notes: {
      tiered: { top: [{ name: 'Bergamot', image_id: 75, weight: 49 }], middle: [{ name: 'Birch', image_id: null, weight: 20 }], base: [] },
      flat: []
    },
    longevity: { average: 3.37 },
    sillage: { average: 2.31 },
    seasons: { winter: 5660, spring: 12424, summer: 12708, autumn: 9453 },
    daypart: { day: 12660, night: 8707 },
    popularity: { magnitude: 119527 }
  }

  it('is recognised and mapped with note icons and community data', async () => {
    const flat = {
      ...record,
      id: 1,
      slug: 'A/B',
      url: 'https://x/1',
      name: 'Flat One',
      notes: { tiered: { top: [], middle: [], base: [] }, flat: [{ name: 'Rose', image_id: 3, weight: 0 }] },
      seasons: {},
      daypart: {}
    }
    const p = tmp('d.jsonl', [JSON.stringify(record), JSON.stringify(flat)].join('\n') + '\n')
    const src = openSource(p)
    expect(isFragranticaDump(src.columns)).toBe(true)
    expect(detectPreset(src)).toBe('fragrantica-dump')

    const e = mapDumpRecord(record)!
    expect(e).toMatchObject({ name: 'Aventus', house: 'Creed', year: 2010, gender: 'for men', perfumers: 'Erwin Creed', popularity: 119527 })
    expect(e.notes).toEqual([
      { name: 'Bergamot', layer: 'top', iconUrl: 'https://fimgs.net/mdimg/sastojci/t.75.jpg' },
      { name: 'Birch', layer: 'heart', iconUrl: null }
    ])
    expect(e.community).toEqual({ winter: 5660, spring: 12424, summer: 12708, fall: 9453, day: 12660, night: 8707, longevity: 3.37, sillage: 2.31 })

    const db = openDatabase(':memory:')
    const r = await runImport(db, p, null, {}, false)
    expect(r.imported).toBe(2)
    const entry = datasetEntry(db, searchLocal(db, 'flat one')[0].id)!
    expect(entry.notes).toEqual([{ name: 'Rose', layer: 'general', iconUrl: 'https://fimgs.net/mdimg/sastojci/t.3.jpg' }])
    expect(entry.community).toBeNull()
  })

  it('skips records without a name or brand', () => {
    expect(mapDumpRecord({ ...record, brand: '' })).toBeNull()
  })
})
