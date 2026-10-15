import type { BottleType, HadDetails, NoteLayer, WardrobeKind } from '@shared/types'
import type { Db } from './index'
import { accordColor } from '@shared/accordColors'
import { pruneBrokenCombos, upsertAccord, upsertNote } from './editing'
import { moveToWardrobe } from './repo'

type Notes = Partial<Record<NoteLayer, string[]>>

interface SeedFragrance {
  name: string
  house: string
  year: number
  concentration: string
  perfumers: string
  gender: string
  description: string
  notes: Notes
  accords: Record<string, number>
  /** winter, spring, summer, fall, day, night, longevity (1-5), sillage (1-4) */
  community: [number, number, number, number, number, number, number, number]
  wardrobe: WardrobeKind
  rating?: number
  /** Days ago for each sample wear. */
  wears?: number[]
  impression?: string
  /** Garbage Perfumes: why I dislike it. */
  dislikeNote?: string
  /** Had: years, memory, why it left. */
  had?: HadDetails
  bottle?: { type: BottleType; sizeMl: number; remainingPct: number }
}

const NOTE_FAMILIES: Record<string, string> = {
  citrus: 'citrus',
  woody: 'woody',
  floral: 'floral',
  spice: 'spicy',
  sweet: 'gourmand',
  resin: 'resinous',
  fresh: 'fresh',
  fruit: 'fruity'
}
const NOTE_FAMILY_MEMBERS: Record<string, string[]> = {
  citrus: ['bergamot', 'calabrian bergamot', 'lemon', 'lime', 'grapefruit', 'orange', 'mandarin', 'sicilian lemon'],
  woody: ['cedar', 'sandalwood', 'vetiver', 'patchouli', 'birch', 'oak', 'papyrus', 'amberwood', 'fir resin', 'woody notes'],
  floral: ['jasmine', 'rose', 'violet', 'iris', 'orange blossom', 'freesia', 'hyacinth', 'geranium', 'bellflower', 'white rose', 'moroccan jasmine', 'tobacco blossom', 'lavender'],
  spice: ['pepper', 'pink pepper', 'sichuan pepper', 'cardamom', 'cinnamon', 'nutmeg', 'ginger', 'saffron', 'coriander', 'spicy notes', 'elemi'],
  sweet: ['vanilla', 'tonka bean', 'praline', 'cacao', 'coffee', 'bitter almond', 'licorice', 'cognac', 'dried fruits'],
  resin: ['incense', 'labdanum', 'amber', 'ambergris', 'ambroxan', 'musk', 'white musk', 'cashmeran', 'oakmoss', 'leather', 'tobacco leaf', 'iso e super'],
  fresh: ['mint', 'sea notes', 'calone', 'rosemary', 'bamboo'],
  fruit: ['apple', 'pineapple', 'pear', 'peach', 'black currant']
}

function familyOf(note: string): string | null {
  const n = note.toLowerCase()
  for (const [key, members] of Object.entries(NOTE_FAMILY_MEMBERS)) {
    if (members.includes(n)) return NOTE_FAMILIES[key]
  }
  return null
}

