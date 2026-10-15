import { describe, expect, it } from 'vitest'
import { buildPreview, identityKey, itemFromLink, parseListText, parseMemberRaw, parsePerfumePath, stripHouse, type RawMember } from './memberParser'

const raw: RawMember = {
  title: 'Example User',
  challenge: false,
  hasProfile: true,
  sections: [
    {
      heading: 'Perfumes I Have 2',
      links: [
        { href: '/perfume/Valentino/Vendetta-Uomo-2026-137496.html', text: 'Valentino Vendetta Uomo (2026)' },
        { href: '/perfume/Rayhaan/Nava-Sol-138578.html', text: 'Rayhaan Nava Sol' }
      ]
    },
    {
      heading: 'Perfumes I Want 3',
      links: [
        { href: '/perfume/Lattafa-Perfumes/Vintage-Radio-89454.html', text: 'Lattafa Perfumes Vintage Radio' },
        { href: '/perfume/Penhaligon-s/The-Blazing-Mister-Sam-Eau-de-Parfum-Intense-138861.html', text: "Penhaligon's The Blazing Mister Sam Eau de Parfum Intense" },
        { href: '/perfume/Rayhaan/Nava-Sol-138578.html', text: 'Rayhaan Nava Sol' }
      ]
    },
    { heading: 'Perfumes I Had 1', links: [{ href: '/perfume/Versace/Eros-16657.html', text: 'Versace Eros' }] },
    { heading: 'for test 1', links: [{ href: '/perfume/French-Avenue/Liquid-Brun-94713.html', text: 'French Avenue Liquid Brun' }] }
  ]
}

describe('paths and names', () => {
  it('reads house, name and id from the address', () => {
    expect(parsePerfumePath('/perfume/Lattafa-Perfumes/Vintage-Radio-89454.html')).toEqual({ house: 'Lattafa Perfumes', nameSlug: 'Vintage Radio', id: 89454 })
    expect(parsePerfumePath('/news/x.html')).toBeNull()
  })
  it('takes the house off the front of the link text, ignoring punctuation', () => {
    expect(stripHouse("Penhaligon's The Blazing Mister Sam", 'Penhaligon s')).toBe('The Blazing Mister Sam')
    expect(stripHouse('Lattafa Perfumes Vintage Radio', 'Lattafa Perfumes')).toBe('Vintage Radio')
    expect(stripHouse('Something else', 'Dior')).toBe('Something else')
  })
  it('keeps the apostrophe in the house name', () => {
    const it = itemFromLink({ href: '/perfume/Penhaligon-s/The-Blazing-Mister-Sam-138861.html', text: "Penhaligon's The Blazing Mister Sam" }, 'want')!
    expect(it.house).toBe("Penhaligon's")
    expect(it.name).toBe('The Blazing Mister Sam')
  })
})

describe('parseMemberRaw', () => {
  it('maps the headings to lists and counts what it read', () => {
    const { items, lists } = parseMemberRaw(raw)
    expect(items.map((i) => `${i.list}:${i.name}`)).toEqual(['have:Vendetta Uomo (2026)', 'have:Nava Sol', 'want:Vintage Radio', 'want:The Blazing Mister Sam Eau de Parfum Intense', 'want:Nava Sol', 'had:Eros', 'shelf:Liquid Brun'])
    expect(lists.map((l) => [l.list, l.expected, l.read])).toEqual([['have', 2, 2], ['want', 3, 3], ['had', 1, 1], ['shelf', 1, 1]])
    expect(items.find((i) => i.list === 'shelf')!.shelf).toBe('for test')
  })
})

describe('buildPreview', () => {
  const existing = [
    { id: 1, name: 'Eros', house: 'Versace', sourceUrl: null },
    { id: 2, name: 'Something', house: 'Else', sourceUrl: 'https://www.fragrantica.com/perfume/Lattafa-Perfumes/Vintage-Radio-89454.html' }
  ]
  const p = buildPreview('example_user', raw, existing)
  const by = (name: string, list: string) => p.items.find((i) => i.name.startsWith(name) && i.list === list)!

  it('skips what the app already has, by name or by Fragrantica id', () => {
    expect(by('Eros', 'had')).toMatchObject({ status: 'exists', target: 'had' })
    expect(by('Vintage Radio', 'want').status).toBe('exists')
  })
  it('sends each list to its wardrobe, with the custom shelf going to To Try', () => {
    expect(by('Vendetta', 'have')).toMatchObject({ status: 'new', target: 'collection' })
    expect(by('The Blazing', 'want')).toMatchObject({ status: 'new', target: 'wishlist' })
    expect(by('Liquid', 'shelf')).toMatchObject({ status: 'new', target: 'to_try' })
  })
  it('keeps only the strongest list when a fragrance is in two', () => {
    expect(by('Nava Sol', 'have').status).toBe('new')
    expect(by('Nava Sol', 'want').status).toBe('duplicate')
  })
  it('warns when a list could not be read completely', () => {
    const short = buildPreview('x', { ...raw, sections: [{ heading: 'Perfumes I Want 43', links: raw.sections[1].links }] }, [])
    expect(short.notes[0]).toMatch(/43.*only 3/)
  })
  it('treats a concentration written into the name as the same fragrance', () => {
    expect(identityKey('Diptyque', 'Orphéon Eau de Parfum')).toBe(identityKey('Diptyque', 'Orpheon'))
  })
})

describe('parseListText', () => {
  it('reads a CSV with List, House and Name', () => {
    const { items, problems } = parseListText('List,House,Name\r\nHave,Dior,"Sauvage, Elixir"\r\nWant,Byredo,Gypsy Water\r\nFor Test,Mancera,Aoud Lemon Mint\r\nnope,,')
    expect(items.map((i) => [i.list, i.house, i.name])).toEqual([['have', 'Dior', 'Sauvage, Elixir'], ['want', 'Byredo', 'Gypsy Water'], ['shelf', 'Mancera', 'Aoud Lemon Mint']])
    expect(problems).toHaveLength(1)
  })
  it('reads headings followed by links', () => {
    const { items, problems } = parseListText('Have 2\nhttps://www.fragrantica.com/perfume/Dior/Sauvage-31861.html\nWant\nhttps://www.fragrantica.com/perfume/Byredo/Gypsy-Water-1234.html\nrandom words that are not a link')
    expect(items.map((i) => [i.list, i.house, i.name, i.fragranticaId])).toEqual([['have', 'Dior', 'Sauvage', 31861], ['want', 'Byredo', 'Gypsy Water', 1234]])
    expect(problems).toHaveLength(1)
  })
  it('explains a link that comes before any heading', () => {
    expect(parseListText('https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html').problems[0]).toMatch(/before any list heading/)
  })
})
