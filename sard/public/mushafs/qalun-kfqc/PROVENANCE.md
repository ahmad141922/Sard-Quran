# qalun-kfqc — provenance

| | |
|---|---|
| Edition | مصحف المدينة النبوية — قالون عن نافع |
| Qira'ah / Riwaya | `nafi` / `qalun` |
| Publisher | King Fahd Glorious Qur'an Printing Complex (KFQC) |
| Page assets from | https://github.com/quranpedia/quran-svg — `mushafs/qalon/kfqc/svg/` (upstream spells the riwaya `qalon`) |
| Overlay (ayahPolygon) | Quranpedia, CC0 1.0 — commercial use permitted, no attribution required |
| Page count | 604 |
| Ayah numbering | `madani-first` — 6214 verses |
| Obtained | 2026-08-19 |
| Pages vendored | 604 / 604 (286 MB) |

## Terms

The same grant as `hafs-kfqc` and `warsh-kfqc`: per the upstream `NOTICE.md`,
KFQC allows free use of its editions for personal, institutional and **digital**
purposes — websites, software and media included. The restriction is on
**commercially selling printed muṣḥafs**, which this product does not do. The
ayah-polygon hit layer is separate work by Quranpedia, released CC0.

## Verification performed

- 604 pages, 6214 ayah polygons, 114/114 surahs reachable, no duplicate ayah, no
  gap in any surah's numbering, no page missing (`npm run mushaf:validate`).
- The polygons enumerate every ayah of every surah exactly once and in reading
  order — `npm run mushaf:index` refuses to write a page index otherwise.
- No `<script>`, no `on*` handlers, no external references.

## The numbering was derived, not inherited

Qalun and Warsh are both riwayat of Nafi', which is a reason to *check* whether
they are numbered alike — never a reason to assume it. Read back out of these
plates:

- 6214 verses, against Hafs's 6236.
- The last verse of all 114 surahs matches the Warsh muṣḥaf exactly; 50 surahs
  differ from Hafs.
- Every one of the 604 pages carries exactly the same list of verses as the
  Warsh muṣḥaf's page of that number.
- On page 1 the first numbered polygon sits where Warsh's does and a line below
  where Hafs's does: this scheme does not number al-Fatiha's basmala.

So `ayahCounting: 'madani-first'` is a measurement of the asset. The validator
fails the package if the plates and the declared scheme ever disagree.

## Relation to the other two

Same 604-page layout (`pageAlignmentGroup: 'kfqc-604'`), verified page by page
against both. Carrying a position between Qalun and Warsh is therefore an
identity — they number alike — while Qalun ↔ Hafs converts, exactly as Warsh ↔
Hafs does, and is marked inexact on the 94 pages where the two divide a verse
differently.

## Not derived from another riwaya

No text, numbering or region was generated from Warsh, Hafs or anything else.
Everything here comes from the KFQC Qalun plates as published by Quranpedia.
