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
| `src/main/db/` | SQLite: `migrations.ts`, `repo.ts` (reads and wardrobe moves), `editing.ts`, `wears.ts`, `stats.ts`, `exportCsv.ts`, `seed.ts` |
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

## End-to-end checks

`scripts/e2e/` drives the packaged app through Chromium's remote debugging port with a throw-away profile
(`--user-data-dir`), so it never touches real data:

```
npm run dist:dir
node scripts/e2e/smoke.mjs      # every page renders, five wardrobe tabs, theme switch, no console errors
node scripts/e2e/flows.mjs      # dialogs and focus, moves between wardrobes, prices, backup, relaunch persistence
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

## Platform notes

- Window position and size are stored in `window-state.json` and sanitised when read.
- Command is used instead of Control for shortcuts on macOS (`src/renderer/src/lib/platform.ts`).
- The app quits when the last window closes on Windows and stays running on macOS, as is conventional there.
- The Fragrantica window is made invisible with transparency, because macOS will not keep a window off-screen.
- Data folders: `%APPDATA%\Scent Wardrobe` on Windows, `~/Library/Application Support/Scent Wardrobe` on macOS.
