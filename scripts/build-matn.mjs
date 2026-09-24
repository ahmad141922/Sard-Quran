/**
 * Builds the matn files the app loads, from the digitisations they came from.
 *
 *   node scripts/build-matn.mjs [<id> ...]        # fetches, then writes
 *   node scripts/build-matn.mjs --cache <dir>     # where the pages are kept
 *
 * Five matns come from two sites — three from shamela.ws, transcribing named
 * critical editions, and two from ketabonline.com. The two that shipped before
 * this script (Tuhfat al-Atfal and al-Muqaddima al-Jazariyya) were prepared by
 * hand and are **not** touched here; their files are the ones in `sard/public`.
 *
 * ## Why this is a script and not a one-off paste
 *
 * The five texts run to 2,895 abyāt. Nobody is going to re-check them by eye,
 * so the only way to know a file is sound is to derive it by a rule and to make
 * the rule state what it assumed. Everything below either verifies against
 * something the print itself says, or fails.
 *
 * ## What tells a bayt from a heading
 *
 * Not the leading number: al-Durra numbers its **chapters** too, so
 * «١٥ - الياءات الزوائد ٦» is a heading while «٥٦ - وتثبت … موصلا» is a line.
 * What separates them is the ellipsis between the hemistichs, which every bayt
 * has and no heading does.
 *
 * ## The chapters, which each print states twice
 *
 * A print says where each heading sits **and** how many abyāt its chapter
 * holds. The two disagree often enough to matter, and which one to believe
 * differs by print:
 *
 * - Ṭayyibat an-Nashr's positions are wrong in the middle — four chapters in a
 *   row come out exactly sixteen lines long, which is one page of the website,
 *   so the headings have been pushed to page ends. Its counts, chained from the
 *   first line, land back on an observed heading at bayt 253 and stay in step.
 * - The Salsabīl and Laʾāliʾ al-Bayān print no counts at all.
 *
 * So both readings are built and the one that agrees with the other more often
 * wins, and whichever is chosen the result must tile 1..total exactly. A
 * chapter list with a hole in it would lose a reciter their place, which is the
 * one thing this must never do.
 *
 * ## Repairs
 *
 * Listed in `REPAIRS`, one by one, never inferred. Each is a place where the
 * source contradicts itself and the correction is the only reading that makes
 * it agree with itself again. They are named so that anyone comparing the
 * shipped text against the website can see exactly where the two differ.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/* ─── where each text comes from ──────────────────────────────────────────── */

const SOURCES = {
  salsabil: {
    site: 'ketab', book: 103147, pages: 40, total: 265,
    editionAr: 'نصّ موقع ketabonline.com (جامع الكتب الإسلامية)',
    editionEn: 'Text from ketabonline.com (Jāmiʿ al-Kutub al-Islāmiyya)',
  },
  laali: {
    site: 'ketab', book: 25003, pages: 45, total: 201,
    editionAr: 'نصّ موقع ketabonline.com (جامع الكتب الإسلامية)',
    editionEn: 'Text from ketabonline.com (Jāmiʿ al-Kutub al-Islāmiyya)',
  },
  durra: {
    site: 'shamela', book: 7749, pages: 30, total: 241,
    editionAr: 'تحقيق محمد تميم الزعبي، دار الهدى، الطبعة الثانية ١٤٢١هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā, 2nd ed. 1421 AH',
  },
  shatibiyya: {
    site: 'shamela', book: 7754, pages: 135, total: 1173,
    editionAr: 'تحقيق محمد تميم الزعبي، مكتبة دار الهدى ودار الغوثاني، الطبعة الرابعة ١٤٢٦هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā & Dār al-Ghawthānī, 4th ed. 1426 AH',
  },
  tayyiba: {
    site: 'shamela', book: 7795, pages: 80, total: 1015,
    editionAr: 'تحقيق محمد تميم الزعبي، دار الهدى بجدة، الطبعة الأولى ١٤١٤هـ',
    editionEn: 'Ed. Muḥammad Tamīm az-Zaʿbī, Dār al-Hudā, Jeddah, 1st ed. 1414 AH',
  },
};

