import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Copy, Eye, EyeOff, LogOut, Plus, Send, UserPlus, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import {
  currentIdentity, ensureTeacher, ensureTeacherRow, joinRoster, reasonOf, resendConfirmation,
  joinLink, sendPasswordReset, setNewPassword, signInWithGoogle, signInWithPassword, signOut,
  signUpWithPassword, MIN_PASSWORD, type FailReason,
} from '@/lib/teacher-auth';
import { loadEnrolment, saveEnrolment } from '@/lib/enrolment';
import {
  addStudent, archiveStudent, issueJoinCode, listStudents, sessionsOfStudent,
  type Student, type StudentSession,
} from '@/lib/roster';
import { teacherText } from './strings';

/**
 * The muqri's own screen: signing in, the participants, and one participant's
 * record.
 *
 * ## Why it is one screen and not three
 *
 * Because it is one errand. A teacher opens this to look at a participant, and
 * the signing-in is the toll on the way — not a destination with its own place
 * in the app. Three screens would mean three ways in and two ways to be
 * somewhere you did not mean to be.
 *
 * ## Why nothing here is on the way to reciting
 *
 * The tool's first promise is that a majlis works with no network and no
 * account. So this whole screen is a door off the home screen that nobody has
 * to open: reciting alone never asks for any of it, and a teacher who never
 * signs in loses nothing they had.
 *
 * ## Why the sign-in says so much about itself
 *
 * A form that asks for an email and a password with no word of why is the
 * shape of every phishing page. So it says what the account is for, that it is
 * optional, and what will arrive in the inbox and from whom — and offers the
 * one button everybody already trusts first.
 *
 * ## Why the code is shown as large as it is
 *
 * It is read aloud across a room, often to a child, and then typed on a phone
 * that is not in your hand. Grouped, spaced, and big enough to read at arm's
 * length is the whole design — see `spokenForm` in `join-code.ts`. The link
 * beside it is for when the participant is not in the room.
 */

type Phase =
  | 'signin' | 'signup' | 'inbox' | 'forgot' | 'forgot-sent' | 'new-password'
  | 'roster' | 'student' | 'join' | 'joined';

