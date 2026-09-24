/**
 * «You may be mixing this with…» — shown beside a verse that was faulted.
 *
 * The most useful thing this whole project can tell a memoriser, when it is
 * right: a slip at a verse with a near-twin elsewhere is usually not a hole in
 * the memorisation but a collision between two passages, and naming the other
 * one turns a recorded symptom into a cause.
 *
 * Which is why the card is careful about how loudly it says it. Strong matches
 * — identical wording, one word changed — are stated. Weaker ones, admitted
 * from the machine-inferred tier only above a threshold, are marked as the
 * possibilities they are. A card that asserts a resemblance that is not there
 * costs more than the card ever earns.
 *
 * **And it is not offered unasked.** The card appears only where the teacher
 * has tagged the place «متشابهات» — the judgement that this slip *was* a
 * collision between two passages is the shaykh's, not a similarity score's.
 * The dataset then answers the question they have already asked, rather than
 * volunteering an opinion at every verse. See `SIMILAR_TAG`.
 *
 * The credit the upstream licence requires lives on the About page, once,
 * instead of under every card — see `AboutPage`.
 */

import React from 'react';
import { Shuffle } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { surahName } from '@/lib/quran-data';
import type { SimilarAyah } from '@/lib/mutashabihat';

/** The tag a teacher puts on a place to ask «what does this resemble?» */
export const SIMILAR_TAG = 'متشابهات';

interface Props {
  matches: SimilarAyah[];
  /** How many to name before stopping. Two is usually the whole story. */
  limit?: number;
}

export const SimilarAyahs: React.FC<Props> = ({ matches, limit = 3 }) => {
  const { t } = useI18n();
  if (!matches.length) return null;
  const shown = matches.slice(0, limit);

  return (
    <div
      data-similar
      className="mt-1.5 rounded-lg border border-sky-600/20 bg-sky-500/[0.06] px-2.5 py-1.5 dark:border-sky-400/20"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-800 dark:text-sky-300">
        <Shuffle size={12} />
        {t('recSimilarTitle')}
      </div>

      <ul className="mt-1 space-y-0.5">
        {shown.map(m => (
          <li key={m.ref} data-similar-ref={m.ref} className="text-[11px] text-foreground">
            {surahName(m.surah)} {m.ayah}
            {/*
              The weaker tier is labelled, never dropped and never dressed up
              as a certainty — see the note at the top of this file.
            */}
            {m.weak && (
              <span data-weak className="text-muted-foreground"> · {t('recSimilarMaybe')}</span>
            )}
          </li>
        ))}
      </ul>

    </div>
  );
};

export default SimilarAyahs;
