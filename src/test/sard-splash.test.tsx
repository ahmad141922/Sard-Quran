import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';

import SardSplash from '../../sard/src/SardSplash';

/**
 * The second the app opens with.
 *
 * There is nothing to load, so the only thing worth asserting is that it
 * **leaves** — on its own, promptly, and immediately if the person touches it.
 * A splash that can fail to end is a splash that can lock somebody out of their
 * own muṣḥaf, which is a far worse outcome than never having animated at all.
 */

afterEach(() => { cleanup(); vi.useRealTimers(); });

const draw = () => {
  const onDone = vi.fn();
  const view = render(<SardSplash onDone={onDone} />);
  return { ...view, onDone };
};

describe('the opening animation', () => {
  it('is there to begin with', () => {
    const { container, onDone } = draw();
    expect(container.querySelector('[data-sard-splash]')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('ends by itself, and well under two seconds', async () => {
    vi.useFakeTimers();
    const { onDone } = draw();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('ends at once when it is touched', () => {
    const { container, onDone } = draw();
    fireEvent.pointerDown(container.querySelector('[data-sard-splash]')!);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /** Touched, then the timer fires: the app must not be told twice. */
  it('says it is done only once', async () => {
    vi.useFakeTimers();
    const { container, onDone } = draw();
    fireEvent.pointerDown(container.querySelector('[data-sard-splash]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing running when it is torn down early', async () => {
    vi.useFakeTimers();
    const { unmount, onDone } = draw();
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onDone).not.toHaveBeenCalled();
  });
});
