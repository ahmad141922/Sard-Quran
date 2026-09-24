import { describe, it, expect } from 'vitest';

import {
  MATN_IDS, MATN_REGISTRY, getMatn, isMatnReady, matnAuthor, matnEdition, matnName,
} from '@/lib/matn/registry';
import { MatnFileError, matnFromFile, type MatnFile } from '@/lib/matn/load';
import { matnOrdinal, matnPosition, sameMatnPlace } from '@/lib/matn/position';
import {
  atEndOfBab, babGoal, completeBab, coverAbyat, createMatnSession, fullMatnGoal, isMatnSession,
  matnProgressPct, matnVolume, moveToBayt,
} from '@/lib/matn/session';
import { activeMs, canIssueCertificate, sessionMode } from '@/lib/recitation-session';

/**
 * The loader's job is to refuse, so every refusal is worth a test.
 *
 * A matn short of its own count still looks like a matn: the reader would run
 * through it and the finish would come early, at a line that is not the last
 * one. Nothing downstream can notice that, which is why it has to be caught
 * on the way in.
 */

/** A small well-formed file, standing in for a supplied one. */
function fixture(over: Partial<MatnFile> = {}): MatnFile {
  const abyat = Array.from({ length: 4 }, (_, i) => ({
    n: i + 1,
    sadr: `صدر ${i + 1}`,
    ajz: `عجز ${i + 1}`,
    bab: i < 2 ? 1 : 2,
  }));
  return {
    id: 'tuhfa',
    editionAr: 'طبعة الاختبار',
    editionEn: 'Test print',
    totalAbyat: 4,
    abwab: [
      { n: 1, titleAr: 'المقدمة', titleEn: 'Introduction', from: 1, to: 2 },
      { n: 2, titleAr: 'الخاتمة', titleEn: 'Conclusion', from: 3, to: 4 },
    ],
    abyat,
    ...over,
  };
}

/** The fixture is 4 lines and 2 chapters; the registry says otherwise. */
const loose = (file: MatnFile) => {
  const def = MATN_REGISTRY[file.id];
  const saved = { abyat: def.totalAbyat, abwab: def.totalAbwab };
  def.totalAbyat = file.totalAbyat;
  def.totalAbwab = file.abwab.length;
  try { return matnFromFile(file); } finally {
    def.totalAbyat = saved.abyat;
    def.totalAbwab = saved.abwab;
  }
};

const rejects = (over: Partial<MatnFile>, why: RegExp) => {
  expect(() => loose(fixture(over))).toThrow(MatnFileError);
  expect(() => loose(fixture(over))).toThrow(why);
};

