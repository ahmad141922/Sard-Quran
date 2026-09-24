import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildQuranIndex, type QuranIndex } from '@/lib/quran-index';
import type { QuranVerse } from '@/lib/quran-data';
import { SURAHS } from '@/lib/quran-data';
import {
  MIN_AYAHS_FOR_PRESSURE, activeMs, closeSegment, completeGoal, coverSpan, coveredCount,
  coveredWithin, creditToPosition, formatClock, formatDuration, formatVolumeAr,
  isKhatmah, juzStates, mergeRange, moveTo, normalizeRanges, notesPerPage, pausedMs,
  progressPct, resolveGoalEnd, restoreAfterReload, startSegment,
  surahPressure, volumeSummary, wallClockMs,
  type RecitationSession,
} from '@/lib/recitation-session';
import { testBooks, type TestBooks } from './session-helpers';

// The real mushaf JSON — every derived number in the feature comes from it, so
// the index is tested against the file the app actually ships.
let index: QuranIndex;
let books: TestBooks;

beforeAll(() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/hafs_smart_v8.json'), 'utf8');
  index = buildQuranIndex(JSON.parse(raw) as QuranVerse[]);
  books = testBooks(index);
});

describe('quran index', () => {
  it('covers the whole mushaf', () => {
    expect(index.totalAyahs).toBe(6236);
    expect(index.juzRanges).toHaveLength(30);
    expect(index.totalPages).toBe(604);
  });

  it('numbers ayahs contiguously from 1', () => {
    expect(index.verses[0].id).toBe(1);
    expect(index.verses[index.totalAyahs - 1].id).toBe(6236);
    for (let i = 0; i < index.verses.length; i++) {
      expect(index.verses[i].id).toBe(i + 1);
    }
  });

  it('matches the surah ayah counts the app ships', () => {
    for (const s of SURAHS) {
      const range = index.surahRanges[s.n - 1];
      expect(range.lastId - range.firstId + 1, `surah ${s.n}`).toBe(s.ayahs);
    }
  });

  it('round-trips (surah, ayah) through the global id', () => {
    for (const [surah, ayah] of [[1, 1], [2, 255], [4, 87], [36, 1], [114, 6]]) {
      const id = index.idOf(surah, ayah)!;
      const loc = index.locOf(id)!;
      expect([loc.surah, loc.ayah]).toEqual([surah, ayah]);
    }
  });

  it('starts juz 1 at al-Fatihah and ends juz 30 at the last ayah', () => {
    expect(index.juzRanges[0].firstId).toBe(1);
    expect(index.juzRanges[29].lastId).toBe(6236);
    expect(index.juzOf(index.idOf(2, 142)!)).toBe(2);
    expect(index.juzOf(index.idOf(78, 1)!)).toBe(30);
  });

  it('leaves no gap between consecutive juz or pages', () => {
    for (let i = 1; i < index.juzRanges.length; i++) {
      expect(index.juzRanges[i].firstId).toBe(index.juzRanges[i - 1].lastId + 1);
    }
    for (let i = 1; i < index.pageRanges.length; i++) {
      expect(index.pageRanges[i].firstId).toBe(index.pageRanges[i - 1].lastId + 1);
    }
  });

  it('returns a page worth of verses in order', () => {
    const verses = index.versesOfPage(2);
    expect(verses.length).toBeGreaterThan(0);
    expect(verses.every(v => v.page === 2)).toBe(true);
    expect([...verses].sort((a, b) => a.id - b.id)).toEqual(verses);
  });
});

describe('covered ranges', () => {
  it('joins overlapping and adjacent runs', () => {
    expect(normalizeRanges([[1, 5], [6, 10]])).toEqual([[1, 10]]);
    expect(normalizeRanges([[1, 5], [4, 9]])).toEqual([[1, 9]]);
    expect(normalizeRanges([[10, 12], [1, 3]])).toEqual([[1, 3], [10, 12]]);
  });

  it('leaves a real gap alone', () => {
    expect(normalizeRanges([[1, 5], [8, 10]])).toEqual([[1, 5], [8, 10]]);
  });

  it('treats re-reciting a passage as a no-op', () => {
    const once = mergeRange([], 10, 20);
    const twice = mergeRange(once, 12, 18);
    expect(coveredCount(twice)).toBe(11);
    expect(twice).toEqual([[10, 20]]);
  });

  it('counts only the part inside a window', () => {
    expect(coveredWithin([[1, 10], [21, 30]], 5, 25)).toBe(11);
  });
});

