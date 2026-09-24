import { describe, it, expect, beforeEach } from 'vitest';

import {
  CONSENT_VERSION, NO_CONSENT,
  consentStamp, giveConsent, loadConsent, mayUpload, needsAsking, revokeConsent, saveConsent,
  type Consent,
} from '@/lib/upload-consent';

/**
 * The gate between a person's recitation and somebody else's server.
 *
 * Every test here is a refusal, because every mistake this file could make is
 * the same mistake: something leaves a device that was not meant to. For its
 * whole life this tool uploaded no audio at all — a rule, not a setting — and
 * what replaces a rule has to fail the same way the rule did.
 */

const yes = (over: Partial<Consent> = {}): Consent =>
  ({ ...giveConsent({ data: true, audio: true }, 1_000), ...over });

describe('what the gate lets through', () => {
  it('lets nothing through before anybody is asked', () => {
    expect(mayUpload(NO_CONSENT, 'data')).toBe(false);
    expect(mayUpload(NO_CONSENT, 'audio')).toBe(false);
  });

  it('lets nothing through for a consent that is absent', () => {
    for (const absent of [null, undefined]) {
      expect(mayUpload(absent, 'data')).toBe(false);
      expect(mayUpload(absent, 'audio')).toBe(false);
    }
  });

  it('lets the majlis through once it is agreed', () => {
    const c = giveConsent({ data: true, audio: false });
    expect(mayUpload(c, 'data')).toBe(true);
  });

  /** Agreeing that a summary may be mirrored is not agreeing to a recording. */
  it('does not take agreement about the majlis as agreement about the voice', () => {
    const c = giveConsent({ data: true, audio: false });
    expect(mayUpload(c, 'data')).toBe(true);
    expect(mayUpload(c, 'audio')).toBe(false);
  });

  it('lets the recording through only when that was agreed too', () => {
    const c = giveConsent({ data: true, audio: true });
    expect(mayUpload(c, 'audio')).toBe(true);
  });

  /** A recording with no majlis to hang it on is not what anybody agreed to. */
  it('refuses a recording where the majlis itself was refused', () => {
    const c = giveConsent({ data: false, audio: true });
    expect(c.audio).toBe(false);
    expect(mayUpload(c, 'audio')).toBe(false);
    expect(mayUpload(c, 'data')).toBe(false);
  });
});

describe('when the question changes', () => {
  it('stops counting an answer given to an older wording', () => {
    const old = yes({ version: CONSENT_VERSION - 1 });
    expect(mayUpload(old, 'data')).toBe(false);
    expect(mayUpload(old, 'audio')).toBe(false);
  });

  it('asks again rather than assuming', () => {
    expect(needsAsking(null)).toBe(true);
    expect(needsAsking(NO_CONSENT)).toBe(true);
    expect(needsAsking(yes({ version: CONSENT_VERSION - 1 }))).toBe(true);
    expect(needsAsking(yes())).toBe(false);
  });

  /** Refusing is an answer: it must not be mistaken for never having asked. */
  it('does not keep asking somebody who said no', () => {
    const refused = giveConsent({ data: false, audio: false });
    expect(needsAsking(refused)).toBe(false);
    expect(mayUpload(refused, 'data')).toBe(false);
  });
});

describe('taking it back', () => {
  it('stops everything from that moment', () => {
    const { consent } = revokeConsent(yes());
    expect(mayUpload(consent, 'data')).toBe(false);
    expect(mayUpload(consent, 'audio')).toBe(false);
  });

  /**
   * And says what is owed rather than claiming to have unsent it. A switch
   * that quietly implied erasure would be the dishonest kind.
   */
  it('says what has already gone and now needs deleting', () => {
    expect(revokeConsent(yes()).owed).toEqual({ data: true, audio: true });
    expect(revokeConsent(giveConsent({ data: true, audio: false })).owed)
      .toEqual({ data: true, audio: false });
    expect(revokeConsent(NO_CONSENT).owed).toEqual({ data: false, audio: false });
  });

  it('counts a revocation as having been asked, so nothing nags', () => {
    expect(needsAsking(revokeConsent(yes()).consent)).toBe(false);
  });
});

describe('what is kept on the device', () => {
  beforeEach(() => localStorage.clear());

  it('starts with nothing agreed', () => {
    expect(loadConsent()).toEqual(NO_CONSENT);
    expect(mayUpload(loadConsent(), 'data')).toBe(false);
  });

  it('comes back as it was given', () => {
    const c = giveConsent({ data: true, audio: true }, 5_000);
    saveConsent(c);
    expect(loadConsent()).toEqual(c);
  });

  /** The one file where a lenient parse would be a leak. */
  it('reads anything unexpected as nothing agreed', () => {
    const rubbish = [
      'not json',
      '{}',
      '{"data":"true","at":1,"version":1}',
      '{"data":true,"version":1}',
      '{"data":true,"at":"soon","version":1}',
      '{"data":true,"at":1}',
      'null',
      '[]',
    ];
    for (const raw of rubbish) {
      localStorage.setItem('tajweedoo:upload-consent', raw);
      expect(mayUpload(loadConsent(), 'data')).toBe(false);
      expect(mayUpload(loadConsent(), 'audio')).toBe(false);
    }
  });

  it('never reads back audio permission that was not paired with the majlis', () => {
    localStorage.setItem(
      'tajweedoo:upload-consent',
      JSON.stringify({ data: false, audio: true, at: 1, version: CONSENT_VERSION }),
    );
    expect(loadConsent().audio).toBe(false);
  });
});

describe('the copy that travels with the row', () => {
  it('carries the terms it was sent under', () => {
    const c = giveConsent({ data: true, audio: true }, 1_700_000_000_000);
    const stamp = consentStamp(c);
    expect(stamp.consent).toEqual(c);
    expect(stamp.consent_at).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it('carries no date where nothing was agreed', () => {
    expect(consentStamp(NO_CONSENT).consent_at).toBeNull();
  });
});
