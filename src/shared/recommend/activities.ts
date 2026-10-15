export interface ActivityProfile {
  key: string
  /** Target projection on the community's 1-4 scale (1 intimate .. 4 enormous). */
  projection: number
  /** How much long wear matters, 0-1. */
  longevityNeed: number
  /** Accords that suit the occasion (weight 0-1) and ones that do not. */
  likes: Record<string, number>
  dislikes: Record<string, number>
}

const FRESH_CLEAN = { fresh: 1, citrus: 1, aquatic: 1, green: 0.8, aromatic: 0.8, herbal: 0.7, 'fresh spicy': 0.6, ozonic: 0.7, musky: 0.3, woody: 0.2 }
const LOUD_HEAVY = { oud: 1, animalic: 1, tobacco: 0.8, leather: 0.7, smoky: 0.8, boozy: 0.6, caramel: 0.7, coffee: 0.5, sweet: 0.5, balsamic: 0.5 }

export const PROFILES: Record<string, ActivityProfile> = {
  office: {
    key: 'office',
    projection: 1.8,
    longevityNeed: 0.5,
    likes: { fresh: 0.9, citrus: 0.8, woody: 0.8, aromatic: 0.8, musky: 0.9, powdery: 0.6, green: 0.6, iris: 0.6, lavender: 0.5, 'fresh spicy': 0.5, herbal: 0.5 },
    dislikes: { ...LOUD_HEAVY, vanilla: 0.2, 'warm spicy': 0.2 }
  },
  gym: {
    key: 'gym',
    projection: 1.5,
    longevityNeed: 0.2,
    likes: { ...FRESH_CLEAN, citrus: 1, aquatic: 1 },
    dislikes: { ...LOUD_HEAVY, vanilla: 0.7, amber: 0.5, 'warm spicy': 0.5, powdery: 0.4, 'white floral': 0.5 }
  },
  casual: {
    key: 'casual',
    projection: 2.4,
    longevityNeed: 0.4,
    likes: { fresh: 0.5, woody: 0.5, citrus: 0.5, aromatic: 0.5, fruity: 0.5, musky: 0.5, 'fresh spicy': 0.5 },
    dislikes: { oud: 0.4, animalic: 0.4 }
  },
  date: {
    key: 'date',
    projection: 2.8,
    longevityNeed: 0.6,
    likes: { sweet: 0.8, vanilla: 1, amber: 0.9, 'warm spicy': 0.8, musky: 0.7, woody: 0.6, rose: 0.7, 'white floral': 0.5, fruity: 0.4, tobacco: 0.4, powdery: 0.4, leather: 0.4 },
    dislikes: { aquatic: 0.7, green: 0.4, fresh: 0.3, soapy: 0.6, aldehydic: 0.4, rubber: 0.6 }
  },
  nightOut: {
    key: 'nightOut',
    projection: 3.4,
    longevityNeed: 0.6,
    likes: { sweet: 0.8, amber: 0.8, vanilla: 0.7, fruity: 0.7, boozy: 0.8, oud: 0.7, 'warm spicy': 0.7, 'fresh spicy': 0.6, leather: 0.5, smoky: 0.5, woody: 0.5, tobacco: 0.5 },
    dislikes: { aquatic: 0.6, green: 0.5, soapy: 0.6, powdery: 0.3, herbal: 0.3 }
  },
  formal: {
    key: 'formal',
    projection: 2.5,
    longevityNeed: 0.7,
    likes: { woody: 0.9, powdery: 0.7, 'white floral': 0.6, floral: 0.6, rose: 0.7, iris: 0.8, aromatic: 0.6, musky: 0.7, leather: 0.5, amber: 0.5, citrus: 0.4 },
    dislikes: { aquatic: 0.5, tropical: 0.7, coconut: 0.7, sweet: 0.3, caramel: 0.6, rubber: 0.7, boozy: 0.3 }
  },
  wedding: {
    key: 'wedding',
    projection: 2.4,
    longevityNeed: 0.8,
    likes: { 'white floral': 0.8, floral: 0.8, powdery: 0.7, woody: 0.7, musky: 0.8, rose: 0.8, iris: 0.6, amber: 0.5, citrus: 0.4, vanilla: 0.4 },
    dislikes: { oud: 0.7, animalic: 0.8, smoky: 0.6, tobacco: 0.5, leather: 0.4, aquatic: 0.4, rubber: 0.8, boozy: 0.5 }
  },
  home: {
    key: 'home',
    projection: 1.8,
    longevityNeed: 0.2,
    likes: { vanilla: 0.9, amber: 0.8, powdery: 0.7, musky: 0.8, sweet: 0.7, woody: 0.5, 'warm spicy': 0.6, coffee: 0.5, caramel: 0.5, honey: 0.6 },
    dislikes: { aquatic: 0.2 }
  },
  travel: {
    key: 'travel',
    projection: 2.0,
    longevityNeed: 0.8,
    likes: { fresh: 0.6, woody: 0.8, musky: 0.8, citrus: 0.5, aromatic: 0.6, amber: 0.5, 'fresh spicy': 0.6, powdery: 0.4 },
    dislikes: { ...LOUD_HEAVY, boozy: 0.5 }
  }
}

