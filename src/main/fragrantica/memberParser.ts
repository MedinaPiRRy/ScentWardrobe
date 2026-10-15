/**
 * Fragrantica member wardrobe: the selectors (inside MEMBER_EXTRACT_SCRIPT) and the code that turns the scrape into
 * import items. Like fragranticaParser.ts, a layout change should only mean editing the script below.
 */
import type { MemberItem, MemberList, MemberPreview, MemberPreviewItem, WardrobeKind } from '@shared/types'
import { cleanName } from '../data/mapping'

export interface RawMemberSection {
  heading: string
  links: { href: string; text: string }[]
}

export interface RawMember {
  title: string
  challenge: boolean
  /** The profile's own header text, used to tell a missing profile from a hidden wardrobe. */
  hasProfile: boolean
  sections: RawMemberSection[]
}

/**
 * Runs inside https://www.fragrantica.com/@name#wardrobe. As of late 2026:
 *  - the "Wardrobe" tab shows one card per list; each card has an <h4> such as "Perfumes I Have 17"
 *    (custom shelves use their own name, e.g. "for test 1") and the fragrances as a[href^="/perfume/"]
 *  - the page header also lists signature/favourite perfumes, which are NOT in a wardrobe card, so only links under
 *    those <h4> cards are read
 * If the Wardrobe tab is not open yet the script opens it.
 */
export const MEMBER_EXTRACT_SCRIPT = `(() => {
  const txt = (e) => ((e && e.textContent) || '').replace(/\\s+/g, ' ').trim();
  const main = document.querySelector('main') || document.body;
  const out = { title: document.title, challenge: /just a moment|attention required|verify you are human/i.test(document.title), hasProfile: /@[A-Za-z0-9_.-]+/.test(txt(main).slice(0, 600)), sections: [] };
  const tab = [...main.querySelectorAll('button')].find((b) => /^Wardrobe\\b/.test(txt(b)));
  const heads = [...main.querySelectorAll('h4')].filter((h) => /\\d+\\s*$/.test(txt(h)));
  if (heads.length === 0 && tab) { tab.click(); return out; }
  for (const h of heads) {
    let card = h;
    for (let i = 0; i < 6 && card; i++) { if (card.querySelector('a[href^="/perfume/"]')) break; card = card.parentElement; }
    if (!card) continue;
    const links = [...card.querySelectorAll('a[href^="/perfume/"]')].map((a) => ({ href: a.getAttribute('href') || '', text: txt(a) }));
    out.sections.push({ heading: txt(h), links });
  }
  return out;
})()`