describe('progress', () => {
  const session = (over: Partial<RecitationSession> = {}): RecitationSession => ({
    id: 's', studentName: 'محمد',
    goal: { kind: 'juz1', start: books.at(1), end: books.at(100) },
    current: books.at(1), sessionSurah: 1, covered: [], segments: [], notes: [],
    startedAt: 0, endedAt: null, lastSeenAt: 0, status: 'active', mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', mushaf: 'madinah', modelVersion: 2,
    ...over,
  });

  it('is a plain fraction of the goal', () => {
    expect(progressPct(session({ covered: [[1, 25]] }))).toBe(25);
  });

  it('adds up out-of-order recitation without double counting', () => {
    // Read 51-75 first, then 1-25, then re-read 60-70.
    let s = session();
    s = coverSpan(s, 51, 75);
    s = coverSpan(s, 1, 25);
    s = coverSpan(s, 60, 70);
    expect(progressPct(s)).toBe(50);
  });

  it('ignores coverage outside the goal window', () => {
    expect(progressPct(session({ covered: [[1, 50], [500, 600]] }))).toBe(50);
  });

  it('never exceeds 100', () => {
    expect(progressPct(session({ covered: [[1, 500]] }))).toBe(100);
  });
});

describe('position is separate from progress', () => {
  const base = (): RecitationSession => ({
    id: 's', studentName: 'x',
    goal: { kind: 'juz1', start: books.at(1), end: books.at(148) },
    current: books.at(10), sessionSurah: 1, covered: [], segments: [], notes: [],
    startedAt: 0, endedAt: null, lastSeenAt: 0, status: 'active', mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', mushaf: 'madinah', modelVersion: 2,
  });

  it('moving the marker forward credits nothing on its own', () => {
    const next = moveTo(base(), books.at(25));
    expect(next.current.anchor.id).toBe(25);
    expect(next.covered).toEqual([]);
  });

  it('moving backwards credits nothing either', () => {
    expect(moveTo(base(), books.at(3)).covered).toEqual([]);
  });

  it('only an explicit span counts as recited', () => {
    const next = coverSpan(moveTo(base(), books.at(25)), 10, 25);
    expect(coveredCount(next.covered)).toBe(16);
  });
});

describe('crediting where the student actually stopped', () => {
  it('credits the unconfirmed tail of the surah being recited', () => {
    const nisa = index.surahRanges[3];
    let s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    // Al-Baqarah and Al-Imran confirmed; stopped part-way into An-Nisa'.
    s = coverSpan(s, 1, nisa.firstId - 1);
    s = moveTo(s, books.at(nisa.firstId + 86));
    const credited = creditToPosition(s, index);
    expect(coveredWithin(credited.covered, nisa.firstId, nisa.firstId + 86)).toBe(87);
  });

  it('does not reach back past an earlier surah', () => {
    const nisa = index.surahRanges[3];
    let s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    s = moveTo(s, books.at(nisa.firstId + 10));
    const credited = creditToPosition(s, index);
    // Only An-Nisa' 1-11 — nothing from the three surahs before it.
    expect(coveredCount(credited.covered)).toBe(11);
    expect(credited.covered[0][0]).toBe(nisa.firstId);
  });

  it('does nothing when the position is already confirmed', () => {
    let s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    s = coverSpan(s, 1, 100);
    s = moveTo(s, books.at(50));
    expect(creditToPosition(s, index).covered).toEqual(s.covered);
  });

  it('never credits ayahs before the majlis began', () => {
    const nisa = index.surahRanges[3];
    const start = nisa.firstId + 50;
    let s = books.session({ studentName: 'x', goalKind: 'juz5', startAyahId: start, now: 0 });
    s = moveTo(s, books.at(start + 20));
    const credited = creditToPosition(s, index);
    expect(credited.covered).toEqual([[start, start + 20]]);
  });
});

