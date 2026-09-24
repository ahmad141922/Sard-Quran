/**
 * A small card worth sending to a halaqa group.
 *
 * Not a certificate and not a report. A certificate attests — it names who
 * heard the recitation and carries a code that verifies it. This says one
 * modest thing about one evening, in three numbers, and is meant to be sent
 * to a family group and forgotten.
 *
 * Which is why it deliberately does **not** carry: the listener's name, a QR
 * code, or the word شهادة. Anything that made it look like a certificate
 * would cheapen the real ones — the same reasoning that keeps a solo session
 * from producing one at all.
 *
 * Rasterised like the report sheet, so the same `sheetToPng` turns it into an
 * image the parent can actually receive.
 */

import React from 'react';

import { useI18n } from '@/hooks/useI18n';
import type { Achievement } from '@/lib/recitation-review';

const CARD_BG = '#0f3d2e';
const CARD_INK = '#f4efe2';
const CARD_MUTED = '#a9c4b6';
const CARD_RULE = 'rgba(244, 239, 226, 0.16)';

interface Props {
  studentName: string;
  achievement: Achievement;
  /** Formatted by the caller, which owns the locale's plural rules. */
  minutesLabel: string;
}

export const AchievementCard = React.forwardRef<HTMLDivElement, Props>((
  { studentName, achievement, minutesLabel }, ref,
) => {
  const { t, dir } = useI18n();

  return (
    <div
      ref={ref}
      dir={dir}
      style={{
        background: CARD_BG, color: CARD_INK, borderRadius: 18,
        padding: '26px 24px', width: '100%',
      }}
    >
      <div style={{ fontSize: 12, color: CARD_MUTED, letterSpacing: '0.08em' }}>
        {t('recCardToday')}
      </div>

      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.35, marginTop: 6 }}>
        {achievement.what}
      </div>

      <div style={{ height: 1, background: CARD_RULE, margin: '18px 0' }} />

      <div style={{ display: 'flex', gap: 22, alignItems: 'baseline' }}>
        <Figure value={minutesLabel} />
        {/*
          Shown even when it is zero, and shown without apology: places to
          review are the useful half of a session, not a blemish on it.
        */}
        <Figure value={String(achievement.toReview)} label={t('recCardToReview')} />
      </div>

      <div style={{ marginTop: 20, fontSize: 13, fontWeight: 700, color: CARD_MUTED }}>
        {studentName}
      </div>
    </div>
  );
});

AchievementCard.displayName = 'AchievementCard';

const Figure: React.FC<{ value: string; label?: string }> = ({ value, label }) => (
  <div>
    <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    {label && <div style={{ fontSize: 11, color: CARD_MUTED, marginTop: 2 }}>{label}</div>}
  </div>
);

export default AchievementCard;
