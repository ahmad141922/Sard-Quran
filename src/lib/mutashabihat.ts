/**
 * Verses that read alike, and the one thing this feature must not do.
 *
 * When a student stumbles at a verse that has a near-twin elsewhere, telling
 * them so is worth more than any count: «you may be mixing this with…» names
 * the actual cause instead of recording the symptom. That is the whole idea.
 *
 * **And it only works while the claim is trustworthy.** The upstream dataset
 * classifies 95% of its pairs by a machine measure whose median similarity is
 * 0.30 — verses that merely share a common word. A card that says «you may be
 * confusing 2:15 with 2:174» teaches a student, very quickly, to stop reading
 * the cards. So the shipped index carries only pairs that clear a bar (see
 * `scripts/build-mutashabihat.mjs`), and every match still says which tier it
 * came from so the interface can show a strong one plainly and a weak one as
 * a possibility.
 *
 * The file is fetched on demand, not bundled: it is small, but it is useless
 * until a student actually faults somewhere.
 */

import { withBase } from './asset-url';

/** How one verse resembles another. Ordered strongest first by the builder. */
export interface SimilarAyah {
  /** «18:24» — surah:ayah in the canonical (Ḥafṣ) numbering. */
  ref: string;
  surah: number;
  ayah: number;
  /** The kind of resemblance, as the dataset classified it. */
  type: string;
  /** 0–100. */
  similarity: number;
  /**
   * True for the machine-inferred tier that only cleared a threshold.
   *
   * Shown differently, never hidden: a possibility offered as a certainty is
   * the failure this whole module is arranged to avoid.
   */
  weak: boolean;
}

export interface Attribution { name: string; url: string; license?: string }

export interface MutashabihatIndex {
  attribution: Attribution[];
  /** Every verse that has at least one near-twin. */
  similarTo(surah: number, ayah: number): SimilarAyah[];
  /** How many verses the index knows about — for the credits line. */
  size: number;
}

interface RawMatch { r: string; t: string; s: number; w?: 1 }
interface RawIndex {
  meta: { attribution: Attribution[] };
  byAyah: Record<string, RawMatch[]>;
}

const EMPTY: SimilarAyah[] = [];

export function indexFromFile(raw: RawIndex): MutashabihatIndex {
  const parsed = new Map<string, SimilarAyah[]>();
  for (const [key, matches] of Object.entries(raw.byAyah)) {
    parsed.set(key, matches.map(m => {
      const [surah, ayah] = m.r.split(':').map(Number);
      return { ref: m.r, surah, ayah, type: m.t, similarity: m.s, weak: m.w === 1 };
    }));
  }
  return {
    attribution: raw.meta.attribution,
    size: parsed.size,
    similarTo: (surah, ayah) => parsed.get(`${surah}:${ayah}`) ?? EMPTY,
  };
}

/**
 * Loads the index once per session.
 *
 * A missing file means the feature is simply absent — the same posture the
 * matn loader takes. It is an addition to a report, never something the
 * report depends on, so a fetch that fails must cost nothing.
 */
let pending: Promise<MutashabihatIndex | null> | null = null;

export function loadMutashabihat(): Promise<MutashabihatIndex | null> {
  pending ??= (async () => {
    try {
      const res = await fetch(withBase('mutashabihat.json'));
      if (!res.ok) return null;
      return indexFromFile(await res.json() as RawIndex);
    } catch {
      // Not built, or offline before it was first cached. Nothing is broken.
      return null;
    }
  })();
  return pending;
}

/** For tests, which must not inherit a cached load from another file. */
export function resetMutashabihatCache(): void {
  pending = null;
}
