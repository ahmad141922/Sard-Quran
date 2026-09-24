# warsh-kfqc — provenance

| | |
|---|---|
| Edition | مصحف المدينة النبوية — ورش عن نافع |
| Qira'ah / Riwaya | `nafi` / `warsh` |
| Publisher | King Fahd Glorious Qur'an Printing Complex (KFQC) |
| Page assets from | https://github.com/quranpedia/quran-svg — `mushafs/warsh/kfqc/svg/` |
| Overlay (ayahPolygon) | Quranpedia, CC0 1.0 — commercial use permitted, no attribution required |
| Page count | 604 |
| Ayah numbering | `madani-first` — 6214 verses |
| Obtained | 2026-08-19 |
| Pages vendored | 604 / 604 (327 MB) |

## Terms

Same grant as `hafs-kfqc`: per the upstream `NOTICE.md`, KFQC allows free use of
its editions for personal, institutional and **digital** purposes — websites,
software and media included. The restriction is on **commercially selling
printed muṣḥafs**, which this product does not do. The ayah-polygon hit layer is
separate work by Quranpedia, released CC0.

## Verification performed

- 604 pages, 6214 ayah polygons, 114/114 surahs reachable, no duplicate ayah, no
  gap in any surah's numbering, no page missing (`npm run mushaf:validate`).
- The polygons enumerate every ayah of every surah exactly once and in reading
  order — `npm run mushaf:index` refuses to write a page index otherwise.
- No `<script>`, no `on*` handlers, no external references. Sanitised again at
  load time regardless.

## The numbering is Warsh's own

These plates number 6214 verses where Hafs numbers 6236; 50 surahs end on a
different number (al-Kahf 105 against 110, al-An'am 167 against 165). **That
total is read back out of the plates themselves**, not assumed — the validator
fails the package if the asset and the declared scheme disagree.

The scheme's *name*, العدّ المدني الأول, is the designation of the count KFQC
prints Warsh with; it is a label on the data, not something derived from it. The
app never relies on the name — only on the per-edition page index.

## Relation to hafs-kfqc

Both are typeset to the same 604-page layout: every page of one carries the same
words as that page of the other, verified against the Hafs plates and against
`public/hafs_smart_v8.json` for all 604 pages. That is what
`pageAlignmentGroup: 'kfqc-604'` claims and what `mushaf-package.test.ts`
re-checks. It is **not** an assumption the viewer makes: pages are always looked
up in the edition's own `page-index.json`.

On 94 of the 604 pages a verse division falls inside the page, so the two books
list a different number of verses there. Positions carried across those pages
are exact to the page and may differ by a verse; the app reports that rather
than presenting a guess as fact.

## Not derived from Hafs

No text, numbering or region was generated from another riwaya. Everything here
comes from the KFQC Warsh plates as published by Quranpedia.
