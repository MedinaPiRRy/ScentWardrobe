# A fragrance in several wardrobes

Until schema version 9 a fragrance lived in exactly one wardrobe (`wardrobe_items.fragrance_id` was the primary key).
From version 10 it can be in several at once, for example Wishlist + Collection (I want the full bottle and own a
decant), Had + Collection (the old bottle and a new one), Had + Wishlist, To Try + Wishlist.

## Data model

```
fragrances
  id, name, house, ..., rating (1-10 or NULL)        <- one rating overall, moved here from wardrobe_items

wardrobe_memberships            (primary key: fragrance_id + wardrobe)
  fragrance_id  -> fragrances(id) ON DELETE CASCADE
  wardrobe      'collection' | 'wishlist' | 'to_try' | 'had' | 'garbage'
  shelf_position, added_at
  desired_size_ml               (wishlist)
  imported                      (wishlist: brought in by an importer, may lack the smell note)
  dislike_note                  (garbage)
  had_years, had_memory, had_reason   (had)
```

Everything that belongs to the *fragrance* (bottles, wears, notes, journal, past bottles, rating history, the "what it
smells like to me" text) stays on the fragrance. Everything that belongs to *being on one shelf* is on the membership.

## How existing data migrates (migration 10)

| Before | After |
| --- | --- |
| each `wardrobe_items` row | exactly one `wardrobe_memberships` row with the same shelf position, added date, desired size, imported flag, dislike note and Had details |
| `wardrobe_items.rating` | `fragrances.rating` (rating history is untouched) |
| the four wishlist triggers | the same four rules on `wardrobe_memberships` (wishlist membership needs the note unless `imported = 1`) |
| why I disliked it / my Had memories of a wardrobe I leave | kept in `membership_memory` (a new table) and restored if the fragrance returns to that wardrobe |
| bottles, wears, journal, `past_bottles`, `rating_history`, foreign flags | unchanged |

Nothing is lost: the migration test builds a library at every earlier version, upgrades it and checks every field.

## Rules

- **Garbage Perfumes is exclusive.** A fragrance I dislike cannot also be in another wardrobe. Adding it to Garbage
  while it is elsewhere, or adding it anywhere while it is in Garbage, is refused with a clear message unless I confirm,
  in which case the conflicting memberships are removed (the fragrance, its bottles, wears and notes are kept).
- **The wishlist note rule applies to the wishlist membership only.** Having the fragrance in Collection does not
  exempt it, and removing the wishlist membership drops the requirement. The importer-only `imported` exemption is
  per membership and goes away once a note is written.
- **Collection needs a bottle** (or vial) when the membership is created, as before.
- **One rating** per fragrance, whichever wardrobes it is in. Rating needs at least one membership.
- **Stats, recommendations and the Layering Lab** count a fragrance when it has a **Collection** membership, including
  one that only holds a sample or decant. A sample or decant of a fragrance that is only on the Wishlist or in To Try is
  not counted (it still appears in the drawer with a tag).
- **Removing** a membership is only possible while another remains (use Delete to remove the fragrance entirely).
- **Move** is a shortcut for "add to the new wardrobe, remove from the old one" in one step. Moving from Had to
  Collection keeps the earlier behaviour: the Had details become a "previous bottle" record. *Adding* Collection to a
  fragrance that stays in Had keeps both, and the Had details stay on the Had membership.
- A fragrance with no membership at all is a **not mine** (foreign) fragrance; adding any membership clears the mark.

## Importers

The Fragrantica profile and the paste/CSV importer create one membership per list a fragrance appears in: Have and
Want gives both Collection and Wishlist. A fragrance that is already in the app but lacks that wardrobe is shown in
the preview as "adds to ..." and gets the extra membership; one that already has it is skipped.
