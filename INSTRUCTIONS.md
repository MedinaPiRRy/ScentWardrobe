# Scent Wardrobe: user guide

This guide is for people who just want to use the app. If you want to build it from source, see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

Contents: [Installing](#installing) · [First launch](#first-launch) · [Adding fragrances](#adding-fragrances) ·
[The five wardrobes](#the-five-wardrobes) · [Bottles, samples and decants](#bottles-samples-and-decants) ·
[Logging wears](#logging-wears) · [The calendar](#the-calendar-and-usual-sprays) · [Layering Lab](#layering-lab) ·
[Recommendations](#recommendations) · [Stats](#stats) · [Prices and currency](#prices-and-currency) ·
[Importing from Fragrantica or a file](#importing) · [Backup and restore](#backup-and-restore) ·
[Where your data lives](#where-your-data-lives) · [FAQ and troubleshooting](#faq-and-troubleshooting)

## Installing

Download the installer for your system from the project's **Releases** page.

### Windows (10 or 11, 64-bit)

1. Download `Scent-Wardrobe-Setup-<version>.exe` and double-click it.
2. Windows SmartScreen may show **"Windows protected your PC / unknown publisher"**. The installer is not code-signed
   (signing certificates cost money), so this warning is normal. Click **More info**, then **Run anyway**.
3. Choose an install folder (or keep the default) and finish. Shortcuts are added to the Desktop and Start menu.

### macOS (Intel or Apple Silicon)

1. Download the right file: **`...-mac-arm64.dmg`** for an Apple Silicon Mac (M1, M2, M3 and later) or
   **`...-mac-x64.dmg`** for an Intel Mac. (Apple menu → *About This Mac* shows the chip.)
2. Open the DMG and drag **Scent Wardrobe** to **Applications**.
3. The app is not signed or notarized by Apple, so the first launch is blocked. Do one of these:
   - In **Applications**, **right-click** (or Control-click) Scent Wardrobe → **Open** → **Open** in the dialog; or
   - open **System Settings → Privacy & Security**, scroll down and click **Open Anyway** next to the message about Scent Wardrobe; or
   - if macOS says the app is *damaged* and cannot be opened, open **Terminal** and run
     `xattr -dr com.apple.quarantine /Applications/Scent\ Wardrobe.app`, then open it again.

   You only need to do this once.

## First launch

The app opens on **My Collection** with empty shelves. You can:

- press **+ Add fragrance** to start your library, or
- go to **Settings → Fragrance data → Load sample data** to explore with 12 well-known fragrances (and **Remove sample data**
  when you are done, which never touches your own entries).

Pages in the left bar: **Wardrobes**, **Layering Lab**, **Recommendations**, **Calendar**, **Stats**, **Settings**.
Shortcuts: **Ctrl+N** (Command+N on a Mac) adds a fragrance from anywhere, **Ctrl+F** (Command+F) searches the
wardrobes, **Esc** closes the top dialog.

## Adding fragrances

Press **+ Add fragrance** (or Ctrl+N). Three ways:

1. **Search.** Type a name or house. Results come from your own library first, then from an imported dataset if you
   have one (see [Importing](#importing)). Pick a result to open the form, filled in.
2. **A Fragrantica link.** Paste the address of a fragrance page, for example
   `https://www.fragrantica.com/perfume/Dior/Sauvage-31861.html`, and press **Import**. The app loads the page in a
   hidden window and fills in notes, accords, community votes and the bottle picture. This takes a few seconds. If the
   site asks for a human check, a window appears for you to complete it.
3. **By hand.** Choose **Enter manually** and fill in the form.

In the form, choose where it goes (**My Collection** needs a bottle type and size) and save. Searching also shows
fragrances you already have in *other* wardrobes, including a reminder of why you put something in Garbage Perfumes.

To change a fragrance, open it (click the bottle) and press **Edit**. **Use my own photo** replaces the picture with a
file of yours (a plain white background is made transparent). **Delete** removes the fragrance and its history after
a confirmation.

## The five wardrobes

Tabs at the top of the Wardrobes page. Drag bottles to reorder them (dragging is off while you search, filter or sort).
Right-click a bottle for **Open**, **Log a wear** and **Move to …**, or use **Move to wardrobe** in its detail view.
Moving never loses wears, bottles, notes or journal entries.

| Wardrobe | Meaning |
| --- | --- |
| **My Collection** | What you own, on warm oak shelves. Samples, decants and minis are shown in the drawer below. |
| **Wishlist** | What you want. You must write what it smells like to *you* before something can enter. Items brought in by an import are exempt and carry a ✎ badge ("needs a note") until you write one. |
| **To Try** | What you want to test. |
| **Had** | A keepsake cabinet. When you move something here you can note the years you wore it, a memory, and why it left (finished, sold, gifted). If you mark your last bottle empty or sold, the app offers to move it here. |
| **Garbage Perfumes** | Perfumes you dislike, in a dumpster, with an optional note on why. They stay searchable so you do not buy them again. |

Only **My Collection** counts in recommendations, the Layering Lab and the collection statistics.

## Bottles, samples and decants

Open a fragrance → **Bottles** → **+ Add bottle**. A bottle has a type (full bottle, travel/mini, decant, sample), a
size, how much is left, ml per spray (0.1 by default), and optionally price, where and when you bought it, a batch code
and when you opened it. Use **Edit** to change the level, and **Mark empty** when it is finished.

- The shelf draws each bottle at its real size with a liquid level. The app warns you when a bottle drops below the
  threshold you set in **Settings → Bottle levels** (15% by default).
- The **drawer** under the collection shelf holds every sample, decant and mini you have, **including vials of
  fragrances that are still on your Wishlist or To Try**: add the vial to the wishlist fragrance (its detail view shows
  "Samples and decants I have"). Those fragrances stay on their shelf with a small "have a vial" tag and show in the
  drawer too.

## Logging wears

Open a fragrance → **Log a wear**, or right-click a bottle → **Log a wear**, or use a day in the Calendar.

Fill in the date and time, how many sprays, the activity, the weather, how strongly it projected, how long it lasted,
compliments and notes. Today's wears take the sprays out of the bottle you pick (the one you used last time is chosen for you,
or the first active one). Leave "how long it lasted" empty and the app asks at the end of the day.

**Past days are diary entries.** A wear dated before today never changes a bottle level and never asks how long it
lasted. Tick *Take this from the bottle* in the form if you do want it to count. Wearing something you have no bottle of
(a gift, a friend's) is fine too.

## The calendar and usual sprays

**Calendar** shows a month with a small bottle for each fragrance worn that day ("+2" when more), with *Today*, previous
and next month, and a **Year** view that works as a heatmap. Under the grid, **Scents used** lists the month's or year's
wears. Click a day to see its wears, edit or delete them, or **log a wear on that day** for a fragrance or a saved
blend.

**Wore something that is not yours?** In a day's panel choose *Wore something that is not yours? Add it*, type its name
and house (suggestions appear), and log it. It is saved marked **not mine**: it appears in the calendar and in search,
but never on a shelf and never in recommendations, layering or collection stats. Moving it to a wardrobe later removes
the mark.

**Usual sprays.** Use **Usual sprays…** (on the Calendar page or in Settings) to say how many sprays you normally use
of each fragrance. That number is the default in the wear form and what diary entries use.

## Layering Lab

Drag two or three bottles from the rack into the mixing area (or click them), then set the spray ratio. You see a
blended accord chart, a short description of how the combination should smell and a compatibility score from 0 to 100
with the reasons. **Suggest a layer** ranks the best partners for any fragrance in your collection (**Mix** puts the pair
together). Save a blend, rate it after you try it, and the scoring adapts to your ratings. You can log a wear of a blend
like any fragrance. The affinity matrix (which accords pair well) can be edited in **Settings**.

## Recommendations

Pick an **activity**, a **time of day** and the weather. Set your city once in **Settings → Weather location** to
fetch live weather (only the city's coordinates are sent, to Open-Meteo); without it you can type a temperature, or the
app assumes typical values for the season. You get your top three picks with a match score, an explanation (**Why?**
shows the breakdown), **Wear this** (logs a wear with the sprays you usually use) and a layering idea.

## Stats

Most and least worn fragrances, wears and ml used per month, the best for longevity, projection and compliments,
bottles running low, and what each fragrance costs per wear. Only collection fragrances count.

## Prices and currency

In a bottle's form, **Price paid** is what you paid. Under **Market price today** you can type what it costs now, when
you checked and where. **The app never looks prices up** for you. The bottle then shows both prices, the price per ml
and a *Saved* or *Overpaid* tag with the amount and percentage. **Stats** adds the collection's market value, the total
saved or overpaid, a paid-versus-market table and the cost per wear.

Choose your currency in **Settings → Appearance and units** (a list, or any three-letter code such as NZD). It only
changes how amounts are shown; nothing is converted, so enter all prices in the same currency.

## Importing

### A whole Fragrantica profile

**Settings → Fragrance data → Import from Fragrantica…**, enter a username (the part after `@` in the profile address)
and press **Look up**. The app reads the profile's *Have*, *Want*, *Had* and custom shelf lists, shows a preview of what
would be added and what you already have, and only then adds anything.

- Have → My Collection (with a **100 ml placeholder bottle**, because Fragrantica has no bottle sizes: correct it
  afterwards), Want → Wishlist (marked "needs a note"), Had → Had, custom shelves such as "For Test" → To Try.
- Fragrances you already have are skipped, so running it again is safe.
- Tick *Also read each fragrance page* to fetch notes, accords and pictures (about 4 seconds per fragrance, and you can
  stop at any time). Pages that cannot be read are still added with their name and house.
- Only pages anyone can see are used. If Fragrantica asks you to log in or pass a check, a window opens: do it there.
  **The app never asks for, sees or stores your password.** Fragrantica does not show a wear diary on public
  profiles, so only the lists are imported.
- If the profile cannot be read, choose **Paste links or load a CSV instead**: paste headings (*Have*, *Want*, *Had*,
  *For Test*) each followed by fragrance links, or load a CSV with the columns **List, House, Name**.

Please read the note about Fragrantica's terms in [NOTICE.md](NOTICE.md) before using the importers.

### A dataset file (optional)

If you have a dataset of fragrances (for example a Kaggle dump of Fragrantica data; it is **not** included with the
app), use **Settings → Fragrance data → Import a dataset…** and pick a `.csv`, `.jsonl` or SQLite `.db` file. Known
layouts are recognised automatically; otherwise you map the columns with a preview. Imported rows are only used for
search, so they never fill your shelves, and the file is read in a stream so very large ones work.

## Backup and restore

**Settings → Backup and restore.**

- **Back up now** saves a zip of your whole library (database and pictures) in the backups folder. **Save a copy
  elsewhere…** lets you pick any folder, such as a USB drive or a cloud-synced folder. **Open backups folder** shows it.
- **Back up automatically once a week** is on by default and keeps the newest 8 automatic backups.
- **Restore from a file…** checks the file, asks you to confirm, saves a *pre-restore* safety backup of your current
  data first, then swaps the data and restarts the app.
- **Before you share a backup:** it contains everything in your library plus your settings, including the city you chose
  for the weather (its name and coordinates) and the last Fragrantica username you typed. Do not post a backup
  publicly or send it to someone you do not trust. The CSV export contains only your fragrance rows, no settings.
- The imported dataset can be very large, so backups leave it out unless you tick *Include the imported dataset*.
- **Settings → Export** writes your fragrances to a CSV that opens in Excel (one row per fragrance, with notes, accords,
  bottle levels, wear statistics and prices).

## Where your data lives

Everything is in one folder; **Settings → About → Data folder → Open** opens it.

| System | Folder |
| --- | --- |
| Windows | `%APPDATA%\Scent Wardrobe\` (for example `C:\Users\<you>\AppData\Roaming\Scent Wardrobe`) |
| macOS | `~/Library/Application Support/Scent Wardrobe/` |

Inside: `scent-wardrobe.db` (your library), `images\` (cached bottle pictures), `backups\` (backup zips) and
`window-state.json`. Uninstalling the app **keeps** this folder, so reinstalling brings everything back. To start
fresh, close the app and delete the folder.

## FAQ and troubleshooting

**Windows or macOS says the app is from an unknown developer.** The installers are not signed. See
[Installing](#installing) for the one-time steps.

**Some bottle pictures show as plain drawn bottles.** The app tries a failed picture several times before giving up.
If it is still a drawn bottle, the picture file is probably missing from the `images` folder (for example after
moving the library without it). Open the fragrance and press **Use my own photo**, or restore a backup, which includes
the pictures. Importing the fragrance again from its Fragrantica link downloads it again.

**The Fragrantica import says it could not read the page or asks for a check.** Complete any check in the window that
appears. If the page layout changed since this version was released, the importer may need an update; the paste/CSV
method still works.

**Weather is empty.** Set your city in Settings → Weather location, and check your internet connection. You can always
type a temperature by hand.

**I deleted something by mistake.** There is no undo, but there is a backup: **Settings → Backup and restore → Restore
from a file…** and choose the newest automatic or manual backup.

**The app says its data file cannot be opened.** The library file may be damaged or locked. Close all copies of the
app, rename `scent-wardrobe.db` in the data folder (for example to `scent-wardrobe.damaged.db`), start the app (it
creates an empty library) and restore a backup zip from the `backups` folder.

**It says my data was made by a newer version.** Install the latest version of the app; an older version will not
open data written by a newer one, to keep it safe.

**Moving to another computer.** Make a backup (**Save a copy elsewhere…**), install the app on the new computer and use
**Restore from a file…**.
