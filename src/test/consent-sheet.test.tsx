import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import ConsentSheet from '../../sard/src/teacher/ConsentSheet';
import { loadConsent, mayUpload, needsAsking, giveConsent, saveConsent } from '@/lib/upload-consent';
import { TEACHER_TEXT } from '../../sard/src/teacher/strings';

/**
 * The asking, which is where the rule is most easily undone.
 *
 * `upload-consent.test.ts` proves the rule and `upload-gate.test.ts` proves
 * nothing gets past it. What is left to get wrong is the screen: a pre-ticked
 * box, a recording switch that stands on its own, or a refusal that is not
 * recorded and so asks again tomorrow.
 *
 * No Arabic is typed here — every expected string is read from the same table
 * the screen reads.
 */

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const draw = (onChange = vi.fn()) => {
  const onClose = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar">
      <ConsentSheet open onClose={onClose} onChange={onChange} />
    </I18nProvider>,
  );
  return { ...view, onClose, onChange };
};

const box = (c: HTMLElement, which: 'data' | 'audio') =>
  c.querySelector(`[data-consent-${which}]`) as HTMLInputElement;

describe('the first time it is shown', () => {
  /** A pre-ticked box is an answer somebody else gave. */
  it('has nothing ticked', () => {
    const { container } = draw();
    expect(box(container, 'data').checked).toBe(false);
    expect(box(container, 'audio').checked).toBe(false);
  });

  it('will not let anything be agreed until something is ticked', () => {
    const { container } = draw();
    const agree = container.querySelector('[data-consent-accept]') as HTMLButtonElement;
    expect(agree.disabled).toBe(true);
  });

  /** Agreeing to a summary is not agreeing to a recording of your voice. */
  it('does not offer the recording until the session itself is agreed', () => {
    const { container } = draw();
    expect(box(container, 'audio').disabled).toBe(true);
    fireEvent.click(box(container, 'data'));
    expect(box(container, 'audio').disabled).toBe(false);
  });

  it('takes the recording back off when the session is unticked', () => {
    const { container } = draw();
    fireEvent.click(box(container, 'data'));
    fireEvent.click(box(container, 'audio'));
    expect(box(container, 'audio').checked).toBe(true);
    fireEvent.click(box(container, 'data'));
    expect(box(container, 'audio').checked).toBe(false);
  });
});

describe('agreeing', () => {
  it('turns on exactly what was on screen', () => {
    const { container, onClose } = draw();
    fireEvent.click(box(container, 'data'));
    fireEvent.click(container.querySelector('[data-consent-accept]')!);
    const saved = loadConsent();
    expect(mayUpload(saved, 'data')).toBe(true);
    expect(mayUpload(saved, 'audio')).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('turns on the recording only when it was ticked too', () => {
    const { container } = draw();
    fireEvent.click(box(container, 'data'));
    fireEvent.click(box(container, 'audio'));
    fireEvent.click(container.querySelector('[data-consent-accept]')!);
    expect(mayUpload(loadConsent(), 'audio')).toBe(true);
  });

  it('tells the caller without it having to read the record again', () => {
    const { container, onChange } = draw();
    fireEvent.click(box(container, 'data'));
    fireEvent.click(container.querySelector('[data-consent-accept]')!);
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0].data).toBe(true);
  });
});

describe('refusing', () => {
  /** «No» and «not asked» must not look the same, or it asks again tomorrow. */
  it('is recorded as an answer', () => {
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-consent-decline]')!);
    expect(needsAsking(loadConsent())).toBe(false);
    expect(mayUpload(loadConsent(), 'data')).toBe(false);
  });
});

describe('once it has been answered', () => {
  it('says what is happening rather than asking again', () => {
    saveConsent(giveConsent({ data: true, audio: false }));
    const { container } = draw();
    expect(container.querySelector('[data-consent-data]')).toBeNull();
    expect(container.querySelector('[data-consent-state]')!.textContent)
      .toBe(TEACHER_TEXT.ar.consentOn);
  });

  it('stops everything when it is withdrawn', () => {
    saveConsent(giveConsent({ data: true, audio: true }));
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-consent-revoke]')!);
    expect(mayUpload(loadConsent(), 'data')).toBe(false);
    expect(mayUpload(loadConsent(), 'audio')).toBe(false);
  });

  /**
   * And says plainly that what already went up is still up. A switch that
   * implied erasure would be the dishonest kind.
   */
  it('does not pretend the withdrawal unsent anything', () => {
    saveConsent(giveConsent({ data: true, audio: true }));
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-consent-revoke]')!);
    expect(container.querySelector('[data-consent-owed]')!.textContent)
      .toBe(TEACHER_TEXT.ar.consentOwed);
  });

  /**
   * Somebody who declined and then opens this deliberately has come to change
   * their mind, so they get the question rather than a switch to withdraw
   * something they never gave. Not being nagged is a matter for the caller,
   * which asks `needsAsking` before opening this at all.
   */
  it('asks again, rather than offering to withdraw a refusal', () => {
    saveConsent(giveConsent({ data: false, audio: false }));
    const { container } = draw();
    expect(container.querySelector('[data-consent-data]')).toBeTruthy();
    expect(container.querySelector('[data-consent-revoke]')).toBeNull();
    expect(container.querySelector('[data-consent-owed]')).toBeNull();
  });

  it('owes nothing after withdrawing a consent that only covered the session', () => {
    saveConsent(giveConsent({ data: true, audio: false }));
    const { container } = draw();
    fireEvent.click(container.querySelector('[data-consent-revoke]')!);
    // The session went up, so it is owed; no recording ever did.
    expect(container.querySelector('[data-consent-owed]')).toBeTruthy();
    expect(mayUpload(loadConsent(), 'data')).toBe(false);
  });
});