const slugToText = (s: string) => decodeURIComponent(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim()

/** Lower-case letters and digits only, with accents folded: the key used to decide two names are the same. */
export const normKey = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** "/perfume/Lattafa-Perfumes/Vintage-Radio-89454.html" -> house, name and id. */
export function parsePerfumePath(href: string): { house: string; nameSlug: string; id: number | null } | null {
  const m = /\/perfume\/([^/]+)\/(.+?)(?:-(\d+))?\.html/i.exec(href)
  return m ? { house: slugToText(m[1]), nameSlug: slugToText(m[2]), id: m[3] ? Number(m[3]) : null } : null
}

/** The link text is "House Name"; takes the house off the front, comparing letters and digits only. */
export function stripHouse(text: string, house: string): string {
  const want = normKey(house)
  let consumed = ''
  for (let i = 0; i < text.length; i++) {
    if (consumed.length >= want.length) break
    const c = normKey(text[i])
    if (c) consumed += c
    if (consumed && !want.startsWith(consumed)) return text
    if (consumed === want) {
      const rest = text.slice(i + 1).trim()
      return rest || text
    }
  }
  return text
}

export function itemFromLink(link: { href: string; text: string }, list: MemberList, shelf?: string): MemberItem | null {
  const p = parsePerfumePath(link.href)
  if (!p) return null
  const stripped = stripHouse(link.text, p.house)
  // Prefer the house as written in the page text ("Penhaligon's"), falling back to the one in the address.
  const name = stripped !== link.text ? stripped : p.nameSlug
  const house = stripped !== link.text ? link.text.slice(0, link.text.length - stripped.length).trim() : p.house
  return { list, shelf, url: new URL(link.href, 'https://www.fragrantica.com').toString(), fragranticaId: p.id, house, name }
}

const SECTION = /^(?:Perfumes I\s+)?(have|want|had)\b\s*\d*\s*$/i

/** Turns the scrape into items, one per fragrance, with the count each list claims to hold. */
export function parseMemberRaw(raw: RawMember): { items: MemberItem[]; lists: { label: string; list: MemberList; expected: number; read: number }[] } {
  const items: MemberItem[] = []
  const lists: { label: string; list: MemberList; expected: number; read: number }[] = []
  for (const s of raw.sections) {
    const claimed = /(\d+)\s*$/.exec(s.heading)
    const expected = claimed ? Number(claimed[1]) : s.links.length
    const label = s.heading.replace(/\s*\d+\s*$/, '').trim()
    const std = SECTION.exec(s.heading)
    const list: MemberList = std ? (std[1].toLowerCase() as 'have' | 'want' | 'had') : 'shelf'
    const seen = new Set<string>()
    let read = 0
    for (const l of s.links) {
      const it = itemFromLink(l, list, list === 'shelf' ? label : undefined)
      if (!it || seen.has(it.url ?? it.name)) continue
      seen.add(it.url ?? it.name)
      items.push(it)
      read++
    }
    lists.push({ label: list === 'shelf' ? label : label.replace(/^Perfumes I\s+/i, ''), list, expected, read })
  }
  return { items, lists }
}

export const TARGET: Record<MemberList, WardrobeKind> = { have: 'collection', want: 'wishlist', had: 'had', shelf: 'to_try' }
/** When one fragrance is in several lists, the first of these wins. */
const STRENGTH: MemberList[] = ['have', 'had', 'want', 'shelf']

export interface ExistingFragrance {
  id: number
  name: string
  house: string
  sourceUrl: string | null
}

export const identityKey = (house: string, name: string): string => normKey(house) + '|' + normKey(cleanName(name, house).name)

/** Marks each item new, already in the app, or a duplicate of a stronger list. */
export function previewItems(items: MemberItem[], existing: ExistingFragrance[]): MemberPreviewItem[] {
  const byKey = new Map(existing.map((e) => [identityKey(e.house, e.name), e]))
  const byId = new Map<number, ExistingFragrance>()
  for (const e of existing) {
    const m = e.sourceUrl ? /-(\d+)\.html/.exec(e.sourceUrl) : null
    if (m) byId.set(Number(m[1]), e)
  }
  const best = new Map<string, MemberList>()
  for (const it of items) {
    const k = identityKey(it.house, it.name)
    const cur = best.get(k)
    if (!cur || STRENGTH.indexOf(it.list) < STRENGTH.indexOf(cur)) best.set(k, it.list)
  }
  const taken = new Set<string>()
  return items.map((it) => {
    const k = identityKey(it.house, it.name)
    const match = (it.fragranticaId != null ? byId.get(it.fragranticaId) : undefined) ?? byKey.get(k)
    const base = { ...it, target: TARGET[it.list] }
    if (match) return { ...base, status: 'exists' as const, existingName: `${match.name} · ${match.house}` }
    if (best.get(k) !== it.list || taken.has(k)) return { ...base, status: 'duplicate' as const }
    taken.add(k)
    return { ...base, status: 'new' as const }
  })
}

export function buildPreview(username: string, raw: RawMember, existing: ExistingFragrance[]): MemberPreview {
  const { items, lists } = parseMemberRaw(raw)
  const notes: string[] = []
  for (const l of lists) if (l.read < l.expected) notes.push(`${l.label}: the profile says ${l.expected}, but only ${l.read} could be read.`)
  return { username, items: previewItems(items, existing), lists, notes }
}

// ---- fallback: pasted text or a CSV --------------------------------------------------------

const LIST_WORDS: [RegExp, MemberList][] = [
  [/\b(have|own|owned|collection)\b/i, 'have'],
  [/\b(want|wish|wishlist)\b/i, 'want'],
  [/\bhad\b/i, 'had'],
  [/\b(test|try|to try|sample)\b/i, 'shelf']
]
const listOf = (s: string): MemberList | null => LIST_WORDS.find(([re]) => re.test(s))?.[1] ?? null

/**
 * Reads either a CSV with the columns List, House, Name (and optionally URL), or pasted text made of list headings
 * ("Have", "Want 43", "Had", "For Test") followed by Fragrantica fragrance links, one per line.
 */
export function parseListText(text: string): { items: MemberItem[]; problems: string[] } {
  const items: MemberItem[] = []
  const problems: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const first = lines[0]?.toLowerCase() ?? ''
  const isCsv = /^"?list"?\s*,/.test(first) || (first.includes(',') && /\bhouse\b/.test(first) && /\bname\b/.test(first))
  let current: MemberList | null = null
  let shelf: string | undefined

  if (isCsv) {
    const rows = lines.map(splitCsv)
    const head = rows[0].map((c) => c.toLowerCase())
    const col = (re: RegExp) => head.findIndex((h) => re.test(h))
    const iList = col(/^list|wardrobe|shelf/)
    const iHouse = col(/house|brand/)
    const iName = col(/^name|fragrance|perfume/)
    const iUrl = col(/url|link/)
    if (iList < 0 || iHouse < 0 || iName < 0) return { items, problems: ['The CSV needs the columns List, House and Name.'] }
    rows.slice(1).forEach((r, i) => {
      const list = listOf(r[iList] ?? '')
      const house = (r[iHouse] ?? '').trim()
      const name = (r[iName] ?? '').trim()
      if (!list || !house || !name) return void problems.push(`Row ${i + 2} was skipped (needs a list, house and name).`)
      const url = iUrl >= 0 && /fragrantica\./i.test(r[iUrl] ?? '') ? r[iUrl].trim() : null
      items.push({ list, shelf: list === 'shelf' ? (r[iList] ?? '').trim() : undefined, url, fragranticaId: url ? (parsePerfumePath(url)?.id ?? null) : null, house, name })
    })
    return { items, problems }
  }

  for (const line of lines) {
    const url = /https?:\/\/\S*fragrantica\.[a-z.]+\/perfume\/\S+/i.exec(line)?.[0]
    if (url) {
      const p = parsePerfumePath(url)
      if (!current || !p) {
        problems.push(current ? `Could not read the link: ${url}` : 'A link came before any list heading (Have, Want, Had...).')
        continue
      }
      items.push({ list: current, shelf, url, fragranticaId: p.id, house: p.house, name: p.nameSlug })
      continue
    }
    const l = listOf(line.replace(/\d+/g, '').trim())
    if (l && line.length < 40) {
      current = l
      shelf = l === 'shelf' ? line.replace(/\s*\(?\d+\)?\s*$/, '').trim() : undefined
    } else problems.push(`Skipped "${line.slice(0, 50)}": paste Fragrantica fragrance links, or use a CSV with List, House, Name.`)
  }
  return { items, problems }
}

function splitCsv(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}
