/**
 * ALL Fragrantica-specific knowledge lives in this file: the selectors (inside EXTRACT_SCRIPT) and the code that
 * turns the raw scrape into a FragranceInput. When the site changes its layout and imports start coming back
 * empty, fix the selectors in EXTRACT_SCRIPT first (see the README, "Fixing the Fragrantica parser").
 */
import type { CommunityData, FragranceInput, NoteLayer } from '@shared/types'
import { cleanName, normalizeGender, titleCase } from '../data/mapping'

export interface RawVote {
  label: string
  /** Text such as "10.3k" */
  count: string
  /** Bar width in percent, a fallback when no count text is shown. */
  width: number | null
}

export interface RawFragrantica {
  title: string
  url: string
  challenge: boolean
  h1: string
  genderText: string
  brand: string
  image: string
  accords: { name: string; width: number; color: string }[]
  notes: { name: string; layer: NoteLayer; icon: string }[]
  votes: RawVote[]
  longevityVotes: RawVote[]
  sillageVotes: RawVote[]
  perfumers: string[]
}

/**
 * Runs inside the Fragrantica page (as of the late-2026 Tailwind layout). Everything that depends on the page's
 * markup is here, so a layout change means editing only this script.
 *
 *  - name / gender : the <h1 itemprop="name">; the gender is its inner <span>
 *  - house         : [itemprop=brand] [itemprop=name]
 *  - image         : img[itemprop=image]
 *  - accords       : the element after the "main accords" heading; each bar is a div with an inline style that
 *                    carries `width: NN%` and `background: rgb(...)`, and a <span> with the accord name
 *  - notes         : inside #pyramid, in document order: heading spans ("Top Notes"...) switch the layer and
 *                    a.pyramid-note-link are the notes (label text + <img> icon)
 *  - votes         : leaf <span> labels (winter, spring, summer, fall, day, night) followed by a sibling holding a
 *                    count span such as "10.3k"
 *  - longevity / sillage : rows of label + count, located through the "eternal" / "enormous" labels. The page
 *                    loads these lazily, so the loader scrolls first. Optional.
 *  - perfumers     : a[href*="/noses/"] (the generic "Perfumers" link is ignored)
 */
export const EXTRACT_SCRIPT = `(() => {
  const txt = (e) => ((e && e.textContent) || '').replace(/\\s+/g, ' ').trim();
  const out = { title: document.title, url: location.href, challenge: /just a moment|attention required|verify you are human/i.test(document.title), h1: '', genderText: '', brand: '', image: '', accords: [], notes: [], votes: [], longevityVotes: [], sillageVotes: [], perfumers: [] };

  const h1 = document.querySelector('h1[itemprop=name]') || document.querySelector('h1');
  if (h1) {
    const c = h1.cloneNode(true);
    const sp = c.querySelector('span');
    if (sp) { out.genderText = txt(sp); sp.remove(); }
    out.h1 = txt(c);
  }
  out.brand = txt(document.querySelector('[itemprop=brand] [itemprop=name]'));
  const img = document.querySelector('img[itemprop=image]');
  out.image = img ? img.src : '';

  const leaves = [...document.querySelectorAll('span, h6, h5, h4, div')].filter((e) => e.children.length === 0);
  const head = leaves.find((e) => /^main accords$/i.test(txt(e)));
  const box = head && head.nextElementSibling;
  if (box) {
    for (const bar of box.querySelectorAll('div[style*="width"]')) {
      const label = txt(bar.querySelector('span'));
      const style = bar.getAttribute('style') || '';
      const w = /width:\\s*([\\d.]+)%/.exec(style);
      const bg = /background(?:-color)?:\\s*(rgb\\([^)]*\\)|#[0-9a-f]{3,8})/i.exec(style);
      if (label && w) out.accords.push({ name: label, width: parseFloat(w[1]), color: bg ? bg[1] : '' });
    }
  }

  const pyr = document.querySelector('#pyramid');
  if (pyr) {
    let layer = 'general';
    for (const el of pyr.querySelectorAll('span, a.pyramid-note-link')) {
      if (el.tagName === 'A') {
        const name = txt(el.querySelector('.pyramid-note-label') || el);
        const icon = el.querySelector('img');
        if (name) out.notes.push({ name, layer, icon: icon ? icon.src : '' });
      } else {
        const m = /^(top|middle|base) notes$/i.exec(txt(el));
        if (m) layer = { top: 'top', middle: 'heart', base: 'base' }[m[1].toLowerCase()];
      }
    }
  }

  const vote = (label) => {
    const sib = label.nextElementSibling;
    const count = sib ? txt(sib.querySelector('span')) : '';
    const bar = sib ? sib.querySelector('div[style*="width"]') : null;
    const w = bar ? /width:\\s*([\\d.]+)%/.exec(bar.getAttribute('style') || '') : null;
    return { label: txt(label).toLowerCase(), count, width: w ? parseFloat(w[1]) : null };
  };
  for (const e of leaves.filter((l) => /^(winter|spring|summer|fall|day|night)$/i.test(txt(l)) && l.tagName === 'SPAN')) out.votes.push(vote(e));

  // Longevity / sillage rows: <div><div><span>label</span></div><div><span>count</span></div><div>bar</div></div>.
  // They are loaded lazily, so the page loader scrolls down before running this script.
  const group = (anchor) => {
    const a = leaves.find((l) => new RegExp('^' + anchor + '$', 'i').test(txt(l)));
    const box = a && a.parentElement && a.parentElement.parentElement && a.parentElement.parentElement.parentElement;
    if (!box) return [];
    return [...box.children].map((r) => {
      const bar = r.children[2] ? r.children[2].querySelector('div[style*="width"]') : null;
      const w = bar ? /width:\\s*([\\d.]+)%/.exec(bar.getAttribute('style') || '') : null;
      return { label: txt(r.children[0]).toLowerCase(), count: txt(r.children[1]), width: w ? parseFloat(w[1]) : null };
    }).filter((v) => v.label);
  };
  out.longevityVotes = group('eternal');
  out.sillageVotes = group('enormous');

  out.perfumers = [...document.querySelectorAll('a[href*="/noses/"]')].map(txt).filter((n) => n && !/^perfumers?$/i.test(n));
  return out;
})()`

