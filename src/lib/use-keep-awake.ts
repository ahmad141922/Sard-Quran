/**
 * Holds the screen on for as long as a session is running.
 *
 * A majlis outlasts any screen timeout: a student reciting a juzʾ says nothing
 * the device counts as activity for twenty minutes at a stretch, and a tablet
 * that sleeps mid-recitation makes the teacher stop listening to wake it —
 * which is the one thing this whole tool exists to avoid.
 *
 * The lock is re-requested when the tab becomes visible again, because the
 * browser drops it whenever the page is hidden and does not give it back.
 *
 * Shared by the muṣḥaf overlay and the matn overlay rather than copied into
 * each: the sentinel has to be released exactly once, and two copies of that
 * bookkeeping would be two chances to leak it.
 */

import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void> } | null;

export function useKeepAwake(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let sentinel: Sentinel = null;
    let released = false;

    const request = async () => {
      try {
        const wl = (navigator as unknown as {
          wakeLock?: { request: (t: string) => Promise<Sentinel> };
        }).wakeLock;
        if (wl) sentinel = await wl.request('screen');
      } catch { /* denied or unsupported — nothing to do */ }
    };

    request();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) request();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => { /* already gone */ });
    };
  }, [enabled]);
}
