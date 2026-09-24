/**
 * The reminder the reciter sets for their own ward.
 *
 * ## Why it lives beside the streak and not in a settings screen
 *
 * It is the same question the streak answers — am I keeping this up — asked
 * forwards instead of backwards. A person looking at a run of days is exactly
 * the person who wants tomorrow's nudge, and a setting they have to go and find
 * is one they never set.
 *
 * ## What it will not do
 *
 * It does not fire on a day already recited. The panel knows, from the streak
 * it sits next to, whether today has been served, and a served day is dropped
 * from the run handed to the system — see `reminder.ts`. Being nagged for
 * something already done is the one thing that makes people switch a reminder
 * off for good.
 *
 * And it says plainly that a browser cannot hold one. A page can raise a
 * notification while it is open, but nothing in a browser wakes at dawn to do
 * it; offering the switch there would be offering a reminder that never comes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { askReminderPermission, canRemind, clearReminders, setReminders } from '@/lib/native';
import {
  EVERY_DAY, fromClock, loadReminder, saveReminder, toClock, upcoming,
  type Reminder, type Weekday,
} from '@/lib/reminder';

/**
 * Day names in the language on screen, from the platform rather than from us.
 *
 * Five languages times seven days is thirty-five strings that every locale
 * already knows, and the reciter's own calendar is the one they read.
 */
function dayNames(lang: string): string[] {
  const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
  // 2024-01-07 was a Sunday, which is day 0 — the numbering `Date.getDay` uses.
  return EVERY_DAY.map(d => fmt.format(new Date(2024, 0, 7 + d)));
}

export const ReminderSetting: React.FC<{
  /** Whether something has been recited today; the streak already knows. */
  recitedToday: boolean;
  now?: number;
}> = ({ recitedToday, now = Date.now() }) => {
  const { t, lang } = useI18n();
  const [reminder, setReminder] = useState<Reminder>(loadReminder);
  const [denied, setDenied] = useState(false);
  const supported = canRemind();

  const names = useMemo(() => dayNames(lang), [lang]);

  const times = useMemo(
    () => upcoming(reminder, now, { recitedAt: recitedToday ? now : null }),
    [reminder, now, recitedToday],
  );

  /*
   * The device is given the whole run every time anything changes, and handed
   * an empty one when the reminder is off. Replacing rather than adding is what
   * keeps a person who moved their reminder from having both.
   */
  useEffect(() => {
    if (!supported) return;
    if (!reminder.on) { void clearReminders(); return; }
    void setReminders(times, { title: t('remindNotifTitle'), body: t('remindNotifBody') });
  }, [supported, reminder.on, times, t]);

  const change = useCallback((next: Reminder) => {
    setReminder(next);
    saveReminder(next);
  }, []);

  const toggle = useCallback(async () => {
    if (reminder.on) { change({ ...reminder, on: false }); setDenied(false); return; }
    // Asked at the moment it is wanted, which is the only moment the answer
    // means anything — and a refusal leaves the switch honestly off.
    const allowed = await askReminderPermission();
    setDenied(!allowed);
    if (allowed) change({ ...reminder, on: true });
  }, [reminder, change]);

  const toggleDay = (d: Weekday) => {
    const has = reminder.days.includes(d);
    const days = (has ? reminder.days.filter(x => x !== d) : [...reminder.days, d])
      .sort((a, b) => a - b);
    change({ ...reminder, days });
  };

  const nextText = times.length
    ? new Intl.DateTimeFormat(lang, { weekday: 'long', hour: '2-digit', minute: '2-digit' })
      .format(new Date(times[0]))
    : null;

  return (
    <div data-reminder className="rounded-xl border border-border bg-card p-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Bell size={13} /> {t('remindTitle')}
        </div>
        <button
          type="button"
          data-reminder-toggle
          aria-pressed={reminder.on}
          disabled={!supported}
          onClick={() => { void toggle(); }}
          className={`h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 ${
            reminder.on ? 'border-primary bg-primary' : 'border-border bg-muted'
          }`}
        >
          <span
            className={`block h-4 w-4 rounded-full bg-background transition-transform ${
              reminder.on ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {!supported ? (
        <p data-reminder-app-only className="mt-1.5 text-[11px] text-muted-foreground">
          {t('remindAppOnly')}
        </p>
      ) : denied ? (
        <p data-reminder-denied className="mt-1.5 text-[11px] text-muted-foreground">
          {t('remindDenied')}
        </p>
      ) : null}

      {supported && reminder.on && (
        <div className="mt-2 grid gap-2">
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {t('remindTime')}
            <input
              type="time"
              data-reminder-time
              value={toClock(reminder.at)}
              onChange={e => {
                const at = fromClock(e.target.value);
                if (at !== null) change({ ...reminder, at });
              }}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
            />
          </label>

          <div>
            <div className="mb-1 text-[11px] text-muted-foreground">{t('remindDays')}</div>
            <div className="flex flex-wrap gap-1">
              {EVERY_DAY.map(d => (
                <button
                  key={d}
                  type="button"
                  data-reminder-day={d}
                  aria-pressed={reminder.days.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={`rounded-lg border px-2 py-1 text-[11px] ${
                    reminder.days.includes(d)
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {names[d]}
                </button>
              ))}
            </div>
          </div>

          {/*
            What will actually happen, in words. A reminder dropped because
            today is already recited would otherwise look like a broken switch.
          */}
          <p data-reminder-next className="text-[11px] text-muted-foreground">
            {nextText ? `${t('remindNext')}: ${nextText}` : t('remindNone')}
          </p>
        </div>
      )}
    </div>
  );
};

export default ReminderSetting;
