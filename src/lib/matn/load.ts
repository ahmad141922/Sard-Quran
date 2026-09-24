/**
 * Reading a supplied matn file, and refusing a bad one loudly.
 *
 * The text of a matn cannot be derived from anything the app already holds —
 * it is a fact about a printed book, like the page boundaries in
 * `mushaf-editions.ts`, and it arrives the same way: supplied, then checked.
 *
 * The checks below all guard one failure: a file that has quietly lost or
 * gained lines. A matn short of its own count still *looks* like a matn, and a
 * student would be followed through it to a finish that comes early. So the
 * loader treats the registry's `totalAbyat` as the supplier's checksum and
 * throws rather than returning a plausible shorter poem.
 */

import { getMatn, type MatnDefinition, type MatnId } from './registry';

/** One line: two halves and the chapter it belongs to. */
export interface Bayt {
  /** 1..totalAbyat in the declared print. */
  n: number;
  /** Fully vowelled — the ḍabṭ is a thing the tool records mistakes against. */
  sadr: string;
  ajz: string;
  /** Chapter number, 1..totalAbwab. */
  bab: number;
}

export interface MatnBab {
  n: number;
  titleAr: string;
  titleEn: string;
  /** Inclusive line range, in the declared print's numbering. */
  from: number;
  to: number;
}

/** The shape of a file under `public/matn-<id>.json`. */
export interface MatnFile {
  id: MatnId;
  /** Named print. Refused when empty — see `registry.editionAr`. */
  editionAr: string;
  editionEn: string;
  /** The supplier's own count, checked against the registry and the array. */
  totalAbyat: number;
  abwab: MatnBab[];
  abyat: Bayt[];
}

export interface Matn {
  def: MatnDefinition;
  editionId: string;
  abwab: MatnBab[];
  abyat: Bayt[];
  /** The line, or undefined past the end — callers bound their own browsing. */
  bayt(n: number): Bayt | undefined;
  /** The chapter a line sits in. */
  babOf(n: number): MatnBab | undefined;
}

export class MatnFileError extends Error {}

const fail = (id: string, why: string): never => {
  throw new MatnFileError(`matn "${id}": ${why}`);
};

/**
 * Validates a supplied file and builds the runtime matn.
 *
 * Everything here is a fail, not a repair. A file this loader had to fix is a
 * file nobody checked, and the whole point of declaring an edition is that
 * somebody did.
 */
export function matnFromFile(file: MatnFile): Matn {
  const def = getMatn(file.id);
  if (!def) return fail(String(file.id), 'not in the registry');

  if (!file.editionAr?.trim() || !file.editionEn?.trim()) {
    return fail(file.id, 'no edition named — an unnamed numbering is the ambiguity we are avoiding');
  }

  // Three counts have to agree: what the supplier declared, how many lines
  // they sent, and what the registry says the print holds. Any two agreeing
  // against the third is still a broken file.
  if (file.totalAbyat !== def.totalAbyat) {
    return fail(file.id, `declares ${file.totalAbyat} abyāt, registry says ${def.totalAbyat}`);
  }
  if (file.abyat.length !== file.totalAbyat) {
    return fail(file.id, `declares ${file.totalAbyat} abyāt but carries ${file.abyat.length}`);
  }

  file.abyat.forEach((b, i) => {
    if (b.n !== i + 1) fail(file.id, `bayt ${i + 1} is numbered ${b.n} — numbering must run 1..n in order`);
    if (!b.sadr?.trim() || !b.ajz?.trim()) fail(file.id, `bayt ${b.n} is missing a shaṭr`);
  });

  if (file.abwab.length !== def.totalAbwab) {
    return fail(file.id, `carries ${file.abwab.length} abwāb, registry says ${def.totalAbwab}`);
  }

  // The chapters must tile the poem exactly: no gap a line could fall into,
  // no overlap that would put one line in two chapters, nothing past the end.
  let expected = 1;
  for (const bab of file.abwab) {
    if (bab.from !== expected) {
      return fail(file.id, `bāb ${bab.n} starts at ${bab.from}, expected ${expected} — abwāb must tile the matn`);
    }
    if (bab.to < bab.from) return fail(file.id, `bāb ${bab.n} ends before it starts`);
    if (!bab.titleAr?.trim() || !bab.titleEn?.trim()) return fail(file.id, `bāb ${bab.n} has no title`);
    expected = bab.to + 1;
  }
  if (expected !== file.totalAbyat + 1) {
    return fail(file.id, `abwāb cover ${expected - 1} abyāt of ${file.totalAbyat}`);
  }

  for (const b of file.abyat) {
    const bab = file.abwab.find(x => b.n >= x.from && b.n <= x.to);
    if (!bab) return fail(file.id, `bayt ${b.n} falls in no bāb`);
    if (b.bab !== bab.n) {
      return fail(file.id, `bayt ${b.n} says bāb ${b.bab}, but the ranges put it in bāb ${bab.n}`);
    }
  }

  const byNumber = file.abyat;
  return {
    def,
    editionId: file.editionAr,
    abwab: file.abwab,
    abyat: byNumber,
    bayt: n => byNumber[n - 1],
    babOf: n => file.abwab.find(x => n >= x.from && n <= x.to),
  };
}

/** Where a matn's file is served from, beside the muṣḥaf data. */
export const matnFileUrl = (id: MatnId) => `matn-${id}.json`;
