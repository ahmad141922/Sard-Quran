import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import ReminderSetting from '@/components/board/ReminderSetting';
import { EVERY_DAY, loadReminder } from '@/lib/reminder';

/**
 * Setting a reminder for one's own ward.
 *
 * Three things are worth a test here and they are all about restraint: the
 * switch is off until somebody turns it on, it is not offered where it cannot
 * work, and it does not schedule anything for a day already recited.
 *
 * The device itself is mocked because there is no device — what is asserted is
 * what the panel *asks* the device for, which is the part this file owns.
 */

const state = { supported: true, allowed: true };
const scheduled = vi.fn();
const cleared = vi.fn();

vi.mock('@/lib/native', () => ({
  canRemind: () => state.supported,
  askReminderPermission: async () => state.allowed,
  setReminders: async (times: number[], text: unknown) => { scheduled(times, text); return true; },
  clearReminders: async () => { cleared(); },
}));

/** A Wednesday morning, built locally so the suite is timezone-proof. */
const NOW = new Date(2026, 8, 9, 7, 0, 0, 0).getTime();

const draw = (recitedToday = false) => render(
  <I18nProvider forceLang="ar">
    <ReminderSetting recitedToday={recitedToday} now={NOW} />
  </I18nProvider>,
);

const sw = (c: HTMLElement) => c.querySelector('[data-reminder-toggle]') as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  scheduled.mockClear();
  cleared.mockClear();
  state.supported = true;
  state.allowed = true;
});
afterEach(cleanup);

describe('before anybody asks for it', () => {
  it('is off, and nothing is scheduled', () => {
    const { container } = draw();
    expect(sw(container).getAttribute('aria-pressed')).toBe('false');
    expect(scheduled).not.toHaveBeenCalled();
    expect(container.querySelector('[data-reminder-time]')).toBeNull();
  });
});

describe('in a browser, which cannot hold one', () => {
  it('says so and does not offer the switch', () => {
    state.supported = false;
    const { container } = draw();
    expect(container.querySelector('[data-reminder-app-only]')).toBeTruthy();
    expect(sw(container).disabled).toBe(true);
  });

  it('asks the device for nothing at all', () => {
    state.supported = false;
    draw();
    expect(scheduled).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
  });
});

describe('turning it on', () => {
  it('asks first, and schedules a run of days once allowed', async () => {
    const { container } = draw();
    fireEvent.click(sw(container));
    await waitFor(() => expect(sw(container).getAttribute('aria-pressed')).toBe('true'));
    await waitFor(() => expect(scheduled).toHaveBeenCalled());
    const [times] = scheduled.mock.calls.at(-1)!;
    expect(times.length).toBeGreaterThan(1);
    expect([...times].sort((a: number, b: number) => a - b)).toEqual(times);
    // Kept, so the next launch does not start it over.
    expect(loadReminder().on).toBe(true);
  });

  it('stays off, and says why, when the device refuses', async () => {
    state.allowed = false;
    const { container } = draw();
    fireEvent.click(sw(container));
    await waitFor(() => expect(container.querySelector('[data-reminder-denied]')).toBeTruthy());
    expect(sw(container).getAttribute('aria-pressed')).toBe('false');
    expect(scheduled).not.toHaveBeenCalled();
    expect(loadReminder().on).toBe(false);
  });

  it('takes it all back off the device when switched off again', async () => {
    const { container } = draw();
    fireEvent.click(sw(container));
    await waitFor(() => expect(scheduled).toHaveBeenCalled());
    fireEvent.click(sw(container));
    await waitFor(() => expect(cleared).toHaveBeenCalled());
    expect(sw(container).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('once it is on', () => {
  const turnedOn = async (recitedToday = false) => {
    const view = draw(recitedToday);
    fireEvent.click(sw(view.container));
    await waitFor(() => expect(scheduled).toHaveBeenCalled());
    return view;
  };

  it('offers every day, all of them chosen', async () => {
    const { container } = await turnedOn();
    const chips = container.querySelectorAll('[data-reminder-day]');
    expect(chips).toHaveLength(EVERY_DAY.length);
    for (const chip of chips) expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('drops a day when its chip is pressed', async () => {
    const { container } = await turnedOn();
    const wednesday = container.querySelector('[data-reminder-day="3"]')!;
    fireEvent.click(wednesday);
    await waitFor(() => expect(wednesday.getAttribute('aria-pressed')).toBe('false'));
    const [times] = scheduled.mock.calls.at(-1)!;
    for (const t of times) expect(new Date(t).getDay()).not.toBe(3);
  });

  /** The whole point of telling it about today. */
  it('schedules nothing for a day already recited', async () => {
    const { container } = await turnedOn(true);
    const [times] = scheduled.mock.calls.at(-1)!;
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) expect(new Date(t).toDateString()).not.toBe(new Date(NOW).toDateString());
    expect(container.querySelector('[data-reminder-next]')!.textContent).toBeTruthy();
  });

  it('reschedules when the hour is changed', async () => {
    const { container } = await turnedOn();
    scheduled.mockClear();
    fireEvent.change(container.querySelector('[data-reminder-time]')!, { target: { value: '05:30' } });
    await waitFor(() => expect(scheduled).toHaveBeenCalled());
    const [times] = scheduled.mock.calls.at(-1)!;
    expect(new Date(times[0]).getHours()).toBe(5);
    expect(new Date(times[0]).getMinutes()).toBe(30);
  });
});