const GoogleMark: React.FC = () => (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export const TeacherScreen: React.FC<{
  onClose: () => void;
  /**
   * Opens the question about what may leave the device.
   *
   * Raised here rather than asked here, because joining is exactly the moment
   * it becomes a real question — before that there is nobody for anything to
   * be uploaded *to*, and asking would be asking about nothing.
   */
  onAskConsent?: () => void;
  /** Where a link opened the screen: a join invitation, or a password reset. */
  initialPhase?: 'join' | 'new-password';
  /** The code from a join link, filled in for the participant. */
  initialJoinCode?: string;
  /** Said once on arrival — a link that had expired, say. */
  notice?: string;
}> = ({ onClose, onAskConsent, initialPhase, initialJoinCode, notice }) => {
  const { lang, dir } = useI18n();
  const t = teacherText(lang);

  const [phase, setPhase] = useState<Phase>(initialPhase ?? 'signin');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(notice ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');

  const [students, setStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState('');
  const [issued, setIssued] = useState<{ id: string; spoken: string; code: string } | null>(null);

  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '');
  const [joinedTo, setJoinedTo] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<StudentSession[]>([]);

  const refresh = useCallback(async () => {
    const r = await listStudents();
    if (r.ok) setStudents(r.value);
  }, []);

  /*
   * Where to open. A teacher who signed in last week is still signed in, and
   * goes straight to the list. A participant's phone is signed in too —
   * anonymously, from joining — so being signed in is not enough: that phone
   * opens on what it joined, never on an empty list of its own. A link that
   * opened the screen for something else wins over both.
   */
  useEffect(() => {
    if (initialPhase) return;
    void (async () => {
      const me = await currentIdentity();
      if (me && !me.anonymous) {
        await ensureTeacherRow();
        setPhase('roster');
        await refresh();
        return;
      }
      const on = loadEnrolment();
      if (on) { setJoinedTo(on.studentName); setPhase('joined'); }
    })();
  }, [refresh, initialPhase]);

  const go = (next: Phase) => { setProblem(null); setInfo(null); setPhase(next); };

  const say = (reason: FailReason | null) => {
    setProblem(
      reason === 'offline' ? t.offline
        : reason === 'bad-input' ? t.badEmail
          : reason === 'wrong-password' ? t.wrongPassword
            : reason === 'unconfirmed' ? t.unconfirmed
              : reason === 'weak-password' ? t.weakPassword
                : t.signInFailed,
    );
  };

  const enter = async () => {
    await ensureTeacherRow();
    setPassword('');
    go('roster');
    await refresh();
  };

  const google = async () => {
    setBusy(true); setProblem(null);
    const r = await signInWithGoogle();
    // On success the page is already on its way to Google.
    if (!r.ok) { setBusy(false); say(reasonOf(r)); }
  };

  const signIn = async () => {
    setBusy(true); setProblem(null);
    const r = await signInWithPassword(email, password);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    await enter();
  };

  const signUp = async () => {
    setBusy(true); setProblem(null);
    const r = await signUpWithPassword(email, password, name);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    if (r.value === 'exists') { go('signin'); setInfo(t.exists); return; }
    if (r.value === 'signed-in') {
      await ensureTeacher(name);
      await enter();
      return;
    }
    setPassword('');
    go('inbox');
  };

  const resend = async () => {
    setBusy(true); setProblem(null);
    const r = await resendConfirmation(email);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    setInfo(t.resent);
  };

  const forgot = async () => {
    setBusy(true); setProblem(null);
    const r = await sendPasswordReset(email);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    go('forgot-sent');
  };

  const savePassword = async () => {
    setBusy(true); setProblem(null);
    const r = await setNewPassword(password);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    await enter();
    setInfo(t.passwordSaved);
  };

  const leave = async () => {
    await signOut();
    setStudents([]); setChosen(null); setIssued(null); go('signin');
  };

  /*
   * The participant's half of the same errand. It is on this screen rather
   * than its own because «connect me to my halaqa» is one thing a person
   * wants, and which side of it they are on is a fact about them, not a menu
   * they should have to navigate.
   */
  const join = async () => {
    setBusy(true); setProblem(null);
    const r = await joinRoster(joinCode);
    setBusy(false);
    if (!r.ok) { setProblem(t.joinFailed); return; }
    // Kept, because from here every majlis on this phone is this participant's
    // — see `enrolment.ts` — and the next visit should open on it.
    saveEnrolment(r.value);
    setJoinedTo(r.value.studentName);
    setPhase('joined');
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const r = await addStudent(newName);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    setNewName('');
    await refresh();
  };

  const issue = async (student: Student) => {
    setBusy(true);
    const r = await issueJoinCode(student.id);
    setBusy(false);
    if (!r.ok) return say(reasonOf(r));
    setIssued({ id: student.id, spoken: r.value.spoken, code: r.value.code });
    await refresh();
  };

  const open = async (student: Student) => {
    setChosen(student);
    setPhase('student');
    setSessions([]);
    const r = await sessionsOfStudent(student.id);
    if (r.ok) setSessions(r.value);
  };

  const remove = async (student: Student) => {
    setBusy(true);
    await archiveStudent(student.id);
    setBusy(false);
    if (issued?.id === student.id) setIssued(null);
    await refresh();
  };

  const invite = (code: string) =>
    t.inviteMessage.replace('{link}', joinLink(code)).replace('{code}', code);

  const sendOnWhatsapp = (code: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(invite(code))}`, '_blank', 'noopener');
  };

  const copyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(invite(code));
      setInfo(t.linkCopied);
    } catch {
      setProblem(t.copyFailed);
    }
  };

  const field = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground';
  const primary = 'rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40';

  return (
    <div
      dir={dir}
      data-teacher-screen
      className="fixed inset-0 z-[9990] overflow-y-auto bg-background pb-safe pt-safe text-foreground"
    >
      <header className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-base font-extrabold">
          {phase === 'student' && chosen
            ? t.sessionsOf.replace('{name}', chosen.name)
            : phase === 'roster' ? t.rosterTitle
              : phase === 'join' || phase === 'joined' ? t.joinTitle
                : phase === 'signup' ? t.signUpTitle
                  : phase === 'forgot' || phase === 'forgot-sent' ? t.forgotTitle
                    : phase === 'new-password' ? t.newPasswordTitle
                      : phase === 'inbox' ? t.inboxTitle
                        : t.signInTitle}
        </h1>
        <div className="flex items-center gap-1">
          {phase === 'roster' && (
            <button
              type="button"
              data-teacher-signout
              onClick={() => { void leave(); }}
              aria-label={t.signOut}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            >
              <LogOut size={17} />
            </button>
          )}
          <button
            type="button"
            data-teacher-close
            onClick={phase === 'student' ? () => go('roster') : onClose}
            aria-label={t.back}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 py-4">
        {problem && (
          <p data-teacher-problem className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {problem}
          </p>
        )}
        {info && (
          <p data-teacher-info className="mb-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">
            {info}
          </p>
        )}

        {phase === 'signin' && (
          <form onSubmit={e => { e.preventDefault(); void signIn(); }}>
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">{t.signInWhy}</p>
            <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">{t.privacyNote}</p>

            <button
              type="button"
              data-teacher-google
              disabled={busy}
              onClick={() => { void google(); }}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-40"
            >
              <GoogleMark />
              {t.google}
            </button>

            <div className="mb-4 flex items-center gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {t.orEmail}
              <span className="h-px flex-1 bg-border" />
            </div>

            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-email">
              {t.emailLabel}
            </label>
            <input
              id="tch-email"
              data-teacher-email
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`${field} mb-3`}
            />
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-password">
              {t.passwordLabel}
            </label>
            <div className="relative mb-3">
              <input
                id="tch-password"
                data-teacher-password
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`${field} pe-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="submit" data-teacher-signin disabled={busy} className={`${primary} w-full`}>
              {t.signIn}
            </button>
            <button type="button" data-teacher-forgot onClick={() => go('forgot')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.forgot}
            </button>
            <button type="button" data-teacher-tosignup onClick={() => go('signup')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.toSignUp}
            </button>

            {/* The other half of the errand, for the person on the other side
                of it. A line, not a tab: most people are only ever one of the
                two, and the one they are is not a choice they make twice. */}
            <button
              type="button"
              data-teacher-asstudent
              onClick={() => go('join')}
              className="mt-6 w-full border-t border-border pt-4 text-center text-xs font-bold text-muted-foreground underline"
            >
              {t.asParticipant}
            </button>
          </form>
        )}

        {phase === 'signup' && (
          <form onSubmit={e => { e.preventDefault(); void signUp(); }}>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t.signUpWhy}</p>
            <button
              type="button"
              data-teacher-google
              disabled={busy}
              onClick={() => { void google(); }}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-40"
            >
              <GoogleMark />
              {t.google}
            </button>
            <div className="mb-4 flex items-center gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              {t.orEmail}
              <span className="h-px flex-1 bg-border" />
            </div>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-name">
              {t.nameLabel}
            </label>
            <input
              id="tch-name"
              data-teacher-name
              autoComplete="name"
              value={name}
              onChange={e => setName(e.target.value)}
              className={`${field} mb-3`}
            />
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-email">
              {t.emailLabel}
            </label>
            <input
              id="tch-email"
              data-teacher-email
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`${field} mb-3`}
            />
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-password">
              {t.passwordLabel}
            </label>
            <div className="relative mb-3">
              <input
                id="tch-password"
                data-teacher-password
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`${field} pe-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
              {t.passwordHint.replace('{n}', String(MIN_PASSWORD))}
            </p>
            <button type="submit" data-teacher-signup disabled={busy} className={`${primary} w-full`}>
              {t.signUp}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">{t.confirmNote}</p>
            <button type="button" data-teacher-tosignin onClick={() => go('signin')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.toSignIn}
            </button>
          </form>
        )}

        {phase === 'inbox' && (
          <div data-teacher-inbox>
            <p className="mb-4 text-sm leading-relaxed">{t.inboxBody.replace('{email}', email.trim())}</p>
            <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">{t.inboxSpam}</p>
            <button type="button" data-teacher-resend disabled={busy} onClick={() => { void resend(); }} className={`${primary} w-full`}>
              {t.resend}
            </button>
            <button type="button" onClick={() => go('signin')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.toSignIn}
            </button>
          </div>
        )}

        {phase === 'forgot' && (
          <form onSubmit={e => { e.preventDefault(); void forgot(); }}>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t.forgotBody}</p>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-email">
              {t.emailLabel}
            </label>
            <input
              id="tch-email"
              data-teacher-email
              type="email"
              dir="ltr"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`${field} mb-3`}
            />
            <button type="submit" data-teacher-sendreset disabled={busy} className={`${primary} w-full`}>
              {t.sendReset}
            </button>
            <button type="button" onClick={() => go('signin')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.toSignIn}
            </button>
          </form>
        )}

        {phase === 'forgot-sent' && (
          <div data-teacher-resetsent>
            <p className="mb-4 text-sm leading-relaxed">{t.resetSent.replace('{email}', email.trim())}</p>
            <p className="mb-4 text-[11px] leading-relaxed text-muted-foreground">{t.inboxSpam}</p>
            <button type="button" onClick={() => go('signin')} className="mt-3 block w-full text-center text-xs font-bold text-muted-foreground underline">
              {t.toSignIn}
            </button>
          </div>
        )}

        {phase === 'new-password' && (
          <form onSubmit={e => { e.preventDefault(); void savePassword(); }}>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{t.newPasswordBody}</p>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-password">
              {t.passwordLabel}
            </label>
            <div className="relative mb-3">
              <input
                id="tch-password"
                data-teacher-password
                dir="ltr"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={`${field} pe-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? t.hidePassword : t.showPassword}
                className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="-mt-2 mb-3 text-[11px] text-muted-foreground">
              {t.passwordHint.replace('{n}', String(MIN_PASSWORD))}
            </p>
            <button type="submit" data-teacher-savepassword disabled={busy} className={`${primary} w-full`}>
              {t.savePassword}
            </button>
          </form>
        )}

        {phase === 'join' && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t.joinBody}</p>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-join">
              {t.joinLabel}
            </label>
            <input
              id="tch-join"
              data-join-code
              value={joinCode}
              autoCapitalize="characters"
              onChange={e => setJoinCode(e.target.value)}
              className={`${field} mb-3 text-center text-lg tracking-[0.3em]`}
            />
            <button
              type="button"
              data-join-go
              disabled={busy}
              onClick={() => { void join(); }}
              className={`${primary} w-full`}
            >
              {t.join}
            </button>
          </>
        )}

        {phase === 'joined' && (
          <>
            <p data-joined className="mb-4 text-sm font-bold">
              {t.joinedTo.replace('{name}', joinedTo ?? '')}
            </p>
            {/* Now, and not before: until there is somebody on the other end,
                «what may leave this device» is a question about nothing. */}
            {onAskConsent && (
              <button
                type="button"
                data-joined-consent
                onClick={onAskConsent}
                className={`${primary} w-full`}
              >
                {t.consentTitle}
              </button>
            )}
          </>
        )}

        {phase === 'roster' && (
          <>
            <div className="mb-4 flex gap-2">
              <input
                data-teacher-newname
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t.studentName}
                aria-label={t.studentName}
                className={field}
              />
              <button
                type="button"
                data-teacher-add
                disabled={busy || !newName.trim()}
                onClick={() => { void create(); }}
                aria-label={t.addStudent}
                className={primary}
              >
                <Plus size={16} />
              </button>
            </div>

            {students.length === 0 ? (
              <p data-teacher-empty className="text-xs text-muted-foreground">{t.noStudents}</p>
            ) : (
              <ul className="grid gap-2">
                {students.map(s => (
                  <li key={s.id} data-student={s.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-student-open
                        onClick={() => { void open(s); }}
                        className="flex flex-1 items-center justify-between gap-2 text-start"
                      >
                        <span>
                          <span className="block text-sm font-bold">{s.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {s.joined ? t.joined : t.notJoined}
                          </span>
                        </span>
                        <ChevronRight size={16} className="shrink-0 text-muted-foreground rtl:rotate-180" />
                      </button>
                      <button
                        type="button"
                        data-student-code
                        onClick={() => { void issue(s); }}
                        aria-label={t.issueCode}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                      >
                        <UserPlus size={15} />
                      </button>
                      <button
                        type="button"
                        data-student-remove
                        onClick={() => { void remove(s); }}
                        aria-label={t.remove}
                        className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {issued?.id === s.id && (
                      <div data-issued-code className="mt-2 rounded-lg bg-muted p-3 text-center">
                        {/* Read across a room, so it is set to be read across a room. */}
                        <div className="text-2xl font-extrabold tracking-[0.25em]">{issued.spoken}</div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{t.codeReadOut}</p>
                        <p className="text-[11px] text-muted-foreground">{t.codeExpires}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            data-invite-whatsapp
                            onClick={() => sendOnWhatsapp(issued.code)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-2 py-2 text-xs font-bold text-white"
                          >
                            <Send size={14} />
                            {t.sendWhatsapp}
                          </button>
                          <button
                            type="button"
                            data-invite-copy
                            onClick={() => { void copyInvite(issued.code); }}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-2 text-xs font-bold"
                          >
                            <Copy size={14} />
                            {t.copyLink}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {phase === 'student' && (
          sessions.length === 0 ? (
            <p data-teacher-nosessions className="text-xs text-muted-foreground">{t.noSessions}</p>
          ) : (
            <ul className="grid gap-2">
              {sessions.map(s => (
                <li key={s.id} data-session={s.id} className="rounded-xl border border-border p-3">
                  <div className="text-sm font-bold">
                    {new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(s.startedAt)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.ayahs} {t.ayahsUnit} · {s.pages} {t.pagesUnit} ·{' '}
                    {s.notesHesitation + s.notesMemory + s.notesTajweed + s.notesShakl} {t.faultsUnit}
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
};

export default TeacherScreen;