describe('the matn registry', () => {
  /**
   * The order is the order they are offered in, and it is deliberate: the two
   * tajwīd matns a student meets first, then the two fuller ones, then the
   * three on the qirāʾāt, which are an order of magnitude longer and are what
   * somebody moves on to rather than starts with.
   */
  it('holds the seven, easiest first', () => {
    expect(MATN_IDS).toEqual([
      'tuhfa', 'jazariyya', 'salsabil', 'laali', 'durra', 'shatibiyya', 'tayyiba',
    ]);
  });

  /**
   * Both figures were assumptions once and both were corrected by the texts
   * themselves — Tuhfa's abwab from eight to ten, and the Jazariyya from 107
   * abyat in 12 abwab to 109 in 19. Keeping them here is what made the
   * disagreement visible instead of silent.
   */
  it('carries the adopted counts', () => {
    expect(MATN_REGISTRY.tuhfa.totalAbyat).toBe(61);
    expect(MATN_REGISTRY.tuhfa.totalAbwab).toBe(10);
    expect(MATN_REGISTRY.jazariyya.totalAbyat).toBe(109);
    expect(MATN_REGISTRY.jazariyya.totalAbwab).toBe(19);
  });

  /**
   * The Jazariyya counts its own abyat in bayt 107 — «أَبْيَاتُهَا قَافٌ
   * وَزَاىٌ فِي الْعَدَدْ», qāf (100) and zāy (7). The supplied print carries
   * two closing lines beyond that count, so the file has 109 and the author
   * said 107. Neither is wrong; it is a fact about the print, which is exactly
   * what a named edition is for.
   */
  it('adopts the print’s count, which is two past the author’s own', () => {
    expect(MATN_REGISTRY.jazariyya.totalAbyat).toBe(109);
    expect(MATN_REGISTRY.jazariyya.totalAbyat - 2).toBe(107);
  });

  it('names each matn and its author in both languages', () => {
    expect(matnName('jazariyya', 'ar')).toBe('المقدّمة الجزريّة');
    expect(matnName('jazariyya', 'en')).toBe('Al-Muqaddima al-Jazariyya');
    expect(matnAuthor('tuhfa', 'ar')).toBe('سليمان الجمزوري');
  });

  it('reads an unknown id as absent rather than throwing', () => {
    expect(getMatn('burda')).toBeUndefined();
  });

  /**
   * Every matn names where its numbering comes from, so every one is offered.
   *
   * What is named differs, and the difference is the point. The two tajwīd
   * matns and the two modern ones name a **website**, which is enough for what
   * this gate is for — a reciter reading «bayt 55» in a report can go and see
   * which bayt 55 is meant — and no more than that.
   *
   * The three qirāʾāt matns name a **printed edition**, with an editor and a
   * printing. That is the stronger thing, because it is what somebody would
   * have to hold to check the text, and because such a print states its own
   * chapter divisions and their lengths — two accounts of the structure that
   * can be held against each other. Neither kind is a claim that a shaykh has
   * read the text.
   */
  it('reports every matn as ready, each naming where its numbering came from', () => {
    for (const id of MATN_IDS) {
      expect(isMatnReady(id)).toBe(true);
      expect(matnEdition(id, 'ar')!.trim()).not.toBe('');
      expect(matnEdition(id, 'en')!.trim()).not.toBe('');
    }
  });

  it('names a website for the four whose text has only a website', () => {
    for (const id of ['tuhfa', 'jazariyya'] as const) {
      expect(matnEdition(id, 'en')).toContain('surahquran.com');
    }
    for (const id of ['salsabil', 'laali'] as const) {
      expect(matnEdition(id, 'en')).toContain('ketabonline.com');
    }
  });

  /** The three qirāʾāt matns were transcribed from one editor's printings. */
  it('names an editor and a printing for the three qirāʾāt matns', () => {
    for (const id of ['durra', 'shatibiyya', 'tayyiba'] as const) {
      expect(matnEdition(id, 'ar')).toContain('محمد تميم الزعبي');
      expect(matnEdition(id, 'en')).toMatch(/az-Za.b/);
      expect(matnEdition(id, 'en')).toMatch(/\d{4} AH/);
    }
  });

  /**
   * And the gate is still a gate: it is the naming that opens it, not the
   * presence of a file. A matn whose source is blank stays off the screen.
   */
  it('would refuse a matn again the moment its edition were blanked', () => {
    const blanked = { ...MATN_REGISTRY.tuhfa, editionAr: '', editionEn: '' };
    expect(!!blanked.editionAr && !!blanked.editionEn).toBe(false);
  });
});

describe('loading a supplied file', () => {
  it('accepts a well-formed one and indexes it', () => {
    const matn = loose(fixture());
    expect(matn.abyat).toHaveLength(4);
    expect(matn.bayt(3)?.sadr).toBe('صدر 3');
    expect(matn.babOf(3)?.titleAr).toBe('الخاتمة');
    expect(matn.bayt(99)).toBeUndefined();
  });

  it('refuses a file that names no edition', () => {
    rejects({ editionAr: '  ' }, /no edition named/);
  });

  it('refuses when the declared count and the lines sent disagree', () => {
    rejects({ totalAbyat: 5 }, /carries 4/);
  });

  it('refuses numbering that is out of order or gapped', () => {
    const abyat = fixture().abyat.map(b => (b.n === 3 ? { ...b, n: 9 } : b));
    rejects({ abyat }, /numbering must run/);
  });

  it('refuses a line missing half of itself', () => {
    const abyat = fixture().abyat.map(b => (b.n === 2 ? { ...b, ajz: '' } : b));
    rejects({ abyat }, /missing a sha/);
  });

  it('refuses abwāb that leave a gap', () => {
    rejects({
      abwab: [
        { n: 1, titleAr: 'أ', titleEn: 'A', from: 1, to: 1 },
        { n: 2, titleAr: 'ب', titleEn: 'B', from: 3, to: 4 },
      ],
    }, /must tile the matn/);
  });

  it('refuses abwāb that stop short of the end', () => {
    rejects({
      abwab: [
        { n: 1, titleAr: 'أ', titleEn: 'A', from: 1, to: 2 },
        { n: 2, titleAr: 'ب', titleEn: 'B', from: 3, to: 3 },
      ],
    }, /cover 3 abyāt of 4/);
  });

  it('refuses a line whose bāb disagrees with the ranges', () => {
    const abyat = fixture().abyat.map(b => (b.n === 4 ? { ...b, bab: 1 } : b));
    rejects({ abyat }, /the ranges put it in bāb 2/);
  });

  it('refuses an untitled bāb', () => {
    rejects({
      abwab: [
        { n: 1, titleAr: '', titleEn: 'A', from: 1, to: 2 },
        { n: 2, titleAr: 'ب', titleEn: 'B', from: 3, to: 4 },
      ],
    }, /has no title/);
  });

  /** The registry is the third opinion, and it has to be able to win. */
  it('refuses a file that disagrees with the registry count', () => {
    expect(() => matnFromFile(fixture())).toThrow(/registry says 61/);
  });
});

