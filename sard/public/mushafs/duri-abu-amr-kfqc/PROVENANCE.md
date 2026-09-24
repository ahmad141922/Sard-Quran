# duri-abu-amr-kfqc — provenance

| | |
|---|---|
| Edition | مصحف المدينة النبوية — الدوري عن أبي عمرو |
| Qira'ah / Riwaya | `abu-amr` / `duri-abu-amr` |
| Publisher | King Fahd Glorious Qur'an Printing Complex (KFQC) |
| Page assets from | https://github.com/quranpedia/quran-svg — `mushafs/douri/kfqc/svg/` (upstream spells it `douri`) |
| Overlay (ayahPolygon) | Quranpedia, CC0 1.0 — commercial use permitted, no attribution required |
| Page count | 604 |
| Ayah numbering | `basri` — **6218 verses**, a table of its own |
| Obtained | 2026-08-19 |
| Pages vendored | 604 / 604 (282 MB) |

## Terms

As with the other KFQC editions here: free digital use per the upstream
`NOTICE.md`, the restriction being on commercially selling printed muṣḥafs. The
polygon layer is Quranpedia's, CC0.

## Which Duri this is

Ad-Duri reported from Abu Amr al-Basri **and** from al-Kisa'i, and the two are
not printed alike, so the folder name alone would not settle it. The plates do:
their verse numbering is neither the Kufan count that a Duri-from-al-Kisa'i
muṣḥaf would carry (6236) nor either Madinan table already in the app. It is a
third table, which is what the Basran tradition — Abu Amr's own — calls for.
Recorded here as evidence, not as a claim beyond it.

## Verification performed

- 604 pages, 6218 ayah polygons, 114/114 surahs, no duplicate ayah, no gap in
  any surah's numbering, no page missing (`npm run mushaf:validate`).
- Every ayah of every surah enumerated exactly once and in reading order —
  `mushaf:index` refuses to write a page index otherwise.
- No `<script>`, no `on*` handlers, no external references.

## The numbering, measured

- **6218 verses**, against Hafs's 6236 and the 6214 of the Warsh and Qalun
  plates. It is its own table, shared with no other edition here.
- 44 surahs end on a different number from Hafs; 11 differ from Warsh — so it
  is neither of them with a few edits, but a third reckoning.
- On page 1 the first numbered polygon sits below the basmala line, as in the
  Warsh and Qalun plates and unlike Hafs: the basmala is not numbered.

**On the scheme's name.** `basri` is a label on this measured table, taken from
the riwaya's own provenance. The total read from these plates (6218) does not
match every published tally of the Basran count, and nothing in the app relies
on the name: every position is converted through each edition's own page index,
and the validator checks the plates against the declared total (6218) rather
than against any outside authority. If the owner establishes the correct
designation, only `AYAH_COUNTING[...].nameAr` changes.

## Relation to the others

Same 604-page layout (`pageAlignmentGroup: 'kfqc-604'`) — every page carries the
same words as that page of the other four, verified page by page. Positions
therefore convert to and from it exactly as they do for Warsh and Qalun, and are
marked inexact wherever a verse division falls inside a page.

## Not derived from another riwaya

Nothing here was generated from Hafs, Warsh or Qalun.
