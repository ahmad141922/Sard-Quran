import React from 'react';
import { Lock } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import {
  AYAH_COUNTING, availableRiwayat, countingName, mushafName, publisherName, riwayaName,
  type MushafDefinition, type RiwayaId,
} from '@/lib/mushaf/registry';

/**
 * The riwaya is asked. The printed edition is not.
 *
 * It used to be a second field, because Hafs is published both as the Madinah
 * muṣḥaf and as ash-Shamarly. But only one edition of each riwaya is offered
 * today, and a list of one is a control that does nothing — so the book is
 * stated under the field instead. `offered` in the registry is what decides;
 * the day a riwaya has two real editions, this is where the field comes back.
 *
 * One field, full width, asked once before anything starts.
 *
 * The option list is coloured explicitly: a native `<select>` popup follows the
 * browser's own palette, and on a dark page that has meant black text on a
 * white sheet dropping out of a dark field. The closed control and its options
 * are stated in the same tokens so both read alike in either mode.
 */
const FIELD_CLASS =
  'w-full rounded-lg border-2 border-primary/25 bg-background px-3 py-2.5 text-sm font-bold text-foreground ' +
  'outline-none ring-primary/20 transition-all hover:border-primary/50 focus:border-primary focus:ring-2 ' +
  'dark:border-primary/50 [&>option]:bg-[hsl(var(--card))] [&>option]:font-bold [&>option]:text-[hsl(var(--foreground))]';

interface Props {
  className?: string;
  /**
   * A majlis in progress. Which riwaya and which print run are settled before
   * the recitation and fixed for its length, so this states the book instead of
   * offering it — and says why, rather than looking like a control that broke.
   */
  locked?: boolean;
  /** The book to state when locked. Defaults to the current selection. */
  mushaf?: MushafDefinition;
  /**
   * A toolbar, not a form.
   *
   * Reading mode keeps the riwaya on the bar above the page, where a label and
   * a line of provenance would take the room the muṣḥaf needs. The field says
   * what it is by what it holds.
   */
  compact?: boolean;
}

const MushafPicker: React.FC<Props> = ({ className, locked, mushaf: fixed, compact }) => {
  const { t, lang } = useI18n();
  const { mushaf: selected, setRiwaya } = useMushaf();
  const mushaf = fixed ?? selected;
  const riwayat = availableRiwayat();

  if (locked) {
    return (
      <div
        className={`flex min-w-0 items-center gap-1.5 rounded-lg border border-emerald-900/10 px-2 py-1 dark:border-emerald-100/10 ${className ?? ''}`}
        title={t('recRiwayaFixed')}
      >
        <Lock size={12} className="shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate text-[11px] font-bold text-foreground sm:text-xs">
          {riwayaName(mushaf.riwayaId)}
        </span>
        <span className="hidden max-w-[9rem] truncate text-[11px] text-muted-foreground sm:inline sm:text-xs">
          · {mushafName(mushaf, lang)}
        </span>
      </div>
    );
  }

  const counting = AYAH_COUNTING[mushaf.ayahCounting];

  if (compact) {
    return (
      <select
        value={mushaf.riwayaId}
        onChange={e => setRiwaya(e.target.value as RiwayaId)}
        aria-label={t('recRiwaya')}
        className={`w-full max-w-full rounded-lg border border-emerald-900/15 bg-transparent px-2 py-1 text-xs font-bold text-foreground outline-none transition-colors hover:border-primary/50 focus:border-primary dark:border-emerald-100/15 [&>option]:bg-[hsl(var(--card))] [&>option]:text-[hsl(var(--foreground))] ${className ?? ''}`}
      >
        {riwayat.map(r => <option key={r} value={r}>{riwayaName(r)}</option>)}
      </select>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('recRiwaya')}</span>
        <select
          value={mushaf.riwayaId}
          onChange={e => setRiwaya(e.target.value as RiwayaId)}
          aria-label={t('recRiwaya')}
          className={FIELD_CLASS}
        >
          {riwayat.map(r => <option key={r} value={r}>{riwayaName(r)}</option>)}
        </select>
      </label>

      {/* The book itself is not asked for — every offered riwaya has one
          printed edition — but it is said, because it is the book whose page
          breaks and whose verse numbers the whole report will be written in. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {mushafName(mushaf, lang)} · {publisherName(mushaf, lang)} · {countingName(counting, lang)}
        {" — "}{counting.totalAyahs} {t('recAyahsUnit')}
      </p>
    </div>
  );
};

export default MushafPicker;
