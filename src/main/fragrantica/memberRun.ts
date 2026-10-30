import type { FragranceInput, FragranticaResult, MemberImportProgress, MemberImportResult, MemberItem, Placement, Result, WardrobeKind } from '@shared/types'
import type { Db } from '../db'
import { createFragrance } from '../db/editing'
import { applyMove, wardrobesOf } from '../db/memberships'
import { identityKey, previewItems, TARGET, type ExistingFragrance } from './memberParser'

/** Bottle sizes are not on Fragrantica, so a Have entry gets a full 100 ml bottle to be corrected by hand. */
export const PLACEHOLDER_BOTTLE = { type: 'full bottle', sizeMl: 100 } as const

export function existingFragrances(db: Db): ExistingFragrance[] {
  const rows = db.prepare('SELECT id, name, house, source_url AS sourceUrl FROM fragrances').all() as Omit<ExistingFragrance, 'wardrobes'>[]
  return rows.map((r) => ({ ...r, wardrobes: wardrobesOf(db, r.id) }))
}

export interface RunDeps {
  /** Reads one fragrance page (null = names and houses only). */
  fetchPage: ((url: string) => Promise<Result<FragranticaResult>>) | null
  resolveImages?: (input: FragranceInput) => Promise<unknown>
  onProgress?: (p: MemberImportProgress) => void
  cancelled?: () => boolean
}

function placementFor(target: WardrobeKind): Placement {
  return target === 'collection' ? { to: 'collection', bottle: { ...PLACEHOLDER_BOTTLE } } : { to: target }
}

/**
 * Adds what the preview says to add (recomputed here against the database, so a stale preview cannot create
 * duplicates): new fragrances are created in their wardrobe, and a fragrance that is already in the app, or that is in
 * several lists of the profile, gets one membership per list. Entries come in through the importer path: a wishlist
 * membership without a smell note is allowed and marked "needs a note".
 */
export async function runMemberImport(db: Db, items: MemberItem[], deps: RunDeps): Promise<MemberImportResult> {
  const todo = previewItems(items, existingFragrances(db))
  const work = todo.filter((i) => i.status === 'new' || i.status === 'adds')
  const result: MemberImportResult = { added: [], skipped: todo.length - work.length, withoutDetails: 0, failed: [], cancelled: false }
  const counts = new Map<WardrobeKind, number>()
  /** Fragrances created during this run, by identity, so a second list adds to the first one's fragrance. */
  const made = new Map<string, number>()
  const existingIds = new Map(existingFragrances(db).map((e) => [identityKey(e.house, e.name), e.id]))

  // Creations first (strongest list first), then the extra memberships.
  work.sort((a, b) => Number(b.status === 'new') - Number(a.status === 'new'))
  let done = 0
  for (const it of work) {
    if (deps.cancelled?.()) {
      result.cancelled = true
      break
    }
    const key = identityKey(it.house, it.name)
    const target = TARGET[it.list]
    deps.onProgress?.({ done, total: work.length, current: `${it.name} · ${it.house}` })
    try {
      if (it.status === 'new') {
        let input: FragranceInput = { name: it.name, house: it.house, sourceUrl: it.url, notes: [], accords: [] }
        if (deps.fetchPage && it.url) {
          const page = await deps.fetchPage(it.url)
          if (page.ok && page.data.input.name && page.data.input.house) {
            input = { ...page.data.input, sourceUrl: page.data.input.sourceUrl ?? it.url }
            await deps.resolveImages?.(input)
          } else result.withoutDetails++
        }
        const r = createFragrance(db, input, placementFor(target), { imported: true })
        if (!r.ok) throw new Error(r.message)
        made.set(key, r.data.id)
      } else {
        const id = made.get(key) ?? existingIds.get(key) ?? findByUrl(db, it.fragranticaId)
        if (id == null) throw new Error('Could not find the fragrance to add this wardrobe to.')
        applyMove(db, { fragranceId: id, to: target, ...(target === 'collection' ? { bottle: { ...PLACEHOLDER_BOTTLE } } : {}) }, { imported: true })
      }
      counts.set(target, (counts.get(target) ?? 0) + 1)
    } catch (e) {
      result.failed.push({ name: `${it.name} · ${it.house}`, message: (e as Error).message })
    }
    done++
  }
  deps.onProgress?.({ done, total: work.length, current: '' })
  result.added = [...counts].map(([wardrobe, count]) => ({ wardrobe, count }))
  return result
}

function findByUrl(db: Db, fragranticaId: number | null): number | null {
  if (fragranticaId == null) return null
  const row = db.prepare("SELECT id FROM fragrances WHERE source_url LIKE ?").get(`%-${fragranticaId}.html%`) as { id: number } | undefined
  return row?.id ?? null
}
