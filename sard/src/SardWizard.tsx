import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Ear, Headphones, User, X } from 'lucide-react';
import type { DisplayLang } from '@/lib/display-lang';
import { useI18n } from '@/hooks/useI18n';
import { SURAHS, surahName } from '@/lib/quran-data';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import {
  availableRiwayat, mushafName, publisherName, riwayaName, type RiwayaId,
} from '@/lib/mushaf/registry';
import {
  finishWizard, shouldOfferWizard, type WizardAnswers, type WizardStance,
} from '@/lib/wizard-profile';

/**
 * The first time the tool is opened, and only then.
 *
 * ## Why there is a wizard at all
 *
 * The setup form is honest but it is a wall: two names, two numbers, a
 * country, a riwaya, a goal and a starting verse, all at once, before a single
 * verse has been recited. Somebody who has just installed the app does not yet
 * know which of those matter to them, and the commonest first act — a
 * memoriser opening the muṣḥaf to review alone — needs almost none of it.
 *
 * So this asks four things, in four sentences, and every one of them has an
 * answer already selected. It is not a tour and it is not a feature list: a
 * screen that explains an app is a screen that admits the app needs
 * explaining, and this one only fills in what the app genuinely cannot infer.
 *
 * ## Why every step can be skipped, and the whole thing in one tap
 *
 * A reciter who wants the muṣḥaf now must be able to have it now. The close
 * button in the corner ends the wizard from any step, and it keeps whatever
 * was answered before it was pressed rather than throwing it away — leaving
 * early is not a mistake to be punished. Whatever is skipped stays unset, and
 * unset means the setup form asks for it exactly as it did before any of this
 * existed. Nothing here can put the tool into a state it could not otherwise
 * be in.
 *
 * ## Why it never comes back
 *
 * See `wizard-profile.ts`: the flag is written the moment the wizard ends,
 * however it ends, and a device that shows any sign of previous use is never
 * offered it in the first place. A wizard that can reappear is not an
 * onboarding screen, it is an obstacle.
 *
 * ## Why the strings are here rather than in `useI18n`
 *
 * They are four screens' worth of copy that no other part of the tool says,
 * and they are read once in the life of an install. Keeping them beside the
 * component that speaks them is the same trade `SPLASH_TEXT` makes in
 * `SplashScreen.tsx`. All five of the board's languages are covered, because
 * the table is typed by `DisplayLang` and a missing one would not compile.
 */

interface WizardStrings {
  heading: string;
  dismiss: string;
  back: string;
  skip: string;
  next: string;
  start: string;
  /** `{n}` and `{total}`, for the progress dots' label. */
  step: string;
  nameTitle: string;
  nameHint: string;
  namePlaceholder: string;
  stanceTitle: string;
  stanceHint: string;
  stanceSolo: string;
  stanceSoloHint: string;
  stanceReciter: string;
  stanceReciterHint: string;
  stanceListener: string;
  stanceListenerHint: string;
  riwayaTitle: string;
  riwayaHint: string;
  startTitle: string;
  startHint: string;
}

