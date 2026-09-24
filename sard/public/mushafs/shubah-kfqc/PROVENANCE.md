# shubah-kfqc — provenance

| | |
|---|---|
| Edition | مصحف المدينة النبوية — شعبة عن عاصم |
| Qira'ah / Riwaya | `asim` / `shubah` |
| Publisher | King Fahd Glorious Qur'an Printing Complex (KFQC) |
| Page assets from | https://github.com/quranpedia/quran-svg — `mushafs/shubah/kfqc/svg/` |
| Overlay (ayahPolygon) | Quranpedia, CC0 1.0 — commercial use permitted, no attribution required |
| Page count | 604 |
| Ayah numbering | `kufi` — 6236 verses |
| Obtained | 2026-08-19 |
| Pages vendored | 604 / 604 (~300 MB) |

## Terms

The same grant as the other KFQC editions here: free use for personal,
institutional and **digital** purposes per the upstream `NOTICE.md`; the
restriction is on commercially selling printed muṣḥafs, which this product does
not do. The ayah-polygon layer is Quranpedia's work, CC0.

## Verification performed

- 604 pages, 6236 ayah polygons, 114/114 surahs, no duplicate ayah, no gap in
  any surah's numbering, no page missing (`npm run mushaf:validate`).
- The polygons enumerate every ayah of every surah exactly once and in order —
  `mushaf:index` refuses to write a page index otherwise.
- No `<script>`, no `on*` handlers, no external references.

## Numbered exactly as Hafs is — measured, not assumed

Shu'bah and Hafs both report from 'Asim, which is a reason to check whether
these plates number alike and no reason to take it for granted. From the plates
themselves:

- 6236 verses, the Kufan total.
- The last verse of **all 114 surahs** matches the Hafs muṣḥaf; none differs.
- **All 604 pages** carry exactly the same list of verses as the Hafs page of
  that number.
- On page 1 the first numbered polygon occupies the same band as Hafs's — the
  basmala is numbered here as it is there.

So this is the first pair of genuinely different books in the app that need no
conversion at all between them: same counting, same layout, different plates
and a different recitation. The registry states `ayahCounting: 'kufi'`, and the
validator fails the package if the plates ever disagree.

## Not derived from another riwaya

No text, numbering or region was generated from Hafs or anything else. The
plates are the KFQC Shu'bah muṣḥaf as published by Quranpedia.