describe('time', () => {
  const s = (segments: RecitationSession['segments']): RecitationSession => ({
    id: 's', studentName: 'x',
    goal: { kind: 'juz1', start: books.at(1), end: books.at(10) },
    current: books.at(1), sessionSurah: 1, covered: [], segments, notes: [],
    startedAt: 0, endedAt: null, lastSeenAt: 0, status: 'active', mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', mushaf: 'madinah', modelVersion: 2,
  });

  it('sums closed segments and excludes the break between them', () => {
    expect(activeMs(s([{ from: 0, to: 1000 }, { from: 5000, to: 6000 }]), 9000)).toBe(2000);
  });

  it('counts the open segment up to now', () => {
    expect(activeMs(s([{ from: 0, to: 1000 }, { from: 5000, to: null }]), 8000)).toBe(4000);
  });

  it('wall clock includes the breaks that active time drops', () => {
    const session = s([{ from: 0, to: 1000 }, { from: 5000, to: 6000 }]);
    expect(wallClockMs(session, 6000)).toBe(6000);
    expect(activeMs(session, 6000)).toBe(2000);
  });

  it('pausing then resuming opens exactly one new segment', () => {
    let session = s([{ from: 0, to: null }]);
    session = { ...session, segments: closeSegment(session, 1000) };
    session = { ...session, segments: startSegment(session, 3000) };
    expect(session.segments).toEqual([{ from: 0, to: 1000 }, { from: 3000, to: null }]);
    expect(activeMs(session, 4000)).toBe(2000);
  });

  it('closing an already-closed segment does nothing', () => {
    const session = s([{ from: 0, to: 1000 }]);
    expect(closeSegment(session, 9000)).toEqual(session.segments);
  });
});

describe('restoring after a reload', () => {
  const crashed = (): RecitationSession => ({
    id: 's', studentName: 'خالد',
    goal: { kind: 'juz1', start: books.at(1), end: books.at(148) },
    current: books.at(32), sessionSurah: 1, covered: [[1, 32]],
    // Was listening from t=0, last written at t=5000, then the app died.
    segments: [{ from: 0, to: null }], notes: [],
    startedAt: 0, endedAt: null, lastSeenAt: 5000, status: 'active', mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', mushaf: 'madinah', modelVersion: 2,
  });

  it('does not bill the student for the hours the app was gone', () => {
    const restored = restoreAfterReload(crashed(), 9_000_000);
    expect(restored.segments).toEqual([{ from: 0, to: 5000 }]);
    expect(activeMs(restored, 9_000_000)).toBe(5000);
  });

  it('comes back paused, with position and notes intact', () => {
    const restored = restoreAfterReload(crashed(), 9_000_000);
    expect(restored.status).toBe('paused');
    expect(restored.current.anchor.id).toBe(32);
    expect(restored.covered).toEqual([[1, 32]]);
  });

  it('is idempotent, so a second reload leaks nothing', () => {
    const once = restoreAfterReload(crashed(), 9_000_000);
    const twice = restoreAfterReload(once, 20_000_000);
    expect(twice.segments).toEqual(once.segments);
    expect(activeMs(twice, 20_000_000)).toBe(5000);
  });
});

describe('completing the goal', () => {
  it('credits everything from the start of the majlis to the end of its goal', () => {
    const s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    const done = completeGoal(s);
    expect(coveredCount(done.covered)).toBe(index.totalAyahs);
    expect(isKhatmah(done, index)).toBe(true);
  });

  it('a partial goal is completed without claiming a khatmah', () => {
    const s = books.session({ studentName: 'x', goalKind: 'juz1', startAyahId: 1, now: 0 });
    const done = completeGoal(s);
    expect(progressPct(done)).toBe(100);
    expect(isKhatmah(done, index)).toBe(false);
  });

  it('a majlis that began mid-Quran is no khatmah even when its goal is met', () => {
    const start = index.idOf(114, 1)!;
    const s = books.session({ studentName: 'x', goalKind: 'juz1', startAyahId: start, now: 0 });
    const done = completeGoal(s);
    expect(progressPct(done)).toBe(100);
    expect(isKhatmah(done, index)).toBe(false);
  });
});