export const WIZARD_TEXT: Record<DisplayLang, WizardStrings> = {
  ar: {
    heading: 'تهيئة أولى',
    dismiss: 'تخطّي التهيئة',
    back: 'رجوع',
    skip: 'تخطّي',
    next: 'التالي',
    start: 'ابدأ',
    step: 'الخطوة {n} من {total}',
    nameTitle: 'ما اسمك؟',
    nameHint: 'يُكتب على تقرير كلّ مجلس، ولك أن تغيّره متى شئت.',
    namePlaceholder: 'الاسم',
    stanceTitle: 'كيف تسرد؟',
    stanceHint: 'تختار هذا في كلّ مجلس، وإنّما هذا ما يُفتح عليه أوّل مرّة.',
    stanceSolo: 'أسرد وحدي',
    stanceSoloHint: 'مراجعة خاصّة، لا شهادة لها.',
    stanceReciter: 'أسرد على مقرئ',
    stanceReciterHint: 'مجلس يُختم بشهادة تذكر من سمع منك.',
    stanceListener: 'أستمع إلى القرّاء',
    stanceListenerHint: 'أنت المقرئ، والجهاز في يدك.',
    riwayaTitle: 'بأيّ رواية تقرأ؟',
    riwayaHint: 'بها تُضبط أرقام الآيات وصفحات المصحف في تقاريرك.',
    startTitle: 'من أين تبدأ؟',
    startHint: 'السورة التي يُفتح عليها أوّل مجلس، ولك أن تنتقل بعدها حيث شئت.',
  },
  en: {
    heading: 'Quick setup',
    dismiss: 'Skip setup',
    back: 'Back',
    skip: 'Skip',
    next: 'Next',
    start: 'Start',
    step: 'Step {n} of {total}',
    nameTitle: 'What is your name?',
    nameHint: 'It is written on the report of every session, and you can change it whenever you like.',
    namePlaceholder: 'Your name',
    stanceTitle: 'How do you recite?',
    stanceHint: 'You choose this at every session too; this is only what it opens with.',
    stanceSolo: 'On my own',
    stanceSoloHint: 'A private review, with no certificate.',
    stanceReciter: 'To a listener',
    stanceReciterHint: 'A session that ends in a certificate naming who heard you.',
    stanceListener: 'I listen to reciters',
    stanceListenerHint: 'You are the muqri’, and the device is in your hand.',
    riwayaTitle: 'Which riwaya do you read?',
    riwayaHint: 'It settles the verse numbers and the mushaf pages your reports are written in.',
    startTitle: 'Where do you start?',
    startHint: 'The surah your first session opens at. You can move anywhere afterwards.',
  },
  fr: {
    heading: 'Configuration rapide',
    dismiss: 'Passer la configuration',
    back: 'Retour',
    skip: 'Passer',
    next: 'Suivant',
    start: 'Commencer',
    step: 'Étape {n} sur {total}',
    nameTitle: 'Quel est votre nom ?',
    nameHint: 'Il figure sur le rapport de chaque séance, et vous pouvez le changer quand vous voulez.',
    namePlaceholder: 'Votre nom',
    stanceTitle: 'Comment récitez-vous ?',
    stanceHint: 'Vous le choisirez aussi à chaque séance ; ce n’est ici que le point de départ.',
    stanceSolo: 'Seul',
    stanceSoloHint: 'Une révision privée, sans attestation.',
    stanceReciter: 'Devant un auditeur',
    stanceReciterHint: 'Une séance qui se conclut par une attestation nommant celui qui vous a écouté.',
    stanceListener: 'J’écoute les récitants',
    stanceListenerHint: 'Vous êtes le muqri’, et l’appareil est dans votre main.',
    riwayaTitle: 'Quelle riwāya lisez-vous ?',
    riwayaHint: 'Elle fixe les numéros de versets et les pages du musḥaf de vos rapports.',
    startTitle: 'Par où commencez-vous ?',
    startHint: 'La sourate sur laquelle s’ouvre votre première séance. Vous pourrez ensuite aller où vous voulez.',
  },
  de: {
    heading: 'Kurze Einrichtung',
    dismiss: 'Einrichtung überspringen',
    back: 'Zurück',
    skip: 'Überspringen',
    next: 'Weiter',
    start: 'Beginnen',
    step: 'Schritt {n} von {total}',
    nameTitle: 'Wie heißen Sie?',
    nameHint: 'Er steht auf dem Bericht jeder Sitzung, und Sie können ihn jederzeit ändern.',
    namePlaceholder: 'Ihr Name',
    stanceTitle: 'Wie rezitieren Sie?',
    stanceHint: 'Sie wählen dies auch bei jeder Sitzung; hier ist es nur der Ausgangspunkt.',
    stanceSolo: 'Allein',
    stanceSoloHint: 'Eine private Wiederholung, ohne Urkunde.',
    stanceReciter: 'Vor einem Zuhörer',
    stanceReciterHint: 'Eine Sitzung, die mit einer Urkunde endet, die Ihren Zuhörer nennt.',
    stanceListener: 'Ich höre Rezitierenden zu',
    stanceListenerHint: 'Sie sind der Muqri’, und das Gerät liegt in Ihrer Hand.',
    riwayaTitle: 'Welche Riwāya lesen Sie?',
    riwayaHint: 'Sie legt die Versnummern und die Musḥaf-Seiten Ihrer Berichte fest.',
    startTitle: 'Wo beginnen Sie?',
    startHint: 'Die Sure, mit der Ihre erste Sitzung beginnt. Danach können Sie überall hinwechseln.',
  },
  es: {
    heading: 'Configuración rápida',
    dismiss: 'Omitir la configuración',
    back: 'Atrás',
    skip: 'Omitir',
    next: 'Siguiente',
    start: 'Empezar',
    step: 'Paso {n} de {total}',
    nameTitle: '¿Cómo te llamas?',
    nameHint: 'Aparece en el informe de cada sesión, y puedes cambiarlo cuando quieras.',
    namePlaceholder: 'Tu nombre',
    stanceTitle: '¿Cómo recitas?',
    stanceHint: 'También lo eliges en cada sesión; aquí es solo el punto de partida.',
    stanceSolo: 'A solas',
    stanceSoloHint: 'Un repaso privado, sin certificado.',
    stanceReciter: 'Ante un oyente',
    stanceReciterHint: 'Una sesión que termina con un certificado que nombra a quien te escuchó.',
    stanceListener: 'Escucho a los recitadores',
    stanceListenerHint: 'Tú eres el muqri’, y el dispositivo está en tu mano.',
    riwayaTitle: '¿Qué riwāya lees?',
    riwayaHint: 'Fija los números de aleya y las páginas del musḥaf de tus informes.',
    startTitle: '¿Por dónde empiezas?',
    startHint: 'La sura con la que se abre tu primera sesión. Después puedes ir a donde quieras.',
  },
};

