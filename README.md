# Scent Wardrobe

A personal fragrance collection app for Windows. One user, offline-first, no accounts and no cloud. It shows your fragrances on virtual shelves, tracks bottle levels and how each scent performs on you, predicts how layers will smell, and recommends what to wear from the weather and your plans.

Electron + React + TypeScript + Tailwind, with SQLite (`better-sqlite3`) in the main process.

## Features

- **Wardrobes:** My Collection (warm oak), Wishlist (dark glass), To Try (light display shelving), Had (sepia keepsake cabinet) and Garbage Perfumes (a dumpster). Drag bottles to reorder; sort, filter and search by name, house, accord, note or season. Bottles are drawn at their real size with a liquid level; decants and samples sit on a decant rack. A fragrance can't enter the Wishlist without a "what it smells like to me" note, enforced in the UI, the main-process API and the database.
- **Detail view:** notes pyramid (click a note to see other bottles you own with it), accord bars, community season and day/night charts, your performance against the community's, bottles with level and estimated wears left, a wear history, a journal and your impression.
- **Adding fragrances:** fuzzy search over your library and an imported dataset, a one-time dataset importer (CSV, JSONL or SQLite) with a column-mapping preview, a single-page Fragrantica import, or a full manual form. Bottle photos are cached locally and a plain white background is made transparent.
- **Wear log and stats:** sprays, activity, weather, projection, longevity, compliments. Each wear subtracts from the bottle you chose; a "How long did it last?" prompt follows up at the end of the day. Stats cover most and least worn, wears and ml per month, leaderboards, cost per wear and bottles running low.
- **Layering Lab:** drag two or three bottles together, set the spray ratio, see a blended accord chart, a predicted description and a 0-100 compatibility score with reasons. It learns from the combos you rate.
- **Recommendations:** activity + time of day + live weather (Open-Meteo, no key) give your top 3 picks, each with an explanation, a one-click "Wear this" and a layering idea.
- **Settings and safety:** theme, units, weather location, low-bottle threshold, an editable accord affinity matrix, zip backup and restore, a weekly automatic backup, CSV export.

## The five wardrobes

| Wardrobe | What it is | Counts in recommendations, Layering Lab and collection stats? |
| --- | --- | --- |
| **My Collection** | What you own, on shelves; samples, decants and minis go in the drawer. | yes |
| **Wishlist** | What you want. Needs a "what it smells like to me" note (UI, API and database triggers). Items brought in by an importer are exempt, are flagged with a ✎ badge and "needs a note", and the rule applies again once you write one. | no |
| **To Try** | What you want to test. | no |
| **Had** | A sepia keepsake cabinet: years you wore it, a memory, and why it left (finished, sold, gifted). You are offered it when the last bottle is marked empty or sold. A rebuy stays *one* fragrance in My Collection: the old bottle becomes a "previous bottle" record shown on the fragrance and as a card in the cabinet. | no |
| **Garbage Perfumes** | Perfumes you dislike, drawn as a dumpster, with an optional "why I dislike it" note. They stay searchable, tagged, in the add-fragrance search and next to wardrobe search results, so you do not buy them again. | no |

Moving a fragrance between wardrobes keeps its wears, bottles, notes and journal. Database changes live in `src/main/db/migrations.ts`; the wardrobe table cannot have its CHECK edited in SQLite, so migration 5 rebuilds it and its triggers.

## Calendar

The Calendar tab shows a month grid with a bottle thumbnail for each fragrance worn that day (and "+N" when there are more), plus a year view that works as a heatmap. Click a day to see, edit or delete its wears, or to log one for that date (single fragrances or saved blends). Below the grid is the list of scents used in the month or year.

Wears for past days are saved as **diary entries**: they do not take anything out of the bottle level, they never ask "How long did it last?", and they do not count as "worn today" for rotation. Tick "Take this from the bottle" in the wear form if you want one to count.

**Usual sprays** (Calendar page or Settings) stores how many sprays you normally use of each fragrance. It is the default in the wear form and the count used for diary entries.

