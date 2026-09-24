/**
 * How long the reciter has kept this up, and whether they are on track.
 *
 * Both are read off majālis that already happened — see `recitation-habit.ts`.
 *
 * ## What this deliberately is not
 *
 * There is no reward, no badge, and nothing is taken away for a missed day.
 * The tool's claim is that it records what happened; a number that congratulates
 * attendance would be measuring the app rather than the Qurʾān, and the moment
 * a reciter opens it to keep a number alive it has started working against the
 * thing it exists for.
 *
 * So the run is stated, not celebrated, and a today that has not happened yet
 * is shown as still open rather than as a loss.
 */

import React, { useMemo, useState } from 'react';
import { Flame, Target } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import ReminderSetting from './ReminderSetting';
import { goalProgress, streakOf, type GoalPeriod } from '@/lib/recitation-habit';
import { GOAL_PRESETS, setStandingGoal, standingGoal } from '@/lib/standing-goal';
import type { RecitationSession } from '@/lib/recitation-session';

const PERIOD_KEY: Record<GoalPeriod, 'goalPerDay' | 'goalPerWeek' | 'goalPerMonth'> = {
  day: 'goalPerDay',
  week: 'goalPerWeek',
  month: 'goalPerMonth',
};

export const HabitPanel: React.FC<{
  sessions: RecitationSession[];
  now?: number;
}> = ({ sessions, now = Date.now() }) => {
  const { t } = useI18n();
  const [goal, setGoal] = useState(() => standingGoal());

  const streak = useMemo(() => streakOf(sessions, now), [sessions, now]);
  const progress = useMemo(
    () => (goal ? goalProgress(goal, sessions, now) : null),
    [goal, sessions, now],
  );

  const choose = (next: typeof GOAL_PRESETS[number] | null) => {
    setStandingGoal(next);
    setGoal(next);
  };

  return (
    <div data-habit className="mt-4 grid gap-2 sm:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Flame size={13} /> {t('habitStreak')}
        </div>

        {streak.days === 0 ? (
          <p data-streak-none className="mt-1 text-xs text-muted-foreground">
            {t('habitNoDays')}
          </p>
        ) : (
          <>
            <div data-streak className="mt-1 text-2xl font-extrabold text-foreground">
              {streak.current}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {t('habitLongest')} {streak.longest} · {t('habitTotalDays')} {streak.days}
            </div>
            {/*
              Said plainly, and not as a warning. The day is not over, and a
              streak that scolded at midnight would be about a clock.
            */}
            {!streak.today && streak.current > 0 && (
              <div data-streak-open className="mt-1 text-[11px] text-muted-foreground">
                {t('habitTodayOpen')}
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Target size={13} /> {t('habitGoal')}
        </div>

        {!goal || !progress ? (
          <div data-goal-none className="mt-1.5">
            {/* No goal is a resting state, not a nag. */}
            <p className="mb-1.5 text-[11px] text-muted-foreground">{t('habitNoGoal')}</p>
            <div className="flex flex-wrap gap-1">
              {GOAL_PRESETS.map(preset => (
                <button
                  key={`${preset.ayahs}-${preset.period}`}
                  type="button"
                  data-goal-set={preset.period}
                  onClick={() => choose(preset)}
                  className="rounded-lg border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  {preset.ayahs} {t(PERIOD_KEY[preset.period])}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div data-goal className="mt-1 text-2xl font-extrabold text-foreground">
              {progress.done}
              <span className="text-sm font-bold text-muted-foreground">
                {' / '}{progress.target}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                data-goal-bar
                className={`h-full rounded-full ${progress.met ? 'bg-emerald-500' : 'bg-emerald-600/60'}`}
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {progress.met
                ? t('habitGoalMet')
                : `${t('habitLeft')} ${progress.left}`}
              {' · '}{t(PERIOD_KEY[goal.period])}
            </div>
            <button
              type="button"
              data-goal-clear
              onClick={() => choose(null)}
              className="mt-1.5 text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              {t('habitChangeGoal')}
            </button>
          </>
        )}
      </div>
      {/*
        Third, and spanning the row: the streak and the goal are what has
        happened, and this is the only thing on the panel that acts on the
        days still to come. It is told whether today has already been
        recited so it can stay quiet on a day already served.
      */}
      <ReminderSetting recitedToday={streak.today} now={now} />
    </div>
  );
};

export default HabitPanel;
