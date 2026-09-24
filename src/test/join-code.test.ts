import { describe, it, expect } from 'vitest';

import {
  CODE_LENGTH, CODE_LIFETIME_MS,
  codeExpiry, codeIsLive, newJoinCode, normaliseCode, spokenForm,
} from '@/lib/join-code';

/**
 * The code a teacher says out loud so a student's phone can join the roster.
 *
 * Its whole job is to survive one trip through a room: said by a teacher, heard
 * by a child, typed on a phone. So most of what is tested here is tolerance on
 * the way in — and the one thing that must not be tolerant is length, because a
 * half-typed code sent to the server is a guess, and guesses are what the
 * expiry exists to make useless.
 */

describe('a fresh code', () => {
  it('is the length people are asked to type', () => {
    expect(newJoinCode()).toHaveLength(CODE_LENGTH);
  });

  /** Every character has to survive being read aloud and typed back. */
  it('uses no character that is heard or seen as another', () => {
    const banned = /[ILOU]/;
    for (let i = 0; i < 400; i++) expect(newJoinCode()).not.toMatch(banned);
  });

  it('is not the same code twice', () => {
    const seen = new Set(Array.from({ length: 300 }, () => newJoinCode()));
    // Six characters from thirty-two: a collision in three hundred would mean
    // the randomness is not random.
    expect(seen.size).toBe(300);
  });

  it('reads back as what it is', () => {
    for (let i = 0; i < 50; i++) {
      const code = newJoinCode();
      expect(normaliseCode(code)).toBe(code);
    }
  });
});

describe('what somebody types', () => {
  it('accepts it in lower case, as a phone keyboard offers it', () => {
    expect(normaliseCode('a1b2c3')).toBe('A1B2C3');
  });

  it('accepts it written down with spaces or dashes', () => {
    expect(normaliseCode('A1B 2C3')).toBe('A1B2C3');
    expect(normaliseCode('A1B-2C3')).toBe('A1B2C3');
    expect(normaliseCode('  a1b 2c3  ')).toBe('A1B2C3');
  });

  /**
   * The letters left out of the alphabet are exactly the ones somebody types
   * anyway, so each has somewhere to go. Excluding both halves of a pair would
   * turn a mishearing into a dropped character and a code that just fails.
   */
  it('folds the letters it deliberately does not use', () => {
    expect(normaliseCode('OI2345')).toBe('012345');
    expect(normaliseCode('L23456')).toBe('123456');
    expect(normaliseCode('U23456')).toBe('V23456');
    expect(normaliseCode('ol2345')).toBe('012345');
  });

  it('refuses anything that is not a whole code', () => {
    expect(normaliseCode('')).toBeNull();
    expect(normaliseCode('A1B2C')).toBeNull();
    expect(normaliseCode('A1B2C34')).toBeNull();
    expect(normaliseCode('!!! ???')).toBeNull();
  });

  /** A half-code sent to the server is a guess, and guessing is what expiry is for. */
  it('does not quietly pad or trim to the right length', () => {
    expect(normaliseCode('A1B2C3D4')).toBeNull();
  });
});

describe('how long it lasts', () => {
  const t0 = 1_000_000;

  it('is usable the moment it is issued', () => {
    expect(codeIsLive(t0, t0)).toBe(true);
  });

  it('is usable while it is fresh', () => {
    expect(codeIsLive(t0, t0 + CODE_LIFETIME_MS - 1)).toBe(true);
  });

  it('stops on the dot', () => {
    expect(codeIsLive(t0, t0 + CODE_LIFETIME_MS)).toBe(false);
    expect(codeIsLive(t0, t0 + CODE_LIFETIME_MS * 2)).toBe(false);
  });

  /** A clock that has gone backwards is not a licence to accept anything. */
  it('is not usable before it was issued', () => {
    expect(codeIsLive(t0, t0 - 1)).toBe(false);
  });

  it('hands the database the moment it dies', () => {
    expect(codeExpiry(t0).toISOString())
      .toBe(new Date(t0 + CODE_LIFETIME_MS).toISOString());
  });
});

describe('saying it out loud', () => {
  it('breaks it where a person would pause', () => {
    expect(spokenForm('A1B2C3')).toBe('A1B 2C3');
  });

  it('leaves a short one alone', () => {
    expect(spokenForm('A1B')).toBe('A1B');
  });

  /** However it is grouped, it has to type back in. */
  it('reads back as the same code', () => {
    for (let i = 0; i < 50; i++) {
      const code = newJoinCode();
      expect(normaliseCode(spokenForm(code))).toBe(code);
    }
  });
});
