# Data, credits and legal notes

## What the licence covers

The source code of Scent Wardrobe is released under the [MIT licence](LICENSE): you may use, copy, modify and
redistribute the code, including commercially, as long as the copyright and licence notice stay with it. The software
is provided as is, without warranty.

The licence covers **only the code and the original artwork in this repository** (for example the app icon and the
generated bottle drawings). It does **not** grant any rights to fragrance data, pictures, text or trademarks that
belong to other people, such as the content of Fragrantica or the Kaggle dataset described below.

## Fragrance data and pictures

- Fragrance names, notes, accords, community votes, descriptions and bottle pictures that the app can show come from
  [Fragrantica](https://www.fragrantica.com) and belong to Fragrantica and its contributors.
- Scent Wardrobe is **not affiliated with, sponsored by or endorsed by Fragrantica**. "Fragrantica" is a name and
  trademark of its owner; brand names and bottle pictures belong to their respective brands.
- The repository contains **no Fragrantica pictures, pages or dataset files**. The app downloads a picture only when
  *you* import a fragrance, stores it on *your* computer (in the app's data folder) for your own offline use, and never
  uploads or redistributes it. Screenshots in the documentation are taken with the built-in sample data only.
- The sample library that ships inside the app (names, houses and the notes used to demonstrate the layering engine)
  consists of facts about well-known fragrances typed in by hand. It contains no pictures.

### The optional dataset

The app can search a local copy of a public Fragrantica dump so that adding a fragrance is quick. The dump is **not**
included here. It was published on Kaggle as
[ledecanteur/fragrantica-perfumes](https://www.kaggle.com/datasets/ledecanteur/fragrantica-perfumes); credit for
collecting it belongs to its author. The dataset page does not make clear what rights come with the data, and the data
itself comes from Fragrantica, so please read the dataset page and Fragrantica's terms yourself before downloading and
using it. Everything works without it.

### About the importer (please read)

The "Import from Fragrantica" features load web pages in the same way a browser does, at your request, and read what is
shown on them. They are meant as a **personal, user-initiated convenience for your own library**:

- They run only when you press the button or paste a link. There is no background crawling.
- They load one page at a time, with a pause of at least three seconds between pages.
- They read pages that anyone can see; if the site asks for a login or a human check, you do it yourself in a window
  that opens (the app never asks for, sees or stores your password).
- Nothing is sent anywhere except the request to Fragrantica itself.

Websites often have terms of use that limit automated access, and Fragrantica's terms may do so too. Whether and how you
use the importer is your decision and your responsibility: read the current terms of the site first, keep your use
personal and light, and stop if the site asks you to. Nothing in this repository is legal advice. If Fragrantica (or
anyone else) asks for a feature to be removed, it will be.

## Weather

Daily recommendations can use current weather from [Open-Meteo](https://open-meteo.com) (free for non-commercial use;
data licensed CC BY 4.0). Only the coordinates of the city you choose are sent. You can use the app without it.

## Open-source software used

The full list, with versions and licences, is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (generated from
`package.json` with `node scripts/generate-notice.mjs`). The main building blocks are Electron, React, Vite
(electron-vite), Tailwind CSS, better-sqlite3, Recharts, dnd-kit, yauzl and yazl, all under permissive licences (MIT, with a
few ISC, BSD and Apache-2.0 packages inside their dependency trees). Build-time tools under other licences (for example
MPL-2.0 for lightningcss and CC-BY-4.0 for the caniuse data) are not part of the shipped app. Electron includes
Chromium and Node.js; their licences are in the `LICENSES.chromium.html` file that comes with every build.
