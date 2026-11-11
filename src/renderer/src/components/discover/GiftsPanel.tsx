import { useEffect, useMemo, useRef, useState } from 'react'
import { EMPTY_BRIEF } from '@shared/discover/brief'
import type { BriefResults, DiscoverCard, GiftList } from '@shared/discover/dto'
import { chipsToBrief, EMPTY_PERSONA, interpretPersona, OCCASION_CHOICES, type Chip, type Persona } from '@shared/discover/vibes'
import { ghostBtn, primaryBtn } from '../Dialogs'
import CardGrid, { type CardActions } from './CardGrid'
import { ChipList, chipKey } from './VibeBox'

const sel = 'w-full rounded border border-ink-600 bg-ink-900 px-2 py-1.5 text-sm text-cream'
const lab = 'mb-1 block text-xs uppercase tracking-wider text-cream/70'
const SHOW_ALL = { owned: false, garbage: false, wishlist: false, toTry: false, had: false, ignored: false }

/** A short description of a person becomes a brief and a shortlist, which can be saved as a gift list and shared as CSV. */
export default function GiftsPanel({ actions, datasetCount, rev }: { actions: CardActions; datasetCount: number; rev: number }) {
  const [persona, setPersona] = useState<Persona>(EMPTY_PERSONA)
  const [removed, setRemoved] = useState<string[]>([])
  const [extra, setExtra] = useState<Chip[]>([])
  const [res, setRes] = useState<BriefResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [lists, setLists] = useState<GiftList[]>([])
  const [listName, setListName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const token = useRef(0)

  const read = useMemo(() => interpretPersona(persona), [persona])
  const chips = [...read.chips.filter((c) => !removed.includes(chipKey(c))), ...extra]
  const brief = useMemo(() => chipsToBrief(chips, EMPTY_BRIEF), [chips.map(chipKey).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void window.api.discover.gifts().then(setLists)
  }, [])

  useEffect(() => {
    if (datasetCount === 0) return
    if (chips.length === 0) return setRes(null)
    const mine = ++token.current
    setLoading(true)
    const t = window.setTimeout(() => {
      void window.api.discover
        .brief({ brief, filters: { limit: 12, hide: SHOW_ALL } })
        .then((r) => token.current === mine && setRes(r))
        .finally(() => token.current === mine && setLoading(false))
    }, 250)
    return () => window.clearTimeout(t)
  }, [brief, datasetCount, rev]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Persona>(k: K, v: Persona[K]) => {
    setPersona({ ...persona, [k]: v })
    setRemoved([])
  }

  const addToList = async (c: DiscoverCard) => {
    if (!listName.trim()) {
      setMsg('Name the list first (for example "Mum, birthday"), then add fragrances to it.')
      document.getElementById('gift-list-name')?.focus()
      return
    }
    const r = await window.api.discover.giftAdd({ name: listName, persona, item: { key: c.key, name: c.name, house: c.house } })
    if (!r.ok) return setMsg(r.message)
    setLists(r.data)
    setMsg(`${c.name} added to "${listName.trim()}".`)
  }

  const exportList = async (id: number) => {
    const r = await window.api.discover.exportGift(id)
    if (r.ok && r.data) setMsg(`Saved ${r.data.rows} fragrance${r.data.rows === 1 ? '' : 's'} to ${r.data.path}.`)
    else if (!r.ok) setMsg(r.message)
  }

  const giftActions: CardActions & { onGift: (c: DiscoverCard) => void } = { ...actions, onGift: (c) => void addToList(c) }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Describe the person">
        <p className="text-sm text-cream/85">Describe the person, not the scent. This does not use your own taste. The answers become starting points you can change before anything is searched.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={lab} htmlFor="p-age">Age</label>
            <select id="p-age" className={sel} value={persona.ageBand} onChange={(e) => set('ageBand', e.target.value as Persona['ageBand'])}>
              <option value="">Not said</option>
              <option value="under25">Under 25</option>
              <option value="25-34">25 to 34</option>
              <option value="35-49">35 to 49</option>
              <option value="50plus">50 or over</option>
            </select>
          </div>
          <div>
            <label className={lab} htmlFor="p-life">Lifestyle</label>
            <select id="p-life" className={sel} value={persona.lifestyle} onChange={(e) => set('lifestyle', e.target.value as Persona['lifestyle'])}>
              <option value="">Not said</option>
              <option value="office">Works in an office</option>
              <option value="active">Active, sporty</option>
              <option value="social">Social, goes out a lot</option>
              <option value="homebody">Likes staying in</option>
              <option value="outdoors">Outdoorsy</option>
              <option value="traveller">Travels often</option>
            </select>
          </div>
          <div>
            <label className={lab} htmlFor="p-exp">Experience with fragrance</label>
            <select id="p-exp" className={sel} value={persona.experience} onChange={(e) => set('experience', e.target.value as Persona['experience'])}>
              <option value="">Not said</option>
              <option value="new">New to it</option>
              <option value="some">Some experience</option>
              <option value="enthusiast">An enthusiast</option>
            </select>
          </div>
          <div>
            <label className={lab} htmlFor="p-climate">Climate</label>
            <select id="p-climate" className={sel} value={persona.climate} onChange={(e) => set('climate', e.target.value as Persona['climate'])}>
              <option value="">Not said</option>
              <option value="hot">Hot</option>
              <option value="mild">Mild</option>
              <option value="cold">Cold</option>
              <option value="seasons">Four seasons</option>
            </select>
          </div>
          <div>
            <label className={lab} htmlFor="p-gender">Gender lean (a soft nudge, optional)</label>
            <select id="p-gender" className={sel} value={persona.gender} onChange={(e) => set('gender', e.target.value as Persona['gender'])}>
              <option value="">Ignore</option>
              <option value="masculine">Leans masculine</option>
              <option value="feminine">Leans feminine</option>
              <option value="unisex">Unisex</option>
            </select>
          </div>
        </div>
        <fieldset>
          <legend className={lab}>Occasions</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {OCCASION_CHOICES.map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-sm text-cream">
                <input type="checkbox" className="accent-[#c4964a]" checked={persona.occasions.includes(o.key)} onChange={(e) => set('occasions', e.target.checked ? [...persona.occasions, o.key] : persona.occasions.filter((x) => x !== o.key))} />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
        <ChipList
          label="Starting points (change them)"
          chips={chips}
          onRemove={(c) => (extra.some((x) => chipKey(x) === chipKey(c)) ? setExtra(extra.filter((x) => chipKey(x) !== chipKey(c))) : setRemoved([...removed, chipKey(c)]))}
          onAdd={(c) => setExtra([...extra.filter((x) => chipKey(x) !== chipKey(c)), c])}
        />
        {read.notes.map((n) => (
          <p key={n} className="text-sm text-cream/70">
            {n}
          </p>
        ))}
      </section>

      <section className="rounded-xl border border-ink-600 bg-ink-800 p-4" aria-label="Gift list">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className={lab} htmlFor="gift-list-name">Add to the list named</label>
            <input id="gift-list-name" list="gift-lists" value={listName} onChange={(e) => setListName(e.target.value)} placeholder='e.g. "Mum, birthday"' className={sel} />
            <datalist id="gift-lists">
              {lists.map((l) => (
                <option key={l.id} value={l.name} />
              ))}
            </datalist>
          </div>
        </div>
        {msg && <p className="mt-2 text-sm text-cream/85" role="status">{msg}</p>}
        {lists.length > 0 && (
          <div className="mt-3 space-y-3">
            {lists.map((l) => (
              <div key={l.id} className="rounded-lg border border-ink-600 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-display text-base text-cream">
                    {l.name} <span className="text-sm text-cream/70">({l.items.length})</span>
                  </h4>
                  <div className="flex gap-2">
                    <button className={ghostBtn} disabled={l.items.length === 0} onClick={() => void exportList(l.id)}>
                      Save as CSV
                    </button>
                    {confirmDelete === l.id ? (
                      <button
                        className={primaryBtn}
                        onClick={async () => {
                          const r = await window.api.discover.giftDelete(l.id)
                          if (r.ok) setLists(r.data)
                          setConfirmDelete(null)
                        }}
                      >
                        Really delete it?
                      </button>
                    ) : (
                      <button className={ghostBtn} onClick={() => setConfirmDelete(l.id)}>
                        Delete list
                      </button>
                    )}
                  </div>
                </div>
                {l.items.length === 0 ? (
                  <p className="mt-1 text-sm text-cream/70">Empty. Add fragrances from the ideas below.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {l.items.map((i) => (
                      <li key={i.key} className="flex items-center justify-between gap-3">
                        <span className="text-cream">
                          {i.name} <span className="text-cream/70">{i.house}</span>
                        </span>
                        <button
                          className="text-brass-400 underline"
                          aria-label={`Remove ${i.name} from ${l.name}`}
                          onClick={async () => {
                            const r = await window.api.discover.giftRemove(l.id, i.key)
                            if (r.ok) setLists(r.data)
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Gift ideas" aria-busy={loading}>
        <h3 className="mb-1 font-display text-lg text-cream">Ideas</h3>
        {datasetCount === 0 && <p className="text-sm text-cream/85">Gift ideas search the imported dataset, which is not here yet. Import one (top of this page) and the ideas appear.</p>}
        {datasetCount > 0 && chips.length === 0 && <p className="text-sm text-cream/85">Answer a few of the questions above and ideas appear here.</p>}
        {loading && !res && <p className="text-sm text-cream/80" role="status">Looking…</p>}
        {res?.message && res.cards.length === 0 && <p className="text-sm text-cream/85">{res.message}</p>}
        {res && <CardGrid cards={res.cards} actions={giftActions} exportTitle="Gift ideas" />}
      </section>
    </div>
  )
}
