import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { FragranceDetail, FragranceSummary, HadReason, NoteEntry, WardrobeKind, WearEntry } from '@shared/types'
import { HAD_REASON_LABEL, WARDROBE_LABEL, WARDROBES } from '../../lib/shelf'
import { HadDialog } from '../WardrobeDialogs'
import BottleSvg from '../BottleSvg'
import { ghostBtn, Modal, primaryBtn } from '../Dialogs'
import AccordBars from './AccordBars'
import BottlesSection from './BottlesSection'
import CommunityCharts from './CommunityCharts'
import Journal, { ImpressionEditor } from './Journal'
import NotesPyramid from './NotesPyramid'
import PerformanceCard from './PerformanceCard'

const KINDS: WardrobeKind[] = WARDROBES

/** Notes that belong to a particular wardrobe, plus the old bottles of a fragrance I bought again. */
function WardrobeNotes({ d, onChanged, say }: { d: FragranceDetail; onChanged: () => void; say: (m: string) => void }) {
  const [editGarbage, setEditGarbage] = useState(false)
  const [note, setNote] = useState(d.dislikeNote ?? '')
  const [editHad, setEditHad] = useState(false)

  const saveGarbage = async () => {
    const r = await window.api.wardrobe.setDetails(d.id, { dislikeNote: note })
    if (!r.ok) return say(r.message)
    setEditGarbage(false)
    onChanged()
  }

  return (
    <>
      {d.wardrobe === 'garbage' && (
        <div className="mb-5 rounded-lg border border-red-900/60 bg-red-950/30 p-3">
          <div className="text-[11px] uppercase tracking-wider text-red-300/80">Why I dislike it</div>
          {editGarbage ? (
            <>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded border border-ink-600 bg-ink-900 p-2 text-sm text-cream" autoFocus />
              <div className="mt-2 flex gap-2">
                <button className={primaryBtn} onClick={saveGarbage}>
                  Save
                </button>
                <button className={ghostBtn} onClick={() => { setEditGarbage(false); setNote(d.dislikeNote ?? '') }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-cream/85">
              {d.dislikeNote ? `“${d.dislikeNote}”` : <span className="text-cream/45">No reason written down.</span>}{' '}
              <button className="ml-2 text-xs underline hover:text-cream" onClick={() => setEditGarbage(true)}>
                Edit
              </button>
            </p>
          )}
        </div>
      )}

      {d.wardrobe === 'had' && (
        <div className="mb-5 rounded-lg border p-3" style={{ borderColor: '#8d6a45aa', background: '#6a4d2e22' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#d3b88a' }}>
            Keepsake
          </div>
          <dl className="mt-1 grid grid-cols-[7rem_1fr] gap-y-1 text-sm">
            <dt className="text-cream/50">Years I wore it</dt>
            <dd>{d.hadYears ?? <span className="text-cream/40">not noted</span>}</dd>
            <dt className="text-cream/50">Why it left</dt>
            <dd>{d.hadReason ? HAD_REASON_LABEL[d.hadReason] : <span className="text-cream/40">not noted</span>}</dd>
            <dt className="text-cream/50">A memory</dt>
            <dd className="italic">{d.hadMemory ? `“${d.hadMemory}”` : <span className="not-italic text-cream/40">none yet</span>}</dd>
          </dl>
          <button className="mt-2 text-xs underline hover:text-cream" onClick={() => setEditHad(true)}>
            Edit
          </button>
          {editHad && (
            <HadDialog
              title={`${d.name}: years, memory, why it left`}
              initial={{ years: d.hadYears, memory: d.hadMemory, reason: d.hadReason }}
              submitLabel="Save"
              onCancel={() => setEditHad(false)}
              onSubmit={async (had) => {
                const r = await window.api.wardrobe.setDetails(d.id, { had })
                if (!r.ok) return say(r.message)
                setEditHad(false)
                onChanged()
              }}
            />
          )}
        </div>
      )}

      {d.pastBottles.length > 0 && (
        <div className="mb-5 rounded-lg border p-3" style={{ borderColor: '#8d6a45aa', background: '#6a4d2e22' }}>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: '#d3b88a' }}>
            Previous bottles
          </div>
          <ul className="mt-1 space-y-1 text-sm">
            {d.pastBottles.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.years ?? 'Earlier'}</span>
                {p.reason && <span className="text-cream/55"> · {HAD_REASON_LABEL[p.reason].toLowerCase()}</span>}
                {p.memory && <span className="italic text-cream/75"> · “{p.memory}”</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="mb-2 border-b border-ink-600 pb-1 font-display text-base text-brass-400">{title}</h3>
      {children}
    </section>
  )
}

interface Props {
  id: number
  /** Bumped by the page whenever data changed elsewhere, so the panel reloads. */
  rev: number
  onClose: () => void
  onChanged: () => void
  onEdit: (d: FragranceDetail) => void
  onMove: (f: FragranceSummary, to: WardrobeKind) => void
  onOpen: (id: number) => void
  onLogWear: (id: number) => void
  onLastBottleGone: (f: FragranceSummary, reason: HadReason) => void
  onAddToLab: (id: number) => void
  onEditWear: (w: WearEntry) => void
  say: (m: string) => void
}

export default function DetailPanel({ id, rev, onClose, onChanged, onEdit, onMove, onOpen, onLogWear, onAddToLab, onLastBottleGone, onEditWear, say }: Props) {
  const [d, setD] = useState<FragranceDetail | null>(null)
  const [note, setNote] = useState<NoteEntry | null>(null)
  const [others, setOthers] = useState<FragranceSummary[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [wears, setWears] = useState<WearEntry[]>([])
  const [confirmWear, setConfirmWear] = useState<number | null>(null)

  const load = useCallback(async () => setD(await window.api.fragrances.get(id)), [id])

  useEffect(() => {
    void load()
    void window.api.wears.list({ fragranceId: id, limit: 8 }).then(setWears)
  }, [load, id, rev])

  useEffect(() => {
    setNote(null)
  }, [id])

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !confirmDelete && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, confirmDelete])

  const changed = () => {
    onChanged()
  }

  const pickNote = async (n: NoteEntry) => {
    if (note?.id === n.id) return setNote(null)
    setNote(n)
    setOthers(await window.api.fragrances.ownedWithNote(n.id, id))
  }

  const setRating = async (v: number | null) => {
    const r = await window.api.wardrobe.setRating(id, v)
    if (!r.ok) say(r.message)
    changed()
  }

  const remove = async () => {
    const r = await window.api.fragrances.delete(id)
    setConfirmDelete(false)
    if (!r.ok) return say(r.message)
    say(`${d?.name} deleted.`)
    onClose()
    changed()
  }

  if (!d) return null
  const owned = d.wardrobe === 'collection'
  // Wanted or to-try fragrances can still hold a sample or decant I have of them.
  const showBottles = owned || d.wardrobe === 'wishlist' || d.wardrobe === 'to_try' || d.bottles.length > 0

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6" onMouseDown={onClose}>
      <div
        className="lift-in flex max-h-full w-full max-w-5xl overflow-hidden rounded-2xl border border-ink-600 bg-ink-800 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={d.name}
      >
        {/* left rail */}
        <aside className="flex w-72 shrink-0 flex-col items-center overflow-y-auto border-r border-ink-600 bg-gradient-to-b from-ink-700 to-ink-900 p-5">
          <div className="relative mt-1 flex h-[236px] items-end justify-center">
            <div className="pointer-events-none absolute inset-0 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle at 50% 40%, rgba(255,200,120,.25), transparent 65%)' }} />
            <div style={{ filter: 'drop-shadow(0 12px 8px rgba(0,0,0,.6))' }}>
              <BottleSvg fragrance={d} showLevel={owned} scale={1.2} />
            </div>
          </div>
          <div className="mt-3 h-2 w-40 rounded-full bg-black/50 blur-md" />
          <h2 className="mt-3 text-center font-display text-2xl leading-tight text-cream">{d.name}</h2>
          <div className="mt-1 text-center text-brass-400">{d.house}</div>
          <div className="mt-1 text-center text-xs text-cream/60">
            {[d.year, d.concentration, d.gender].filter(Boolean).join(' · ')}
          </div>
          {d.perfumers && <div className="mt-1 text-center text-xs text-cream/50">Perfumer: {d.perfumers}</div>}
          {d.wardrobe && <div className="mt-2 rounded-full border border-brass-500/40 px-3 py-0.5 text-[11px] text-brass-400">{WARDROBE_LABEL[d.wardrobe]}</div>}
          {d.isForeign && (
            <div className="mt-2 rounded-full border border-cream/30 px-3 py-0.5 text-[11px] text-cream/70" title="You wore it, but it is not yours. Move it to a wardrobe to keep it.">
              Not mine
            </div>
          )}

          {d.wardrobe && (
            <div className="mt-4 w-full">
              <div className="mb-1 text-center text-[11px] uppercase tracking-wider text-cream/50">My rating {d.rating ? `· ${d.rating}/10` : ''}</div>
              <div className="flex justify-center gap-0.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    aria-label={`Rate ${n}`}
                    title={d.rating === n ? 'Click again to clear' : `${n}/10`}
                    onClick={() => setRating(d.rating === n ? null : n)}
                    className={`h-6 w-5 rounded text-[11px] ${d.rating && n <= d.rating ? 'bg-brass-500 text-[#17110b]' : 'bg-ink-900 text-cream/50 hover:bg-ink-600'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 flex w-full flex-col gap-2">
            <button className={primaryBtn} onClick={() => onLogWear(d.id)}>
              Log a wear
            </button>
            <button
              className={`${ghostBtn} ${owned ? '' : 'opacity-50'}`}
              disabled={!owned}
              title={owned ? 'Open the Layering Lab with this fragrance' : 'Only fragrances in My Collection can be layered'}
              onClick={() => onAddToLab(d.id)}
            >
              Add to Layering Lab
            </button>
            <button className={ghostBtn} onClick={() => onEdit(d)}>
              Edit
            </button>
            <button
              className={ghostBtn}
              onClick={async () => {
                const r = await window.api.images.replace(d.id, true)
                if (!r.ok) say(r.message)
                else if (r.data) changed()
              }}
              title="Choose your own photo. A plain white background is made transparent."
            >
              {d.imagePath ? 'Replace photo' : 'Use my own photo'}
            </button>
            <div className="relative">
              <button className={`${ghostBtn} w-full`} onClick={() => setMenuOpen((v) => !v)}>
                Move to wardrobe ▾
              </button>
              {menuOpen && (
                <div className="absolute bottom-full z-10 mb-1 w-full rounded-lg border border-ink-600 bg-ink-800 py-1 shadow-xl">
                  {KINDS.filter((k) => k !== d.wardrobe).map((k) => (
                    <button key={k} className="block w-full px-3 py-2 text-left text-sm hover:bg-ink-600" onClick={() => { setMenuOpen(false); onMove(d, k) }}>
                      {WARDROBE_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="rounded-md border border-red-900/70 px-4 py-2 text-sm text-red-300 hover:bg-red-950/50" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          </div>
        </aside>

        {/* right content */}
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <button className="float-right rounded px-2 text-xl text-cream/50 hover:text-cream" onClick={onClose} aria-label="Close">
            ×
          </button>
          {d.description && <p className="mb-5 text-sm text-cream/70">{d.description}</p>}
          <WardrobeNotes d={d} onChanged={changed} say={say} />

          <Section title="Notes">
            <NotesPyramid notes={d.notes} selectedId={note?.id ?? null} onSelect={pickNote} />
            {note && (
              <div className="mt-3 rounded-lg border border-ink-600 bg-ink-900/60 p-3 text-sm">
                <div className="mb-1 text-xs text-cream/60">Other fragrances in your collection with {note.name}:</div>
                {others.length === 0 ? (
                  <span className="text-cream/50">None.</span>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {others.map((o) => (
                      <button key={o.id} className="rounded-full border border-brass-500/40 px-3 py-1 text-xs text-brass-400 hover:bg-brass-500/20" onClick={() => onOpen(o.id)}>
                        {o.name} <span className="text-cream/50">· {o.house}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section title="Main accords">
            <AccordBars accords={d.accords} />
          </Section>

          <Section title="Community">
            <CommunityCharts c={d.community} />
          </Section>

          <Section title="My performance">
            <PerformanceCard p={d.performance} community={d.community} />
          </Section>

          <Section title="Wear history">
            {wears.length === 0 ? (
              <p className="text-sm text-cream/50">No wears logged yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {wears.map((w) => (
                  <li key={w.id} className="rounded-lg border border-ink-600 bg-ink-900/60 px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {w.wornAt.slice(0, 16)} <span className="text-cream/50">· {w.sprays} spray{w.sprays === 1 ? '' : 's'}</span>
                        {w.activity && <span className="text-cream/50"> · {w.activity}</span>}
                      </span>
                      <span className="flex shrink-0 gap-3 text-xs text-cream/50">
                        {confirmWear === w.id ? (
                          <>
                            Delete?
                            <button className="text-red-300 underline" onClick={async () => { setConfirmWear(null); const r = await window.api.wears.delete(w.id); if (!r.ok) say(r.message); changed() }}>
                              Yes
                            </button>
                            <button className="underline" onClick={() => setConfirmWear(null)}>
                              No
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="underline hover:text-cream" onClick={() => onEditWear(w)}>
                              Edit
                            </button>
                            <button className="underline hover:text-cream" onClick={() => setConfirmWear(w.id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-cream/50">
                      {[
                        w.projection != null && `projection ${w.projection}/5`,
                        w.longevityHours != null ? `${w.longevityHours} h` : 'longevity not recorded',
                        w.compliments > 0 && `${w.compliments} compliment${w.compliments === 1 ? '' : 's'}`,
                        w.weather && `${w.temperatureC != null ? `${w.temperatureC}°C ` : ''}${w.weather}`
                      ].filter(Boolean).join(' · ')}
                    </div>
                    {w.notes && <div className="mt-1 text-xs italic text-cream/70">{w.notes}</div>}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {showBottles && (
            <Section title={owned ? 'Bottles' : 'Samples and decants I have'}>
              <BottlesSection d={d} onChanged={changed} onNoBottlesLeft={(reason) => onLastBottleGone(d, reason)} say={say} />
            </Section>
          )}

          <Section title="What it smells like to me">
            {d.importedPending && (
              <p className="mb-2 rounded-lg border border-brass-500/40 bg-brass-500/10 px-3 py-2 text-xs text-cream/80">
                Imported from Fragrantica without a note. Write what it smells like to you; from then on the usual wishlist rule applies.
              </p>
            )}
            <ImpressionEditor key={`${d.id}-${d.impression}`} d={d} onChanged={changed} />
          </Section>

          <Section title="My notes">
            <Journal d={d} onChanged={changed} say={say} />
          </Section>

          {d.sourceUrl && <p className="mt-6 break-all text-xs text-cream/35">Source: {d.sourceUrl}</p>}
        </div>
      </div>

      {confirmDelete && (
        <Modal title={`Delete ${d.name}?`} onClose={() => setConfirmDelete(false)}>
          <p className="text-sm text-cream/80">
            This permanently removes the fragrance together with its bottles, wear history, notes and journal. This can't be undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={ghostBtn} onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600" onClick={remove}>
              Delete permanently
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
