# hafs-kfqc — provenance

| | |
|---|---|
| Edition | مصحف المدينة النبوية — حفص عن عاصم |
| Qira'ah / Riwaya | `asim` / `hafs` |
| Publisher | King Fahd Glorious Qur'an Printing Complex (KFQC) |
| Page assets from | https://github.com/quranpedia/quran-svg — `mushafs/hafs/kfqc/svg/` |
| Overlay (ayahPolygon) | Quranpedia, CC0 1.0 — commercial use permitted, no attribution required |
| Page count | 604 |
| Ayah numbering | `kufi` — 6236 verses |
| Obtained | 2026-08-17 |
| Pages vendored | 604 / 604 (348 MB) |

## Terms

Per the upstream `NOTICE.md`, KFQC grants free use of its editions for personal,
institutional and **digital** purposes — websites, software and media included.
The restriction is on **commercially selling printed muṣḥafs**, which this
product does not do.

The ayah-polygon hit layer and the JSON metadata are separate work by
Quranpedia, released CC0.

## Verification performed

- Page 105's polygons carry an-Nisa 171–175; `public/hafs_smart_v8.json`
  independently places exactly those five ayahs on page 105. The asset and our
  text data describe the same edition.
- Extended to the whole book: on all 604 pages the polygon layer lists exactly
  the ayahs `hafs_smart_v8.json` puts on that page, in the same order. Two
  independently sourced descriptions of one edition agree completely.
- 6236 ayah polygons, 114/114 surahs, no duplicate and no gap in any surah's
  numbering (`npm run mushaf:validate`).
- The file contains no `<script>`, no `on*` handlers and no external references.
  It is sanitised again at load time regardless.

## Excluded on licence grounds

`qalon/libya-awqaf` (Libyan Ministry of Endowments) — non-commercial only,
commercial use needs prior written approval. This product is commercial, so the
edition is not vendored.
