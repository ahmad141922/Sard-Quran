/**
 * What a parent sees when they open the link.
 *
 * Everything it draws was decrypted in this browser out of the fragment of the
 * URL they were sent. The host handed over bytes and has no idea what is on
 * this screen.
 *
 * A bad link, an expired one and a wrong key all end in the same sentence, on
 * purpose: distinguishing them would tell whoever is holding a broken link
 * which part they got wrong, and there is nobody that helps except somebody
 * guessing.
 */

import React, { useEffect, useState } from 'react';

import { useI18n } from '@/hooks/useI18n';
import { openReport, parseShareHash } from '@/lib/share-link';
import { fetchSealed } from '@/lib/share-store';
import { installShareStore } from '@/lib/share-store-supabase';
import type { SharedReport } from './ShareReportButton';

type State =
  | { status: 'loading' }
  | { status: 'bad' }
  | { status: 'ready'; report: SharedReport };

export const SharedReportView: React.FC<{ hash: string }> = ({ hash }) => {
  const { t, lang, dir } = useI18n();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    (async () => {
      const parsed = parseShareHash(hash);
      // Half a link is not asked about — see `parseShareHash`.
      if (!parsed) { if (alive) setState({ status: 'bad' }); return; }

      await installShareStore().catch(() => false);
      const row = await fetchSealed(parsed.id).catch(() => null);
      if (!row) { if (alive) setState({ status: 'bad' }); return; }

      const report = await openReport(row.payload, parsed.key) as SharedReport | null;
      if (!alive) return;
      setState(report ? { status: 'ready', report } : { status: 'bad' });
    })();
    return () => { alive = false; };
  }, [hash]);

  if (state.status === 'loading') {
    return <Centre dir={dir}>{t('recShareLoading')}</Centre>;
  }
  if (state.status === 'bad') {
    return <Centre dir={dir} data-bad-link>{t('recShareBadLink')}</Centre>;
  }

  const { report } = state;

  return (
    <div dir={dir} className="mx-auto max-w-md px-4 py-8" data-shared-report>
      <div className="text-xs text-muted-foreground">{t('recSharedTitle')}</div>
      <h1 className="mt-1 text-2xl font-extrabold text-foreground">{report.student}</h1>

      <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
        <Row label={t('recRecited')} value={report.amount} />
        <Row label={t('recListeningTime')} value={`${report.minutes}`} />
        {report.instructor && <Row label={t('recInstructor')} value={report.instructor} />}
        <Row
          label={t('recStartedAt')}
          value={new Date(report.at).toLocaleDateString(lang, {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        />
      </dl>

      {report.places.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="mb-2 text-xs font-bold text-muted-foreground">{t('recReviewList')}</div>
          <ul className="space-y-1">
            {report.places.map((place, i) => (
              <li
                key={i}
                data-place
                className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
              >
                <div className="font-bold text-foreground">{place.label}</div>
                {place.text && (
                  <p data-ayah-text dir="rtl" className="mt-1 text-[15px] leading-[2.1] text-foreground/90">
                    {place.text}
                  </p>
                )}
                <div className="mt-1 text-muted-foreground">{place.kinds.join(' · ')}</div>
                {place.detail && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">— {place.detail}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const Centre: React.FC<{
  dir: string; children: React.ReactNode; 'data-bad-link'?: boolean;
}> = ({ dir, children, ...rest }) => (
  <div
    dir={dir}
    {...rest}
    className="mx-auto max-w-md px-4 py-16 text-center text-sm text-muted-foreground"
  >
    {children}
  </div>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="font-bold text-foreground">{value}</dd>
  </div>
);

export default SharedReportView;
