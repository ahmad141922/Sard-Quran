import { describe, it, expect, beforeEach } from 'vitest';

import {
  finishWizard, rememberOperatorRole, roleOfStance, shouldOfferWizard, wizardDone, wizardProfile,
} from '@/lib/wizard-profile';

/**
 * The one line of state the wizard has.
 *
 * Two things are worth more than everything else here: that a wizard which has
 * had its turn can never take another one, and that a *skipped* wizard leaves
 * the tool exactly as it found it. The first is the difference between an
 * onboarding screen and a launch-time obstacle; the second is what makes
 * skipping safe enough to offer at every step.
 */

const KEY = 'tajweedoo:wizard';
const CONTACT_KEY = 'tajweedoo:contact';
const MUSHAF_KEY = 'tajweedoo:mushaf-id';

beforeEach(() => { localStorage.clear(); });

describe('whether the wizard is offered at all', () => {
  it('is offered on a device nothing has ever been done on', () => {
    expect(shouldOfferWizard()).toBe(true);
    expect(wizardDone()).toBe(false);
  });

  it('is never offered again once it has ended, answered or not', () => {
    finishWizard();
    expect(wizardDone()).toBe(true);
    expect(shouldOfferWizard()).toBe(false);
  });

  it('is not offered to somebody who had already chosen a riwaya', () => {
    // The day this ships, every existing reciter has one of these. A first-run
    // screen for them would be the interruption the wizard exists to avoid.
    localStorage.setItem(MUSHAF_KEY, 'hafs-kfqc');
    expect(shouldOfferWizard()).toBe(false);
  });

  it('is not offered to somebody who had already run a majlis', () => {
    localStorage.setItem(CONTACT_KEY, JSON.stringify({ whatsapp: '+201001234567', role: 'listener' }));
    expect(shouldOfferWizard()).toBe(false);
  });

  it('counts a record it cannot parse as done, rather than starting over', () => {
    localStorage.setItem(KEY, 'not json');
    expect(wizardDone()).toBe(true);
    expect(shouldOfferWizard()).toBe(false);
    // Damaged beyond reading is not the same as answered.
    expect(wizardProfile()).toBeNull();
  });

  it('reads a record from a future shape as no answers, not as a broken one', () => {
    localStorage.setItem(KEY, JSON.stringify({ v: 99, done: true, name: 'x' }));
    expect(wizardProfile()).toBeNull();
    expect(shouldOfferWizard()).toBe(false);
  });
});

describe('what a finished wizard leaves behind', () => {
  it('keeps what was answered', () => {
    finishWizard({ name: 'Umar', stance: 'reciter', startSurah: 18 });
    expect(wizardProfile()).toEqual({ name: 'Umar', stance: 'reciter', startSurah: 18 });
  });

  it('leaves nothing at all when nothing was answered', () => {
    finishWizard();
    // An empty answer set, not null: the wizard ran, it simply said nothing.
    expect(wizardProfile()).toEqual({});
  });

  it('trims the name, and drops one that is only spaces', () => {
    finishWizard({ name: '  Umar  ' });
    expect(wizardProfile()).toEqual({ name: 'Umar' });
    localStorage.clear();
    finishWizard({ name: '   ' });
    expect(wizardProfile()).toEqual({});
  });

  it('drops a surah outside the muṣḥaf rather than storing it', () => {
    for (const bad of [0, 115, -3, 4.5, Number.NaN]) {
      localStorage.clear();
      finishWizard({ startSurah: bad });
      expect(wizardProfile(), `startSurah ${bad}`).toEqual({});
    }
  });

  it('keeps the two valid ends of the surah range', () => {
    for (const good of [1, 114]) {
      localStorage.clear();
      finishWizard({ startSurah: good });
      expect(wizardProfile()).toEqual({ startSurah: good });
    }
  });

  it('drops a stance it does not recognise', () => {
    finishWizard({ stance: 'shaykh' as never, name: 'Umar' });
    expect(wizardProfile()).toEqual({ name: 'Umar' });
  });

  it('keeps one bad answer from throwing away the good ones', () => {
    finishWizard({ name: 'Umar', stance: 'nonsense' as never, startSurah: 900 });
    expect(wizardProfile()).toEqual({ name: 'Umar' });
  });
});

describe('the side of the majlis the device is on', () => {
  it('puts the reciter behind the phone unless they said they were listening', () => {
    expect(roleOfStance('solo')).toBe('reciter');
    expect(roleOfStance('reciter')).toBe('reciter');
    expect(roleOfStance('listener')).toBe('listener');
  });

  it('hands the answer to the setup form in the form’s own key', () => {
    finishWizard({ stance: 'listener' });
    expect(JSON.parse(localStorage.getItem(CONTACT_KEY)!).role).toBe('listener');
  });

  it('says nothing about the role when the question was skipped', () => {
    finishWizard({ name: 'Umar' });
    expect(localStorage.getItem(CONTACT_KEY)).toBeNull();
  });

  it('never drops a number somebody had already typed', () => {
    localStorage.setItem(CONTACT_KEY, JSON.stringify({
      whatsapp: '+201001234567', countryCode: 'EG', role: 'listener',
    }));
    rememberOperatorRole('reciter');
    const saved = JSON.parse(localStorage.getItem(CONTACT_KEY)!);
    expect(saved).toEqual({ whatsapp: '+201001234567', countryCode: 'EG', role: 'reciter' });
  });

  it('survives a contact record that is not readable', () => {
    localStorage.setItem(CONTACT_KEY, '{{{');
    expect(() => rememberOperatorRole('reciter')).not.toThrow();
    expect(JSON.parse(localStorage.getItem(CONTACT_KEY)!)).toEqual({
      whatsapp: '', countryCode: '', role: 'reciter',
    });
  });
});
