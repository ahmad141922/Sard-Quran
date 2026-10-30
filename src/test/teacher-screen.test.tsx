import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

/**
 * The teacher's screen.
 *
 * What is worth pinning is the shape of the errand rather than the styling: a
 * teacher already signed in does not sign in again, a refused code does not
 * quietly look like a signed-in teacher with an empty list, the join code is
 * shown in a form somebody can read across a room, and removing a student takes
 * their outstanding code down with them.
 *
 * Every expected string is read from the same table the screen reads — no
 * Arabic is typed in an assertion here.
 */

const state = {
  signedIn: null as string | null,
  signUpAs: 'confirm' as 'confirm' | 'signed-in' | 'exists',
  students: [] as { id: string; name: string; joinCode: null; joinExpiresAt: null; joined: boolean }[],
  passwordOk: true,
  joinOk: true,
  anonymous: false,
};
const calls = {
  signedInWith: 0, signedUp: 0, resets: 0, google: 0, ensured: 0,
  issued: [] as string[], archived: [] as string[], joined: [] as string[],
};

vi.mock('@/lib/teacher-auth', () => ({
  reasonOf: (r: { reason?: string }) => r.reason ?? null,
  currentUserId: async () => state.signedIn,
  currentIdentity: async () =>
    (state.signedIn ? { id: state.signedIn, anonymous: state.anonymous } : null),
  MIN_PASSWORD: 8,
  joinLink: (code: string) => `https://sard.tajweedoo.com/app/#/join/${code}`,
  signInWithGoogle: async () => { calls.google++; return { ok: true, value: undefined }; },
  signInWithPassword: async () => {
    calls.signedInWith++;
    if (!state.passwordOk) return { ok: false, reason: 'wrong-password' };
    state.signedIn = 'teacher-1';
    return { ok: true, value: undefined };
  },
  signUpWithPassword: async () => { calls.signedUp++; return { ok: true, value: state.signUpAs }; },
  resendConfirmation: async () => ({ ok: true, value: undefined }),
  sendPasswordReset: async () => { calls.resets++; return { ok: true, value: undefined }; },
  setNewPassword: async () => ({ ok: true, value: undefined }),
  ensureTeacherRow: async () => { calls.ensured++; },
  ensureTeacher: async () => { calls.ensured++; return { ok: true, value: { id: 't', name: '' } }; },
  signOut: async () => { state.signedIn = null; },
  joinRoster: async (code: string) => {
    calls.joined.push(code);
    return state.joinOk
      ? { ok: true, value: { studentId: 's1', studentName: TEACHER_NAME, teacherId: 't1' } }
      : { ok: false, reason: 'rejected' };
  },
}));

/** A placeholder name; what matters is that the screen echoes it back. */
const TEACHER_NAME = 'X';

vi.mock('@/lib/roster', () => ({
  listStudents: async () => ({ ok: true, value: state.students }),
  addStudent: async (name: string) => {
    const s = {
      id: `s${state.students.length + 1}`,
      name, joinCode: null, joinExpiresAt: null, joined: false,
    };
    state.students = [s, ...state.students];
    return { ok: true, value: s };
  },
  issueJoinCode: async (id: string) => {
    calls.issued.push(id);
    return { ok: true, value: { code: 'A1B2C3', spoken: 'A1B 2C3', expiresAt: 0 } };
  },
  archiveStudent: async (id: string) => {
    calls.archived.push(id);
    state.students = state.students.filter(s => s.id !== id);
    return { ok: true, value: undefined };
  },
  sessionsOfStudent: async () => ({ ok: true, value: [] }),
}));

import { I18nProvider } from '@/hooks/useI18n';
import TeacherScreen from '../../sard/src/teacher/TeacherScreen';
import { TEACHER_TEXT } from '../../sard/src/teacher/strings';
import { loadEnrolment, saveEnrolment } from '@/lib/enrolment';

const t = TEACHER_TEXT.ar;

const draw = () => {
  const onClose = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar"><TeacherScreen onClose={onClose} /></I18nProvider>,
  );
  return { ...view, onClose };
};

const student = (id: string, name: string) =>
  ({ id, name, joinCode: null, joinExpiresAt: null, joined: false });

beforeEach(() => {
  state.signedIn = null;
  state.students = [];
  state.passwordOk = true;
  state.signUpAs = 'confirm';
  state.joinOk = true;
  state.anonymous = false;
  localStorage.clear();
  calls.signedInWith = 0; calls.signedUp = 0; calls.resets = 0; calls.google = 0; calls.ensured = 0;
  calls.issued = []; calls.archived = []; calls.joined = [];
});
afterEach(cleanup);

