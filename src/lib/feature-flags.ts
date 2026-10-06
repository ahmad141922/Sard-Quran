/**
 * Work that is finished in the source but not yet decided for release.
 *
 * A flag here is a release decision, not a permanent setting: it exists so a
 * build can ship everything else without carrying an unreleased feature along
 * with it. Turn one on, build, and it goes out with the next deploy.
 */

/**
 * The review section inside the recitation report: places to review, the
 * corrections at each one, and the similar-verse (mutashābihāt) matches.
 *
 * The report itself has been live for a while; this section is an addition to
 * it that has not been released. Off so the polish work can ship on its own.
 */
export const RECITATION_REVIEW_SECTION = false;

/**
 * Whether the browser recogniser reports a probability for each sound.
 *
 * sherpa's greedy CTC — the Android path — throws it away, so `align.ts` has
 * only ever run its no-confidence branch. The web recogniser keeps it
 * (`Heard.prob`). Off until the threshold in `align.ts` is calibrated on the
 * labelled recordings, so turning it on is a measured decision, not a guess.
 */
export const WEB_ASR_CONFIDENCE = false;
