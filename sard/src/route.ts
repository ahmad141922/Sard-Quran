/**
 * Which screen a URL asks for.
 *
 * Its own module, and pure, so it can be tested without importing `main.tsx` —
 * which applies the theme, registers a service worker and installs the native
 * recogniser the moment it loads.
 *
 * ## Paths and fragments are not the same thing here
 *
 * Two screens are real **paths**, because they are links somebody was sent
 * rather than places inside the tool: the certificate a QR square prints, and
 * a shared report. Everything else is a fragment, which never leaves the
 * browser — and for the shared report the fragment is also where the
 * decryption key lives, so it must stay that way.
 */

export type Route = 'cert' | 'shared' | 'admin' | 'about' | 'app';

const trimmed = (pathname: string) => pathname.replace(/\/+$/, '');

export function routeFor(pathname: string, hash: string): Route {
  const path = trimmed(pathname);
  if (path.endsWith('/cert')) return 'cert';
  // Deployed under `/app/`, because the landing page owns the root of the
  // domain — see `SHARE_PAGE_URL`.
  if (path.endsWith('/r')) return 'shared';
  if (hash.startsWith('#/admin')) return 'admin';
  if (hash.startsWith('#/about')) return 'about';
  return 'app';
}