const REPAIRS = {
  shatibiyya: {
    /*
     * Two lines lost the ellipsis between their hemistichs and so read as
     * headings, leaving holes at 107 and 444. Restoring them is not a matter of
     * taste: with 107 back, «bāb al-basmala» holds the 8 abyāt it declares, and
     * with 444 back «bāb farsh al-ḥurūf» holds its declared 676 exactly.
     */
    splitLines: { 107: 'سُورَةٍ', 444: 'أَكْتَفِي' },
  },
  tayyiba: {
    /*
     * The print stacks «bāb waqf Ḥamza wa-Hishām» and «bāb as-sakt» after bayt
     * 245, in that order. The poem says otherwise: bayt 235 opens «wa-s-saktu
     * ʿan Ḥamzata fī shayʾin wa-al», and 240 opens «idhā ʿtamadta l-waqfa
     * khaffif hamzah … li-Ḥamzah». Their declared counts, 5 and 14, fill the
     * span 235–253 exactly in that order and in no other.
     */
    headingOrder: [{ after: 245, order: ['السَّكْتِ', 'وَقفِ حَمْزَةَ'] }],
    /*
     * One line ends «… كَمْ فَتىً رَتَعْ ١س». Every other bayt ends on its rhyme;
     * «١س» is a marginal mark that ran into the text, and it is the only one of
     * its kind in the file.
     */
    trimEnd: { 466: 'رَتَعْ' },
  },
  durra: {
    /*
     * The print numbers two consecutive lines 238 and has no 239. They are
     * different abyāt, so the second is 239 and the poem's own total of 241
     * comes out right.
     */
    renumber: [{ at: 238, occurrence: 2, becomes: 239 }],
  },
};

/* ─── text handling ───────────────────────────────────────────────────────── */

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const west = s => [...s].map(c => (AR_DIGITS.indexOf(c) >= 0 ? AR_DIGITS.indexOf(c) : c)).join('');

/**
 * Shadda before its vowel, always.
 *
 * The two are stored in either order by different typesetters and render
 * identically; fixing the order is what lets the same line typed twice compare
 * equal at all.
 */
const canonicalMarks = s => s.replace(/([ً-ِْ])(ّ)/g, '$2$1');

/** Letters only, for comparing a name across two ḍabṭs. */
const letters = s => s.replace(/[^ء-ي]/g, '');

/**
 * What divides the two hemistichs: an ellipsis.
 *
 * Two lines of the Salsabīl use a dash instead, so on ketabonline a dash beside
 * a space counts too — but **only** there. Allowing it everywhere breaks the
 * shamela prints, where a dash is ordinary punctuation inside a heading:
 * «٣٢ - ومن سورة الرحمن - عز وجل - إلى سورة الامتحان» then splits in two and
 * becomes a bayt that does not exist.
 */
const SEP = /\s*(?:\.{3,}|…)\s*/;
const SEP_KETAB = /\s*(?:\.{3,}|…)\s*|\s-\s*|\s*-\s/;
const sepFor = site => (site === 'ketab' ? SEP_KETAB : SEP);

/* ─── fetching ────────────────────────────────────────────────────────────── */

const pageUrl = (spec, n) => spec.site === 'shamela'
  ? `https://shamela.ws/book/${spec.book}/${n}`
  : `https://ketabonline.com/ar/books/${spec.book}/read?part=1&page=${n}`;

async function fetchPages(id, spec, cache) {
  const dir = join(cache, `${spec.site}-${spec.book}`);
  mkdirSync(dir, { recursive: true });
  let got = 0;
  for (let n = 1; n <= spec.pages; n++) {
    const file = join(dir, `${n}.html`);
    if (existsSync(file) && readFileSync(file, 'utf8').length > 1000) continue;
    const res = await fetch(pageUrl(spec, n), { headers: { 'user-agent': 'Mozilla/5.0' } });
    writeFileSync(file, await res.text());
    got++;
    await new Promise(r => setTimeout(r, 300));
  }
  if (got) console.log(`  ${id}: fetched ${got} page(s)`);
  return dir;
}

