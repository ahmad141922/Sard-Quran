/**
 * Starting a matn session: which poem, how much of it, and who is reciting.
 *
 * Much shorter than the muṣḥaf's setup, and the omissions are the point. There
 * is no riwaya to pick, because a matn is one text. There is no edition to
 * pick either — each ships with exactly one declared print — but that print is
 * **shown**, because the print owns the line numbers and the teacher has to be
 * told which numbering they will be following.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import type { Matn } from '@/lib/matn/load';
import { isMatnReady, matnAuthor, matnEdition, matnName, type MatnId } from '@/lib/matn/registry';
import {
  babGoal, createMatnSession, fullMatnGoal, type MatnGoal, type MatnSession,
} from '@/lib/matn/session';
import type { SessionMode } from '@/lib/recitation-session';

interface Props {
  open: boolean;
  /** Only those with a settled print — see `isMatnReady`. */
  available: { id: MatnId; matn: Matn }[];
  onClose: () => void;
  onStart: (session: MatnSession) => void;
}

const MatnSetupModal: React.FC<Props> = ({ open, available, onClose, onStart }) => {
  const { t, lang, dir } = useI18n();
  const [matnId, setMatnId] = useState<MatnId | null>(null);
  const [mode, setMode] = useState<SessionMode>('majlis');
  const [name, setName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [babN, setBabN] = useState<number | 'full'>('full');

  const alone = mode === 'solo';

  /**
   * Only matns whose print has been named.
   *
   * A matn without a settled edition is not offered at all: following a
   * student in a numbering nobody declared is the mistake this whole design is
   * arranged around, and an empty list saying so is better than a session that
   * cannot be trusted.
   */
  const offered = useMemo(
    () => available.filter(a => isMatnReady(a.id)),
    [available],
  );

  /**
   * A list of one is not a choice.
   *
   * Matns arrive as their prints are settled, so for most of this tool's life
   * the list has held one or two. Making the reciter tap the only thing on
   * offer before the form will even show them the chapters is a step that
   * asks nothing — and it is the step people stall on, because a card that
   * looks like a heading does not look like a button.
   */
  useEffect(() => {
    if (offered.length === 1) setMatnId(current => current ?? offered[0].id);
  }, [offered]);

  const chosen = offered.find(a => a.id === matnId) ?? null;

  const goal: MatnGoal | null = useMemo(() => {
    if (!chosen) return null;
    if (babN === 'full') return fullMatnGoal(chosen.matn);
    const bab = chosen.matn.abwab.find(b => b.n === babN);
    return bab ? babGoal(bab) : null;
  }, [chosen, babN]);

  const canStart = !!chosen && !!goal && name.trim().length > 0
    && (alone || instructor.trim().length > 0);

  /**
   * What is still standing between this form and a session, named — the same
   * answer the muṣḥaf's setup gives, for the same reason: a button that only
   * goes dim leaves the reciter hunting a field that has scrolled off the top.
   */
  const missing: string[] = [];
  if (offered.length > 0) {
    if (!chosen) missing.push(t('recMatn'));
    if (!name.trim()) missing.push(t('recStudent'));
    if (!alone && !instructor.trim()) missing.push(t('recInstructor'));
  }

  const start = useCallback(() => {
    if (!chosen || !goal || !canStart) return;
    onStart(createMatnSession({
      studentName: name,
      // Left off entirely when reciting alone rather than written empty: there
      // was no listener, and saying so by omission is truer than by a blank.
      instructorName: alone ? undefined : instructor,
      mode,
      matn: chosen.matn,
      goal,
    }));
  }, [chosen, goal, canStart, name, instructor, alone, mode, onStart]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${t('recTitle')} · ${t('recMatn')}`}
    >
      <div
        dir={dir}
        onClick={e => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-md flex-col rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          {/* Named for the text it is about: the muṣḥaf's setup carries the
              same «مجلس السرد», and two identical headings on two different
              forms is one heading doing no work. */}
          <span className="text-sm font-bold text-foreground">{t('recTitle')} · {t('recMatn')}</span>
          <button
            onClick={onClose}
            data-a11y-tap
            aria-label={t('close')}
            title={t('close')}
            className="-me-1 flex items-center justify-center rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {offered.length === 0 ? (
            /* Nothing to offer, and the reason is worth stating plainly. */
            <p data-none className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              {t('recMatnNoneReady')}
            </p>
          ) : (
            <>
              <Field label={t('recSessionMode')}>
                <Choice<SessionMode>
                  options={[['majlis', t('recModeMajlis')], ['solo', t('recModeSolo')]]}
                  value={mode}
                  onPick={setMode}
                />
                {alone && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {t('recSoloHint')}
                  </p>
                )}
              </Field>

              <Field label={t('recMatn')}>
                <div className="grid gap-1.5">
                  {offered.map(({ id }) => (
                    <button
                      key={id}
                      data-matn={id}
                      onClick={() => { setMatnId(id); setBabN('full'); }}
                      aria-pressed={matnId === id}
                      className={`rounded-lg border-2 px-3 py-2 text-start transition-all ${
                        matnId === id
                          ? 'border-emerald-600 bg-emerald-600/10'
                          : 'border-border bg-background hover:border-emerald-600/40'
                      }`}
                    >
                      <div className="text-sm font-bold text-foreground">{matnName(id, lang)}</div>
                      <div className="text-[11px] text-muted-foreground">{matnAuthor(id, lang)}</div>
                      {/* The print, shown not chosen — it owns the numbering. */}
                      <div className="text-[10px] text-muted-foreground/80">{matnEdition(id, lang)}</div>
                    </button>
                  ))}
                </div>
              </Field>

              {chosen && (
                <Field label={t('recGoal')}>
                  <select
                    data-bab
                    value={String(babN)}
                    onChange={e => setBabN(e.target.value === 'full' ? 'full' : Number(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value="full">{t('recMatnWhole')}</option>
                    {chosen.matn.abwab.map(b => (
                      <option key={b.n} value={b.n}>
                        {dir === 'rtl' ? b.titleAr : b.titleEn}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {/* The label above each field is a heading, not a `<label>`, so
                  the fields carry their own — otherwise a screen reader reaches
                  two identical unnamed boxes and the form is unusable. */}
              <Field label={t('recStudent')} htmlFor="matn-student">
                <input
                  id="matn-student"
                  data-student
                  value={name}
                  onChange={e => setName(e.target.value)}
                  aria-label={t('recStudent')}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </Field>

              {!alone && (
                <Field label={t('recInstructor')} htmlFor="matn-instructor">
                  <input
                    id="matn-instructor"
                    data-instructor
                    value={instructor}
                    onChange={e => setInstructor(e.target.value)}
                    aria-label={t('recInstructor')}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border p-3">
          <button
            data-start
            onClick={start}
            disabled={!canStart}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
          >
            {t('recStart')}
          </button>
          {!canStart && missing.length > 0 && (
            <p data-start-missing className="mt-1.5 text-center text-[11px] leading-relaxed text-muted-foreground">
              {t('recStartMissing').replace('{what}', missing.join(' · '))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; htmlFor?: string; children: React.ReactNode }> = ({ label, htmlFor, children }) => (
  <div>
    {htmlFor
      ? <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      : <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>}
    {children}
  </div>
);

function Choice<V extends string>({ options, value, onPick }: {
  options: readonly (readonly [V, string])[];
  value: V;
  onPick: (v: V) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          data-choice={v}
          onClick={() => onPick(v)}
          aria-pressed={value === v}
          className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition-all ${
            value === v
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
              : 'border-border bg-background text-foreground hover:border-emerald-600/40'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default MatnSetupModal;