describe('paused time', () => {
  const s = (segments: RecitationSession['segments'], endedAt: number | null): RecitationSession => ({
    id: 's', studentName: 'x',
    goal: { kind: 'juz1', start: books.at(1), end: books.at(10) },
    current: books.at(1), sessionSurah: 1, covered: [], segments, notes: [],
    startedAt: 0, endedAt, lastSeenAt: 0, status: 'ended', mushafId: 'hafs-kfqc', riwayaId: 'hafs', ayahCounting: 'kufi', mushaf: 'madinah', modelVersion: 2,
  });

  it('is the span the majlis was open minus the time spent listening', () => {
    // Open for 10 minutes, listening for 4 of them.
    const session = s([{ from: 0, to: 120_000 }, { from: 480_000, to: 600_000 }], 600_000);
    expect(activeMs(session, 600_000)).toBe(240_000);
    expect(pausedMs(session, 600_000)).toBe(360_000);
  });

  it('is zero when the clock never stopped', () => {
    expect(pausedMs(s([{ from: 0, to: 600_000 }], 600_000), 600_000)).toBe(0);
  });

  /** The case that made the report confusing: paused after a reload. */
  it('accounts for a session left paused for most of its span', () => {
    const session = s([{ from: 0, to: 30_000 }], 660_000);
    expect(formatDuration(activeMs(session, 660_000), 'ar')).toBe('أقل من دقيقة');
    expect(formatDuration(pausedMs(session, 660_000), 'ar')).toBe('10 دقائق');
  });
});

describe('goal resolution', () => {
  it('one juz from al-Fatihah ends the first juz', () => {
    expect(resolveGoalEnd(1, 'juz1', index)).toBe(index.juzRanges[0].lastId);
  });

  it('five juz from the middle of juz 3 ends at juz 7', () => {
    const start = index.juzRanges[2].firstId + 5;
    expect(resolveGoalEnd(start, 'juz5', index)).toBe(index.juzRanges[6].lastId);
  });

  it('clamps at juz 30 rather than running off the end', () => {
    expect(resolveGoalEnd(index.juzRanges[28].firstId, 'juz15', index)).toBe(6236);
  });

  it('the whole Quran is the whole Quran', () => {
    expect(resolveGoalEnd(1, 'full', index)).toBe(6236);
  });
});

describe('juz strip', () => {
  it('marks out-of-goal juz distinctly from unread ones', () => {
    const s = books.session({ studentName: 'x', goalKind: 'juz1', startAyahId: 1, now: 0 });
    const states = juzStates(s, index);
    expect(states[0]).toBe('active');
    expect(states.slice(1).every(st => st === 'out')).toBe(true);
  });

  it('flips a juz to done only when it is fully covered', () => {
    let s = books.session({ studentName: 'x', goalKind: 'juz5', startAyahId: 1, now: 0 });
    const juz1 = index.juzRanges[0];
    s = coverSpan(s, juz1.firstId, juz1.lastId - 1);
    expect(juzStates(s, index)[0]).not.toBe('done');
    s = coverSpan(s, juz1.firstId, juz1.lastId);
    expect(juzStates(s, index)[0]).toBe('done');
  });

  it('a goal starting mid-juz still completes that juz on its own tail', () => {
    const start = index.juzRanges[1].firstId + 10;
    let s = books.session({ studentName: 'x', goalKind: 'juz1', startAyahId: start, now: 0 });
    s = coverSpan(s, start, index.juzRanges[1].lastId);
    expect(juzStates(s, index)[1]).toBe('done');
  });
});

describe('volume summary', () => {
  it('reports complete juz first and only the leftover pages', () => {
    let s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    const juz1 = index.juzRanges[0];
    const nextPage = index.pageRanges[index.pageOf(juz1.lastId)];
    s = coverSpan(s, juz1.firstId, juz1.lastId);
    s = coverSpan(s, nextPage.firstId, nextPage.lastId);
    const v = volumeSummary(s, index);
    expect(v.fullJuz).toBe(1);
    expect(v.extraPages).toBe(1);
    expect(v.ayahs).toBe(coveredCount(s.covered));
  });

  it('does not round a partial juz up to a whole one', () => {
    let s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    const juz1 = index.juzRanges[0];
    s = coverSpan(s, juz1.firstId, juz1.lastId - 1);
    expect(volumeSummary(s, index).fullJuz).toBe(0);
  });
});

