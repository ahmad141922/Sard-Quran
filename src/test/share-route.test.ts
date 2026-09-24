import { describe, it, expect } from 'vitest';

import { routeFor } from '../../sard/src/route';
import { SHARE_PAGE_URL, shareUrl } from '@/lib/share-link';

/**
 * That a shared link actually opens the shared report.
 *
 * Everything else about sharing was built and tested — the sealing, the key in
 * the fragment, the store that cannot read what it holds, the screen that draws
 * it — and none of it was reachable, because nothing routed the path the links
 * pointed at. Worse, they pointed at the wrong path: `/r` on the root of the
 * domain, which the landing page owns.
 */

describe('the link a parent is sent', () => {
  it('points inside the app, not at the landing page that owns the root', () => {
    expect(new URL(SHARE_PAGE_URL).pathname).toBe('/app/r');
  });

  it('is served by the app shell, which the site already routes', () => {
    // `_redirects` carries `/app/* -> /app/index.html 200`, so this path needs
    // no rule of its own. Anything outside `/app/` would.
    expect(new URL(SHARE_PAGE_URL).pathname.startsWith('/app/')).toBe(true);
  });

  it('opens the shared report and nothing else', async () => {
    const sealed = {
      id: 'abc', key: 'def', payload: 'x', expiresAt: 0,
    };
    const url = new URL(shareUrl(sealed));
    expect(routeFor(url.pathname, url.hash)).toBe('shared');
  });

  /** The key rides in the fragment; the route must not need the query. */
  it('routes on the path alone, so the key never has to be in the URL a server sees', () => {
    expect(routeFor('/app/r', '')).toBe('shared');
    expect(routeFor('/app/r', '#anything.atall')).toBe('shared');
  });
});

describe('the other screens still route as they did', () => {
  it('serves the certificate its own path, as a QR square prints it', () => {
    expect(routeFor('/cert', '')).toBe('cert');
    expect(routeFor('/app/cert/', '')).toBe('cert');
  });

  it('keeps admin and about on fragments, which never leave the browser', () => {
    expect(routeFor('/app/', '#/admin')).toBe('admin');
    expect(routeFor('/app/', '#/about')).toBe('about');
  });

  it('gives everything else the tool itself', () => {
    expect(routeFor('/app/', '')).toBe('app');
    expect(routeFor('/app/index.html', '#')).toBe('app');
    expect(routeFor('/', '')).toBe('app');
  });

  /**
   * A path merely containing the letter is not the shared report — `/reader`
   * and `/quran` must not be swallowed by a one-character route.
   */
  it('does not mistake any path ending in r for a shared report', () => {
    expect(routeFor('/app/reader', '')).toBe('app');
    expect(routeFor('/app/tafsir', '')).toBe('app');
  });
});
