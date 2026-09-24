/**
 * The review list: every place this majlis flagged, gathered by verse.
 *
 * The session stores three lists — notes, marks, corrections — because they
 * are three different kinds of fact. A student sitting down to review wants
 * the opposite arrangement: **one line per verse**, with everything that
 * happened there beside it. Without this the student has to read three lists
 * and cross-reference them by number, which is exactly the fussing the tool
 * exists to remove.
 *
 * Ordered by reading order, not by severity: the point is to go through the
 * portion once, in the order it is recited.
 */

import React, { useState } from 'react';

import { useI18n } from '@/hooks/useI18n';
import type { ReviewPlace } from '@/lib/recitation-review';
import type { MutashabihatIndex } from '@/lib/mutashabihat';
import { NOTE_LABEL_KEY, NOTE_STYLE, type NoteSlot } from './recitation-shared';
import SimilarAyahs, { SIMILAR_TAG } from './SimilarAyahs';
import CorrectionList from './CorrectionList';
import PlaceTagRow from './PlaceTagRow';
import { allTags, tagsAt } from '@/lib/place-tags';

interface Props<P> {
  places: ReviewPlace<P>[];
  /** How a place is written for the reader — the caller knows its text. */
  label: (position: P) => string;
  /**
   * Near-twins of a place, when the index has loaded and the caller can say
   * where a position sits in the canonical numbering. Absent for a matn, and
   * absent before the file arrives — the card is an addition, never a
   * dependency.
   */
  similar?: MutashabihatIndex | null;
  canonicalOf?: (position: P) => { surah: number; ayah: number } | null;
  /**
   * Labels that outlive the majlis. Editable here because this is the screen
   * a teacher is looking at when «he is very weak here» occurs to them.
   */
  anchorOf?: (position: P) => number | null;
  /**
   * The words themselves.
   *
   * «البقرة ٢١» tells a student where to go; it does not let them review on
   * the spot. Returning null is a real answer — a position whose conversion
   * into the text's own numbering is not exact must show no text at all
   * rather than the wrong verse.
   */
  textOf?: (position: P) => string | null;
  /** The face that encoding needs — see `textOf` at the call site. */
  textFont?: string;
}

export function ReviewPlaces<P>({
  places, label, similar, canonicalOf, anchorOf, textOf, textFont,
}: Props<P>) {
  const { t } = useI18n();
  // Re-read on every change rather than held in state: the store is a few
  // hundred short strings and a synchronous read is cheaper than a mirror
  // that can fall out of step with it.
  const [tagsVersion, setTagsVersion] = useState(0);
  const tags = anchorOf ? allTags() : null;
  void tagsVersion;
  if (!places.length) return null;

  return (
    <div className="mt-4" data-review-places>
      <div className="mb-0.5 text-xs font-bold text-muted-foreground">
        {t('recReviewList')} · {places.length}
      </div>
      <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
        {t('recReviewListHint')}
      </p>
      <ul className="space-y-1">
        {places.map(place => (
          <li
            key={place.ordinal}
            data-place={place.ordinal}
            className="rounded-lg border border-emerald-900/10 bg-white/50 px-2.5 py-1.5 text-xs dark:border-emerald-100/10 dark:bg-white/[0.04]"
          >
            <div className="font-bold text-foreground">{label(place.position)}</div>

            {/* The verse itself, so the review can start here. */}
            {textOf && (() => {
              const text = textOf(place.position);
              return text ? (
                <p
                  data-ayah-text
                  dir="rtl"
                  style={textFont ? { fontFamily: textFont } : undefined}
                  className="mt-1 text-[15px] leading-[2.1] text-foreground/90"
                >
                  {text}
                </p>
              ) : null;
            })()}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {/*
                Every kind that landed here, each said once with its own count.
                Two hesitations at one verse is a fact about that verse, not
                two lines about it.
              */}
              {tally(place).map(([slot, count]) => (
                <span key={slot} className={`flex items-center gap-1 ${NOTE_STYLE[slot].text}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${NOTE_STYLE[slot].dot}`} aria-hidden />
                  {t(NOTE_LABEL_KEY[slot])}{count > 1 ? ` ×${count}` : ''}
                </span>
              ))}

            </div>
            {/*
              The shaykh's voice, on the line it belongs to.
              It used to sit in a section of its own further down, which said
              «تصحيحات الشيخ» a second time and made the reader match verse
              numbers between two lists to find out which clip was which.
            */}
            {place.corrections.length > 0 && (
              <CorrectionList
                corrections={place.corrections}
                label={() => label(place.position)}
                compact
              />
            )}

            {/* What the teacher wrote, if anything — it is the useful part. */}
            {details(place).map((text, i) => (
              <div key={i} className="mt-0.5 text-[11px] text-muted-foreground">— {text}</div>
            ))}

            {/*
              Only where something actually went wrong. A verse the reciter
              merely marked to revisit does not need to be told it looks like
              another one — that would turn a bookmark into an accusation.
            */}
            {/* Labels on the place, kept beyond this majlis. */}
            {anchorOf && tags && (() => {
              const anchor = anchorOf(place.position);
              return anchor === null ? null : (
                <PlaceTagRow
                  anchorId={anchor}
                  tags={tagsAt(anchor, tags)}
                  onChange={() => setTagsVersion(v => v + 1)}
                />
              );
            })()}

            {/*
              Only where the teacher asked. Tagging a place «متشابهات» is the
              judgement that this slip was a collision between two passages;
              the dataset then answers that question rather than volunteering
              an opinion at every verse the algorithm finds a rhyme in.
            */}
            {similar && canonicalOf && anchorOf && tags && (() => {
              const anchor = anchorOf(place.position);
              if (anchor === null || !tagsAt(anchor, tags).includes(SIMILAR_TAG)) return null;
              const at = canonicalOf(place.position);
              if (!at) return null;
              const matches = similar.similarTo(at.surah, at.ayah);
              return matches.length ? <SimilarAyahs matches={matches} /> : null;
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Kinds present at a place, each with how many times, in a stable order. */
function tally<P>(place: ReviewPlace<P>): [NoteSlot, number][] {
  const counts = new Map<NoteSlot, number>();
  for (const n of place.notes) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
  if (place.marks.length) counts.set('mark', place.marks.length);
  return [...counts.entries()];
}

function details<P>(place: ReviewPlace<P>): string[] {
  return [...place.notes, ...place.marks]
    .map(x => x.detail?.trim())
    .filter((d): d is string => !!d);
}

export default ReviewPlaces;
