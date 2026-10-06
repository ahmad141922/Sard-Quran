import { describe, it, expect } from 'vitest';

import type { Candidate } from '@/lib/asr/align';
import { evalAnchor, parseLabel, score, summarise, type Label } from '@/lib/asr/evaluate';

/**
 * The scoring behind the numbers in the challenge report. If this is wrong,
 * every figure built on it is, so each outcome is pinned by hand.
 */

const label = (over: Partial<Label> = {}): Label => ({
  file: 'x.wav', surah: 1, fromAyah: 1, toAyah: 7, errorType: 'none', errorAyah: null, errorWord: null, ...over,
});
const cand = (ayah: number, word: number | null = 0): Candidate => ({
  kind: 'substitution', anchorId: evalAnchor(1, ayah), word, atMs: 0, expected: ['a'], heard: ['b'], confidence: null,
});
const shown = (...candidates: Candidate[]) => ({ followed: true, agreement: 0.9, candidates });

describe('one recording', () => {
  it('is clean when nothing is shown on a clean recitation', () => {
    expect(score(label(), shown()).outcome).toBe('clean');
  });

  it('counts every candidate on a clean recitation as a false alarm', () => {
    const s = score(label(), shown(cand(1), cand(4)));
    expect(s.outcome).toBe('false-alarm');
    expect(s.falseAlarms).toBe(2);
  });

  it('is caught and placed at the right verse and word (1-based in the label)', () => {
    const s = score(label({ errorType: 'substitution', errorAyah: 3, errorWord: 2 }), shown(cand(3, 1)));
    expect(s.outcome).toBe('caught-placed');
    expect(s.falseAlarms).toBe(0);
  });

  it('is caught, not placed, at the right verse but the wrong word', () => {
    expect(score(label({ errorType: 'omission', errorAyah: 5, errorWord: 1 }), shown(cand(5, 3))).outcome).toBe('caught');
  });

  it('is misplaced when something was shown, but elsewhere', () => {
    const s = score(label({ errorType: 'omission', errorAyah: 5, errorWord: 1 }), shown(cand(4)));
    expect(s.outcome).toBe('misplaced');
    expect(s.falseAlarms).toBe(1);
  });

  it('is missed when nothing was shown', () => {
    expect(score(label({ errorType: 'insertion', errorAyah: 4 }), shown()).outcome).toBe('missed');
  });

  it('never scores a madd error as missed — the tool does not claim to hear it', () => {
    expect(score(label({ errorType: 'madd', errorAyah: 7 }), shown()).outcome).toBe('out-of-scope');
  });

  it('says when the recording could not be followed', () => {
    const s = score(label({ errorType: 'substitution', errorAyah: 3 }), { followed: false, agreement: 0.2, candidates: [] });
    expect(s.outcome).toBe('not-followed');
  });
});

describe('the whole set', () => {
  it('adds up recall, precision and false alarms', () => {
    const sum = summarise([
      score(label(), shown()),                                                         // clean, silent
      score(label(), shown(cand(2))),                                                  // 1 false alarm
      score(label({ errorType: 'substitution', errorAyah: 3, errorWord: 2 }), shown(cand(3, 1))), // caught
      score(label({ errorType: 'omission', errorAyah: 5, errorWord: 1 }), shown()),               // missed
      score(label({ errorType: 'madd', errorAyah: 7 }), shown()),                                 // out of scope
    ]);
    expect(sum).toMatchObject({
      recordings: 5, clean: 2, cleanSilent: 1, errors: 2, caught: 1, placed: 1, missed: 1,
      outOfScope: 1, falseAlarms: 1, recall: 0.5, precision: 0.5,
    });
  });
});

describe('the label file', () => {
  it('reads the template rows, skipping the header', () => {
    expect(parseLabel('file,surah,from_ayah,to_ayah,error_type')).toBeNull();
    expect(parseLabel('02-fatiha.m4a,1,1,7,substitution,3,2,الكريم بدل الرحيم,yes,')).toEqual({
      file: '02-fatiha.m4a', surah: 1, fromAyah: 1, toAyah: 7, errorType: 'substitution', errorAyah: 3, errorWord: 2,
    });
    expect(parseLabel('01.m4a,1,1,7,none,,,,yes,سليمة')?.errorAyah).toBeNull();
  });

  it('refuses a mistake with no verse, rather than scoring it as clean', () => {
    expect(() => parseLabel('x.m4a,1,1,7,omission,,,,,')).toThrow(/error_ayah/);
    expect(() => parseLabel('x.m4a,1,1,7,typo,3,,,,')).toThrow(/error_type/);
  });
});
