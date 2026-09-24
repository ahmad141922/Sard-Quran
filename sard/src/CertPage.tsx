import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Download, Loader2, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import LangToggle from '@/components/board/LangToggle';
import { withBase } from '@/lib/asset-url';
import { RecitationCertificate } from '@/components/board/RecitationCertificate';
import { sheetToPng } from '@/components/board/RecitationReportSheet';
import { saveImage } from '@/lib/native';
import { decodeCertificate, waitForPaintable, type CertificateFields } from '@/lib/recitation-certificate';
import { toArabicIndic } from '@/lib/quran-data';
import { formatDuration } from '@/lib/recitation-session';
import { toHijri, HIJRI_MONTH_NAMES } from '@/lib/hijri';
import { SARD_ADMIN_FUNCTION, sardSupabase } from '@/lib/sard-supabase';
import type { TranslationKey } from '@/hooks/useI18n';

/**
 * The page a scanned certificate opens — `sard.tajweedoo.com/cert#…`.
 *
 * Everything printed on the certificate travels in the fragment of the link
 * the QR carries, so the page renders with no backend behind it, forever, and
 * nothing about the reciter is ever sent anywhere. A fragment that is missing
 * or mangled is said to be so rather than filled in with guesses.
 *
 * One thing it does ask the server: whether the certificate's id names a real
 * majlis. A fragment anyone can write is not proof, so the badge would be
 * theatre without it — and the answer that comes back is a bare yes or no,
 * carrying no name and no row.
 */
const CertPage: React.FC = () => {
  const { t, lang, dir } = useI18n();
  const [fields, setFields] = useState<CertificateFields | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Whether this certificate names a majlis the tool actually recorded.
   *
   * The link's fragment is not proof of anything — anyone can write one. So the
   * page asks the backend whether the id exists, and the backend answers yes or
   * no and nothing else. `unknown` is its own state, not a quiet "no": with no
   * network, an honest page says it could not check rather than calling a real
   * certificate false.
   */
  const [verified, setVerified] = useState<'checking' | 'yes' | 'no' | 'unknown'>('checking');
  const certRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const read = () => {
      setFields(decodeCertificate(window.location.hash.replace(/^#/, '')));
      setReady(true);
    };
    read();
    // Scanning a second certificate on the same open page changes only the
    // fragment, and the browser fires no navigation for that.
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  useEffect(() => {
    if (!fields) return;
    let alive = true;
    sardSupabase.functions
      .invoke(SARD_ADMIN_FUNCTION, { body: { action: 'verify_certificate', id: fields.id } })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { setVerified('unknown'); return; }
        setVerified((data as { verified?: boolean })?.verified ? 'yes' : 'no');
      })
      .catch(() => { if (alive) setVerified('unknown'); });
    return () => { alive = false; };
  }, [fields]);

  const download = useCallback(async () => {
    if (!certRef.current || !fields) return;
    setBusy(true);
    try {
      await waitForPaintable(certRef.current);
      await saveImage(await sheetToPng(certRef.current), `${t('recCertificate')}-${fields.name}.png`);
    } finally { setBusy(false); }
  }, [fields, t]);

  return (
    <div dir={dir} className="min-h-dvh bg-background px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-[880px]">
        {/* The certificate keeps its own language; the page around it follows
            whoever is reading, which is not always the same person. */}
        <div className="mb-3 flex justify-end">
          <LangToggle />
        </div>
        {!ready ? null : !fields ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-16 text-center">
            <p className="text-sm font-bold">{t('recCertNoData')}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {t('recCertNoDataHint')}
            </p>
          </div>
        ) : (
          <>
            {/*
              نسختان: هذه للعرض وتُصغَّر بـ`zoom` مع الشاشة (وهو يعيد التخطيط
              فلا يترك فراغًا تحته كما يفعل `scale`)، وتحتها نسخة بالمقاس
              الكامل خارج الشاشة هي التي تُصوَّر — لئلّا يخرج التصغير في الصورة.
            */}
            <div className="overflow-x-auto">
              <div className="mx-auto w-fit [zoom:0.42] sm:[zoom:0.62] md:[zoom:0.82] lg:[zoom:1]">
                <RecitationCertificate fields={fields} />
              </div>
            </div>
            <div aria-hidden style={{ position: 'fixed', top: 0, insetInlineStart: '-10000px', width: 840 }}>
              <RecitationCertificate ref={certRef} fields={fields} />
            </div>

            {/*
              The same facts in words, under the picture.
              A phone that scanned the code is often too small to read the
              sheet, and a screen reader cannot read a rasterised one at all.
            */}
            <Record fields={fields} verified={verified} t={t} lang={lang} />

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={download}
                disabled={busy}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {t('recCertSaveImage')}
              </button>
              <a href={withBase('')} className="text-xs font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {t('recToolName')}
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const BADGE = {
  yes: {
    icon: BadgeCheck,
    text: 'recCertVerified',
    note: 'recCertVerifiedNote',
    className: 'border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300',
  },
  no: {
    icon: ShieldAlert,
    text: 'recCertUnverified',
    note: 'recCertUnverifiedNote',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
  },
  unknown: {
    icon: ShieldQuestion,
    text: 'recCertUnknown',
    note: 'recCertUnknownNote',
    className: 'border-border bg-muted text-muted-foreground',
  },
  checking: {
    icon: Loader2,
    text: 'recCertChecking',
    note: '',
    className: 'border-border bg-muted text-muted-foreground',
  },
} as const;

const Record: React.FC<{
  fields: CertificateFields;
  verified: keyof typeof BADGE;
  t: (key: TranslationKey) => string;
  lang: string;
}> = ({ fields, verified, t, lang }) => {
  const badge = BADGE[verified];
  const Icon = badge.icon;
  const ar = lang === 'ar';
  const at = new Date(fields.at);
  const h = toHijri(at);
  const digits = (text: string) => (ar ? text.replace(/[0-9]/g, d => toArabicIndic(Number(d))) : text);
  const gregorian = `${at.toLocaleDateString(ar ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} ${ar ? 'ميلادي' : 'Gregorian'}`;
  const hijri = ar
    ? `${toArabicIndic(h.day)} ${HIJRI_MONTH_NAMES[h.month - 1].ar} ${toArabicIndic(h.year)} هجري`
    : `${h.day} ${HIJRI_MONTH_NAMES[h.month - 1].en} ${h.year} Hijri`;
  const rows: [string, string][] = [
    [t('recReciter'), fields.name],
    [t('recRecited'), fields.amount],
    ...(fields.instructor ? [[t('recListener'), fields.instructor] as [string, string]] : []),
    [t('recRiwaya'), fields.riwaya || '—'],
    [t('recListeningTime'), digits(formatDuration(fields.durationMs, ar ? 'ar' : 'en'))],
    [t('recDate'), `${gregorian} — ${hijri}`],
    [t('recCertNumber'), fields.id],
  ];

  return (
    <section className="mx-auto mt-6 max-w-xl rounded-2xl border border-border bg-card/70 p-4">
      <div className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${badge.className}`}>
        <Icon size={18} className={verified === 'checking' ? 'animate-spin' : ''} aria-hidden />
        {t(badge.text)}
      </div>
      {badge.note && <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{t(badge.note)}</p>}

      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-end font-bold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default CertPage;
