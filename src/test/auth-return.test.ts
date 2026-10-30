import { describe, it, expect } from 'vitest';

import { arrivalFrom } from '@/lib/auth-return';

/** What a link the tool was opened with asks for — read before anything else. */
describe('the link the tool opened with', () => {
  it('is an invitation to join', () => {
    expect(arrivalFrom('#/join/A1B2C3')).toEqual({ kind: 'join', code: 'A1B2C3' });
  });

  it('is a confirmation link, or the way back from Google', () => {
    expect(arrivalFrom('#access_token=x&refresh_token=y&type=signup')).toEqual({ kind: 'signed-in' });
  });

  it('is a password link', () => {
    expect(arrivalFrom('#access_token=x&refresh_token=y&type=recovery')).toEqual({ kind: 'recovery' });
  });

  /** An expired link must say so, not drop the reader on the home screen. */
  it('is a link that has gone stale', () => {
    expect(arrivalFrom('#error=access_denied&error_code=otp_expired&error_description=x'))
      .toEqual({ kind: 'expired' });
  });

  it('is nothing at all on an ordinary visit, or on a screen of the tool', () => {
    expect(arrivalFrom('')).toBeNull();
    expect(arrivalFrom('#/admin')).toBeNull();
    expect(arrivalFrom('#/about')).toBeNull();
  });

  it('is a return from Google when the tool left for it, even with no fragment', () => {
    expect(arrivalFrom('', true)).toEqual({ kind: 'signed-in' });
  });
});
