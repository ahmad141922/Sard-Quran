import { describe, it, expect } from 'vitest';
import {
  toHijri,
  isRabiAwwal,
  findHijriMonthStart,
  hijriMonthLength,
  buildHijriMonthView,
  hijriMonthName,
  formatHijri,
  moonPhaseForDay,
  MOON_PHASES,
  RABI_AWWAL,
} from '@/lib/hijri';

/** Noon-anchored so the assertions don't drift with the runner's timezone. */
const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe('toHijri', () => {
  it('maps 2026-08-14 to 1 Rabi al-Awwal 1448', () => {
    expect(toHijri(at('2026-08-14'))).toEqual({ day: 1, month: 3, year: 1448 });
  });

  it('advances the Hijri day in step with the Gregorian day', () => {
    const a = toHijri(at('2026-08-14'));
    const b = toHijri(at('2026-08-15'));
    expect(b.day).toBe(a.day + 1);
    expect(b.month).toBe(a.month);
  });
});

describe('isRabiAwwal', () => {
  it('is true inside the month and false outside it', () => {
    expect(isRabiAwwal(at('2026-08-14'))).toBe(true);
    expect(isRabiAwwal(at('2026-08-01'))).toBe(false); // Safar
    expect(isRabiAwwal(at('2026-10-01'))).toBe(false); // past Rabi al-Akhir
  });
});

describe('findHijriMonthStart', () => {
  it('walks back to day 1 when already inside the month', () => {
    const start = findHijriMonthStart(RABI_AWWAL, at('2026-08-20'));
    expect(toHijri(start)).toMatchObject({ day: 1, month: RABI_AWWAL });
  });

  it('scans forward to the next occurrence when outside the month', () => {
    const start = findHijriMonthStart(RABI_AWWAL, at('2026-06-01'));
    expect(toHijri(start)).toMatchObject({ day: 1, month: RABI_AWWAL });
    expect(start.getTime()).toBeGreaterThan(at('2026-06-01').getTime());
  });
});

describe('hijriMonthLength', () => {
  it('returns a lunar month length', () => {
    const len = hijriMonthLength(findHijriMonthStart(RABI_AWWAL, at('2026-08-14')));
    expect([29, 30]).toContain(len);
  });
});

describe('buildHijriMonthView', () => {
  const view = buildHijriMonthView(RABI_AWWAL, at('2026-08-14'));

  it('starts at day 1 and runs to the month length', () => {
    expect(view.month).toBe(RABI_AWWAL);
    expect(view.year).toBe(1448);
    expect(view.cells).toHaveLength(view.length);
    expect(view.cells[0].day).toBe(1);
    expect(view.cells[view.cells.length - 1].day).toBe(view.length);
  });

  it('reports the current day when the reference sits inside the month', () => {
    expect(view.currentDay).toBe(1);
  });

  it('reports no current day when previewing a future month', () => {
    expect(buildHijriMonthView(RABI_AWWAL, at('2026-06-01')).currentDay).toBeNull();
  });

  it('maps every cell onto consecutive Gregorian days', () => {
    for (let i = 1; i < view.cells.length; i++) {
      const prev = view.cells[i - 1].gregorian;
      const cur = view.cells[i].gregorian;
      const deltaDays = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
      expect(deltaDays).toBe(1);
    }
  });

  it('keeps each cell in Rabi al-Awwal', () => {
    for (const cell of view.cells) {
      expect(toHijri(cell.gregorian)).toMatchObject({ day: cell.day, month: RABI_AWWAL });
    }
  });

  it('aligns startWeekday with day 1', () => {
    expect(view.startWeekday).toBe(view.cells[0].gregorian.getDay());
    expect(view.startWeekday).toBe(view.start.getDay());
  });
});

describe('moonPhaseForDay', () => {
  it('opens on the new moon and peaks at the full moon mid-month', () => {
    expect(moonPhaseForDay(1, 29)).toBe('🌑');
    expect(moonPhaseForDay(15, 29)).toBe('🌕');
    expect(moonPhaseForDay(1, 30)).toBe('🌑');
    expect(moonPhaseForDay(15, 30)).toBe('🌕');
  });

  it('wanes back toward the new moon by the end of the month', () => {
    expect(moonPhaseForDay(29, 29)).toBe('🌘');
    expect(moonPhaseForDay(30, 30)).toBe('🌘');
  });

  it('progresses monotonically through the phase list', () => {
    for (const length of [29, 30]) {
      let previous = -1;
      for (let day = 1; day <= length; day++) {
        const index = MOON_PHASES.indexOf(moonPhaseForDay(day, length) as (typeof MOON_PHASES)[number]);
        expect(index).toBeGreaterThanOrEqual(previous);
        previous = index;
      }
    }
  });

  it('clamps days outside the month instead of returning undefined', () => {
    expect(MOON_PHASES).toContain(moonPhaseForDay(30, 29));
    expect(MOON_PHASES).toContain(moonPhaseForDay(0, 29));
  });
});

describe('naming and formatting', () => {
  it('localises the month name', () => {
    expect(hijriMonthName(RABI_AWWAL, 'ar')).toBe('ربيع الأول');
    expect(hijriMonthName(RABI_AWWAL, 'en')).toBe("Rabi' al-Awwal");
    expect(hijriMonthName(9, 'ar')).toBe('رمضان');
  });

  it('formats a full Hijri date', () => {
    expect(formatHijri(at('2026-08-14'), 'ar')).toBe('1 ربيع الأول 1448');
  });
});