describe('surah pressure', () => {
  function withNotes(spec: { surah: number; ayah: number; kind: 'hesitation' | 'memory' | 'tajweed' }[], covered: [number, number][]) {
    const s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    return {
      ...s,
      covered,
      notes: spec.map(n => books.note(n.kind, index.idOf(n.surah, n.ayah)!, 0)),
    };
  }

  it('ranks by density, not by raw count', () => {
    const baqara = index.surahRanges[1];
    const nisa = index.surahRanges[3];
    const s = withNotes(
      [
        // Six slips spread over 200 recited ayahs of al-Baqarah…
        ...[10, 20, 30, 40, 50, 60].map(a => ({ surah: 2, ayah: a, kind: 'hesitation' as const })),
        // …against four over 20 recited ayahs of an-Nisa'.
        ...[1, 2, 3, 4].map(a => ({ surah: 4, ayah: a, kind: 'memory' as const })),
      ],
      [
        [baqara.firstId, baqara.firstId + 199],
        [nisa.firstId, nisa.firstId + 19],
      ],
    );
    const { items, lowConfidence } = surahPressure(s, index);
    expect(lowConfidence).toBe(false);
    expect(items[0].surah).toBe(4);
  });

  it('will not rank a surah with too little recited, but says so', () => {
    const ikhlas = index.surahRanges[111];
    const s = withNotes(
      [{ surah: 112, ayah: 2, kind: 'memory' }],
      [[ikhlas.firstId, ikhlas.lastId]],
    );
    const { items, lowConfidence } = surahPressure(s, index);
    expect(index.surahRanges[111].lastId - index.surahRanges[111].firstId + 1)
      .toBeLessThan(MIN_AYAHS_FOR_PRESSURE);
    expect(lowConfidence).toBe(true);
    expect(items).toHaveLength(1);
  });

  it('counts notes per recited page', () => {
    const page = index.pageRanges[4];
    const s = books.session({ studentName: 'x', goalKind: 'full', startAyahId: 1, now: 0 });
    const withCoverage = {
      ...coverSpan(s, page.firstId, page.lastId),
      notes: [books.note('memory', page.firstId, 0), books.note('tajweed', page.firstId + 1, 0)],
    };
    expect(notesPerPage(withCoverage, index)).toBe(2);
  });
});

describe('formatting', () => {
  const H = 3600_000;
  const M = 60_000;

  it('renders the compact clock', () => {
    expect(formatClock(2 * H + 47 * M)).toBe('2:47:00');
    expect(formatClock(5 * M)).toBe('0:05:00');
    // Seconds, which is what a reciter watching the clock mid-verse can see move.
    expect(formatClock(5 * M + 9_000)).toBe('0:05:09');
    expect(formatClock(59_999)).toBe('0:00:59');
    // The hour stays even at zero, so the figure never changes width as it ticks.
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock(-5)).toBe('0:00:00');
  });

  it('inflects Arabic hours and minutes', () => {
    expect(formatDuration(H + 5 * M, 'ar')).toBe('ساعة و5 دقائق');
    expect(formatDuration(2 * H + 34 * M, 'ar')).toBe('ساعتان و34 دقيقة');
    expect(formatDuration(3 * H, 'ar')).toBe('3 ساعات');
    expect(formatDuration(2 * M, 'ar')).toBe('دقيقتان');
    expect(formatDuration(0, 'ar')).toBe('أقل من دقيقة');
  });

  it('keeps the Latin form short', () => {
    expect(formatDuration(2 * H + 34 * M, 'en')).toBe('2h 34m');
    expect(formatDuration(0, 'en')).toBe('<1m');
  });

  it('inflects the Arabic volume line', () => {
    expect(formatVolumeAr({ ayahs: 100, fullJuz: 1, extraPages: 0, pages: 20 })).toBe('جزء · 100 آية');
    expect(formatVolumeAr({ ayahs: 3, fullJuz: 0, extraPages: 0, pages: 2 })).toBe('صفحتان · 3 آيات');
    expect(formatVolumeAr({ ayahs: 900, fullJuz: 5, extraPages: 3, pages: 103 })).toBe('5 أجزاء و3 صفحات · 900 آية');
  });
});
