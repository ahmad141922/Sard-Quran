/**
 * Seals a report, uploads the ciphertext, and hands back a link.
 *
 * Offered only where pressing it would actually produce a working link: the
 * store has to be installed, which means a backend is configured and its table
 * exists. A button that fails is worse than a button that is not there — see
 * `installShareStore`.
 *
 * What is shared is **not** the session. A session carries the reciter's
 * contact numbers, the operator's role, every anchor of every note, sync
 * bookkeeping. A parent opening a link needs none of that, and the least that
 * can be sent is the right amount to send, encrypted or not.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Link2, Loader2 } from 'lucide-react';

import { useI18n } from '@/hooks/useI18n';
import { sealReport, shareUrl } from '@/lib/share-link';
import { putSealed } from '@/lib/share-store';
import { installShareStore } from '@/lib/share-store-supabase';

export interface SharedReport {
  student: string;
  instructor?: string;
  /** Already a finished phrase — «٣ أجزاء من القرآن الكريم». */
  amount: string;
  minutes: number;
  at: number;
  /**
   * One line per place, as the report already prints them.
   *
   * `text` is the **imlāʾī** reading, not the Uthmani one the report shows on
   * screen. The Uthmani text is in a private-use encoding that is legible only
   * with the bundled font: whoever opens the link may be on a borrowed phone
   * that never loaded it, and a verse rendered as boxes is worse than none.
   */
  places: { label: string; kinds: string[]; detail?: string; text?: string }[];
}

export const ShareReportButton: React.FC<{ report: SharedReport }> = ({ report }) => {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { installShareStore().then(setReady).catch(() => setReady(false)); }, []);

  const share = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const sealed = await sealReport(report);
      // Ciphertext up, key kept here — see `share-link`.
      await putSealed({ id: sealed.id, payload: sealed.payload, expiresAt: sealed.expiresAt });
      const url = shareUrl(sealed);
      setLink(url);
      try { await navigator.clipboard.writeText(url); } catch { /* shown below anyway */ }
    } catch {
      // The majlis is already saved locally; a failed share costs nothing else.
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [report]);

  if (!ready) return null;

  return (
    <div className="mt-3" data-share>
      <button
        onClick={share}
        disabled={busy}
        data-share-button
        className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-xs font-bold text-foreground ring-1 ring-border transition-colors hover:bg-accent disabled:opacity-50"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : link ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
        {busy ? t('recSharing') : link ? t('recShareCopied') : t('recShare')}
      </button>

      {link && (
        <>
          <input
            data-share-link
            readOnly
            value={link}
            onFocus={e => e.currentTarget.select()}
            dir="ltr"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground"
          />
          {/*
            Said plainly, because a teacher sending a child's name somewhere
            deserves to know exactly what was sent and for how long.
          */}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            {t('recShareHint')}
          </p>
        </>
      )}

      {failed && (
        <p data-share-failed className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          {t('recShareFailed')}
        </p>
      )}
    </div>
  );
};

export default ShareReportButton;
