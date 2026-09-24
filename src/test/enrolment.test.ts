import { describe, it, expect, beforeEach } from 'vitest';

import { clearEnrolment, loadEnrolment, saveEnrolment, studentIdFor } from '@/lib/enrolment';

/**
 * Which roster a phone is on, and so whose recitation a session is.
 *
 * The mistake worth testing for is attributing a recitation to the wrong
 * student — so a record that cannot be read in full is not read at all, and
 * the choice a teacher made on their own phone always wins over the phone's
 * own enrolment.
 */

beforeEach(() => localStorage.clear());

const joined = { studentId: 'stu-1', studentName: 'n', teacherId: 't-1' };

describe('what is kept', () => {
  it('is nothing on a phone that never joined', () => {
    expect(loadEnrolment()).toBeNull();
  });

  it('comes back as it was saved, with when', () => {
    saveEnrolment(joined, 1_000);
    expect(loadEnrolment()).toEqual({ ...joined, joinedAt: 1_000 });
  });

  /** One roster per phone, as the database has it. */
  it('is replaced, not added to, by joining again', () => {
    saveEnrolment(joined, 1_000);
    saveEnrolment({ ...joined, studentId: 'stu-2' }, 2_000);
    expect(loadEnrolment()!.studentId).toBe('stu-2');
  });

  it('is gone once cleared', () => {
    saveEnrolment(joined);
    clearEnrolment();
    expect(loadEnrolment()).toBeNull();
  });

  /** Half a record would attribute a recitation to somebody by guesswork. */
  it('reads anything incomplete as not joined', () => {
    for (const raw of [
      'not json', '{}', 'null',
      '{"studentId":"s","joinedAt":1}',
      '{"teacherId":"t","joinedAt":1}',
      '{"studentId":"","teacherId":"t","joinedAt":1}',
      '{"studentId":"s","teacherId":"t"}',
      '{"studentId":"s","teacherId":"t","joinedAt":"today"}',
    ]) {
      localStorage.setItem('tajweedoo:enrolment', raw);
      expect(loadEnrolment()).toBeNull();
    }
  });
});

describe('whose recitation a session is', () => {
  it('is the student a teacher picked on their own phone', () => {
    expect(studentIdFor({ rosterStudentId: 'picked' }, null)).toBe('picked');
  });

  /** A teacher's phone that has also joined a roster still means who was picked. */
  it('prefers the pick to the phone\'s own enrolment', () => {
    expect(studentIdFor({ rosterStudentId: 'picked' }, { studentId: 'mine' })).toBe('picked');
  });

  it('is the phone\'s own student when nobody was picked', () => {
    expect(studentIdFor({}, { studentId: 'mine' })).toBe('mine');
  });

  it('is nobody\'s when neither says', () => {
    expect(studentIdFor({}, null)).toBeNull();
  });
});
