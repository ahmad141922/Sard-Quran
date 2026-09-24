import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Whose roster it is.
 *
 * The teacher's id is never an argument to anything here — it is read from the
 * session on every call. That is the whole design, so it is what the tests are
 * about: a student is created against the signed-in teacher and nobody else, a
 * code can only be issued for a student already theirs, and every call refuses
 * outright when nobody is signed in rather than sending a query and letting the
 * database say no.
 *
 * The row policies would catch a wrong id anyway. These tests are about not
 * forming the intent in the first place.
 */

const calls: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
let signedInAs: string | null = 'teacher-1';
/** A joined student's phone signs in too — anonymously. */
let anonymous = false;

/** A chainable stand-in that records rather than talks to anything. */
function builder(table: string, op: string, payload?: unknown) {
  const entry = { table, op, payload, filters: [] as [string, unknown][] };
  calls.push(entry);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.eq = (col: string, val: unknown) => { entry.filters.push([col, val]); return chain; };
  chain.order = self;
  chain.limit = self;
  chain.select = self;
  chain.single = async () => ({ data: { id: 's1', name: 'زينب' }, error: null });
  // Awaiting the chain itself is what a query with no `.single()` does.
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return chain;
}

vi.mock('@/lib/sard-supabase', () => ({
  SARD_ADMIN_FUNCTION: 'sard-admin',
  sardSupabase: {
    auth: {
      getUser: async () => ({
        data: { user: signedInAs ? { id: signedInAs, is_anonymous: anonymous } : null },
      }),
    },
    from: (table: string) => ({
      select: () => builder(table, 'select'),
      insert: (payload: unknown) => builder(table, 'insert', payload),
      update: (payload: unknown) => builder(table, 'update', payload),
    }),
  },
}));

import { addStudent, archiveStudent, issueJoinCode, listStudents } from '@/lib/roster';
import { CODE_LIFETIME_MS, normaliseCode } from '@/lib/join-code';

const lastCall = () => calls.at(-1)!;
const filterFor = (col: string) => lastCall().filters.find(([c]) => c === col)?.[1];

beforeEach(() => { calls.length = 0; signedInAs = 'teacher-1'; anonymous = false; });

describe('adding somebody to the roster', () => {
  it('attaches them to the teacher who is signed in', async () => {
    const r = await addStudent('زينب');
    expect(r.ok).toBe(true);
    expect(lastCall().op).toBe('insert');
    expect((lastCall().payload as { teacher_id: string }).teacher_id).toBe('teacher-1');
  });

  it('refuses an empty name without asking the database', async () => {
    const r = await addStudent('   ');
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses outright when nobody is signed in', async () => {
    signedInAs = null;
    const r = await addStudent('زينب');
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('reading the roster', () => {
  it('asks only for this teacher, and not for the archived', async () => {
    await listStudents();
    expect(filterFor('teacher_id')).toBe('teacher-1');
    expect(filterFor('archived')).toBe(false);
  });

  it('asks nothing at all when nobody is signed in', async () => {
    signedInAs = null;
    expect((await listStudents()).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('issuing a code', () => {
  it('writes one that types back in', async () => {
    const r = await issueJoinCode('s1');
    expect(r.ok).toBe(true);
    const written = (lastCall().payload as { join_code: string }).join_code;
    expect(normaliseCode(written)).toBe(written);
    if (r.ok) expect(r.value.code).toBe(written);
  });

  it('gives it a life, and one that ends', async () => {
    const now = 1_700_000_000_000;
    const r = await issueJoinCode('s1', now);
    const written = (lastCall().payload as { join_expires_at: string }).join_expires_at;
    expect(Date.parse(written)).toBe(now + CODE_LIFETIME_MS);
    if (r.ok) expect(r.value.expiresAt).toBe(now + CODE_LIFETIME_MS);
  });

  /** Belt as well as braces: the policy refuses it too, but we never ask. */
  it('scopes the write to the teacher as well as the student', async () => {
    await issueJoinCode('s1');
    expect(filterFor('id')).toBe('s1');
    expect(filterFor('teacher_id')).toBe('teacher-1');
  });

  it('asks nothing when nobody is signed in', async () => {
    signedInAs = null;
    expect((await issueJoinCode('s1')).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('taking somebody off the roster', () => {
  /** A majlis that happened happened; the list is what stops mentioning them. */
  it('archives rather than deletes', async () => {
    await archiveStudent('s1');
    expect(lastCall().op).toBe('update');
    expect((lastCall().payload as { archived: boolean }).archived).toBe(true);
  });

  /** An outstanding code must not keep working for somebody who has left. */
  it('takes any outstanding code down with them', async () => {
    await archiveStudent('s1');
    const payload = lastCall().payload as { join_code: null; join_expires_at: null };
    expect(payload.join_code).toBeNull();
    expect(payload.join_expires_at).toBeNull();
  });

  it('scopes it to the teacher', async () => {
    await archiveStudent('s1');
    expect(filterFor('teacher_id')).toBe('teacher-1');
  });
});

describe("a student's phone, which is signed in but is not a teacher", () => {
  /**
   * Being signed in is not being a teacher. A phone that joined a roster holds
   * an anonymous identity, and nothing on the roster is its to read or change.
   */
  it('reads no roster and changes nothing', async () => {
    signedInAs = 'device-1';
    anonymous = true;
    expect((await listStudents()).ok).toBe(false);
    expect((await addStudent('x')).ok).toBe(false);
    expect((await issueJoinCode('s1')).ok).toBe(false);
    expect((await archiveStudent('s1')).ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
