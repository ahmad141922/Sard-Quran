/**
 * Where this build's own files live.
 *
 * The tool is served from the root in development and from `/app/` in
 * production, because the landing page owns the root of the domain. Vite
 * rewrites the URLs it generates itself, but a path written as a string in
 * source — `/logos/sard-day.webp`, `/hafs_smart_v8.json` — is invisible to it
 * and would 404 under any base but `/`.
 *
 * So every such path goes through here. One function, and moving the app to a
 * sub-path is a build flag rather than a search-and-replace.
 */

/** Always `/…/`, with both slashes, whatever Vite was configured with. */
export function baseUrl(): string {
  const base = (import.meta.env?.BASE_URL ?? '/') || '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/** `withBase('logos/x.webp')` → `/app/logos/x.webp`. Leading slashes are fine. */
export function withBase(path: string): string {
  return `${baseUrl()}${path.replace(/^\/+/, '')}`;
}

/**
 * Root of the muṣḥaf packages — the one asset group that may live off this
 * origin entirely.
 *
 * Five editions are 1.6 GB of vector pages, which is a bucket's job, not a
 * static site's. `VITE_MUSHAF_BASE_URL` moves them wholesale (`https://…/`),
 * and with it unset they are served from the app's own `/mushafs/`, exactly as
 * in development. Nothing else in the app knows which of the two is in force.
 */
export function mushafRoot(): string {
  const configured = import.meta.env?.VITE_MUSHAF_BASE_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  return withBase('mushafs').replace(/\/+$/, '');
}
