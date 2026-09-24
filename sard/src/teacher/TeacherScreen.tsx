import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, LogOut, Plus, UserPlus, X } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import {
  confirmSignInCode, currentIdentity, ensureTeacher, joinRoster, reasonOf, requestSignInCode,
  signOut,
} from '@/lib/teacher-auth';
import { loadEnrolment, saveEnrolment } from '@/lib/enrolment';
import {
  addStudent, archiveStudent, issueJoinCode, listStudents, sessionsOfStudent,
  type Student, type StudentSession,
} from '@/lib/roster';
import { teacherText } from './strings';

/**
 * The muqri's own screen: signing in, the roster, and one student's record.
 *
 * ## Why it is one screen and not three
 *
 * Because it is one errand. A teacher opens this to look at a student, and the
 * signing-in is the toll on the way — not a destination with its own place in
 * the app. Three screens would mean three ways in and two ways to be somewhere
 * you did not mean to be.
 *
 * ## Why nothing here is on the way to reciting
 *
 * The tool's first promise is that a majlis works with no network and no
 * account. So this whole screen is a door off the home screen that nobody has
 * to open: reciting alone never asks for any of it, and a teacher who never
 * signs in loses nothing they had.
 *
 * ## Why the code is shown as large as it is
 *
 * It is read aloud across a room, often to a child, and then typed on a phone
 * that is not in your hand. Grouped, spaced, and big enough to read at arm's
 * length is the whole design — see `spokenForm` in `join-code.ts`.
 */

type Phase = 'email' | 'code' | 'roster' | 'student' | 'join' | 'joined';

export const TeacherScreen: React.FC<{
  onClose: () => void;
  /**
   * Opens the question about what may leave the device.
   *
   * Raised here rather than asked here, because joining a roster is exactly the
   * moment it becomes a real question — before that there is nobody for
   * anything to be uploaded *to*, and asking would be asking about nothing.
   */
  onAskConsent?: () => void;
}> = ({ onClose, onAskConsent }) => {
  const { lang, dir } = useI18n();
  const t = teacherText(lang);

  const [phase, setPhase] = useState<Phase>('email');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  const [students, setStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState('');
  const [issued, setIssued] = useState<{ id: string; spoken: string } | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joinedTo, setJoinedTo] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Student | null>(null);
  const [sessions, setSessions] = useState<StudentSession[]>([]);

  const refresh = useCallback(async () => {
    const r = await listStudents();
    if (r.ok) setStudents(r.value);
  }, []);

  /*
   * Where to open. A teacher who signed in last week is still signed in, and
   * goes straight to the list. A student's phone is signed in too — anonymously,
   * from joining — so being signed in is not enough: that phone opens on whose
   * list it is on, never on an empty roster of its own.
   */
  useEffect(() => {
    void (async () => {
      const me = await currentIdentity();
      if (me && !me.anonymous) {
        setPhase('roster');
        await refresh();
        return;
      }
      const on = loadEnrolment();
      if (on) { setJoinedTo(on.studentName); setPhase('joined'); }
    })();
  }, [refresh]);

  const say = (result: { ok: boolean }, bad = t.signInFailed) => {
    const reason = reasonOf(result as never);
    setProblem(reason === 'offline' ? t.offline : reason === 'bad-input' ? bad : t.signInFailed);
  };

  const send = async () => {
    setBusy(true); setProblem(null);
    const r = await requestSignInCode(email);
    setBusy(false);
    if (!r.ok) return say(r, t.badEmail);
    setPhase('code');
  };

  const confirm = async () => {
    setBusy(true); setProblem(null);
    const r = await confirmSignInCode(email, code);
    if (!r.ok) { setBusy(false); return say(r, t.badCode); }
    // The row may be missing because this is a new account, or because it was
    // deleted; both want the same repair, so it runs on every sign-in.
    await ensureTeacher(name);
    setBusy(false);
    setPhase('roster');
    await refresh();
  };

  const leave = async () => {
    await signOut();
    setStudents([]); setChosen(null); setPhase('email'); setCode('');
  };

  /*
   * The student's half of the same errand. It is on this screen rather than its
   * own because «connect me to my halaqa» is one thing a person wants, and which
   * side of it they are on is a fact about them, not a menu they should have to
   * navigate.
   */
  const join = async () => {
    setBusy(true); setProblem(null);
    const r = await joinRoster(joinCode);
    setBusy(false);
    if (!r.ok) { setProblem(t.joinFailed); return; }
    // Kept, because from here every majlis on this phone is this student's —
    // see `enrolment.ts` — and the next visit should open on it.
    saveEnrolment(r.value);
    setJoinedTo(r.value.studentName);
    setPhase('joined');
  };

  const create = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const r = await addStudent(newName);
    setBusy(false);
    if (!r.ok) return say(r);
    setNewName('');
    await refresh();
  };

  const issue = async (student: Student) => {
    setBusy(true);
    const r = await issueJoinCode(student.id);
    setBusy(false);
    if (!r.ok) return say(r);
    setIssued({ id: student.id, spoken: r.value.spoken });
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
            onClick={phase === 'student' ? () => setPhase('roster') : onClose}
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

        {phase === 'email' && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t.signInWhy}</p>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-email">
              {t.emailLabel}
            </label>
            <input
              id="tch-email"
              data-teacher-email
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className={`${field} mb-3`}
            />
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-name">
              {t.nameLabel}
            </label>
            <input
              id="tch-name"
              data-teacher-name
              value={name}
              onChange={e => setName(e.target.value)}
              className={`${field} mb-3`}
            />
            <button
              type="button"
              data-teacher-send
              disabled={busy}
              onClick={() => { void send(); }}
              className={`${primary} w-full`}
            >
              {t.sendCode}
            </button>

            {/* The other half of the errand, for the person on the other side
                of it. A line, not a tab: most people are only ever one of the
                two, and the one they are is not a choice they make twice. */}
            <button
              type="button"
              data-teacher-asstudent
              onClick={() => { setProblem(null); setPhase('join'); }}
              className="mt-4 w-full text-center text-xs font-bold text-muted-foreground underline"
            >
              {t.joinTitle}
            </button>
          </>
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

        {phase === 'code' && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{t.codeSent}</p>
            <label className="mb-1 block text-[11px] text-muted-foreground" htmlFor="tch-code">
              {t.codeLabel}
            </label>
            <input
              id="tch-code"
              data-teacher-code
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className={`${field} mb-3 text-center text-lg tracking-[0.3em]`}
            />
            <button
              type="button"
              data-teacher-confirm
              disabled={busy}
              onClick={() => { void confirm(); }}
              className={`${primary} w-full`}
            >
              {t.confirm}
            </button>
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