describe('arriving signed out', () => {
  const type = (container: HTMLElement, sel: string, value: string) =>
    fireEvent.change(container.querySelector(sel)!, { target: { value } });

  it('offers Google and an email with a password — and no emailed code', () => {
    const { container } = draw();
    expect(container.querySelector('[data-teacher-google]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-email]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-password]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-code]')).toBeNull();
  });

  /** A form with no word of why it wants a password reads as a trap. */
  it('says the account is optional, and what will arrive in the inbox', () => {
    const { container } = draw();
    expect(container.textContent).toContain(t.signInWhy);
    expect(container.textContent).toContain(t.privacyNote);
  });

  it('signs in with a password and goes to the participants', async () => {
    const { container } = draw();
    type(container, '[data-teacher-email]', 'a@b.com');
    type(container, '[data-teacher-password]', 'long enough');
    fireEvent.click(container.querySelector('[data-teacher-signin]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-add]')).toBeTruthy());
    expect(calls.signedInWith).toBe(1);
    expect(calls.ensured).toBeGreaterThan(0);
  });

  /**
   * An account from the days of emailed codes has no password. Refusing it
   * must point at setting one, not at making a second account.
   */
  it('points a refused password at «forgot your password», and stays put', async () => {
    state.passwordOk = false;
    const { container } = draw();
    type(container, '[data-teacher-email]', 'a@b.com');
    type(container, '[data-teacher-password]', 'whatever1');
    fireEvent.click(container.querySelector('[data-teacher-signin]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-problem]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-problem]')!.textContent).toBe(t.wrongPassword);
    expect(container.querySelector('[data-teacher-add]')).toBeNull();
  });

  it('asks a new account to confirm its email before anything else', async () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-tosignup]')!);
    type(container, '[data-teacher-name]', TEACHER_NAME);
    type(container, '[data-teacher-email]', 'a@b.com');
    type(container, '[data-teacher-password]', 'long enough');
    fireEvent.click(container.querySelector('[data-teacher-signup]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-inbox]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-inbox]')!.textContent).toContain('a@b.com');
    expect(container.querySelector('[data-teacher-add]')).toBeNull();
  });

  /** Signing up with an address that has an account must not make a second one. */
  it('sends an address that already has an account back to signing in', async () => {
    state.signUpAs = 'exists';
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-tosignup]')!);
    type(container, '[data-teacher-email]', 'a@b.com');
    type(container, '[data-teacher-password]', 'long enough');
    fireEvent.click(container.querySelector('[data-teacher-signup]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-info]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-info]')!.textContent).toBe(t.exists);
    expect(container.querySelector('[data-teacher-signin]')).toBeTruthy();
  });

  it('sends a password link', async () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-forgot]')!);
    type(container, '[data-teacher-email]', 'a@b.com');
    fireEvent.click(container.querySelector('[data-teacher-sendreset]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-resetsent]')).toBeTruthy());
    expect(calls.resets).toBe(1);
  });

  it('opens on a new password when a reset link brought it here', () => {
    const { container } = render(
      <I18nProvider forceLang="ar"><TeacherScreen onClose={vi.fn()} initialPhase="new-password" /></I18nProvider>,
    );
    expect(container.querySelector('[data-teacher-savepassword]')).toBeTruthy();
  });

  it('hands Google the sign-in', () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-google]')!);
    expect(calls.google).toBe(1);
  });
});

describe('arriving already signed in', () => {
  /** Making somebody sign in again to look at a list is a toll for nothing. */
  it('goes straight to the roster', async () => {
    state.signedIn = 'teacher-1';
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-teacher-add]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-email]')).toBeNull();
    expect(calls.signedInWith).toBe(0);
  });

  it('says plainly when there is nobody on it yet', async () => {
    state.signedIn = 'teacher-1';
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-teacher-empty]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-empty]')!.textContent).toBe(t.noStudents);
  });
});

