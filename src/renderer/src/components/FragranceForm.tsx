import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type {
  BottleType,
  CatalogItem,
  CommunityData,
  FragranceDetail,
  FragranceInput,
  HadReason,
  NoteLayer,
  Placement,
  WardrobeKind
} from '@shared/types'
import { HAD_REASON_LABEL, WARDROBE_LABEL, WARDROBES } from '../lib/shelf'
import { ghostBtn, Modal, primaryBtn, SizePicker } from './Dialogs'

const field = 'mt-1 w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
const CONCENTRATIONS = ['EDC', 'EDT', 'EDP', 'Parfum', 'Extrait de Parfum', 'Elixir', 'Cologne', 'Other']
const GENDERS = ['for women', 'for men', 'unisex']
const LAYERS: { layer: NoteLayer; label: string; hint: string }[] = [
  { layer: 'top', label: 'Top notes', hint: 'First 15-30 minutes' },
  { layer: 'heart', label: 'Heart notes', hint: 'The body' },
  { layer: 'base', label: 'Base notes', hint: 'The drydown' },
  { layer: 'general', label: 'General notes', hint: 'For fragrances without a published pyramid' }
]
const BOTTLE_TYPES: BottleType[] = ['full bottle', 'travel/mini', 'decant', 'sample']
const EMPTY_COMMUNITY: CommunityData = { winter: 0, spring: 0, summer: 0, fall: 0, day: 0, night: 0, longevity: null, sillage: null }

interface AccordRow {
  key: number
  name: string
  color: string
  strength: number
}

function NoteEditor({ label, hint, names, onChange, listId }: { label: string; hint: string; names: string[]; onChange: (n: string[]) => void; listId: string }) {
  const [text, setText] = useState('')
  const add = () => {
    const parts = text.split(',').map((t) => t.trim()).filter(Boolean)
    if (!parts.length) return
    const next = [...names]
    for (const p of parts) if (!next.some((n) => n.toLowerCase() === p.toLowerCase())) next.push(p)
    onChange(next)
    setText('')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !text && names.length) onChange(names.slice(0, -1))
  }
  return (
    <div>
      <div className="text-sm text-cream/80">
        {label} <span className="text-xs text-cream/40">{hint}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded border border-ink-600 bg-ink-900 p-1.5">
        {names.map((n) => (
          <span key={n} className="flex items-center gap-1 rounded-full bg-ink-600 px-2 py-0.5 text-xs">
            {n}
            <button type="button" aria-label={`Remove ${n}`} className="text-cream/50 hover:text-cream" onClick={() => onChange(names.filter((x) => x !== n))}>
              ×
            </button>
          </span>
        ))}
        <input
          list={listId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder="Type a note, press Enter"
          className="min-w-[160px] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
    </div>
  )
}

function detailToInput(d: FragranceDetail): FragranceInput {
  return {
    name: d.name, house: d.house, year: d.year, concentration: d.concentration, perfumers: d.perfumers, gender: d.gender,
    description: d.description, sourceUrl: d.sourceUrl,
    notes: d.notes.map((n) => ({ name: n.name, layer: n.layer })),
    accords: d.accords.map((a) => ({ name: a.name, color: a.color, strength: a.strength })),
    community: d.community
  }
}

interface Props {
  mode: 'add' | 'edit'
  initial?: FragranceDetail
  /** Data from a dataset entry or a Fragrantica import. */
  prefill?: FragranceInput | null
  defaultWardrobe: WardrobeKind
  onClose: () => void
  /** Resolves with an error message when saving failed. */
  onSubmit: (input: FragranceInput, placement: Placement) => Promise<string | null>
}

