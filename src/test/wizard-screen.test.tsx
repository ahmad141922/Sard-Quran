import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';
import { availableRiwayat } from '@/lib/mushaf/registry';
import { finishWizard, wizardDone, wizardProfile } from '@/lib/wizard-profile';
import SardWizard, { WIZARD_TEXT } from '../../sard/src/SardWizard';

/**
 * The screen a person meets before they have met anything else.
 *
 * Almost nothing here is about what it looks like. What is asserted is that it
 * can always be left — from any step, in one tap, keeping whatever was already
 * said — and that leaving it puts the tool in no state it could not have been
 * in anyway. A wizard is only acceptable at all on those terms.
 *
 * No Arabic is typed into these assertions. Both sides of every comparison are
 * read from `WIZARD_TEXT`, which is the thing under test: a table checked
 * against a copy of itself would only ever prove that a typo was consistent.
 */

const MUSHAF_KEY = 'tajweedoo:mushaf-id';
const CONTACT_KEY = 'tajweedoo:contact';

beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

const draw = (onDone?: (a: unknown) => void) => {
  const view = render(
    <I18nProvider forceLang="ar">
      <MushafProvider>
        <SardWizard onDone={onDone} />
      </MushafProvider>
    </I18nProvider>,
  );
  const at = <T extends Element>(sel: string) => view.container.querySelector<T>(sel);
  const sheet = () => at('[data-sard-wizard]');
  const tap = (sel: string) => {
    const el = at<HTMLElement>(sel);
    if (!el) throw new Error(`nothing to tap at ${sel}`);
    fireEvent.click(el);
  };
  const step = () => at('[data-wizard-step]')?.getAttribute('data-wizard-step');
  return { ...view, at, sheet, tap, step };
};

describe('whether the wizard shows its face', () => {
  it('is there on a device nothing has been done on', () => {
    const { sheet } = draw();
    expect(sheet()).toBeTruthy();
  });

  it('is not there once it has already had its turn', () => {
    finishWizard();
    const { sheet } = draw();
    expect(sheet()).toBeNull();
  });

  it('is not there for somebody who was already using the tool', () => {
    localStorage.setItem(MUSHAF_KEY, 'hafs-kfqc');
    const { sheet } = draw();
    expect(sheet()).toBeNull();
  });
});

describe('leaving it', () => {
  it('goes in one tap, from the very first step', () => {
    const { sheet, tap } = draw();
    tap('[data-wizard-dismiss]');
    expect(sheet()).toBeNull();
    expect(wizardDone()).toBe(true);
  });

  it('does not come back on the next launch', () => {
    const first = draw();
    first.tap('[data-wizard-dismiss]');
    cleanup();
    expect(draw().sheet()).toBeNull();
  });

  it('keeps what was already said rather than punishing an early exit', () => {
    const { at, tap } = draw();
    fireEvent.change(at<HTMLInputElement>('#wizard-name')!, { target: { value: 'Umar' } });
    tap('[data-wizard-next]');
    tap('[data-wizard-stance="solo"]');
    tap('[data-wizard-dismiss]');
    expect(wizardProfile()).toEqual({ name: 'Umar', stance: 'solo' });
  });

  it('is dismissible from every step, not only the first', () => {
    for (const reached of [0, 1, 2, 3]) {
      localStorage.clear();
      const view = draw();
      for (let i = 0; i < reached; i++) view.tap('[data-wizard-skip]');
      view.tap('[data-wizard-dismiss]');
      expect(view.sheet(), `step ${reached}`).toBeNull();
      expect(wizardDone()).toBe(true);
      cleanup();
    }
  });

  it('closes on Escape, which is the same tap without a finger', () => {
    const { sheet } = draw();
    fireEvent.keyDown(sheet()!, { key: 'Escape' });
    expect(sheet()).toBeNull();
    expect(wizardDone()).toBe(true);
  });
});

describe('walking through it', () => {
  it('asks four questions and then gets out of the way', () => {
    const { sheet, tap, step } = draw();
    expect(step()).toBe('name');
    tap('[data-wizard-next]');
    expect(step()).toBe('stance');
    tap('[data-wizard-next]');
    expect(step()).toBe('riwaya');
    tap('[data-wizard-next]');
    expect(step()).toBe('start');
    tap('[data-wizard-next]');
    expect(sheet()).toBeNull();
  });

  it('lets somebody go back and change an answer', () => {
    const { tap, step } = draw();
    tap('[data-wizard-next]');
    tap('[data-wizard-next]');
    expect(step()).toBe('riwaya');
    tap('[data-wizard-back]');
    expect(step()).toBe('stance');
  });

  it('offers nothing to go back to on the first question', () => {
    const { at } = draw();
    expect(at('[data-wizard-back]')).toBeNull();
  });

  it('says «start» on the last step and «next» before it', () => {
    const { at, tap } = draw();
    const label = () => at('[data-wizard-next]')?.textContent ?? '';
    expect(label()).toContain(WIZARD_TEXT.ar.next);
    tap('[data-wizard-next]');
    tap('[data-wizard-next]');
    tap('[data-wizard-next]');
    expect(label()).toContain(WIZARD_TEXT.ar.start);
  });
});

