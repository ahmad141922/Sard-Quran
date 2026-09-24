import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import RecitationSetupModal from '@/components/board/RecitationSetupModal';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';
import { finishWizard, wizardProfile } from '@/lib/wizard-profile';

/**
 * What the wizard was told, actually being used.
 *
 * A first-run screen that asks somebody their name and then presents them an
 * empty name field is worse than not asking: it spends their patience and gives
 * nothing back. So what it collected has to arrive somewhere, and the place it
 * arrives is the form that opens the first majlis.
 *
 * It arrives as an **opening state**, not as a setting. Clearing the field has
 * to stick — the wizard's answer is where the form starts, not a value the form
 * keeps agreeing with.
 */

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const draw = () => render(
  <I18nProvider forceLang="ar">
    <MushafProvider>
      <RecitationSetupModal open onClose={() => {}} onStart={vi.fn()} />
    </MushafProvider>
  </I18nProvider>,
);

const nameField = (c: HTMLElement) => c.querySelector('#rec-student') as HTMLInputElement;
/** The surah pickers, found by what they hold rather than by an id they lack. */
const surahValues = (c: HTMLElement) =>
  [...c.querySelectorAll('select')].map(el => Number((el as HTMLSelectElement).value));

describe('a device that has been through the wizard', () => {
  it('opens the form at the name it was given', () => {
    finishWizard({ name: 'زينب' });
    const { container } = draw();
    expect(nameField(container).value).toBe(wizardProfile()!.name);
  });

  it('opens at the surah it was given', () => {
    finishWizard({ name: 'زينب', startSurah: 36 });
    const { container } = draw();
    expect(wizardProfile()!.startSurah).toBe(36);
    expect(surahValues(container)).toContain(36);
  });

  /** And opens at al-Fatiha when it was told nothing, as it always did. */
  it('opens at the first surah when the wizard was not asked about it', () => {
    finishWizard({ name: 'زينب' });
    const { container } = draw();
    expect(surahValues(container)).not.toContain(36);
  });

  /** A starting point, not a setting: clearing the field has to stick. */
  it('lets the name be cleared and left cleared', () => {
    finishWizard({ name: 'زينب' });
    const { container } = draw();
    fireEvent.change(nameField(container), { target: { value: '' } });
    expect(nameField(container).value).toBe('');
  });

  it('lets the name be replaced', () => {
    finishWizard({ name: 'زينب' });
    const { container } = draw();
    fireEvent.change(nameField(container), { target: { value: 'عائشة' } });
    expect(nameField(container).value).toBe('عائشة');
  });
});

describe('a device that skipped it', () => {
  it('opens empty, exactly as before', () => {
    finishWizard({});
    const { container } = draw();
    expect(nameField(container).value).toBe('');
  });

  it('opens empty where the wizard never ran at all', () => {
    const { container } = draw();
    expect(nameField(container).value).toBe('');
  });
});
