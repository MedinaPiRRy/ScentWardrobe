// Invented Fragrantica-dump-shaped rows for the Discovery checks. No real data: names are "Synthetic 000123".
import { closeSync, openSync, writeSync } from 'node:fs'

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const ACC = ['citrus', 'woody', 'fresh', 'amber', 'vanilla', 'sweet', 'aromatic', 'fresh spicy', 'warm spicy', 'musky', 'floral', 'white floral', 'powdery', 'leather', 'tobacco', 'aquatic', 'green', 'fruity', 'oud', 'rose', 'earthy', 'smoky', 'balsamic', 'herbal', 'lavender', 'iris']
const NOTES = ['bergamot', 'lemon', 'vetiver', 'cedar', 'sandalwood', 'patchouli', 'vanilla', 'tonka bean', 'amber', 'musk', 'jasmine', 'rose', 'lavender', 'pepper', 'cardamom', 'leather', 'tobacco', 'oakmoss', 'ambroxan', 'iris', 'orange', 'mint', 'sage', 'incense']

export function writeDump(path, n) {
  const r = rng(7)
  const pick = (xs) => xs[Math.floor(r() * xs.length)]
  const fd = openSync(path, 'w')
  let buf = []
  for (let i = 1; i <= n; i++) {
    const accords = new Map()
    for (let k = 0, na = 3 + Math.floor(r() * 6); k < na; k++) accords.set(pick(ACC), Math.round(30 + r() * 70))
    const tier = () => Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({ name: pick(NOTES), image_id: null, weight: Math.round(r() * 100) }))
    const v = () => Math.floor(r() * r() * 4000)
    const pop = Math.floor(r() * r() * 90000)
    const rec = {
      id: 500000 + i,
      slug: `Synthetic House ${i % 300}/Synthetic ${String(i).padStart(6, '0')}`,
      url: `https://www.fragrantica.com/perfume/Synthetic-House-${i % 300}/Synthetic-${String(i).padStart(6, '0')}-${500000 + i}.html`,
      name: `Synthetic ${String(i).padStart(6, '0')}`,
      brand: `Synthetic House ${i % 300}`,
      year: 1995 + (i % 30),
      gender: pick(['male', 'female', 'unisex']),
      accords: [...accords].map(([name, strength]) => ({ name, strength })),
      notes: { tiered: { top: tier(), middle: tier(), base: tier() }, flat: [] },
      rating: { average: 3.3 + r() * 1.5, histogram: [{ bucket: 3, count: Math.floor(r() * 200) }, { bucket: 4, count: Math.floor(r() * 600) + 50 }, { bucket: 5, count: Math.floor(r() * 600) }] },
      longevity: { average: 1.8 + r() * 3 },
      sillage: { average: 1.4 + r() * 2.2 },
      relation: { have: Math.floor(pop / 3), had: Math.floor(pop / 9), want: Math.floor(pop / 4) },
      community_gender: { female: v(), female_leaning: v(), unisex: v(), male_leaning: v(), male: v() },
      seasons: { winter: v(), spring: v(), summer: v(), autumn: v() },
      daypart: { day: v(), night: v() },
      people: 200 + Math.floor(r() * 9000),
      popularity: { magnitude: pop, recent_magnitude: Math.floor(pop * r() * 0.4) },
      similar: i > 5 && r() < 0.2 ? { reminds_me_of: [{ id: 500001 + (i % 97), up_votes: 200 + Math.floor(r() * 3000), down_votes: Math.floor(r() * 40) }], also_liked: [] } : { reminds_me_of: [], also_liked: [] },
      price_value: { average: 2 + r() * 3, histogram: [{ bucket: 3, count: 40 }, { bucket: 4, count: 60 + Math.floor(r() * 300) }] },
      meta: { scraped_at: 1779692833 }
    }
    buf.push(JSON.stringify(rec))
    if (buf.length >= 2000) {
      writeSync(fd, buf.join('\n') + '\n')
      buf = []
    }
  }
  if (buf.length) writeSync(fd, buf.join('\n') + '\n')
  closeSync(fd)
}