## Prices and currency

Each bottle can hold the price you **paid** and a **market price** you looked up yourself, with the date you checked and where. The app never fetches prices. The bottle shows both, the price per ml, and whether you saved or overpaid (in money and as a percentage of the market price). Stats adds the collection's market value, the total saved or overpaid, a paid-vs-market table and the cost per wear. The CSV export includes paid, market price, date and source.

Pick your currency in Settings (a list of common ones, or any three-letter code). It only changes how amounts are displayed; nothing is converted, so enter all prices in the same currency.

## Importing a Fragrantica profile

Settings -> Fragrance data -> **Import from Fragrantica** reads the public wardrobe of a member (enter the username, for example `your_username`) and shows a preview before anything is added.

- **Mapping:** Have goes to My Collection, Want to Wishlist, Had to Had, and custom shelves (such as "For Test") to To Try. A fragrance in two lists goes to the stronger one (Have, then Had, then Want, then a shelf).
- **Skips what you already have**, matched by name and house or by the Fragrantica page number, so you can run it again safely.
- **Details:** optionally each fragrance page is read too (notes, accords, picture). Pages are loaded one at a time with a pause between them, in the same hidden window the single-page importer uses. A page that cannot be read is still added with its name and house.
- **Login:** only pages anyone can see are read. If Fragrantica asks for a check or a login, a visible window opens with the app's own saved browser session: do it there. The app never asks for, sees or stores your password.
- **Imported entries:** Have items get a 100 ml placeholder bottle (Fragrantica has no bottle sizes), and Wishlist items arrive marked "needs a note" until you write what they smell like to you.
- **No wear diary:** Fragrantica does not show a wear diary on public profiles, so only the lists can be imported. Log past wears from the Calendar.
- **If it cannot read the profile** (private wardrobe, or the site's layout changed), choose "Paste links or load a CSV instead": headings (Have, Want, Had, For Test) followed by fragrance links, or a CSV with the columns List, House, Name. If the layout changed, the selectors are in `src/main/fragrantica/memberParser.ts`.

## Samples of fragrances you want, and fragrances that are not yours

- **Want it and have a vial:** a Wishlist or To Try fragrance can hold a sample or decant. Open it and use "Samples and decants I have". It stays on the Wishlist, shows a "have a vial" tag on the shelf, and you can log wears of it. These vials are not counted in My Collection stats.
- **Worn but not owned:** in a day on the Calendar, "Wore something that is not yours? Add it" saves a fragrance marked **not mine** (suggestions come from your fragrances and the imported dataset). It has no wardrobe, stays out of the shelves, recommendations, layering and collection stats, but shows in the calendar and in search. Moving it into a wardrobe removes the mark.

## Dev setup

You need Node.js 20+ (developed on 24) and, only if a prebuilt native module is not available, the Visual Studio C++ build tools.

```
npm install        # also rebuilds better-sqlite3 for Electron (postinstall)
npm run dev        # start the app with hot reload
npm test           # Vitest (runs under Electron's Node so better-sqlite3's ABI matches)
npm run typecheck
npm run build      # production build into out/
```

Notes:

- `npm test` runs through Electron's own Node runtime. Running `npx vitest` directly fails with a native-module version mismatch.
- If the app or tests complain about `better-sqlite3` after switching Node/Electron versions, run `npm run rebuild`.
- The renderer is plain React; the main process owns the database and exposes a typed API through `contextBridge` (`window.api`). The contract is in `src/shared/ipc.ts`: add a method there first and TypeScript tells you where the handler and preload entry are missing.

## Creating the Windows installer

```
npm run dist       # electron-vite build + electron-builder -> dist\Scent-Wardrobe-Setup-1.0.0.exe (NSIS)
npm run dist:dir   # same, but only the unpacked app in dist\win-unpacked (quick to test)
npm run icon       # regenerate build\icon.png
```

The installer lets you pick the install folder and creates Desktop and Start Menu shortcuts. It is not code-signed, so Windows SmartScreen shows "unknown publisher" the first time: choose *More info → Run anyway*. Uninstalling keeps your data (see below).

## Where your data is stored

Everything lives in `%APPDATA%\Scent Wardrobe\` (Settings → About has a button that opens it):

| Item | Location |
| --- | --- |
| Database | `scent-wardrobe.db` |
| Cached bottle photos and note icons | `images\` |
| Backups | `backups\` (`manual-…`, `auto-…`, `pre-restore-…` zips) |
| Window size and position | `window-state.json` |

## Backup and restore

Settings → Backup and restore.

- **Back up now** writes a zip (database snapshot + all images) into the `backups` folder. **Save a copy elsewhere** lets you choose a folder, for example a USB drive or a cloud-synced folder.
- A **weekly automatic backup** is made when the app starts and it has been 7 days since the last one (the newest 8 are kept; manual and pre-restore backups are never deleted). It can be switched off.
- The imported dataset can be 150+ MB and is re-importable from its original file, so backups leave it out unless you tick "Include the imported dataset".
- **Restore** checks the zip first (valid backup, not from a newer version, database passes an integrity check), asks for confirmation, saves a `pre-restore-…` safety backup of your current data, swaps the files and restarts. A dataset you have imported is kept even when the backup has none. Older backups are upgraded to the current schema automatically.

## Importing a dataset

Adding a fragrance → *Import a dataset file…* (or Settings → Fragrance data). Pick a `.csv`, `.jsonl` or SQLite `.db` file (unzip archives first; the project's `data/` folder opens by default; it is git-ignored). Files over 500 MB are streamed, not loaded whole.

- The **Fragrantica dump** layout (`perfumes.csv` / `perfumes.jsonl`, see `data/SCHEMA.md`) is recognised automatically: names, houses, notes by layer, accords with strengths, season and day/night votes, longevity and sillage. The JSONL version also carries note icons.
- Any other file gets a column-mapping step with a preview before anything is imported.
- Imported rows are only used for search. A fragrance enters your wardrobes when you pick it and save the form, so they never clutter your shelves.

## Fixing the Fragrantica parser

Everything that depends on Fragrantica's page markup is in [`src/main/fragrantica/fragranticaParser.ts`](src/main/fragrantica/fragranticaParser.ts), inside the `EXTRACT_SCRIPT` string (the doc comment above it lists every selector). If an import comes back with missing accords, notes or votes, the site probably changed its layout:

1. Open a fragrance page in a normal browser, right-click the missing element and choose *Inspect*.
2. Paste the contents of `EXTRACT_SCRIPT` into the DevTools console to see what it returns, and adjust the selector that returns nothing.
3. Update the captured fixture in `fragranticaParser.test.ts` if the output shape changed, then run `npm test`.

The page loading, scrolling (longevity and sillage load lazily) and the human-check handling are in `fragranticaImport.ts`. Requests run one at a time, at least 3 seconds apart. If the site shows a human check, the window is brought on-screen so you can complete it.

## Project layout

```
src/main/        main process: database + migrations (db/), IPC handlers, importer (data/), weather, backup, Fragrantica import, images
src/preload/     contextBridge API
src/renderer/    React app: pages/, components/, lib/
src/shared/      types, the IPC contract and the pure engines:
                 layering/ (compatibility scoring), recommend/ (what to wear), performance, weather helpers
data/            your dataset files (git-ignored)
build/           app icon
scripts/         test runner, icon generator
```

The two scoring engines (`src/shared/layering` and `src/shared/recommend`) are pure, framework-free TypeScript with their own Vitest suites. The database layer is tested against in-memory SQLite.

## Keyboard shortcuts

`Ctrl+N` add a fragrance (from anywhere) · `Ctrl+F` search the wardrobes · `Esc` closes dialogs.

## Privacy

Nothing leaves your computer except: the weather lookup (your chosen city's coordinates go to Open-Meteo), city search in the location picker, and Fragrantica page and image downloads when you ask for an import.