/* ─── reading a page ──────────────────────────────────────────────────────── */

const CHROME = /^(تحميل الصفحة|&lt;|<<|اذهب|الكتاب:|تَأْلِيفُ:|ملحوظة:|المؤلف:)/;

/** The reading text of one shamela page, footnotes and furniture dropped. */
function shamelaPage(file) {
  if (!existsSync(file)) return [];
  const h = readFileSync(file, 'utf8');
  const m = h.match(/<div[^>]*class="nass[^"]*"[\s\S]*?<\/div>\s*<\/div>/);
  if (!m) return [];
  const body = m[0]
    .replace(/<span[^>]*class="[^"]*hamesh[\s\S]*$/i, '')
    .replace(/<a[^>]*class="[^"]*btn_tag[\s\S]*?<\/a>/g, '')
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/<br\s*\/?>/g, '\n').replace(/<\/(p|div|h[1-6]|li)>/g, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return body.split('\n').map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s && !CHROME.test(s));
}

const unescapeNuxt = s => s
  .replace(/\\u002F/gi, '/').replace(/\\u003C/gi, '<').replace(/\\u003E/gi, '>')
  .replace(/\\u0026/gi, '&').replace(/\\"/g, '"').replace(/\\n/g, '\n');

/**
 * The paragraphs of one ketabonline page.
 *
 * The reader renders client-side, so the text is taken from the Nuxt payload.
 * Anchored on each paragraph's own id rather than on its opening tag: the
 * payload is split at the markup's own quote characters, so a `<p class="…"` is
 * routinely cut in half and cannot be matched whole. A chapter title is a
 * `g-title` div; both shapes are read in one scan so a heading stays attached
 * to the bayt it precedes.
 */
function ketabPage(file) {
  if (!existsSync(file)) return [];
  const h = readFileSync(file, 'utf8');
  const i = h.indexOf('__NUXT__');
  if (i < 0) return [];
  const raw = unescapeNuxt(h.slice(i, h.indexOf('</script>', i)));
  const pattern = /<div[^>]*class="g-title[^"]*"[^>]*>([\s\S]*?)<\/div>|id="p-\d+-\d+-\d+">([\s\S]*?)<a href="#p-/g;
  return [...raw.matchAll(pattern)]
    .map(m => (m[1] ?? m[2])
      .replace(/<span[^>]*class="[^"]*g-list[^"]*"[^>]*>([\s\S]*?)<\/span>/g, '$1 ')
      .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function bookLines(spec, dir) {
  const read = spec.site === 'shamela' ? shamelaPage : ketabPage;
  const out = [];
  for (let n = 1; n <= spec.pages; n++) out.push(...read(join(dir, `${n}.html`)));
  return out;
}

/* ─── repairs ─────────────────────────────────────────────────────────────── */

/**
 * Puts a missing divider back, before anything is parsed.
 *
 * A line that reads as a heading also shifts the recorded position of every
 * heading after it, so repairing it later would fix the line and leave the
 * chapters wrong. The split is named by the word it follows, so it either
 * matches the source exactly or fails loudly.
 */
function applySplits(lines, splits) {
  if (!splits) return lines;
  const done = new Set();
  const out = lines.map(line => {
    const m = west(line).match(/^(\d+)[\s.\-–—]*(.+)$/);
    if (!m) return line;
    const n = +m[1];
    const after = splits[n];
    if (after === undefined || done.has(n)) return line;
    const i = line.indexOf(after);
    if (i < 0) throw new Error(`repair for bayt ${n}: «${after}» is not in the line any more`);
    done.add(n);
    const cut = i + after.length;
    return `${line.slice(0, cut)} ... ${line.slice(cut).trim()}`;
  });
  const missed = Object.keys(splits).map(Number).filter(n => !done.has(n));
  if (missed.length) throw new Error(`repairs for abyat ${missed.join(', ')} matched nothing`);
  return out;
}

/**
 * Cuts marginal noise off the end of a line.
 *
 * Named by the word the bayt really ends on, so it either matches the source
 * exactly or fails rather than quietly trimming the wrong thing.
 */
function applyTrims(abyat, rules) {
  if (!rules) return abyat;
  for (const [n, endsOn] of Object.entries(rules)) {
    const bayt = abyat.find(b => b.n === +n);
    if (!bayt) throw new Error(`repair: no bayt ${n} to trim`);
    const i = bayt.ajz.lastIndexOf(endsOn);
    if (i < 0) throw new Error(`repair: bayt ${n} does not end on «${endsOn}» any more`);
    bayt.ajz = bayt.ajz.slice(0, i + endsOn.length).trim();
  }
  return abyat;
}

/** Renumbers a line the print gave the previous line's number. */
function applyRenumbering(abyat, rules) {
  if (!rules) return abyat;
  const out = abyat.map(a => ({ ...a }));
  for (const rule of rules) {
    const hits = out.filter(a => a.n === rule.at);
    if (hits.length < rule.occurrence) {
      throw new Error(`repair: expected ${rule.occurrence} lines numbered ${rule.at}, found ${hits.length}`);
    }
    hits[rule.occurrence - 1].n = rule.becomes;
  }
  return out.sort((a, b) => a.n - b.n);
}

/** Reorders headings the print stacked at one place in the wrong sequence. */
function applyHeadingOrder(heads, rules) {
  if (!rules) return heads;
  const out = [...heads];
  for (const rule of rules) {
    const at = out.map((h, i) => [h, i]).filter(([h]) => h.after === rule.after);
    if (at.length !== rule.order.length) {
      throw new Error(`repair: expected ${rule.order.length} headings after bayt ${rule.after}, found ${at.length}`);
    }
    const wanted = rule.order.map(k => {
      const found = at.find(([h]) => letters(h.text).includes(letters(k)));
      if (!found) throw new Error(`repair: no heading after bayt ${rule.after} contains «${k}»`);
      return found[0];
    });
    at.forEach(([, i], k) => { out[i] = wanted[k]; });
  }
  return out;
}

/* ─── parsing ─────────────────────────────────────────────────────────────── */

/**
 * Cuts a heading that has a bayt tacked onto it into the two of them.
 *
 * Only the ketabonline texts need it — the Salsabīl's «الخُطبَة» carries the
 * poem's first line inside the title block. Run over the shamela prints it cuts
 * lines that were never joined, and Ṭayyiba loses fifteen abyāt.
 */
function splitJoined(lines) {
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(.*?[ء-ي])\s+(\d+[\s.\-–—]*[ء-ي(][\s\S]*)$/);
    if (m && /(?:\.{3,}|…)/.test(m[2]) && !/^\d/.test(line)) { out.push(m[1], m[2]); continue; }
    out.push(line);
  }
  return out;
}

/**
 * Splits a book into its abyat and the headings between them.
 *
 * A heading is recorded with the bayt it follows, so `after: 12` means the
 * chapter opens at bayt 13. How a line announces its number differs by print —
 * «22-» in the Salsabīl, «1 . ..» in Laʾāliʾ al-Bayān — so anything between the
 * number and the first Arabic letter is treated as that punctuation.
 */
function poem(lines, sep, joined) {
  const abyat = [], heads = [];
  let n = 0;
  for (const raw of (joined ? splitJoined(lines) : lines)) {
    const line = canonicalMarks(raw);
    // The lookahead admits a bare combining mark as well as a letter: fifteen
    // Ṭayyiba lines open with a stray fatḥa — «َوقَالَ» — and requiring a letter
    // there silently dropped every one of them.
    const m = west(line).match(/^(\d+)[\s.\-–—]*(?=[ء-ْٰ(])(.+)$/);
    if (m) {
      const halves = m[2].split(sep);
      if (halves.length >= 2) {
        // The number was read off the westernised copy; the text is the original.
        const body = line.replace(/^[\d٠-٩]+[\s.\-–—]*/, '');
        const parts = body.split(sep);
        n = +m[1];
        abyat.push({ n, sadr: parts[0].trim(), ajz: parts.slice(1).join(' ').trim() });
        continue;
      }
    }
    heads.push({ after: n, text: line });
  }
  return { abyat, heads };
}

/* ─── chapters ────────────────────────────────────────────────────────────── */

const NOISE = /^(بِسْمِ الله|بسم الله|[*.\s]+$|&gt;|&lt;|الكتاب:|في القراءات|تَمَّتْ|تَمَّ بِحَمْدِ|الحمد لله|نظم$|الفقير|\[تعريف)/;

function declaredCount(text) {
  const w = west(text);
  const m = w.match(/\((\d+)\)\s*$/) || w.match(/\s(\d+)\s*$/);
  return m ? +m[1] : null;
}

/** Whether every bracket in a title is closed — see `cleanTitle`. */
function balanced(t) {
  let round = 0, square = 0;
  for (const c of t) {
    if (c === '(') round++; else if (c === ')') round--;
    if (c === '[') square++; else if (c === ']') square--;
    if (round < 0 || square < 0) return false;
  }
  return round === 0 && square === 0;
}

/**
 * The chapter's name, with the print's bookkeeping taken off it.
 *
 * A heading carries a chapter number in front and a bayt count behind, and some
 * are set in brackets — «(مقدمة) (94)», «[(الخاتمة)]». Only *matched* brackets
 * are stripped: a title may legitimately end in one that belongs inside it, as
 * «wa-min sūrati l-Mujādala ilā sūrati (n)» does, and taking that away would
 * leave the sura's name hanging open.
 */
function cleanTitle(text) {
  let t = west(text)
    .replace(/^\d+\s*-\s*/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s*:\s*$/, '')
    .trim();
  let before;
  do {
    before = t;
    t = t.replace(/^\s*\((.*)\)\s*$/, '$1').replace(/^\s*\[(.*)\]\s*$/, '$1').trim();
  } while (t !== before && balanced(t));
  t = balanced(t) ? t : before;
  // A closing bracket with nothing to close is the print's slip, not a name.
  if (!t.includes('(') && t.endsWith(')')) t = t.slice(0, -1).trim();
  if (!t.includes('[') && t.endsWith(']')) t = t.slice(0, -1).trim();
  return t;
}

const byPosition = (heads, total) => heads.map((h, i) => ({
  ...h, from: h.after + 1, to: i + 1 < heads.length ? heads[i + 1].after : total,
})).filter(c => c.to >= c.from);

/** Chapters from the declared counts, chained from the first line. */
function byCount(heads, total) {
  const out = [];
  let at = 1;
  for (let i = 0; i < heads.length; i++) {
    let span = heads[i].count;
    if (!span) span = ((heads[i + 1]?.after) ?? total) - heads[i].after;
    if (span < 1) span = 1;
    out.push({ ...heads[i], from: at, to: Math.min(at + span - 1, total) });
    at = out[out.length - 1].to + 1;
    if (at > total) break;
  }
  if (out.length) out[out.length - 1].to = total;
  return out;
}

const tiles = (list, total) =>
  list.length > 0 && list[0].from === 1 && list[list.length - 1].to === total &&
  list.every((c, i) => (i === 0 || c.from === list[i - 1].to + 1) && c.to >= c.from);

/** The better of the print's two accounts of its own structure — see the header. */
function divide(heads, total) {
  const pos = byPosition(heads, total), cnt = byCount(heads, total);
  const okPos = tiles(pos, total), okCnt = tiles(cnt, total);
  const counted = heads.filter(h => h.count).length;
  const scorePos = pos.filter(c => c.count && c.count === c.to - c.from + 1).length;
  const scoreCnt = cnt.filter(c => c.from === c.after + 1).length;

  // Ties go to positions: a heading's place is observed in the text, while its
  // count is a separate claim about it.
  let chosen = 'position', list = pos;
  if (counted && okCnt && (!okPos || scoreCnt > scorePos)) { chosen = 'count'; list = cnt; }
  if (!tiles(list, total)) throw new Error('neither account tiles the poem');
  return { list, chosen, agreed: chosen === 'count' ? scoreCnt : scorePos, of: chosen === 'count' ? cnt.length : counted };
}

/* ─── one matn ────────────────────────────────────────────────────────────── */

function assemble(id, spec, dir) {
  const repair = REPAIRS[id] || {};
  const { abyat: raw, heads } = poem(applySplits(bookLines(spec, dir), repair.splitLines), sepFor(spec.site), spec.site === 'ketab');
  const abyat = applyTrims(applyRenumbering(raw, repair.renumber).sort((a, b) => a.n - b.n), repair.trimEnd);

  const usable = [];
  for (const h of heads) {
    const text = h.text.trim();
    if (!text || NOISE.test(text) || /^[*.\s—-]+$/.test(text)) continue;
    if (/:\s*$/.test(west(text))) continue;   // a grouping heading over other chapters
    if (h.after >= spec.total) continue;      // a colophon
    /*
     * Everything before the first line is front matter — a title page, an
     * author's name, a preface — except its last entry, which is the opening
     * chapter's own heading. So each replaces the one before it.
     */
    if (h.after === 0 && usable.length && usable[0].after === 0) usable.shift();
    usable.push({ after: h.after, text, count: declaredCount(text) });
  }
  if (!usable.length || usable[0].after !== 0) usable.unshift({ after: 0, text: 'الْمُقَدِّمَةُ', count: null });

  const division = divide(applyHeadingOrder(usable, repair.headingOrder), spec.total);
  return { abyat, division };
}

/* ─── writing ─────────────────────────────────────────────────────────────── */

const OUT = join('sard', 'public');
const fail = (id, why) => { throw new Error(`${id}: ${why}`); };

async function main() {
  const args = process.argv.slice(2);
  const ci = args.indexOf('--cache');
  const cache = ci >= 0 ? args[ci + 1] : join('.cache', 'matn');
  if (ci >= 0) args.splice(ci, 2);
  const ids = args.length ? args : Object.keys(SOURCES);

  const { englishTitle } = await import('./matn-english.mjs');

  for (const id of ids) {
    const spec = SOURCES[id];
    if (!spec) fail(id, 'not a matn this script knows');
    const dir = await fetchPages(id, spec, cache);
    const { abyat, division } = assemble(id, spec, dir);

    if (abyat.length !== spec.total) fail(id, `${abyat.length} abyat, expected ${spec.total}`);
    abyat.forEach((b, i) => {
      if (b.n !== i + 1) fail(id, `bayt ${i + 1} is numbered ${b.n}`);
      if (!b.sadr?.trim() || !b.ajz?.trim()) fail(id, `bayt ${b.n} is missing a shaṭr`);
    });

    let expected = 1;
    const abwab = division.list.map((c, i) => {
      if (c.from !== expected) fail(id, `bāb ${i + 1} starts at ${c.from}, expected ${expected}`);
      expected = c.to + 1;
      const titleAr = cleanTitle(c.text);
      const titleEn = englishTitle(titleAr);
      if (!titleEn) fail(id, `bāb ${i + 1} «${titleAr}» has no English name`);
      return { n: i + 1, titleAr, titleEn, from: c.from, to: c.to };
    });
    if (expected !== spec.total + 1) fail(id, `abwāb cover ${expected - 1} of ${spec.total}`);

    const file = {
      id,
      editionAr: spec.editionAr,
      editionEn: spec.editionEn,
      totalAbyat: spec.total,
      abwab,
      abyat: abyat.map(b => ({
        n: b.n, sadr: b.sadr, ajz: b.ajz,
        bab: abwab.find(c => b.n >= c.from && b.n <= c.to).n,
      })),
    };
    const json = JSON.stringify(file);
    writeFileSync(join(OUT, `matn-${id}.json`), json);
    console.log(
      `matn-${id}.json  ${Math.round(json.length / 1024)} KB  ` +
      `${spec.total} abyāt · ${abwab.length} abwāb · ` +
      `chapters from the ${division.chosen}s, the two accounts agreeing on ${division.agreed}/${division.of}`,
    );
    console.log(`  registry: totalAbyat ${spec.total}, totalAbwab ${abwab.length}`);
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