/** The four questions, in the order they are asked. */
const STEPS = ['name', 'stance', 'riwaya', 'start'] as const;
type Step = typeof STEPS[number];

const FIELD =
  'w-full rounded-xl border-2 border-primary/25 bg-background px-3 py-3 text-sm font-bold text-foreground ' +
  'outline-none ring-primary/20 transition-all placeholder:font-normal placeholder:text-muted-foreground ' +
  'focus:border-primary focus:ring-2 dark:border-primary/50 ' +
  '[&>option]:bg-[hsl(var(--card))] [&>option]:font-bold [&>option]:text-[hsl(var(--foreground))]';

/**
 * Where the person stands, as three plain sentences.
 *
 * Icons rather than a bare list because the three are read at a glance on a
 * phone, and because the middle one — reciting *to* somebody — is the case a
 * hurried reader would otherwise mistake for the first.
 */
const STANCES: { value: WizardStance; Icon: typeof User; label: keyof WizardStrings; hint: keyof WizardStrings }[] = [
  { value: 'solo', Icon: User, label: 'stanceSolo', hint: 'stanceSoloHint' },
  { value: 'reciter', Icon: Headphones, label: 'stanceReciter', hint: 'stanceReciterHint' },
  { value: 'listener', Icon: Ear, label: 'stanceListener', hint: 'stanceListenerHint' },
];

