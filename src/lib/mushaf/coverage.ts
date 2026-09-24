import { useEffect, useState } from 'react';
import { manifestUrl, type MushafDefinition } from './registry';

/**
 * Which pages of an edition we actually hold.
 *
 * Read from the edition's own `manifest.json`, written by the import script —
 * never a list hard-coded in the app. A part-imported edition therefore shows
 * real pages where it has them and falls back elsewhere, with no code change.
 */
export interface MushafManifest {
  id: string;
  pageCount: number;
  firstPageNumber: number;
  /** Printed page numbers present on disk. */
  pages: number[];
  source?: string;
  importedAt?: string;
}

const manifests = new Map<string, Set<number>>();
const pending = new Map<string, Promise<Set<number>>>();

export function loadCoverage(m: MushafDefinition): Promise<Set<number>> {
  // An edition that has no page images has nothing to cover; asking its
  // manifest every time would be a request we already know the answer to.
  if (m.pageFormat === 'none') return Promise.resolve(new Set<number>());
  const cached = manifests.get(m.id);
  if (cached) return Promise.resolve(cached);
  const inflight = pending.get(m.id);
  if (inflight) return inflight;

  const p = fetch(manifestUrl(m))
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json: MushafManifest) => {
      const set = new Set(json.pages ?? []);
      manifests.set(m.id, set);
      pending.delete(m.id);
      return set;
    })
    .catch(() => {
      // A manifest that failed to arrive is not a manifest that says "no
      // pages": nothing is remembered, so the next reader asks again rather
      // than the edition looking empty for the rest of the session.
      pending.delete(m.id);
      return new Set<number>();
    });
  pending.set(m.id, p);
  return p;
}

export function hasPageAsset(m: MushafDefinition, printedPage: number): boolean {
  return manifests.get(m.id)?.has(printedPage) ?? false;
}

/** Loads the manifest once and re-renders when it arrives. */
export function useMushafCoverage(m: MushafDefinition | null): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!m || manifests.has(m.id)) return;
    let alive = true;
    loadCoverage(m).then(() => { if (alive) setVersion(v => v + 1); });
    return () => { alive = false; };
  }, [m]);
  return version;
}
