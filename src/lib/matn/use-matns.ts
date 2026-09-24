/**
 * Which matns are actually available to recite, right now.
 *
 * The feature appears when its data does, and not before. A matn needs two
 * things to be offerable: a print named in the registry (`isMatnReady`) and a
 * file that passes the loader. Either missing and it is simply not there — no
 * greyed-out entry, no "coming soon". Offering a matn we cannot follow a
 * student through correctly would be worse than not offering it.
 *
 * A missing file is not an error: the text of each matn is supplied and checked
 * by a person (see `docs/add-matn.md`), and a partial deploy can drop one, so
 * either way the matn simply is not there.
 *
 * The fetching is deferred until a matn is actually wanted — see `useMatns`.
 *
 * Note the fetch does **not** 404 when the file is absent. The app is a single
 * page, so an unknown path is answered with the app's own HTML at 200; the
 * request only fails at `res.json()`. Both outcomes mean the same thing here —
 * no matn — and both are caught below.
 */

import { useEffect, useState } from 'react';

import { withBase } from '../asset-url';
import { MatnFileError, matnFromFile, matnFileUrl, type Matn, type MatnFile } from './load';
import { MATN_IDS, isMatnReady, type MatnId } from './registry';

export interface AvailableMatn { id: MatnId; matn: Matn }

async function loadOne(id: MatnId): Promise<AvailableMatn | null> {
  if (!isMatnReady(id)) return null;
  try {
    const res = await fetch(withBase(matnFileUrl(id)));
    if (!res.ok) return null;
    return { id, matn: matnFromFile(await res.json() as MatnFile) };
  } catch (err) {
    // A malformed file is worth saying out loud — somebody edited it and it is
    // now wrong — while a missing one is just a matn that has not shipped yet.
    if (err instanceof MatnFileError) console.error(err.message);
    return null;
  }
}

/**
 * Whether any matn is offerable at all, without fetching anything.
 *
 * The registry alone answers this, and it is what decides whether the matn
 * entry appears. The texts themselves are large — the Shāṭibiyya and Ṭayyibat
 * an-Nashr are a thousand-odd abyāt each, and all seven come to about 150 KB
 * compressed — and fetching them to find out whether to draw one button would
 * make every reciter who never opens a matn pay for the ones who do.
 *
 * That every named matn really does ship a sound file is checked over the whole
 * registry in `matn-files.test.ts`, which is the right place for it: it is a
 * fact about the build, and finding it out again on each device costs a
 * download and cannot be acted on anyway.
 */
export const anyMatnReady = (): boolean => MATN_IDS.some(isMatnReady);

/**
 * The matns, loaded — but only once somebody is going to use one.
 *
 * `enabled` is false until a reciter opens the matn screen or has a session in
 * progress. Once it flips the files are fetched together and kept, so moving
 * between matns in the setup screen is immediate.
 */
export function useMatns(enabled = true): { matns: AvailableMatn[]; loading: boolean } {
  const [matns, setMatns] = useState<AvailableMatn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || matns.length) return;
    let alive = true;
    setLoading(true);
    Promise.all(MATN_IDS.map(loadOne)).then(list => {
      if (!alive) return;
      setMatns(list.filter((m): m is AvailableMatn => m !== null));
      setLoading(false);
    });
    return () => { alive = false; };
    // `matns.length` only ever goes 0 → n, and guards the refetch.
  }, [enabled, matns.length]);

  return { matns, loading };
}