export default function FragranceForm({ mode, initial, prefill, defaultWardrobe, onClose, onSubmit }: Props) {
  const seed = useMemo<FragranceInput | null>(() => (initial ? detailToInput(initial) : (prefill ?? null)), [initial, prefill])
  const [name, setName] = useState(seed?.name ?? '')
  const [house, setHouse] = useState(seed?.house ?? '')
  const [year, setYear] = useState(seed?.year ? String(seed.year) : '')
  const [concentration, setConcentration] = useState(seed ? (seed.concentration ?? '') : 'EDP')
  const [perfumers, setPerfumers] = useState(seed?.perfumers ?? '')
  const [gender, setGender] = useState(seed?.gender ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [sourceUrl, setSourceUrl] = useState(seed?.sourceUrl ?? '')

  const [notes, setNotes] = useState<Record<NoteLayer, string[]>>(() => {
    const base: Record<NoteLayer, string[]> = { top: [], heart: [], base: [], general: [] }
    for (const n of seed?.notes ?? []) base[n.layer].push(n.name)
    return base
  })
  const nextKey = useMemo(() => ({ n: 1 }), [])
  const [accords, setAccords] = useState<AccordRow[]>(() =>
    (seed?.accords ?? []).map((a) => ({ key: nextKey.n++, name: a.name, color: a.color ?? '#888888', strength: a.strength }))
  )
  const [community, setCommunity] = useState<CommunityData>(seed?.community ?? EMPTY_COMMUNITY)
  const [useCommunity, setUseCommunity] = useState(!!seed?.community)

  const [wardrobe, setWardrobe] = useState<WardrobeKind>(defaultWardrobe)
  const [impression, setImpression] = useState('')
  const [desiredSize, setDesiredSize] = useState('')
  const [bottleType, setBottleType] = useState<BottleType>('full bottle')
  const [bottleSize, setBottleSize] = useState('100')
  const [pct, setPct] = useState(100)
  const [dislike, setDislike] = useState('')
  const [hadYears, setHadYears] = useState('')
  const [hadMemory, setHadMemory] = useState('')
  const [hadReason, setHadReason] = useState<HadReason | null>(null)

  const [catalogNotes, setCatalogNotes] = useState<CatalogItem[]>([])
  const [catalogAccords, setCatalogAccords] = useState<CatalogItem[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (problems.length || serverError) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [problems, serverError])

  useEffect(() => {
    void window.api.catalog.notes().then(setCatalogNotes)
    void window.api.catalog.accords().then(setCatalogAccords)
  }, [])

  const setAccord = (key: number, patch: Partial<AccordRow>) => setAccords((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const onAccordName = (key: number, value: string) => {
    const known = catalogAccords.find((c) => c.name.toLowerCase() === value.toLowerCase())
    setAccord(key, known?.extra ? { name: value, color: known.extra } : { name: value })
  }
  const num = (v: number) => (Number.isFinite(v) ? v : 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: string[] = []
    if (!name.trim()) errs.push('Name is required.')
    if (!house.trim()) errs.push('House is required.')
    const y = year.trim() === '' ? null : parseInt(year, 10)
    if (y != null && !(y >= 1700 && y <= 2100)) errs.push('Year looks wrong.')
    if (accords.some((a) => !a.name.trim())) errs.push('Every accord needs a name (or remove the empty row).')

    const placement: Placement = { to: wardrobe }
    if (mode === 'add') {
      if (wardrobe === 'wishlist') {
        if (!impression.trim()) errs.push('The wishlist needs a description of what it smells like to you.')
        placement.impression = impression
        const ds = parseFloat(desiredSize)
        if (ds > 0) placement.desiredSizeMl = ds
      }
      if (wardrobe === 'garbage') placement.dislikeNote = dislike
      if (wardrobe === 'had') placement.had = { years: hadYears, memory: hadMemory, reason: hadReason }
      if (wardrobe === 'collection') {
        const sz = parseFloat(bottleSize)
        if (!(sz > 0)) errs.push('Enter a bottle size greater than 0 ml.')
        placement.bottle = { type: bottleType, sizeMl: sz, remainingMl: Math.round(sz * pct) / 100 }
      }
    }
    setProblems(errs)
    if (errs.length) return

    const input: FragranceInput = {
      name, house, year: y, concentration, perfumers, gender, description, sourceUrl,
      imageUrl: seed?.imageUrl ?? null,
      imagePath: seed?.imagePath ?? null,
      notes: LAYERS.flatMap(({ layer }) =>
        notes[layer].map((n) => ({ name: n, layer, iconUrl: seed?.notes.find((x) => x.name.toLowerCase() === n.toLowerCase())?.iconUrl ?? null }))
      ),
      accords: accords.map((a) => ({ name: a.name, color: a.color, strength: a.strength })),
      community: useCommunity ? community : null
    }
    setSaving(true)
    const err = await onSubmit(input, placement)
    setSaving(false)
    setServerError(err)
  }

  const cnum = (k: keyof CommunityData, label: string) => (
    <label className="text-xs text-cream/70">
      {label}
      <input
        type="number"
        min={0}
        step="any"
        value={community[k] ?? ''}
        onChange={(e) => setCommunity({ ...community, [k]: e.target.value === '' ? null : num(parseFloat(e.target.value)) })}
        className={field}
      />
    </label>
  )

  return (
    <Modal title={mode === 'add' ? 'Add a fragrance' : `Edit ${initial?.name}`} onClose={onClose} xl>
      <datalist id="note-catalog">
        {catalogNotes.map((n) => (
          <option key={n.id} value={n.name} />
        ))}
      </datalist>
      <datalist id="accord-catalog">
        {catalogAccords.map((n) => (
          <option key={n.id} value={n.name} />
        ))}
      </datalist>

      <form onSubmit={submit} className="space-y-6">
        <div className="grid grid-cols-6 gap-x-4 gap-y-3 text-sm text-cream/80">
          <label className="col-span-3">
            Name <span className="text-brass-400">*</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className="col-span-3">
            House <span className="text-brass-400">*</span>
            <input value={house} onChange={(e) => setHouse(e.target.value)} className={field} />
          </label>
          <label className="col-span-2">
            Year
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={field} />
          </label>
          <label className="col-span-2">
            Concentration
            <select value={concentration} onChange={(e) => setConcentration(e.target.value)} className={field}>
              {!CONCENTRATIONS.includes(concentration) && concentration && <option>{concentration}</option>}
              <option value="">(not set)</option>
              {CONCENTRATIONS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="col-span-2">
            Gender label
            <select value={gender} onChange={(e) => setGender(e.target.value)} className={field}>
              {!GENDERS.includes(gender) && gender && <option>{gender}</option>}
              <option value="">(not set)</option>
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="col-span-3">
            Perfumer(s)
            <input value={perfumers} onChange={(e) => setPerfumers(e.target.value)} className={field} />
          </label>
          <label className="col-span-3">
            Source URL
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" className={field} />
          </label>
          <label className="col-span-6">
            Description
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
          </label>
        </div>

        {seed?.imageUrl && <p className="text-xs text-cream/50">The bottle photo from the source will be downloaded and cached when you save.</p>}

        <fieldset className="space-y-3">
          <legend className="mb-1 font-display text-base text-brass-400">Notes</legend>
          {LAYERS.map((l) => (
            <NoteEditor key={l.layer} label={l.label} hint={l.hint} names={notes[l.layer]} listId="note-catalog" onChange={(n) => setNotes({ ...notes, [l.layer]: n })} />
          ))}
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-display text-base text-brass-400">Main accords</legend>
          <div className="space-y-2">
            {accords.map((a) => (
              <div key={a.key} className="flex items-center gap-3">
                <input type="color" value={a.color} onChange={(e) => setAccord(a.key, { color: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-ink-600 bg-ink-900" aria-label="Accord colour" />
                <input list="accord-catalog" value={a.name} onChange={(e) => onAccordName(a.key, e.target.value)} placeholder="Accord name" className={`${field} mt-0 w-48`} />
                <input type="range" min={0} max={100} value={a.strength} onChange={(e) => setAccord(a.key, { strength: +e.target.value })} className="flex-1 accent-[#c4964a]" aria-label="Accord strength" />
                <span className="w-10 text-right text-sm tabular-nums">{a.strength}</span>
                <button type="button" aria-label="Remove accord" className="px-1 text-cream/50 hover:text-cream" onClick={() => setAccords(accords.filter((x) => x.key !== a.key))}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className={`${ghostBtn} mt-2`} onClick={() => setAccords([...accords, { key: nextKey.n++, name: '', color: '#888888', strength: 70 }])}>
            + Add accord
          </button>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-display text-base text-brass-400">Community data</legend>
          <label className="flex items-center gap-2 text-sm text-cream/70">
            <input type="checkbox" checked={useCommunity} onChange={(e) => setUseCommunity(e.target.checked)} />
            Enter season / day-night votes and community ratings
          </label>
          {useCommunity && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {cnum('winter', 'Winter votes')}
              {cnum('spring', 'Spring votes')}
              {cnum('summer', 'Summer votes')}
              {cnum('fall', 'Fall votes')}
              {cnum('day', 'Day votes')}
              {cnum('night', 'Night votes')}
              {cnum('longevity', 'Longevity (1-5)')}
              {cnum('sillage', 'Sillage (1-4)')}
            </div>
          )}
        </fieldset>

        {mode === 'add' && (
          <fieldset>
            <legend className="mb-2 font-display text-base text-brass-400">Where does it go?</legend>
            <div className="flex gap-2">
              {WARDROBES.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWardrobe(w)}
                  className={`rounded-md border px-4 py-2 text-sm ${wardrobe === w ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}
                >
                  {WARDROBE_LABEL[w]}
                </button>
              ))}
            </div>
            {wardrobe === 'wishlist' && (
              <div className="mt-3 text-sm text-cream/80">
                <label>
                  What it smells like to me <span className="text-brass-400">*</span>
                  <textarea rows={3} value={impression} onChange={(e) => setImpression(e.target.value)} className={field} />
                </label>
                <div className="mt-3">Desired size (optional)</div>
                <SizePicker value={desiredSize} onChange={setDesiredSize} allowEmpty />
              </div>
            )}
            {wardrobe === 'garbage' && (
              <label className="mt-3 block text-sm text-cream/80">
                Why I dislike it <span className="text-cream/45">(optional)</span>
                <textarea rows={2} value={dislike} onChange={(e) => setDislike(e.target.value)} className={field} />
              </label>
            )}
            {wardrobe === 'had' && (
              <div className="mt-3 text-sm text-cream/80">
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    Years I wore it
                    <input value={hadYears} onChange={(e) => setHadYears(e.target.value)} placeholder="e.g. 2012–2015" className={field} />
                  </label>
                  <div>
                    Why it left
                    <div className="mt-1 flex gap-1.5">
                      {(['finished', 'sold', 'gifted'] as const).map((r) => (
                        <button key={r} type="button" onClick={() => setHadReason(hadReason === r ? null : r)} className={`rounded-md border px-2.5 py-1.5 text-xs ${hadReason === r ? 'border-brass-400 bg-brass-500/20 text-brass-400' : 'border-ink-600 text-cream/80 hover:bg-ink-700'}`}>
                          {HAD_REASON_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <label className="mt-3 block">
                  A memory
                  <textarea rows={2} value={hadMemory} onChange={(e) => setHadMemory(e.target.value)} className={field} />
                </label>
              </div>
            )}
            {wardrobe === 'collection' && (
              <div className="mt-3 text-sm text-cream/80">
                <label>
                  Bottle type
                  <select value={bottleType} onChange={(e) => setBottleType(e.target.value as BottleType)} className={`${field} w-56`}>
                    {BOTTLE_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <div className="mt-3">Size</div>
                <SizePicker value={bottleSize} onChange={setBottleSize} />
                <label className="mt-3 block">
                  Amount left: <span className="text-brass-400">{pct}%</span>
                  <input type="range" min={0} max={100} step={5} value={pct} onChange={(e) => setPct(+e.target.value)} className="block w-64 accent-[#c4964a]" />
                </label>
              </div>
            )}
          </fieldset>
        )}

        {(problems.length > 0 || serverError) && (
          <div ref={errorRef} className="rounded-lg border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
            {problems.map((p) => (
              <div key={p}>{p}</div>
            ))}
            {serverError && <div>{serverError}</div>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className={ghostBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={saving}>
            {mode === 'add' ? 'Add fragrance' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
