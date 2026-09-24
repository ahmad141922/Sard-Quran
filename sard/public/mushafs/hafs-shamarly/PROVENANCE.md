# hafs-shamarly — provenance

| | |
|---|---|
| Edition | مصحف الشمرلي — حفص عن عاصم |
| Qira'ah / Riwaya | `asim` / `hafs` |
| Publisher | مطبعة الشمرلي |
| What we hold | **pagination only** — 521 pages numbered 2…522, and their line layout |
| Source of the pagination | `public/mushaf-shamarly.json`, supplied by the owner from a Shamarly page database: page, surah and ayah numbers, with word offsets interpolated between ayah markers |
| Page images | **none.** No licensed source yet |
| Ayah numbering | `kufi` — 6236 verses, the same numbering as the Madinah muṣḥaf |
| Built | `npm run mushaf:index-pages hafs-shamarly public/mushaf-shamarly.json` |

## Why it is an edition here at all, with no plates

Hafs is Hafs: this book numbers verses exactly as the Madinah muṣḥaf does. What
differs — and what a memoriser actually holds in their head — is **where the
pages break**. A student who learnt from ash-Shamarly knows a surah ends at the
bottom of a particular page of *that* book, and "finish the surah" has to appear
there and nowhere else.

So the edition is registered on the strength of its pagination alone, and the
text layer renders it line for line until plates arrive. `pageFormat: 'none'`
says so in the registry; nothing else in the engine treats it as a special case.

## Deliberately in no alignment group

Page 106 of this book is not page 106 of the King Fahd Complex's, and the
engine is told so: `pageAlignmentGroup` is absent, which is what stops any
conversion from assuming the two share boundaries. It is the first edition here
that does not, and the first real exercise of that path.

## Verification performed

- 521 pages, first numbered 2 — its opening leaf carries no Qur'anic text.
- The pagination covers all 6236 ayahs exactly once, in order, starting at 1:1:
  `mushaf:index-pages` refuses to write an index otherwise.
- Every surah ends where the Kufan text data independently says it ends
  (`npm run mushaf:validate hafs-shamarly`).

## What is still missing, and the rule that governs it

1. **Page images** under a licence that permits commercial use. Not yet found.
   **QuranFlash's assets are not to be used** — it is a commercial reader that
   does not licence its pages — and a PDF being downloadable is not permission
   to redistribute it.
2. **An ayah-region layer** (`hotspotMode: 'external-json'`) so verses can be
   tapped on those images. It will not come with them and must be produced.

Until both exist this stays `pageFormat: 'none'`: an honest description of a
real edition we hold part of, not a placeholder pretending to be a muṣḥaf.

## When a licensed PDF arrives

The pipeline for it is built and tested (`scripts/pdf-to-mushaf.mjs`, rendering
through pdf.js and @napi-rs/canvas — no service, nothing uploaded anywhere):

```bash
npm run mushaf:from-pdf hafs-shamarly <file.pdf> --probe
npm run mushaf:from-pdf hafs-shamarly <file.pdf> --skip <n> --first-printed 2
```

It refuses to write unless the pages the file yields match the 521 this edition
declares, then writes `pages/002.webp` … `pages/522.webp` and a manifest. The
only code change afterwards is `pageFormat: 'none'` → `'webp'`.

What has to be settled first is not technical: **who owns that PDF and what it
permits**. A file being downloadable is not a licence, and this product is
commercial.
