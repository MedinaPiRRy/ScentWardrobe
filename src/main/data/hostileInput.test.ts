import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseListText } from '../fragrantica/memberParser'
import { openDatabase } from '../db'
import { previewImport, runImport, searchLocal } from './catalog'
import { suggestMapping } from './mapping'
import { openSource } from './sources'

const tmp = (name: string, content: string | Buffer) => {
  const p = join(mkdtempSync(join(tmpdir(), 'scent-hostile-')), name)
  writeFileSync(p, content)
  return p
}

describe('pasted lists and CSVs', () => {
  it('stays fast and safe on huge or pathological input', () => {
    const t = performance.now()
    parseListText('a'.repeat(2_000_000))
    parseListText('https://fragrantica.' + 'a.'.repeat(200_000))
    parseListText(('Have\n' + 'https://www.fragrantica.com/perfume/' + 'x'.repeat(5000) + '\n').repeat(200))
    parseListText('"'.repeat(500_000))
    parseListText(',,,,'.repeat(200_000))
    expect(performance.now() - t).toBeLessThan(4000)
  })
  it('keeps odd text as plain data and never as a link', () => {
    const { items, problems } = parseListText('List,House,Name\nHave,"<script>alert(1)</script>",Name\nHave,Dior,"javascript:alert(1)"\nWant,😀 House,"Ça va ""bien"""\n')
    expect(items.map((i) => [i.house, i.name])).toEqual([['<script>alert(1)</script>', 'Name'], ['Dior', 'javascript:alert(1)'], ['😀 House', 'Ça va "bien"']])
    expect(items.every((i) => i.url === null)).toBe(true)
    expect(problems).toEqual([])
  })
  it('does not follow non-Fragrantica links in pasted text', () => {
    const r = parseListText('Have\nhttps://evil.example.com/perfume/House/Name-1.html\nhttp://localhost/perfume/A/B-2.html\n')
    expect(r.items).toEqual([])
  })
  it('copes with an unterminated quote and blank lines', () => {
    expect(() => parseListText('List,House,Name\nHave,"Dior,Sauvage\n\n\n')).not.toThrow()
  })
})

describe('dataset files', () => {
  it('rejects an empty file and a header-only file gently', async () => {
    const db = openDatabase(':memory:')
    for (const content of ['', 'id,name,brand\n']) {
      const p = tmp('x.csv', content)
      let err: unknown = null
      try {
        const src = openSource(p)
        const r = await runImport(db, p, null, suggestMapping(src.columns), false, () => undefined)
        expect(r.imported).toBe(0)
      } catch (e) {
        err = e
      }
      if (err) expect((err as Error).message).toBeTruthy()
    }
  })
  it('skips broken lines in a JSONL file and imports the good ones', async () => {
    const db = openDatabase(':memory:')
    const good = (n: string) => JSON.stringify({ id: n.length, slug: `H/${n}`, name: n, brand: 'H', url: `https://www.fragrantica.com/perfume/H/${n}-${n.length}.html`, accords: [], notes: { tiered: { top: [], middle: [], base: [] }, flat: [] } })
    const p = tmp('x.jsonl', [good('One'), '{"broken": ', 'not json at all', '', good('Three'), '[1,2,3]', 'null'].join('\n'))
    const src = openSource(p)
    const r = await runImport(db, p, null, suggestMapping(src.columns), false, () => undefined).catch((e: Error) => e)
    if (r instanceof Error) throw r
    expect(r.imported).toBe(2)
    expect(searchLocal(db, 'three').some((h) => h.name === 'Three')).toBe(true)
  })
  it('does not choke on a binary file with a .csv name', () => {
    const p = tmp('bin.csv', Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256)))
    expect(() => {
      const s = openSource(p)
      previewImport(p, null, suggestMapping(s.columns))
    }).not.toThrow(/Maximum call stack|out of memory/i)
  })
})