export const SAMPLE_FRAGRANCES: SeedFragrance[] = [
  {
    name: 'Sauvage', house: 'Dior', year: 2015, concentration: 'EDT', perfumers: 'François Demachy', gender: 'for men',
    description: 'Bright, peppery and ambery: a clean, versatile everyday scent.',
    notes: {
      top: ['Calabrian Bergamot', 'Pepper'],
      heart: ['Sichuan Pepper', 'Lavender', 'Pink Pepper', 'Vetiver', 'Patchouli', 'Geranium', 'Elemi'],
      base: ['Ambroxan', 'Cedar', 'Labdanum']
    },
    accords: { 'fresh spicy': 100, aromatic: 85, citrus: 78, amber: 70, woody: 62, musky: 50 },
    community: [60, 140, 520, 180, 780, 210, 3.9, 3.4],
    wardrobe: 'collection', wears: [1, 4, 9, 15, 22, 30, 41], rating: 8, bottle: { type: 'full bottle', sizeMl: 100, remainingPct: 60 }
  },
  {
    name: 'Aventus', house: 'Creed', year: 2010, concentration: 'EDP', perfumers: 'Olivier Creed, Erwin Creed', gender: 'for men',
    description: 'A fruity-smoky woody scent with a pineapple opening.',
    notes: {
      top: ['Bergamot', 'Black Currant', 'Apple', 'Pineapple'],
      heart: ['Birch', 'Patchouli', 'Moroccan Jasmine', 'Rose'],
      base: ['Musk', 'Oakmoss', 'Ambergris', 'Vanilla']
    },
    accords: { fruity: 100, citrus: 80, woody: 70, smoky: 60, musky: 50, fresh: 45 },
    community: [90, 330, 540, 240, 690, 320, 3.8, 3.5],
    wardrobe: 'wishlist',
    impression: 'Bright smoky pineapple on a clean musky base. Confident and polished.'
  },
  {
    name: 'Bleu de Chanel', house: 'Chanel', year: 2014, concentration: 'EDP', perfumers: 'Jacques Polge', gender: 'for men',
    description: 'A fresh, woody-citrus scent that sits comfortably between casual and formal.',
    notes: {
      top: ['Grapefruit', 'Lemon', 'Mint', 'Pink Pepper'],
      heart: ['Ginger', 'Nutmeg', 'Jasmine', 'Iso E Super'],
      base: ['Incense', 'Vetiver', 'Cedar', 'Sandalwood', 'Patchouli', 'Labdanum', 'Amber', 'White Musk']
    },
    accords: { woody: 100, citrus: 85, 'fresh spicy': 70, aromatic: 62, amber: 50, musky: 45 },
    community: [180, 260, 380, 330, 640, 410, 3.8, 3.3],
    wardrobe: 'collection', wears: [2, 6, 13, 20], rating: 9, bottle: { type: 'full bottle', sizeMl: 50, remainingPct: 85 }
  },
  {
    name: 'Black Opium', house: 'Yves Saint Laurent', year: 2014, concentration: 'EDP', perfumers: 'Nathalie Lorson, Marie Salamagne, Olivier Cresp, Honorine Blanc', gender: 'for women',
    description: 'A sweet, coffee-led gourmand floral for the evening.',
    notes: {
      top: ['Pear', 'Pink Pepper', 'Orange Blossom'],
      heart: ['Coffee', 'Jasmine', 'Bitter Almond', 'Licorice'],
      base: ['Vanilla', 'Patchouli', 'Cedar', 'Cashmeran']
    },
    accords: { sweet: 100, vanilla: 90, coffee: 80, 'warm spicy': 55, 'white floral': 50, powdery: 35 },
    community: [420, 120, 60, 310, 250, 780, 3.7, 3.4],
    wardrobe: 'collection', wears: [8, 21], rating: 7, bottle: { type: 'full bottle', sizeMl: 50, remainingPct: 40 }
  },
  {
    name: 'Tobacco Vanille', house: 'Tom Ford', year: 2007, concentration: 'EDP', perfumers: 'Harry Fremont', gender: 'unisex',
    description: 'A rich, warm blend of tobacco, spice and vanilla.',
    notes: {
      top: ['Tobacco Leaf', 'Spicy Notes'],
      heart: ['Tonka Bean', 'Vanilla', 'Cacao', 'Tobacco Blossom'],
      base: ['Dried Fruits', 'Woody Notes']
    },
    accords: { sweet: 100, tobacco: 90, vanilla: 85, 'warm spicy': 80, aromatic: 50, woody: 45 },
    community: [780, 90, 20, 440, 160, 840, 4.2, 3.7],
    wardrobe: 'wishlist',
    impression: 'Thick pipe tobacco wrapped in sweet vanilla. Cosy, a little decadent, like a winter lounge.'
  },
  {
    name: 'Santal 33', house: 'Le Labo', year: 2011, concentration: 'EDP', perfumers: 'Frank Voelkl', gender: 'unisex',
    description: 'A dry, smoky sandalwood with leather and cardamom. No pyramid is published for this one.',
    notes: { general: ['Sandalwood', 'Cedar', 'Cardamom', 'Iris', 'Violet', 'Leather', 'Papyrus', 'Ambergris'] },
    accords: { woody: 100, 'warm spicy': 70, leather: 60, powdery: 45, aromatic: 40, earthy: 35 },
    community: [310, 210, 130, 380, 420, 340, 3.5, 3.1],
    wardrobe: 'collection', wears: [3, 10, 17, 26, 33], rating: 8, bottle: { type: 'decant', sizeMl: 10, remainingPct: 70 }
  },
  {
    name: 'Acqua di Giò', house: 'Giorgio Armani', year: 1996, concentration: 'EDT', perfumers: 'Alberto Morillas', gender: 'for men',
    description: 'A classic marine freshness with citrus and a touch of woods.',
    notes: {
      top: ['Lime', 'Lemon', 'Bergamot', 'Jasmine', 'Orange', 'Mandarin'],
      heart: ['Sea Notes', 'Peach', 'Freesia', 'Hyacinth', 'Rosemary', 'Calone'],
      base: ['White Musk', 'Cedar', 'Oakmoss', 'Patchouli', 'Amber']
    },
    accords: { aquatic: 100, citrus: 85, fresh: 75, woody: 50, aromatic: 45, musky: 30 },
    community: [40, 220, 790, 120, 840, 130, 3.1, 2.8],
    wardrobe: 'collection', wears: [45], rating: 6, bottle: { type: 'full bottle', sizeMl: 100, remainingPct: 95 }
  },
  {
    name: "Angels' Share", house: 'By Kilian', year: 2020, concentration: 'EDP', perfumers: 'Calice Becker', gender: 'unisex',
    description: 'A boozy, sweet, woody scent with cinnamon and praline.',
    notes: {
      top: ['Cognac'],
      heart: ['Cinnamon', 'Tonka Bean', 'Oak'],
      base: ['Praline', 'Vanilla', 'Sandalwood']
    },
    accords: { sweet: 100, vanilla: 90, boozy: 82, 'warm spicy': 80, woody: 75, amber: 60 },
    community: [690, 80, 15, 350, 140, 760, 4.1, 3.5],
    wardrobe: 'to_try'
  },
  {
    name: 'Baccarat Rouge 540', house: 'Maison Francis Kurkdjian', year: 2015, concentration: 'EDP', perfumers: 'Francis Kurkdjian', gender: 'unisex',
    description: 'A luminous, airy and sweet amber-woody signature.',
    notes: {
      top: ['Saffron', 'Jasmine'],
      heart: ['Amberwood', 'Ambergris'],
      base: ['Fir Resin', 'Cedar']
    },
    accords: { amber: 100, woody: 85, sweet: 70, 'warm spicy': 60, 'fresh spicy': 50, musky: 40 },
    community: [440, 310, 170, 420, 510, 620, 4.0, 3.9],
    wardrobe: 'collection', wears: [1, 5, 7, 12, 19], rating: 9, bottle: { type: 'full bottle', sizeMl: 70, remainingPct: 75 }
  },
  {
    name: 'Light Blue', house: 'Dolce&Gabbana', year: 2001, concentration: 'EDT', perfumers: 'Olivier Cresp', gender: 'for women',
    description: 'A fresh, sparkling citrus-floral for hot days.',
    notes: {
      top: ['Sicilian Lemon', 'Apple', 'Cedar', 'Bellflower'],
      heart: ['Jasmine', 'White Rose', 'Bamboo'],
      base: ['Cedar', 'Musk', 'Amber']
    },
    accords: { citrus: 100, fresh: 85, woody: 60, floral: 50, fruity: 45, aromatic: 30 },
    community: [30, 260, 820, 90, 870, 90, 2.9, 2.7],
    wardrobe: 'to_try'
  },
  {
    name: 'Cool Water', house: 'Davidoff', year: 1988, concentration: 'EDT', perfumers: 'Pierre Bourdon', gender: 'for men',
    description: "A cool, aquatic scent from the era of fresh men's fragrances.",
    notes: { top: ['Mint', 'Lavender', 'Coriander'], heart: ['Jasmine', 'Neroli', 'Sandalwood'], base: ['Musk', 'Oakmoss', 'Amber'] },
    accords: { aquatic: 100, fresh: 85, aromatic: 70, woody: 40, musky: 35 },
    community: [60, 180, 520, 110, 700, 120, 3.0, 2.8],
    wardrobe: 'had', had: { years: '2003-2006', memory: 'My first bottle, bought with summer-job money.', reason: 'finished' },
    wears: [900, 1200]
  },
  {
    name: 'Kouros', house: 'Yves Saint Laurent', year: 1981, concentration: 'EDT', perfumers: 'Pierre Bourdon', gender: 'for men',
    description: 'A strongly animalic, aromatic classic.',
    notes: { top: ['Aldehydes', 'Coriander', 'Artemisia'], heart: ['Carnation', 'Patchouli', 'Vetiver'], base: ['Civet', 'Leather', 'Amber'] },
    accords: { animalic: 100, aromatic: 80, leather: 60, 'warm spicy': 50, powdery: 40, amber: 40 },
    community: [350, 220, 90, 300, 300, 420, 4.0, 3.8],
    wardrobe: 'garbage', dislikeNote: 'Far too animalic on me, smells like a locker room after an hour.'
  }
]

