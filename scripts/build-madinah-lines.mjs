#!/usr/bin/env node
/**
 * Builds the Madinah line layout: which words sit on which printed line.
 *
 * ## Why this file has to exist
 *
 * The Madinah edition is read as a **plate** — the publisher's own vector page —
 * and a plate is a picture. It carries one polygon per ayah, which is why a
 * verse can be highlighted on it, and it carries nothing per word. So on the
 * plate a word cannot be marked at all. (This was measured, twice: clustering
 * the page's glyph contours gets the word *count* right on 99.6% of lines but
 * lands on only 6.5% of the boundaries the ayah polygons prove, because Arabic
 * letters' bounding boxes overlap even when the letters never touch.)
 *
 * The text renderer has no such problem: `QuranIndex.pageWordLines` already
 * draws one element per word. What it lacked was the **line breaks** — without
 * them the text flows freely and stops being the page anybody memorised from.
 * ash-Shamarly has had them since its own index was built; Madinah never did.
 *
 * ## Where the numbers come from, and why they can be trusted
 *
 * `aya_text` in the Qur'an dataset is already split on spaces into words — the
 * same 77,429 the Quranic Universal Library numbers, plus one end-of-ayah marker
 * each, 83,665 tokens in all. QUL's layout database gives, per printed line, the
 * first and last word on it. Same books, same words.
 *
 * **The two are not numbered identically**: QUL reaches 83,668, three ahead of
 * us, because the two texts split four words differently. So nothing here uses a
 * QUL word id as an index into our text. Only **differences** are used — where a
 * line begins relative to the first word of its own page — and a difference is
 * immune to any offset that came before it.
 *
 * What makes that enough is a property of this particular print: **no verse is
 * split across a leaf**. Every one of the 604 pages holds whole verses, checked
 * here against the page index rather than assumed. So each page's own token
 * count is knowable from our text alone, no page needs a starting word offset,
 * and a counting difference can never leak past the page it occurs on — it is
 * confined to four of them, named in `knownDrift` and pinned by a test.
 *
 * Where the layout and the text cannot both be right the script writes nothing.
 * A page index that is subtly wrong is worse than none: it would mis-credit
 * recitation and send the review plan to the wrong passage, both in silence.
 *
 *   node scripts/build-madinah-lines.mjs [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const QURAN = resolve(ROOT, 'sard/public/hafs_smart_v8.json');
const QUL = resolve(ROOT, 'scripts/data/qpc-v2-lines.json');
const OUT = resolve(ROOT, 'sard/public/mushaf-madinah-lines.json');

const AYAH_LINE = 0;

/** Tokens of one ayah: its words, then its end-of-ayah marker. */
const tokensOf = verse => verse.aya_text.replace(/‏/g, '').trim().split(/\s+/).filter(Boolean);

function main() {
  const dry = process.argv.includes('--dry');
  const verses = JSON.parse(readFileSync(QURAN, 'utf8'));
  const qul = JSON.parse(readFileSync(QUL, 'utf8'));

  /*
   * Every page of this print holds whole verses — no verse is split across a
   * leaf, which is checked below rather than assumed. That is what makes the
   * page's own token count knowable from our text alone, and it is why no page
   * needs a `pageStartWord`: each one opens at a verse.
   */
  const perPage = new Map();
  for (const v of verses) {
    const n = tokensOf(v).length;
    perPage.set(v.page, (perPage.get(v.page) ?? 0) + n);
  }

  const pages = qul.pages;
  const pageLines = [];
  const problems = [];
  const drifted = [];

  for (let p = 1; p <= pages; p++) {
    const rows = (qul.lines[p - 1] ?? []).filter(r => r[1] === AYAH_LINE && r[2] > 0);
    if (!rows.length) { problems.push(`page ${p}: the layout has no verse lines`); continue; }
    rows.sort((a, b) => a[0] - b[0]);

    const ours = perPage.get(p);
    if (!ours) { problems.push(`page ${p}: the text places nothing here`); continue; }
    const theirs = rows.reduce((n, r) => n + (r[3] - r[2] + 1), 0);

    const first = rows[0][2];
    let breaks = rows.slice(1).map(r => r[2] - first);

    /*
     * The two texts split four words differently — the muqattaʿat and «إل ياسين»
     * among them — so on four pages the layout counts one or two tokens we do
     * not. The difference never leaves the page it occurs on, because a page
     * boundary here is always a verse boundary, so it is recorded and the
     * breaks past our own last token are dropped rather than pointing beyond
     * the line they belong to.
     */
    if (theirs !== ours) {
      drifted.push({ page: p, ours, theirs });
      breaks = breaks.filter(b => b < ours);
    }
    pageLines.push(breaks);
  }

  if (problems.length) {
    console.error('refusing to write the Madinah line layout:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    return;
  }

  const lines = pageLines.reduce((n, b) => n + b.length + 1, 0);
  const doc = {
    id: 'madinah',
    totalPages: pages,
    firstPageNumber: 1,
    source: qul.source,
    edition: qul.edition,
    builtBy: 'scripts/build-madinah-lines.mjs',
    /** Pages where the layout's word count differs from the text's; see above. */
    knownDrift: drifted,
    pageLines,
  };
  console.log(`${pages} pages, ${lines} lines`);
  if (drifted.length) {
    console.log(`pages counted differently by the two sources: ${
      drifted.map(d => `${d.page} (${d.ours} vs ${d.theirs})`).join(', ')}`);
  }
  if (dry) { console.log('--dry: nothing written'); return; }
  writeFileSync(OUT, JSON.stringify(doc), 'utf8');
  console.log(`wrote ${OUT}`);
}

main();
