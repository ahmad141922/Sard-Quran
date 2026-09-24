import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider, useI18n, type Lang, type TranslationKey } from '@/hooks/useI18n';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';
import RecitationSetupModal from '@/components/board/RecitationSetupModal';
import MatnSetupModal from '@/components/board/MatnSetupModal';
import DueToday from '@/components/board/DueToday';
import MushafHeatMap from '@/components/board/MushafHeatMap';
import type { PageState } from '@/lib/recitation-memory';
import { matnFromFile, type Matn, type MatnFile } from '@/lib/matn/load';
import { MATN_REGISTRY } from '@/lib/matn/registry';
import { BACK_ORDER, layerToClose } from '../../sard/src/back-stack';

/**
 * The screens as somebody actually meets them: what back does, why a start
 * button will not start, and whether the one thing on offer has to be chosen.
 *
 * Nothing here spells an Arabic string out. Every expected word is asked of the
 * same table the screen asked — a test that hand-types «إغلاق» passes when the
 * table says something else, which is the one thing it exists to catch.
 */

afterEach(cleanup);

/** What the table says, in the language the screen under test is drawn in. */
function say(key: TranslationKey, lang: Lang = 'ar'): string {
  const Probe: React.FC = () => <span data-probe>{useI18n().t(key)}</span>;
  const view = render(<I18nProvider forceLang={lang}><Probe /></I18nProvider>);
  const text = view.container.querySelector('[data-probe]')!.textContent ?? '';
  view.unmount();
  return text;
}

describe('the hardware back button', () => {
  /**
   * The regression this list exists for. Each of these was open on screen and
   * absent from the handler, so Android's back put the whole app in the
   * background instead of closing the panel in front of the reciter.
   */
  it('closes the panels that used to fall through to minimising the app', () => {
    for (const layer of ['progress', 'matnSetup', 'matnReport'] as const) {
      expect(layerToClose({ [layer]: true }), layer).toBe(layer);
    }
  });

  it('closes the topmost layer when several are open', () => {
    // A report opened over a setup form: the report is what a press means.
    expect(layerToClose({ setup: true, report: true })).toBe('report');
    // …and the session underneath everything is always the last resort.
    expect(layerToClose({ session: true, progress: true })).toBe('progress');
    expect(layerToClose({ session: true })).toBe('session');
  });

  it('hands the press on when there is nothing open', () => {
    expect(layerToClose({})).toBeNull();
    expect(layerToClose(Object.fromEntries(BACK_ORDER.map(l => [l, false])))).toBeNull();
  });

  /**
   * A matn session is deliberately not a layer: it has no card on the home
   * screen to come back through, so closing it would strand a session that
   * cannot be reopened.
   */
  it('leaves a matn session to the shell', () => {
    expect(BACK_ORDER).not.toContain('matnSession');
  });
});

describe('a start button that will not start says why', () => {
  const drawMajlis = () => render(
    <I18nProvider forceLang="ar">
      <MushafProvider>
        <RecitationSetupModal open onClose={() => {}} onStart={() => {}} />
      </MushafProvider>
    </I18nProvider>,
  );

  it('names the reciter’s name while it is empty', () => {
    const { container } = drawMajlis();
    const line = container.querySelector('[data-start-missing]');
    expect(line).toBeTruthy();
    expect(line!.textContent).toContain(say('recReciterName'));
  });

  it('stops saying it once that field is filled', () => {
    const { container } = drawMajlis();
    // Reciting alone is the one mode whose only requirement is the name, so it
    // is the mode that can be satisfied without a plausible phone number.
    fireEvent.click(container.querySelector('[data-mode="solo"]')!);
    expect(container.querySelector('[data-start-missing]')!.textContent)
      .toContain(say('recReciterName'));

    fireEvent.change(container.querySelector('#rec-student')!, { target: { value: 'x' } });
    expect(container.querySelector('[data-start-missing]')).toBeNull();
  });

  it('names the listener too, and only while somebody is listening', () => {
    const { container } = drawMajlis();
    expect(container.querySelector('[data-start-missing]')!.textContent)
      .toContain(say('recListenerName'));
    fireEvent.click(container.querySelector('[data-mode="solo"]')!);
    expect(container.querySelector('[data-start-missing]')!.textContent)
      .not.toContain(say('recListenerName'));
  });
});