/** Anything not recognised (a custom activity) is neutral: moderate projection, no accord preferences. */
export const NEUTRAL_PROFILE: ActivityProfile = { key: 'custom', projection: 2.4, longevityNeed: 0.4, likes: {}, dislikes: {} }

const MATCHERS: [RegExp, string][] = [
  [/\b(office|work|business|meeting|school|class|study|interview)\b/i, 'office'],
  [/\b(gym|sport|workout|training|run|running|yoga|exercise|hiking)\b/i, 'gym'],
  [/\b(date|romantic|dinner for two|anniversary)\b/i, 'date'],
  [/\b(night ?out|club|party|bar|concert|festival)\b/i, 'nightOut'],
  [/\b(formal|gala|black tie|ceremony|opera|funeral)\b/i, 'formal'],
  [/\bwedding\b/i, 'wedding'],
  [/\b(home|staying in|stay in|lounge|relax|chill|movie)\b/i, 'home'],
  [/\b(travel|trip|flight|airport|vacation|holiday)\b/i, 'travel'],
  [/\b(casual|day|errands|shopping|weekend|brunch|lunch|walk)\b/i, 'casual']
]

export function profileFor(activity: string): ActivityProfile {
  for (const [re, key] of MATCHERS) if (re.test(activity)) return PROFILES[key]
  return NEUTRAL_PROFILE
}

// ---- warmth ------------------------------------------------------------------------------------

const WARM_WEATHER_ACCORDS = new Set(['citrus', 'fresh', 'aquatic', 'green', 'ozonic', 'fruity', 'herbal', 'tropical', 'coconut', 'aromatic', 'marine', 'salty', 'soapy', 'terpenic'])
const COLD_WEATHER_ACCORDS = new Set(['amber', 'vanilla', 'oud', 'warm spicy', 'tobacco', 'leather', 'balsamic', 'boozy', 'sweet', 'caramel', 'coffee', 'honey', 'cinnamon', 'smoky', 'animalic', 'chocolate', 'cacao', 'nutty', 'rum', 'whiskey', 'beeswax'])

/**
 * -1 (very fresh / light) .. +1 (very warm / heavy), from how strong the fresh vs. the cosy accords are.
 * Accords in neither group (woody, floral...) dilute the result towards 0.
 */
export function warmthIndex(accords: { name: string; strength: number }[]): number {
  let warm = 0
  let fresh = 0
  let total = 0
  for (const a of accords) {
    const n = a.name.trim().toLowerCase()
    total += a.strength
    if (COLD_WEATHER_ACCORDS.has(n)) warm += a.strength
    else if (WARM_WEATHER_ACCORDS.has(n)) fresh += a.strength
    else if (n === 'fresh spicy') fresh += a.strength * 0.5
  }
  if (total <= 0) return 0
  // Weighted against the strongest accords so that one small accord cannot swing it.
  return Math.max(-1, Math.min(1, ((warm - fresh) / total) * 1.5))
}

/** The warmth a fragrance should have in this weather: fresh in the heat, rich in the cold. */
export function targetWarmth(temperatureC: number): number {
  return Math.max(-0.85, Math.min(0.85, (15 - temperatureC) / 17.5))
}
