import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { I18nProvider } from '@/hooks/useI18n';
import RecitationSetupModal from '@/components/board/RecitationSetupModal';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';

/**
 * The setup screen, rendered — which the solo work first shipped without.
 *
 * Hiding the listener's side of the form hid the reciter's **name** with it,
 * because both live in the same block. Every model test still passed: none of
 * them drew the form, so nothing noticed that the one field `canStart`
 * requires had no way to be filled. These are the tests that would have.
 */

afterEach(cleanup);

const draw = (account?: { name: string; side: 'reciter' | 'listener' }) => {
  const onStart = vi.fn();
  const view = render(
    <I18nProvider forceLang="ar">
      <MushafProvider>
        <RecitationSetupModal open onClose={() => {}} onStart={onStart} account={account} />
      </MushafProvider>
    </I18nProvider>,
  );
  const solo = () => {
    const btn = [...view.container.querySelectorAll('button')]
      .find(b => b.textContent?.includes('مراجعة'));
    if (!btn) throw new Error('the review choice is not on screen');
    fireEvent.click(btn);
  };
  return { ...view, onStart, solo };
};

const nameField = (c: HTMLElement) => c.querySelector('#rec-student') as HTMLInputElement | null;
const listenerField = (c: HTMLElement) => c.querySelector('#rec-instructor');
const whatsappFields = (c: HTMLElement) => c.querySelectorAll('[id$="-whatsapp"]');

describe('the setup screen, reciting alone', () => {
  it('still asks for the reciter — the report and the history are about somebody', () => {
    const { container, solo } = draw();
    expect(nameField(container)).toBeTruthy();
    solo();
    expect(nameField(container)).toBeTruthy();
  });

  it('lets that name actually be typed', () => {
    const { container, solo } = draw();
    solo();
    const field = nameField(container)!;
    fireEvent.change(field, { target: { value: 'محمّد' } });
    expect(field.value).toBe('محمّد');
  });

  it('drops the listener', () => {
    const { container, solo } = draw();
    expect(listenerField(container)).toBeTruthy();
    solo();
    expect(listenerField(container)).toBeNull();
  });

  it('keeps both sides by name for a majlis', () => {
    const { container } = draw();
    expect(nameField(container)).toBeTruthy();
    expect(listenerField(container)).toBeTruthy();
  });
});

describe('asking for nothing the tool does not use', () => {
  /** A phone number the tool never sends anything to is the shape of a scam. */
  it('asks for no phone number and no country, in either mode', () => {
    const { container, solo } = draw();
    expect(whatsappFields(container)).toHaveLength(0);
    expect(container.querySelector('[id$="-country"]')).toBeNull();
    solo();
    expect(whatsappFields(container)).toHaveLength(0);
  });
});

describe('a signed-in device', () => {
  it("names the teacher from the account, and does not ask", async () => {
    const { container } = draw({ name: 'الشيخ أحمد', side: 'listener' });
    const field = listenerField(container) as HTMLInputElement;
    await waitFor(() => expect(field.value).toBe('الشيخ أحمد'));
    expect(field.readOnly).toBe(true);
    expect((nameField(container) as HTMLInputElement).readOnly).toBe(false);
  });

  it("names a participant's phone as the reciter", async () => {
    const { container } = draw({ name: 'عائشة', side: 'reciter' });
    const field = nameField(container)!;
    await waitFor(() => expect(field.value).toBe('عائشة'));
    expect(field.readOnly).toBe(true);
  });
});
