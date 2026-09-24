import { pageAssetUrl, type MushafDefinition } from './registry';

/**
 * Fetches page assets on demand, keeps a few in memory, and warms the
 * neighbours.
 *
 * The whole muṣḥaf is hundreds of megabytes, so it is never precached with the
 * app. A page is fetched the first time it is opened and stays available after
 * that — including offline, once the service worker has seen it.
 */

/** Pages either side of the current one to warm. Turning a page is the common act. */
const PREFETCH_RADIUS = 1;
/** Enough for a comfortable back-and-forth without holding the book in memory. */
const MAX_CACHED = 12;

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function evictIfNeeded() {
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function load(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit !== undefined) {
    // Refresh recency.
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const pending = inflight.get(url);
  if (pending) return pending;

  const p = fetch(url)
    .then(r => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${url}`))))
    .then(text => {
      cache.set(url, text);
      evictIfNeeded();
      inflight.delete(url);
      return text;
    })
    .catch(err => { inflight.delete(url); throw err; });
  inflight.set(url, p);
  return p;
}

export function getPage(m: MushafDefinition, printedPage: number): Promise<string> {
  return load(pageAssetUrl(m, printedPage));
}

/** Warms the neighbours. Failures are silent — this is an optimisation. */
export function prefetchAround(m: MushafDefinition, printedPage: number): void {
  const last = m.firstPageNumber + m.pageCount - 1;
  for (let d = 1; d <= PREFETCH_RADIUS; d++) {
    for (const p of [printedPage - d, printedPage + d]) {
      if (p < m.firstPageNumber || p > last) continue;
      const url = pageAssetUrl(m, p);
      if (cache.has(url) || inflight.has(url)) continue;
      load(url).catch(() => { /* a warm-up that fails costs nothing */ });
    }
  }
}

export function isCached(m: MushafDefinition, printedPage: number): boolean {
  return cache.has(pageAssetUrl(m, printedPage));
}

/** Test seam. */
export function __clearPageCache() { cache.clear(); inflight.clear(); }
