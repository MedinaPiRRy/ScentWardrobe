import type { FragranceInput, FragranticaResult, MemberImportProgress, MemberImportResult, MemberItem, Placement, Result, WardrobeKind } from '@shared/types'
import type { Db } from '../db'
import { createFragrance } from '../db/editing'
import { previewItems, TARGET, type ExistingFragrance } from './memberParser'

/** Bottle sizes are not on Fragrantica, so a Have entry gets a full 100 ml bottle to be corrected by hand. */
export const PLACEHOLDER_BOTTLE = { type: 'full bottle', sizeMl: 100 } as const

export function existingFragrances(db: Db): ExistingFragrance[] {
  return db.prepare('SELECT id, name, house, source_url AS sourceUrl FROM fragrances').all() as ExistingFragrance[]
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
 * Adds the items that are new (recomputed here against the database, so a stale preview cannot create duplicates).
 * Entries come in through the importer path: a wishlist item without a smell note is allowed and marked "needs a note".
 */
export async function runMemberImport(db: Db, items: MemberItem[], deps: RunDeps): Promise<MemberImportResult> {
  const todo = previewItems(items, existingFragrances(db))
  const fresh = todo.filter((i) => i.status === 'new')
  const result: MemberImportResult = { added: [], skipped: todo.length - fresh.length, withoutDetails: 0, failed: [], cancelled: false }
  const counts = new Map<WardrobeKind, number>()

  let done = 0
  for (const it of fresh) {
    if (deps.cancelled?.()) {
      result.cancelled = true
      break
    }
    deps.onProgress?.({ done, total: fresh.length, current: `${it.name} · ${it.house}` })
    let input: FragranceInput = { name: it.name, house: it.house, sourceUrl: it.url, notes: [], accords: [] }
    if (deps.fetchPage && it.url) {
      const page = await deps.fetchPage(it.url)
      if (page.ok && page.data.input.name && page.data.input.house) {
        input = { ...page.data.input, sourceUrl: page.data.input.sourceUrl ?? it.url }
        await deps.resolveImages?.(input)
      } else result.withoutDetails++
    }
    const r = createFragrance(db, input, placementFor(TARGET[it.list]), { imported: true })
    if (r.ok) counts.set(TARGET[it.list], (counts.get(TARGET[it.list]) ?? 0) + 1)
    else result.failed.push({ name: `${it.name} · ${it.house}`, message: r.message })
    done++
  }
  deps.onProgress?.({ done, total: fresh.length, current: '' })
  result.added = [...counts].map(([wardrobe, count]) => ({ wardrobe, count }))
  return result
}