/** Adds the sample fragrances (flagged is_sample so they can be removed). Safe to run repeatedly. */
export function seedSampleData(db: Db): number {
  let added = 0
  db.transaction(() => {
    for (const s of SAMPLE_FRAGRANCES) {
      const exists = db
        .prepare('SELECT 1 FROM fragrances WHERE lower(name) = lower(?) AND lower(house) = lower(?) AND lower(concentration) = lower(?)')
        .get(s.name, s.house, s.concentration)
      if (exists) continue

      const id = Number(
        db
          .prepare(
            `INSERT INTO fragrances (name, house, year, concentration, perfumers, gender, description, is_sample)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
          )
          .run(s.name, s.house, s.year, s.concentration, s.perfumers, s.gender, s.description).lastInsertRowid
      )

      const addNote = db.prepare('INSERT OR IGNORE INTO fragrance_notes (fragrance_id, note_id, layer) VALUES (?, ?, ?)')
      for (const [layer, names] of Object.entries(s.notes) as [NoteLayer, string[]][]) {
        for (const n of names) addNote.run(id, upsertNote(db, n, familyOf(n)), layer)
      }

      const addAccord = db.prepare('INSERT INTO fragrance_accords (fragrance_id, accord_id, strength) VALUES (?, ?, ?)')
      for (const [a, strength] of Object.entries(s.accords)) addAccord.run(id, upsertAccord(db, a, accordColor(a)), strength)

      const c = s.community
      db.prepare(
        `INSERT INTO fragrance_community (fragrance_id, winter, spring, summer, fall, day, night, longevity, sillage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, ...c)

      const res = moveToWardrobe(db, {
        fragranceId: id,
        to: s.wardrobe,
        impression: s.impression,
        dislikeNote: s.dislikeNote,
        had: s.had,
        bottle: s.bottle && { type: s.bottle.type, sizeMl: s.bottle.sizeMl, remainingMl: (s.bottle.sizeMl * s.bottle.remainingPct) / 100 }
      })
      if (!res.ok) throw new Error(`Seeding ${s.name}: ${res.message}`)
      const wear = db.prepare(
        `INSERT INTO wear_log (fragrance_id, bottle_id, worn_at, sprays, projection, longevity_hours)
         VALUES (?, (SELECT id FROM bottles WHERE fragrance_id = ? LIMIT 1), datetime('now', ?), 4, ?, ?)`
      )
      for (const [i, daysAgo] of (s.wears ?? []).entries()) wear.run(id, id, `-${daysAgo} days`, 2 + (i % 3), 5 + (i % 4))
      if (s.rating) db.prepare('UPDATE wardrobe_items SET rating = ? WHERE fragrance_id = ?').run(s.rating, id)
      added++
    }
  })()
  return added
}

/** Removes only sample rows (cascades), then prunes notes/accords nothing references any more. */
export function clearSampleData(db: Db): number {
  let removed = 0
  db.transaction(() => {
    // Wardrobe rows go first so the wishlist-impression triggers don't block the cascade.
    db.prepare('DELETE FROM wardrobe_items WHERE fragrance_id IN (SELECT id FROM fragrances WHERE is_sample = 1)').run()
    removed = db.prepare('DELETE FROM fragrances WHERE is_sample = 1').run().changes
    pruneBrokenCombos(db)
    db.prepare('DELETE FROM notes WHERE id NOT IN (SELECT note_id FROM fragrance_notes)').run()
    db.prepare('DELETE FROM accords WHERE id NOT IN (SELECT accord_id FROM fragrance_accords)').run()
  })()
  return removed
}