/** "10.3k" -> 10300, "1.2m" -> 1200000, "845" -> 845. */
export function parseCount(text: string): number | null {
  const m = /^([\d.,]+)\s*([km])?$/i.exec(text.trim())
  if (!m) return null
  const n = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  const mult = m[2]?.toLowerCase() === 'k' ? 1_000 : m[2]?.toLowerCase() === 'm' ? 1_000_000 : 1
  return Math.round(n * mult)
}

export function rgbToHex(color: string): string | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) return `#${hex[1].toLowerCase()}`
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color)
  if (!m) return null
  return '#' + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, '0')).join('')
}

const LONGEVITY_SCALE: Record<string, number> = { 'very weak': 1, weak: 2, moderate: 3, 'long lasting': 4, eternal: 5 }
const SILLAGE_SCALE: Record<string, number> = { intimate: 1, moderate: 2, strong: 3, enormous: 4 }

/** Weighted average rating, or null without votes. */
export function averageRating(votes: RawVote[], scale: Record<string, number>): number | null {
  let sum = 0
  let total = 0
  for (const v of votes) {
    const rating = scale[v.label.trim().toLowerCase()]
    const n = parseCount(v.count)
    if (rating == null || n == null) continue
    sum += rating * n
    total += n
  }
  return total > 0 ? Math.round((sum / total) * 100) / 100 : null
}

export function isFragranticaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && /(^|\.)fragrantica\.[a-z.]+$/i.test(u.hostname) && /\/perfume\//i.test(u.pathname)
  } catch {
    return false
  }
}

export function normalizeRaw(raw: RawFragrantica): { input: FragranceInput; warnings: string[] } {
  const warnings: string[] = []
  const house = raw.brand.trim()
  const { name, concentration } = cleanName(raw.h1, house)

  const year = /\b(19|20)\d{2}\b(?!.*\b(19|20)\d{2}\b)/.exec(raw.title)?.[0]

  const accords = raw.accords
    .map((a) => ({ name: a.name.trim().toLowerCase(), strength: Math.max(1, Math.min(100, Math.round(a.width))), color: rgbToHex(a.color) ?? undefined }))
    .sort((a, b) => b.strength - a.strength)
  if (accords.length === 0) warnings.push('No main accords were found on the page.')

  const notes = raw.notes.map((n) => ({ name: titleCase(n.name.trim()), layer: n.layer, iconUrl: n.icon || null }))
  if (notes.length === 0) warnings.push('No notes were found on the page.')

  const count = (label: string) => {
    const v = raw.votes.find((x) => x.label === label)
    if (!v) return 0
    return parseCount(v.count) ?? 0
  }
  const hasVotes = raw.votes.some((v) => parseCount(v.count) != null)
  const community: CommunityData | null = hasVotes
    ? {
        winter: count('winter'), spring: count('spring'), summer: count('summer'), fall: count('fall'), day: count('day'), night: count('night'),
        longevity: averageRating(raw.longevityVotes, LONGEVITY_SCALE),
        sillage: averageRating(raw.sillageVotes, SILLAGE_SCALE)
      }
    : null
  if (!community) warnings.push('No season / day-night votes were found.')

  const input: FragranceInput = {
    name,
    house,
    year: year ? parseInt(year, 10) : null,
    concentration,
    perfumers: raw.perfumers.length ? [...new Set(raw.perfumers)].join(', ') : null,
    gender: normalizeGender(raw.genderText),
    description: null,
    sourceUrl: raw.url.split('#')[0].split('?')[0],
    imageUrl: raw.image || null,
    notes,
    accords,
    community
  }
  return { input, warnings }
}
