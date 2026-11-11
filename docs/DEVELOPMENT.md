# Development notes

## Set up

You need Node.js 22 or newer. `npm ci` installs the dependencies and, through the `postinstall` script, rebuilds the
native SQLite module (`better-sqlite3`) for Electron. On Windows this needs the Visual Studio C++ build tools if no
prebuilt binary is available; on macOS the Xcode command line tools.

```
npm ci
npm run dev          # the app with hot reload (the main process and preload restart when changed)
npm run typecheck    # tsc --noEmit
npm test             # the whole suite
npm run build        # production build into out/
npm run e2e          # drive the PACKAGED app (build with npm run dist:dir first), see below
npm run notice       # regenerate THIRD_PARTY_NOTICES.md after changing dependencies
```

`npm test` runs Vitest **inside Electron's Node runtime** (`scripts/test.mjs`) so that `better-sqlite3`, which is compiled
for Electron, loads. Running `npx vitest` directly fails with a native-module version mismatch. If the tests or the
app complain about `better-sqlite3` after switching Node or Electron versions, run `npm run rebuild`.

## Layout

| Path | What lives there |
| --- | --- |
| `src/main/db/` | SQLite: `migrations.ts`, `repo.ts` (reads), `memberships.ts` (add, move and remove wardrobes), `ratings.ts`, `editing.ts`, `wears.ts`, `stats.ts`, `exportCsv.ts`, `seed.ts` |
| `src/main/data/` | dataset import (CSV, JSONL, SQLite sources), column mapping, fuzzy search |
| `src/main/fragrantica/` | single-page importer, profile importer, parsers and the locked-down scrape window |
| `src/main/` | `ipc.ts` (every handler), `backup*.ts`, `images.ts`, `security.ts`, `windowState.ts`, `weather*.ts` |
| `src/preload/` | the `contextBridge` API |
| `src/renderer/src/` | `pages/`, `components/`, `lib/` (calendar, money, shelf, dialog helpers) |
| `src/shared/` | types, `ipc.ts` (the API contract), the layering and recommendation engines |
| `scripts/` | test runner, icon generator, notice generator, `e2e/` driver scripts |

## The IPC contract

`src/shared/ipc.ts` declares the whole API (`Api`). `ChannelName` is derived from it, and `registerIpc` in
`src/main/ipc.ts` is a `Record<ChannelName, handler>`, so adding a method to `Api` without a handler is a compile
error; the preload script has to list it too. Every handler runs only for calls from the app's own page
(`isTrustedSender` in `src/main/security.ts`).

## Database migrations

Each entry in `src/main/db/migrations.ts` has a `version` and an SQL script. `runMigrations` applies the ones above
`PRAGMA user_version`, each in a transaction, and refuses a database whose version is *newer* than the app knows.
To change the schema:

1. Append a migration (never edit an old one).
2. Update `src/main/backup.test.ts` ("brings an older backup up to the current schema") if the migration adds columns
   the test has to drop.
3. Run `npm test`: `migrationChain.test.ts` builds a library at every version and upgrades it.

SQLite cannot alter a `CHECK` constraint, so migration 5 rebuilds the wardrobe table and its triggers.

## Fixing the Fragrantica parsers

Everything that depends on Fragrantica's markup is isolated:

- single fragrance pages: `EXTRACT_SCRIPT` in `src/main/fragrantica/fragranticaParser.ts` (the comment above it lists
  every selector);
- member profiles: `MEMBER_EXTRACT_SCRIPT` in `src/main/fragrantica/memberParser.ts`.

If an import returns missing accords, notes, votes or lists, the site probably changed:

1. Open the page in a normal browser, right-click the missing element and choose *Inspect*.
2. Paste the script into the DevTools console to see what it returns, and fix the selector that returns nothing.
3. Update the test fixtures if the shape changed, then run `npm test`.

Page loading, scrolling (votes load lazily), the human-check handling and the 3-second spacing between requests are in
`fragranticaImport.ts` and `memberFetch.ts`. The window the pages load in (`scrapeWindow.ts`) is sandboxed, has no
permissions, navigates only to https addresses and is kept invisible by being transparent and off-screen.

## Discovery

Pure scoring is in `src/shared/discover` (framework-free, unit-tested in `discover.test.ts`); database access and the background index are in `src/main/db/discover.ts`; the window is `pages/DiscoverPage.tsx` with `components/discover/*`.