describe('skipping', () => {
  it('records nothing at all when every step is passed through', () => {
    const { sheet, tap } = draw();
    for (let i = 0; i < 4; i++) tap('[data-wizard-skip]');
    expect(sheet()).toBeNull();
    // Nothing said means nothing stored, which means the setup form goes on
    // asking exactly as it did before the wizard existed.
    expect(wizardProfile()).toEqual({});
    expect(localStorage.getItem(CONTACT_KEY)).toBeNull();
    expect(localStorage.getItem(MUSHAF_KEY)).toBeNull();
  });

  it('does not mistake the default shown for an answer given', () => {
    const { tap } = draw();
    // The surah field has al-Fatiha selected from the first paint; passing it
    // by must not write that down as a choice.
    tap('[data-wizard-skip]');
    tap('[data-wizard-skip]');
    tap('[data-wizard-skip]');
    tap('[data-wizard-skip]');
    expect(wizardProfile()?.startSurah).toBeUndefined();
  });
});

describe('what the answers actually do', () => {
  it('writes the reciter’s name where the report can find it', () => {
    const { at, tap } = draw();
    fireEvent.change(at<HTMLInputElement>('#wizard-name')!, { target: { value: 'Umar' } });
    for (let i = 0; i < 4; i++) tap('[data-wizard-next]');
    expect(wizardProfile()?.name).toBe('Umar');
  });

  it('hands the side of the majlis to the setup form’s own key', () => {
    const { tap } = draw();
    tap('[data-wizard-next]');
    tap('[data-wizard-stance="listener"]');
    tap('[data-wizard-dismiss]');
    expect(JSON.parse(localStorage.getItem(CONTACT_KEY)!).role).toBe('listener');
  });

  it('writes the riwaya through the provider, not into a second copy of it', () => {
    const others = availableRiwayat().slice(1);
    if (!others.length) return; // only one riwaya is offered today
    const { at, tap } = draw();
    tap('[data-wizard-next]');
    tap('[data-wizard-next]');
    fireEvent.change(at<HTMLSelectElement>('#wizard-riwaya')!, { target: { value: others[0] } });
    // The tool's own key, written by MushafProvider — the wizard keeps no
    // riwaya of its own that could disagree with it.
    expect(localStorage.getItem(MUSHAF_KEY)).toBeTruthy();
    tap('[data-wizard-dismiss]');
    expect(wizardProfile()).toEqual({});
  });

  it('remembers the surah the first majlis is meant to open at', () => {
    const { at, tap } = draw();
    for (let i = 0; i < 3; i++) tap('[data-wizard-next]');
    fireEvent.change(at<HTMLSelectElement>('#wizard-surah')!, { target: { value: '18' } });
    tap('[data-wizard-next]');
    expect(wizardProfile()?.startSurah).toBe(18);
  });

  it('tells the host what was settled, for anything it wants to do next', () => {
    const onDone = vi.fn();
    const { tap } = draw(onDone);
    tap('[data-wizard-next]');
    tap('[data-wizard-stance="solo"]');
    tap('[data-wizard-dismiss]');
    expect(onDone).toHaveBeenCalledWith({ stance: 'solo' });
  });
});

describe('the manners of the thing', () => {
  it('turns the movement off for anyone who asked for that', () => {
    const { container } = draw();
    const css = [...container.querySelectorAll('style')].map(s => s.textContent).join('');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    // Not merely present — the two animated things have to be named in it.
    const guarded = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(guarded).toContain('.sard-wizard-sheet');
    expect(guarded).toContain('.sard-wizard-step');
  });

  it('follows the direction of the language it is speaking', () => {
    const { sheet } = draw();
    expect(sheet()?.getAttribute('dir')).toBe('rtl');
  });

  it('announces itself as what it is', () => {
    const { sheet } = draw();
    expect(sheet()?.getAttribute('role')).toBe('dialog');
    expect(sheet()?.getAttribute('aria-modal')).toBe('true');
    expect(sheet()?.getAttribute('aria-label')).toBe(WIZARD_TEXT.ar.heading);
  });

  it('says where in the four steps a reader is, for readers who cannot see dots', () => {
    const { at, tap } = draw();
    const said = () => at('[role="img"]')?.getAttribute('aria-label') ?? '';
    const expected = (n: number) => WIZARD_TEXT.ar.step.replace('{n}', String(n)).replace('{total}', '4');
    expect(said()).toBe(expected(1));
    tap('[data-wizard-next]');
    expect(said()).toBe(expected(2));
  });
});
