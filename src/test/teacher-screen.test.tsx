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
  students: [] as { id: string; name: string; joinCode: null; joinExpiresAt: null; joined: boolean }[],
  confirmOk: true,
  joinOk: true,
  anonymous: false,
};
const calls = {
  requested: 0, confirmed: 0, ensured: 0,
  issued: [] as string[], archived: [] as string[], joined: [] as string[],
};

vi.mock('@/lib/teacher-auth', () => ({
  reasonOf: (r: { reason?: string }) => r.reason ?? null,
  currentUserId: async () => state.signedIn,
  currentIdentity: async () =>
    (state.signedIn ? { id: state.signedIn, anonymous: state.anonymous } : null),
  requestSignInCode: async () => { calls.requested++; return { ok: true, value: undefined }; },
  confirmSignInCode: async () => {
    calls.confirmed++;
    if (!state.confirmOk) return { ok: false, reason: 'rejected' };
    state.signedIn = 'teacher-1';
    return { ok: true, value: undefined };
  },
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
  state.confirmOk = true;
  state.joinOk = true;
  state.anonymous = false;
  localStorage.clear();
  calls.requested = 0; calls.confirmed = 0; calls.ensured = 0;
  calls.issued = []; calls.archived = []; calls.joined = [];
});
afterEach(cleanup);

describe('arriving signed out', () => {
  it('asks for an email first', () => {
    const { container } = draw();
    expect(container.querySelector('[data-teacher-email]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-code]')).toBeNull();
  });

  it('asks for the emailed code once one is sent', async () => {
    const { container } = draw();
    fireEvent.change(container.querySelector('[data-teacher-email]')!, {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(container.querySelector('[data-teacher-send]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-code]')).toBeTruthy());
    expect(calls.requested).toBe(1);
  });

  /** A refused code must not look like a signed-in teacher with no students. */
  it('says so when the code is refused, and stays put', async () => {
    state.confirmOk = false;
    const { container } = draw();
    fireEvent.change(container.querySelector('[data-teacher-email]')!, {
      target: { value: 'a@b.com' },
    });
    fireEvent.click(container.querySelector('[data-teacher-send]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-code]')).toBeTruthy());
    fireEvent.click(container.querySelector('[data-teacher-confirm]')!);
    await waitFor(() => expect(container.querySelector('[data-teacher-problem]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-code]')).toBeTruthy();
    expect(container.querySelector('[data-teacher-add]')).toBeNull();
  });
});

describe('arriving already signed in', () => {
  /** Making somebody sign in again to look at a list is a toll for nothing. */
  it('goes straight to the roster', async () => {
    state.signedIn = 'teacher-1';
    const { container } = draw();
    await waitFor(() => expect(container.querySelector('[data-teacher-add]')).toBeTruthy());
    expect(container.querySelector('[data-teacher-email]')).toBeNull();
    expect(calls.requested).toBe(0);
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