export const SardWizard: React.FC<{
  /**
   * Told when the wizard leaves, with whatever was answered.
   *
   * Optional, and the wizard is complete without it: everything worth keeping
   * has already been written to storage by the time this fires. It exists so a
   * host screen can act on the ending — opening the setup form straight away,
   * say — without this component having to know what a session is.
   */
  onDone?: (answers: Partial<WizardAnswers>) => void;
}> = ({ onDone }) => {
  const { lang, dir } = useI18n();
  const text = WIZARD_TEXT[lang] ?? WIZARD_TEXT.en;
  const { mushaf, setRiwaya } = useMushaf();

  /*
   * Decided once, at mount, and never re-read.
   *
   * The wizard writes the very keys `shouldOfferWizard()` reads, so asking it
   * again on any later render would answer "no" and tear the sheet off the
   * screen the instant somebody chose a riwaya.
   */
  const [open, setOpen] = useState(shouldOfferWizard);
  const [step, setStep] = useState(0);

  /*
   * Null means "not answered", which is not the same as the default shown.
   *
   * The controls all have something selected — that is the point of the whole
   * screen — but a step that was passed through without being touched must
   * leave nothing behind, so that the setup form goes on deciding for itself.
   * These are the three questions whose answers have nowhere else to live; the
   * riwaya is written straight through `MushafProvider` instead, because that
   * is already where the tool keeps it.
   */
  const [name, setName] = useState('');
  const [stance, setStance] = useState<WizardStance | null>(null);
  const [startSurah, setStartSurah] = useState<number | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const riwayat = useMemo(() => availableRiwayat(), []);

  const leave = useCallback(() => {
    const answers: Partial<WizardAnswers> = {};
    if (name.trim()) answers.name = name.trim();
    if (stance) answers.stance = stance;
    if (startSurah) answers.startSurah = startSurah;
    finishWizard(answers);
    setOpen(false);
    onDone?.(answers);
  }, [name, stance, startSurah, onDone]);

  // Written against `step` rather than as an updater: the last step's button is
  // the one that ends the wizard, and an updater that reaches outside itself is
  // a side effect React is entitled to run twice.
  const advance = useCallback(() => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else leave();
  }, [step, leave]);

  // The sheet takes focus so a screen reader announces it rather than leaving
  // the reader somewhere on the home screen behind it, and so Escape lands
  // here without the person having to tap first.
  useEffect(() => { if (open) cardRef.current?.focus(); }, [open]);

  if (!open) return null;

  const which: Step = STEPS[step];
  const last = step === STEPS.length - 1;

  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const BackChevron = dir === 'rtl' ? ChevronRight : ChevronLeft;

  return (
    <div
      data-sard-wizard
      dir={dir}
      role="dialog"
      aria-modal="true"
      aria-label={text.heading}
      onKeyDown={e => { if (e.key === 'Escape') leave(); }}
      className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      {/*
        The sheet rises from the bottom edge on a phone, which is where a hand
        is, and sits centred on anything wider. `prefers-reduced-motion` gets
        the same sheet without the travel — the movement is decoration here,
        and the screen it decorates is the very first one an unfamiliar person
        sees.
      */}
      <style>{`
        @keyframes sard-wizard-rise {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes sard-wizard-step {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .sard-wizard-sheet { animation: sard-wizard-rise 260ms cubic-bezier(0.22, 0.8, 0.3, 1) both; }
        .sard-wizard-step  { animation: sard-wizard-step 200ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .sard-wizard-sheet, .sard-wizard-step {
            animation-duration: 1ms;
            animation-delay: 0ms;
            transform: none;
          }
        }
      `}</style>

      <div
        ref={cardRef}
        tabIndex={-1}
        data-wizard-step={which}
        className="sard-wizard-sheet flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl outline-none pb-safe sm:max-h-[88vh] sm:rounded-3xl"
      >
        <div className="flex items-center gap-2 border-b border-border bg-accent/30 px-4 py-3">
          <span className="flex-1 truncate text-sm font-bold text-foreground">{text.heading}</span>
          {/* The progress is dots, not «3/4»: a count invites somebody to work
              out how much is left, and four is not enough to be worth
              counting. The label says it for anyone who cannot see them. */}
          <div
            className="flex items-center gap-1.5"
            role="img"
            aria-label={text.step.replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
          >
            {STEPS.map((s, i) => (
              <span
                key={s}
                aria-hidden
                className={`h-1.5 rounded-full transition-all ${i === step ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
              />
            ))}
          </div>
          {/*
            The one tap that ends all of it, in the corner every other sheet in
            this tool puts it. It keeps what was already answered — see `leave`.
          */}
          <button
            type="button"
            data-wizard-dismiss
            onClick={leave}
            data-a11y-tap
            aria-label={text.dismiss}
            title={text.dismiss}
            className="ms-1 flex shrink-0 items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* `key` on the step, so each question fades in as its own thing rather
            than the previous one's text being swapped out under the reader. */}
        <div key={which} className="sard-wizard-step min-h-0 flex-1 overflow-y-auto p-5">
          {which === 'name' && (
            <>
              <h2 className="text-lg font-extrabold text-foreground">{text.nameTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text.nameHint}</p>
              {/*
                Not focused on arrival. A phone keyboard springing up over the
                first screen of a new app hides the very sheet it belongs to,
                and this field is the one thing here somebody may well want to
                skip past.
              */}
              <input
                id="wizard-name"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') advance(); }}
                placeholder={text.namePlaceholder}
                autoComplete="name"
                aria-label={text.nameTitle}
                className={`${FIELD} mt-4`}
              />
            </>
          )}

          {which === 'stance' && (
            <>
              <h2 className="text-lg font-extrabold text-foreground">{text.stanceTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text.stanceHint}</p>
              <div className="mt-4 space-y-2">
                {STANCES.map(({ value, Icon, label, hint }) => (
                  <button
                    key={value}
                    type="button"
                    data-wizard-stance={value}
                    onClick={() => setStance(value)}
                    aria-pressed={stance === value}
                    className={`flex w-full items-start gap-3 rounded-xl border-2 px-3 py-3 text-start transition-all ${
                      stance === value
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/40'
                    }`}
                  >
                    <Icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-foreground">{text[label]}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{text[hint]}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {which === 'riwaya' && (
            <>
              <h2 className="text-lg font-extrabold text-foreground">{text.riwayaTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text.riwayaHint}</p>
              {/*
                Written straight through the provider, which is where the tool
                already keeps this choice — a second copy in the wizard's own
                record could only ever disagree with it. Choosing here is the
                same act as choosing in the setup form.
              */}
              <select
                id="wizard-riwaya"
                value={mushaf.riwayaId}
                onChange={e => setRiwaya(e.target.value as RiwayaId)}
                aria-label={text.riwayaTitle}
                className={`${FIELD} mt-4`}
              >
                {riwayat.map(r => <option key={r} value={r}>{riwayaName(r, lang)}</option>)}
              </select>
              {/* The book is not asked for — each offered riwaya has one
                  printed edition — but it is said, because its page breaks are
                  the ones every report will be written in. */}
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {mushafName(mushaf, lang)} · {publisherName(mushaf, lang)}
              </p>
            </>
          )}

          {which === 'start' && (
            <>
              <h2 className="text-lg font-extrabold text-foreground">{text.startTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text.startHint}</p>
              {/* The surah alone. A verse number is asked for in the setup form
                  by somebody who already knows which one they want; nobody
                  knows that before their first majlis. */}
              <select
                id="wizard-surah"
                value={startSurah ?? 1}
                onChange={e => setStartSurah(Number(e.target.value))}
                aria-label={text.startTitle}
                className={`${FIELD} mt-4`}
              >
                {SURAHS.map(s => (
                  <option key={s.n} value={s.n}>{s.n}. {surahName(s.n, lang)}</option>
                ))}
              </select>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          {step > 0 && (
            <button
              type="button"
              data-wizard-back
              onClick={() => setStep(s => Math.max(0, s - 1))}
              className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <BackChevron size={14} aria-hidden />
              {text.back}
            </button>
          )}
          <div className="flex-1" />
          {/*
            Skip and Next do the same thing on a step nobody touched, and that
            is deliberate rather than redundant: «التالي» reads as a commitment
            to what is on screen, and somebody who wants none of it should be
            able to say so in the word for it.
          */}
          <button
            type="button"
            data-wizard-skip
            onClick={advance}
            className="rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {text.skip}
          </button>
          <button
            type="button"
            data-wizard-next
            onClick={advance}
            className="flex items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] active:scale-[0.99]"
          >
            {last ? text.start : text.next}
            {!last && <Chevron size={15} aria-hidden />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SardWizard;