describe('a position in a matn', () => {
  it('carries the print, because the print owns the number', () => {
    const p = matnPosition('tuhfa', 'طبعة الاختبار', 12, 'ajz');
    expect(p.editionId).toBe('طبعة الاختبار');
    expect(p.origin).toBe('read');
  });

  it('tells the two halves of one line apart', () => {
    const sadr = matnPosition('tuhfa', 'e', 12, 'sadr');
    const ajz = matnPosition('tuhfa', 'e', 12, 'ajz');
    expect(sameMatnPlace(sadr, ajz)).toBe(false);
    expect(matnOrdinal(ajz)).toBeGreaterThan(matnOrdinal(sadr));
  });

  it('orders the ʿajz of one line before the ṣadr of the next', () => {
    expect(matnOrdinal(matnPosition('tuhfa', 'e', 12, 'ajz')))
      .toBeLessThan(matnOrdinal(matnPosition('tuhfa', 'e', 13, 'sadr')));
  });

  it('does not call the same line in two prints the same place', () => {
    expect(sameMatnPlace(
      matnPosition('tuhfa', 'print-a', 12, 'sadr'),
      matnPosition('tuhfa', 'print-b', 12, 'sadr'),
    )).toBe(false);
  });
});

describe('a matn session', () => {
  const build = (over: Partial<Parameters<typeof createMatnSession>[0]> = {}) => {
    const matn = loose(fixture());
    return createMatnSession({
      studentName: 'محمّد', matn, goal: fullMatnGoal(matn), now: 1_000, ...over,
    });
  };

  it('is told apart by its kind, not by a version number', () => {
    const s = build();
    expect(isMatnSession(s)).toBe(true);
    expect(isMatnSession({ textKind: undefined })).toBe(false);
    expect(s.modelVersion).toBe(1);
  });

  it('denormalises the print and the count, so a report survives a data swap', () => {
    const s = build();
    expect(s.editionId).toBe('طبعة الاختبار');
    expect(s.totalAbyat).toBe(4);
  });

  it('starts the marker at the goal, on the ṣadr', () => {
    const matn = loose(fixture());
    const s = createMatnSession({
      studentName: 'x', matn, goal: babGoal(matn.abwab[1]), now: 1_000,
    });
    expect(s.current.bayt).toBe(3);
    expect(s.current.shatr).toBe('sadr');
  });

  /** Same rule as the muṣḥaf: browsing is free, progress is claimed. */
  it('moves the marker without crediting anything', () => {
    const moved = moveToBayt(build(), 4, 'ajz');
    expect(moved.current.bayt).toBe(4);
    expect(moved.covered).toEqual([]);
    expect(matnProgressPct(moved)).toBe(0);
  });

  it('credits a stretch, and counts a line once however often it is passed', () => {
    const s = coverAbyat(coverAbyat(build(), 1, 2), 2, 3);
    expect(matnVolume(s).abyat).toBe(3);
    expect(matnVolume(s).percent).toBe(75);
  });

  it('counts a bāb done only when every line of it was recited', () => {
    const matn = loose(fixture());
    const partly = coverAbyat(build(), 3, 3);
    expect(matnVolume(partly, matn.abwab).abwabDone).toBe(0);

    const whole = completeBab(build(), matn.abwab[1]);
    expect(matnVolume(whole, matn.abwab).abwabDone).toBe(1);
  });

  it('measures progress against the goal, not against the whole matn', () => {
    const matn = loose(fixture());
    const s = createMatnSession({ studentName: 'x', matn, goal: babGoal(matn.abwab[0]), now: 1_000 });
    expect(matnProgressPct(coverAbyat(s, 1, 1))).toBe(50);
    expect(matnProgressPct(coverAbyat(s, 1, 2))).toBe(100);
  });

  it('shows the finish button only at the last line of the bāb', () => {
    const matn = loose(fixture());
    const s = build();
    expect(atEndOfBab(moveToBayt(s, 1), matn.abwab[0])).toBe(false);
    expect(atEndOfBab(moveToBayt(s, 2), matn.abwab[0])).toBe(true);
    expect(atEndOfBab(moveToBayt(s, 2), undefined)).toBe(false);
  });

  /** The shell is shared, so the shared selectors must work unchanged. */
  it('keeps time with the same arithmetic a majlis uses', () => {
    expect(activeMs(build(), 4_000)).toBe(3_000);
  });

  it('takes the same modes, and refuses a certificate when alone', () => {
    expect(sessionMode(build())).toBe('majlis');
    expect(canIssueCertificate(build())).toBe(true);
    expect(canIssueCertificate(build({ mode: 'solo' }))).toBe(false);
  });
});