describe('the roster', () => {
  const signedIn = async () => {
    state.signedIn = 'teacher-1';
    const view = draw();
    await waitFor(() => expect(view.container.querySelector('[data-teacher-add]')).toBeTruthy());
    return view;
  };

  it('adds somebody and shows them', async () => {
    const { container } = await signedIn();
    fireEvent.change(container.querySelector('[data-teacher-newname]')!, {
      target: { value: t.studentName },
    });
    fireEvent.click(container.querySelector('[data-teacher-add]')!);
    await waitFor(() => expect(container.querySelector('[data-student]')).toBeTruthy());
  });

  it('will not add a blank name', async () => {
    const { container } = await signedIn();
    expect((container.querySelector('[data-teacher-add]') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(container.querySelector('[data-teacher-newname]')!, { target: { value: '   ' } });
    expect((container.querySelector('[data-teacher-add]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a code in a form somebody can read out', async () => {
    state.students = [student('s1', t.studentName)];
    const { container } = await signedIn();
    fireEvent.click(container.querySelector('[data-student-code]')!);
    await waitFor(() => expect(container.querySelector('[data-issued-code]')).toBeTruthy());
    const shown = container.querySelector('[data-issued-code]')!.textContent!;
    // Grouped for speaking, and said to be short-lived.
    expect(shown).toContain('A1B 2C3');
    expect(shown).toContain(t.codeExpires);
    expect(calls.issued).toEqual(['s1']);
  });

  /** The participant may not be in the room: the code travels as a link too. */
  it('offers the invitation to send, with the link that carries the code', async () => {
    state.students = [student('s1', t.studentName)];
    const { container } = await signedIn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(container.querySelector('[data-student-code]')!);
    await waitFor(() => expect(container.querySelector('[data-invite-whatsapp]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-invite-whatsapp]')!);
    const url = decodeURIComponent(String(open.mock.calls[0][0]));
    expect(url).toContain('https://wa.me/');
    expect(url).toContain('https://sard.tajweedoo.com/app/#/join/A1B2C3');
    open.mockRestore();
  });

  /** An outstanding code must not stay on screen for somebody who has left. */
  it('takes the code away with the student', async () => {
    state.students = [student('s1', t.studentName)];
    const { container } = await signedIn();
    fireEvent.click(container.querySelector('[data-student-code]')!);
    await waitFor(() => expect(container.querySelector('[data-issued-code]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-student-remove]')!);
    await waitFor(() => expect(container.querySelector('[data-issued-code]')).toBeNull());
    expect(calls.archived).toEqual(['s1']);
  });

  it('opens a student, and comes back', async () => {
    state.students = [student('s1', t.studentName)];
    const { container } = await signedIn();
    fireEvent.click(container.querySelector('[data-student-open]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-nosessions]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-teacher-close]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-add]')).toBeTruthy());
  });

  it('signs out back to the email', async () => {
    const { container } = await signedIn();
    fireEvent.click(container.querySelector('[data-teacher-signout]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-email]')).toBeTruthy());
  });
});

describe('the student side of the same door', () => {
  it('is offered to somebody who is not a teacher', () => {
    const { container } = draw();
    expect(container.querySelector('[data-teacher-asstudent]')).toBeTruthy();
  });

  it('asks for the code the teacher read out', () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-asstudent]')!);
    expect(container.querySelector('[data-join-code]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-email]')).toBeNull();
  });

  it('says whose list it landed on', async () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-asstudent]')!);
    fireEvent.change(container.querySelector('[data-join-code]')!, { target: { value: 'a1b2c3' } });
    fireEvent.click(container.querySelector('[data-join-go]')!);
    await waitFor(() => expect(container.querySelector('[data-joined]')).toBeTruthy());
    expect(calls.joined).toEqual(['a1b2c3']);
  });

  /** A code that did not work must not look like having joined. */
  it('says so when the code is refused, and stays on the form', async () => {
    state.joinOk = false;
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-asstudent]')!);
    fireEvent.change(container.querySelector('[data-join-code]')!, { target: { value: 'zzzzzz' } });
    fireEvent.click(container.querySelector('[data-join-go]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-problem]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-problem]')!.textContent).toBe(t.joinFailed);
    expect(container.querySelector('[data-joined]')).toBeNull();
    expect(container.querySelector('[data-join-code]')).toBeTruthy();
  });
});

describe("a student's phone", () => {
  /**
   * It is signed in too — anonymously, from joining. Being signed in is not
   * being a teacher, and treating it as one would open this phone on an empty
   * roster of its own.
   */
  it('is not shown a roster just because it is signed in', async () => {
    state.signedIn = 'device-1';
    state.anonymous = true;
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-teacher-email]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-add]')).toBeNull();
  });

  it('opens on whose list it is on, once it has joined', async () => {
    state.signedIn = 'device-1';
    state.anonymous = true;
    saveEnrolment({ studentId: 's1', studentName: TEACHER_NAME, teacherId: 't1' });
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-joined]')).toBeTruthy());
    expect(container.querySelector('[data-joined]')!.textContent)
      .toBe(t.joinedTo.replace('{name}', TEACHER_NAME));
  });

  it("remembers joining, so the next majlis is this student's", async () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-asstudent]')!);
    fireEvent.change(container.querySelector('[data-join-code]')!, { target: { value: 'a1b2c3' } });
    fireEvent.click(container.querySelector('[data-join-go]')!);
    await waitFor(() => expect(container.querySelector('[data-joined]')).toBeTruthy());
    expect(loadEnrolment()!.studentId).toBe('s1');
  });

  it('remembers nothing when the code is refused', async () => {
    state.joinOk = false;
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-teacher-asstudent]')!);
    fireEvent.change(container.querySelector('[data-join-code]')!, { target: { value: 'zzzzzz' } });
    fireEvent.click(container.querySelector('[data-join-go]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-problem]')).toBeTruthy());
    expect(loadEnrolment()).toBeNull();
  });
});