- **Data.** Migration 11 adds `catalog_extra` (what the importer keeps from a full dump record: note weights, rating and value votes, collection counts, community gender votes, "reminds me of" votes, recent popularity, capture time; see `shared/discover/extra.ts`), `discover_features` (the derived, query-friendly copy), `discover_ignored` and `discover_briefs`. Re-importing a file adds nothing new but **enriches** rows that were imported without extras (`ImportResult.enriched`). Extras are kept out of the saved fragrance JSON.
- **Index.** `buildDiscoverIndex` copies the dataset into `discover_features` in 1,500-row chunks with the progress marker in the same transaction (`settings` keys `discover.index.*`), yielding to the event loop between chunks, so cancelling or quitting at any point loses nothing and the next call resumes. An import, re-import or `clearDataset` invalidates it (the build also checks a generation counter so it cannot finish stale), and `INDEX_VERSION` forces a rebuild after a format change. `loadDiscoverIndex` pages the table into a struct-of-arrays `FeatureIndex` (typed arrays, no per-row objects) the first time per session, which pauses the main process for about a second on 140,000 rows.
- **Scoring.** `rank.ts` is the shared core: cosine similarity on accords (65%) and note weights (35%) against a compiled profile, minus what I avoid or dislike, blended with community quality (rating shrunk toward 3.9) and confidence (voters). `explainRow` writes only reasons it computed. `similar.ts` turns seeds and sliders into a target and an adjust function; `brief.ts` evaluates a brief per row (`met` / `partial` / `unmet` / `unknown`) with allocation-free numbers in the ranking loop and strings only for the page shown. Temperature, humidity and activity reuse `shared/recommend/activities`. Ownership is matched by house, name and concentration through `FeatureIndex.rowsForKey`, not per-row string work.
- **Budgets.** On 140,000 synthetic rows: For you about 60 ms in the engine (about 130 ms round trip), a full brief about 70 ms (about 170 ms), the index build about 4 s, and the first query of a session about 1 s while the index loads. `discover.test.ts` checks the engine part (below 300 ms) and `scripts/e2e/discover.mjs` phase 3 checks the real round trip.
- **Fixtures.** `shared/discover/fixture.ts` and `scripts/e2e/synthetic.mjs` generate invented rows ("Synthetic 000123", plain accord and note names). No Fragrantica data is used in tests or screenshots, and `data/` stays out of the repository.
- **Other modes.** `shared/discover/gaps.ts` (coverage cells from `GapItem`s; `discoverCoverage` in `db/discoverModes.ts` builds them from the collection, the community table and the wear log), layering partners in `discoverLayering` (the Lab's `suggestPartners` and `analyzeLayer` with my affinity edits and rated blends; dataset candidates are the best taste matches, scored by the same engine), `shared/discover/dupes.ts` and `discoverDupes` (migration 12 `discover_remind` holds who-reminds-whom, filled while the index is built; the index version was bumped, so an older index rebuilds itself), `shared/discover/budget.ts` (my price per ml, never a price for an unowned fragrance).
- **Vocabulary.** `shared/discover/vibes.ts` is a typed, hand-written phrase table plus accord and note word lists (unit-tested, including that every entry says something). A phrase is one to three words, longest first; "no/not/without" turn accords and notes into dealbreakers; anything else is reported as not understood. Personas become chips the same way, each with its reason, and all chips are editable before `chipsToBrief` builds the brief. Gift lists are `discover_gift_lists` and `discover_gift_items` (migration 12); CSV is built in the main process from plain values with formula neutralisation (`discoverGifts.ts`, `discoverExport.ts`).
- **Known limits.** The dataset has no price, discontinued flag or compliments for fragrances I do not own, so none is shown. "Niche" is not a thing the app says: "stands out" means a low dataset popularity score. Market-price comparisons are only between prices I entered.

## End-to-end checks

`scripts/e2e/` drives the packaged app through Chromium's remote debugging port with a throw-away profile
(`--user-data-dir`), so it never touches real data:

```
npm run dist:dir
node scripts/e2e/smoke.mjs      # every page renders, five wardrobe tabs, theme switch, no console errors
node scripts/e2e/flows.mjs      # dialogs and focus, moves between wardrobes, prices, backup, relaunch persistence
node scripts/e2e/round3.mjs     # ratings, weather, Browse, several wardrobes (each phase in a fresh profile)
node scripts/e2e/drawer-picker.mjs   # dragging vials, the searchable wear picker
node scripts/e2e/discover.mjs   # Discovery, five phases: no dataset; a synthetic dataset; 140,000 synthetic rows (timings); gaps, layering, dupes, budget; feelings, people, gift lists
node scripts/e2e/a11y.mjs       # contrast (WCAG AA) and layout of the new screens, both themes, both minimum sizes
node scripts/e2e/screenshots.mjs docs/screenshots   # README screenshots from the sample data only
```

Set `SCENT_EXE` if the executable is not in the default place for your system.

## Releasing

1. Update the version in `package.json`, run `npm run typecheck && npm test`, commit.
2. `git tag v1.0.0 && git push origin v1.0.0`.
3. `.github/workflows/release.yml` builds the Windows installer and both macOS DMGs on their own runners (the native
   module has to be built on the matching architecture) and attaches them to a GitHub Release. Builds are **not
   signed or notarized**; macOS signing would need an Apple Developer ID and notarization credentials added to the
   workflow.

## The update button

`src/main/updater.ts` (Electron side) and `src/main/updateCore.ts` (pure, tested in `updateCore.test.ts`). It is user-initiated
only: `update:check` asks `api.github.com/repos/MedinaPiRRy/ScentWardrobe/releases/latest`; `update:install` (Windows) looks
the release up again in the main process, so nothing from the window decides what is downloaded, requires exactly one asset
named `Scent-Wardrobe-Setup-<x.y.z>.exe` hosted by this repository (or GitHub's CDN), and requires the `digest`
(`sha256:...`) GitHub attaches to release assets. It streams the file to a private temp folder with a size cap, compares the SHA-256, takes a
manual backup, starts the installer detached and quits. A release without a digest is shown but not installed
automatically. For this to work a release must be published with the installer attached (the release workflow does that);
pre-release and non-`x.y.z` tags are ignored. What is not covered by automated tests: the real download and install of a
newer version, which needs a published release newer than the running build.

## Platform notes

- Window position and size are stored in `window-state.json` and sanitised when read.
- Command is used instead of Control for shortcuts on macOS (`src/renderer/src/lib/platform.ts`).
- The app quits when the last window closes on Windows and stays running on macOS, as is conventional there.
- The Fragrantica window is made invisible with transparency, because macOS will not keep a window off-screen.
- Data folders: `%APPDATA%\Scent Wardrobe` on Windows, `~/Library/Application Support/Scent Wardrobe` on macOS.
