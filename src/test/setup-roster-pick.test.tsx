import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * Picking the reciter from a teacher's halaqa roster, all the way to a majlis.
 *
 * This is the half of a halaqa that happens on the teacher's phone: one reciter
 * after another, each picked from the list. The pick is what attaches the
 * majlis to that student for the teacher's view of them, so what is asserted is
 * the session that actually comes out of the form's own start button - not the
 * state of a dropdown.
 *
 * The form waits for the Qur'an index before it will start, so a real one is
 * built from the app's own data file rather than stubbed: a stub shaped wrong
 * would make the start button's refusal look like the picker's bug.
 */

vi.mock('@/lib/quran-index', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quran-index')>('@/lib/quran-index');
  const { readFileSync } = await import('node:fs');
  const raw = JSON.parse(readFileSync('sard/public/hafs_smart_v8.json', 'utf8'));
  const idx = actual.buildQuranIndex(raw);
  return { ...actual, loadQuranIndex: async () => idx, discoverMushafs: async () => ['madinah'] };
});

import { I18nProvider } from '@/hooks/useI18n';
import RecitationSetupModal from '@/components/board/RecitationSetupModal';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const ROSTER = [{ id: 'stu-1', name: 'Zayd' }, { id: 'stu-2', name: 'Amina' }];

const draw = (roster?: { id: string; name: string }[]) => {
  const onStart = vi.fn();
  const view = render(
    <I18nProvider forceLang="en">
      <MushafProvider>
        <RecitationSetupModal
          open onClose={() => {}} onStart={onStart}
          roster={roster} rosterLabel="Roster"
        />
      </MushafProvider>
    </I18nProvider>,
  );
  return { ...view, onStart };
};

const picker = (c: HTMLElement) => c.querySelector('[data-roster-pick]') as HTMLSelectElement | null;
const nameField = (c: HTMLElement) => c.querySelector('#rec-student') as HTMLInputElement;

/** Reciting alone needs only a name, which keeps the other gates out of the way. */
const alone = (c: HTMLElement) => {
  const b = [...c.querySelectorAll('[data-mode]')].find(el => el.getAttribute('data-mode') === 'solo');
  if (!b) throw new Error('no solo choice; modes are ' + [...c.querySelectorAll('[data-mode]')].map(el => el.getAttribute('data-mode')).join(','));
  fireEvent.click(b);
};

const start = async (c: HTMLElement) => {
  await waitFor(() => expect((c.querySelector('[data-start]') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(c.querySelector('[data-start]')!);
};

describe('without a roster', () => {
  it('shows no picker - the form is what it always was', () => {
    const { container } = draw();
    expect(picker(container)).toBeNull();
  });

  it('shows none for an empty roster either', () => {
    const { container } = draw([]);
    expect(picker(container)).toBeNull();
  });
});

describe('with a roster', () => {
  it('offers every student on it', () => {
    const { container } = draw(ROSTER);
    const names = [...picker(container)!.options].map(o => o.textContent);
    expect(names).toEqual(expect.arrayContaining(['Zayd', 'Amina']));
  });

  it('fills the name when somebody is picked', () => {
    const { container } = draw(ROSTER);
    fireEvent.change(picker(container)!, { target: { value: 'stu-2' } });
    expect(nameField(container).value).toBe('Amina');
  });

  /** The whole point: the majlis that comes out belongs to that student. */
  it('attaches the majlis to the student picked', async () => {
    const { container, onStart } = draw(ROSTER);
    alone(container);
    fireEvent.change(picker(container)!, { target: { value: 'stu-1' } });
    await start(container);
    const session = onStart.mock.calls[0][0];
    expect(session.rosterStudentId).toBe('stu-1');
    expect(session.studentName).toBe('Zayd');
  });

  /**
   * A typed name is not a claim about which student it is. Attributing it
   * anyway would put one child's recitation in another's record.
   */
  it('lets go of the student once the name is typed over', async () => {
    const { container, onStart } = draw(ROSTER);
    alone(container);
    fireEvent.change(picker(container)!, { target: { value: 'stu-1' } });
    fireEvent.change(nameField(container), { target: { value: 'Somebody else' } });
    await start(container);
    const session = onStart.mock.calls[0][0];
    expect(session.rosterStudentId).toBeUndefined();
    expect(session.studentName).toBe('Somebody else');
  });

  it('attaches nobody when nobody was picked', async () => {
    const { container, onStart } = draw(ROSTER);
    alone(container);
    fireEvent.change(nameField(container), { target: { value: 'Walk-in' } });
    await start(container);
    expect(onStart.mock.calls[0][0].rosterStudentId).toBeUndefined();
  });
});