describe('the matn setup screen', () => {
  function fixtureFile(): MatnFile {
    return {
      id: 'tuhfa',
      editionAr: 'A', editionEn: 'A',
      totalAbyat: 4,
      abwab: [
        { n: 1, titleAr: 'A', titleEn: 'First', from: 1, to: 2 },
        { n: 2, titleAr: 'B', titleEn: 'Second', from: 3, to: 4 },
      ],
      abyat: Array.from({ length: 4 }, (_, i) => ({
        n: i + 1, sadr: `s${i + 1}`, ajz: `a${i + 1}`, bab: i < 2 ? 1 : 2,
      })),
    };
  }

  /** The registry ships real counts; the fixture is four lines long. */
  function withRelaxedRegistry<T>(run: (matn: Matn) => T): T {
    const f = fixtureFile();
    const def = MATN_REGISTRY[f.id];
    const saved = { ...def };
    def.totalAbyat = f.totalAbyat;
    def.totalAbwab = f.abwab.length;
    def.editionAr = f.editionAr;
    def.editionEn = f.editionEn;
    try { return run(matnFromFile(f)); } finally { Object.assign(def, saved); }
  }

  const draw = (matn: Matn) => render(
    <I18nProvider forceLang="ar">
      <MatnSetupModal open available={[{ id: 'tuhfa', matn }]} onClose={() => {}} onStart={vi.fn()} />
    </I18nProvider>,
  );

  it('has already chosen the only matn on offer', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      expect(container.querySelector('[data-matn="tuhfa"]')!.getAttribute('aria-pressed')).toBe('true');
      // …so the chapters are offered without a tap that decides nothing.
      expect(container.querySelector('[data-bab]')).toBeTruthy();
    });
  });

  it('says the reciter is what is still missing', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      const line = container.querySelector('[data-start-missing]');
      expect(line).toBeTruthy();
      expect(line!.textContent).toContain(say('recStudent'));
      // The matn is not among them — it was chosen for us.
      expect(line!.textContent).not.toContain(say('recMatn'));

      fireEvent.change(container.querySelector('[data-student]')!, { target: { value: 'x' } });
      fireEvent.change(container.querySelector('[data-instructor]')!, { target: { value: 'y' } });
      expect(container.querySelector('[data-start-missing]')).toBeNull();
      expect((container.querySelector('[data-start]') as HTMLButtonElement).disabled).toBe(false);
    });
  });

  /**
   * A ✕ that dismisses a panel cancels nothing, and «إلغاء» is what the rest
   * of this form's buttons would be called. Screen readers were being told the
   * wrong verb on every close control in the tool.
   */
  it('calls its close control close, not cancel', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      const close = [...container.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-label') === say('close'));
      expect(close).toBeTruthy();
      expect(close!.getAttribute('aria-label')).not.toBe(say('recCancel'));
    });
  });

  it('gives both name fields a label of their own', () => {
    withRelaxedRegistry(matn => {
      const { container } = draw(matn);
      expect(container.querySelector('[data-student]')!.getAttribute('aria-label'))
        .toBe(say('recStudent'));
      expect(container.querySelector('[data-instructor]')!.getAttribute('aria-label'))
        .toBe(say('recInstructor'));
    });
  });
});

describe('the progress screen only looks tappable where it is', () => {
  /** One page, recited cleanly once and then left long enough to fall due. */
  const DAY = 86_400_000;
  const T0 = 1_700_000_000_000;
  const states = () => new Map<number, PageState>([[294, {
    page: 294,
    sessions: 1,
    ayahsRecited: 12,
    faultWeight: 0,
    faults: 0,
    lastRecitedAt: T0,
    lastFaultAt: null,
  }]]);

  const wrap = (node: React.ReactNode) => render(<I18nProvider forceLang="ar">{node}</I18nProvider>);

  it('draws a due page as a row when nothing can open it', () => {
    const { container } = wrap(<DueToday states={states()} now={T0 + 400 * DAY} />);
    expect(container.querySelector('[data-due-page]')).toBeTruthy();
    expect(container.querySelector('[data-due-page] button')).toBeNull();
  });

  it('draws it as a button, and hands over the page, when one can', () => {
    const onPick = vi.fn();
    const { container } = wrap(<DueToday states={states()} now={T0 + 400 * DAY} onPick={onPick} />);
    const button = container.querySelector('[data-due-page] button') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalledWith(294);
  });

  /** Six hundred and four disabled buttons is not an accessible grid. */
  it('never draws the heat map as buttons nobody may press', () => {
    const { container } = wrap(<MushafHeatMap states={states()} totalPages={12} />);
    expect(container.querySelectorAll('[data-page]')).toHaveLength(12);
    expect(container.querySelectorAll('button[data-page]')).toHaveLength(0);
    // The description survives the change of element — see `role="img"`.
    expect(container.querySelector('[data-page="294"], [data-page="1"]')!.getAttribute('aria-label'))
      .toContain(say('recPageUnit'));
  });

  it('makes them buttons once a page can be opened', () => {
    const onPick = vi.fn();
    const { container } = wrap(<MushafHeatMap states={states()} totalPages={12} onPick={onPick} />);
    expect(container.querySelectorAll('button[data-page]')).toHaveLength(12);
    fireEvent.click(container.querySelector('button[data-page="7"]')!);
    expect(onPick).toHaveBeenCalledWith(7);
  });
});

describe('every language gets the whole screen', () => {
  /**
   * Two strings in the setup form used to branch on Arabic and answer English
   * for everything else, so a French, German or Spanish teacher met English
   * mid-form. Asserted as five distinct answers rather than by spelling any of
   * them out.
   */
  it('answers the setup form’s own words in all five', () => {
    for (const key of ['recYouWord', 'recWhatsappHint'] as const) {
      const answers = (['ar', 'en', 'fr', 'de', 'es'] as Lang[]).map(l => say(key, l));
      for (const answer of answers) expect(answer.trim().length, key).toBeGreaterThan(0);
      // Arabic, and four Latin-script languages that do not simply repeat one
      // another — which is what "falls back to English" looked like.
      expect(new Set(answers).size, key).toBe(5);
    }
  });
});
