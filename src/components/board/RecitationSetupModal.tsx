import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, BookOpenCheck } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { SURAHS, surahName } from '@/lib/quran-data';
import { discoverMushafs, loadQuranIndex, type QuranIndex } from '@/lib/quran-index';
import { MUSHAF_LABELS, type MushafId } from '@/lib/mushaf-editions';
import {
  createSession, resolveGoalEnd,
  type GoalKind, type RecitationSession, type SessionMode,
} from '@/lib/recitation-session';
import { wizardProfile } from '@/lib/wizard-profile';
import {
  contactForName, recentInstructorNames, recentStudentNames, sessionsForStudent,
} from '@/lib/recitation-store';
import {
  applyDialCode, countryByCode, countryOfNumber, isPlausibleWhatsapp, normalizeWhatsapp,
} from '@/lib/countries';
import { mushafName } from '@/lib/mushaf/registry';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import { positionFromAnchor, positionInEdition } from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
import CountryPicker from './CountryPicker';
import MushafPicker from './MushafPicker';
import { positionLabel } from './recitation-shared';

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (session: RecitationSession) => void;
  /**
   * The signed-in teacher's halaqa roster, when there is one.
   *
   * Passed in rather than fetched here: this form is shared with the board and
   * knows nothing of accounts or servers, and it should not start to. With no
   * roster the form is exactly what it always was.
   */
  roster?: { id: string; name: string }[];
  /** What the picker is called. The caller owns the words, as it owns the list. */
  rosterLabel?: string;
}

const GOALS: {
  kind: GoalKind;
  key: 'recGoalJuz1' | 'recGoalJuz5' | 'recGoalJuz10' | 'recGoalJuz15' | 'recGoalFull' | 'recGoalCustom';
}[] = [
  { kind: 'juz1', key: 'recGoalJuz1' },
  { kind: 'juz5', key: 'recGoalJuz5' },
  { kind: 'juz10', key: 'recGoalJuz10' },
  { kind: 'juz15', key: 'recGoalJuz15' },
  { kind: 'full', key: 'recGoalFull' },
  // The five above are «from here, this far». This one is «from here to
  // there», and it is the only goal whose end the teacher states themselves.
  { kind: 'custom', key: 'recGoalCustom' },
];

const MUSHAF_KEY = 'tajweedoo:mushaf-edition';
/** Asked at the first majlis, offered back at every one after it. */
const CONTACT_KEY = 'tajweedoo:contact';

function storedContact(): { whatsapp: string; countryCode: string; role: 'reciter' | 'listener' } {
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    return {
      whatsapp: saved?.whatsapp ?? '',
      // Older devices stored the country's Arabic name; the code is derived
      // from the number on the next render either way, so a miss costs nothing.
      countryCode: saved?.countryCode ?? '',
      role: saved?.role === 'reciter' ? 'reciter' : 'listener',
    };
  } catch { return { whatsapp: '', countryCode: '', role: 'listener' }; }
}

const RecitationSetupModal: React.FC<Props> = ({ open, onClose, onStart, roster, rosterLabel }) => {
  const { t, dir, lang } = useI18n();
  const [index, setIndex] = useState<QuranIndex | null>(null);
  /*
   * What the wizard was told on the first run, used as the opening state and
   * nothing more. Read once, so a reciter who clears the field is not corrected
   * back on the next render — the wizard's answer is a starting point, not a
   * setting the form has to keep agreeing with.
   */
  const opening = useMemo(() => wizardProfile(), []);
  const [name, setName] = useState(() => opening?.name ?? '');
  /*
   * Which roster student is reciting, when one was picked. Cleared the moment
   * the name is typed over: a name somebody typed is not a claim about which
   * student it is, and attributing it anyway would put one child's recitation
   * in another's record.
   */
  const [rosterStudentId, setRosterStudentId] = useState<string | undefined>(undefined);
  const [instructor, setInstructor] = useState('');
  /** Which side of the majlis is holding the device. Remembered: it rarely changes. */
  const [role, setRole] = useState<'reciter' | 'listener'>(() => storedContact().role);
  /**
   * Whether anyone is listening.
   *
   * Not remembered between sessions like the contact is: a memoriser who
   * reviews alone on weeknights and recites to a shaykh on Friday should find
   * the majlis waiting, because that is the one that produces a certificate
   * and the one that must never be started by accident in the wrong mode.
   */
  const [mode, setMode] = useState<SessionMode>('majlis');
  const alone = mode === 'solo';
  const [studentWhatsapp, setStudentWhatsapp] = useState(
    () => (storedContact().role === 'reciter' ? storedContact().whatsapp : ''),
  );
  const [studentCountryCode, setStudentCountryCode] = useState(
    () => (storedContact().role === 'reciter' ? storedContact().countryCode : ''),
  );
  const [instructorWhatsapp, setInstructorWhatsapp] = useState(
    () => (storedContact().role === 'listener' ? storedContact().whatsapp : ''),
  );
  const [instructorCountryCode, setInstructorCountryCode] = useState(
    () => (storedContact().role === 'listener' ? storedContact().countryCode : ''),
  );

  const [recent, setRecent] = useState<string[]>([]);
  const [recentInstructors, setRecentInstructors] = useState<string[]>([]);
  const [goal, setGoal] = useState<GoalKind>('juz1');
  const [surah, setSurah] = useState(() => opening?.startSurah ?? 1);
  const [ayah, setAyah] = useState(1);
  /** Where a custom majlis stops. Ignored by every other goal. */
  const [endSurah, setEndSurah] = useState(1);
  const [endAyah, setEndAyah] = useState(7);
  const [mushaf, setMushaf] = useState<MushafId>(() => {
    try { return localStorage.getItem(MUSHAF_KEY) === 'shamarly' ? 'shamarly' : 'madinah'; } catch { return 'madinah'; }
  });
  const [editions, setEditions] = useState<MushafId[]>(['madinah']);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    recentStudentNames().then(names => { if (alive) setRecent(names); });
    recentInstructorNames().then(names => {
      if (!alive) return;
      setRecentInstructors(names);
      // The muqri' rarely changes between sessions, so offer the last one.
      setInstructor(cur => cur || names[0] || '');
    });
    // An edition whose page index is missing or malformed drops out of this
    // list; the muṣḥaf chosen above decides which pagination we want, and this
    // says whether we actually have it.
    // Caught, not left floating: the data this reaches for can be missing —
    // a cold cache with no network, a half-installed service worker — and an
    // unhandled rejection there would be a blank console error instead of a
    // form that simply offers no editions yet.
    discoverMushafs()
      .then(list => { if (alive) setEditions(list); })
      .catch(() => { /* no editions discovered; the picker stays as it is */ });
    return () => { alive = false; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadQuranIndex(mushaf)
      .then(idx => { if (alive) setIndex(idx); })
      // Left null, which is what `paginationReady` already reads as "not yet":
      // the start button stays disabled rather than the screen breaking.
      .catch(() => { /* index unavailable */ });
    try { localStorage.setItem(MUSHAF_KEY, mushaf); } catch { /* private mode */ }
    return () => { alive = false; };
  }, [open, mushaf]);

  // The starting verse is chosen in the muṣḥaf the teacher will actually be
  // holding, so the number they type is the number printed in front of them.
  const { mushaf: edition } = useMushaf();
  const editionPages = useMushafPageIndex(edition);
  const canonical = useMemo(() => (index ? canonicalBookFromQuranIndex(index) : null), [index]);
  const book = useMemo(
    () => (canonical ? editionBook(edition, editionPages, canonical) : null),
    [edition, editionPages, canonical],
  );

  /**
   * The muṣḥaf on screen decides which pagination the text layer uses — they
   * are the same book. Offering the two separately let a teacher pick
   * ash-Shamarly's pages and the Madinah plates at once, which is not a thing.
   */
  useEffect(() => { setMushaf(edition.textPaginationId); }, [edition.textPaginationId]);

  // Al-Kahf runs to 110 verses in one riwaya and 105 in another, so even the
  // range of the ayah field belongs to the edition.
  const ayahCount = useMemo(
    () => book?.pages.lastAyahOf(surah) ?? SURAHS.find(s => s.n === surah)?.ayahs ?? 1,
    [book, surah],
  );

  useEffect(() => { if (ayah > ayahCount) setAyah(1); }, [ayahCount, ayah]);

  const start = useMemo(
    () => (book && canonical ? positionInEdition(book, canonical, { surah, ayah }) : null),
    [book, canonical, surah, ayah],
  );
  const endAyahCount = useMemo(
    () => book?.pages.lastAyahOf(endSurah) ?? SURAHS.find(s => s.n === endSurah)?.ayahs ?? 1,
    [book, endSurah],
  );
  useEffect(() => { if (endAyah > endAyahCount) setEndAyah(endAyahCount); }, [endAyahCount, endAyah]);

  const end = useMemo(() => {
    if (!book || !canonical || !index || !start) return null;
    // A custom majlis ends where it was told to; every other goal counts a
    // distance from the start and works the end out.
    if (goal === 'custom') return positionInEdition(book, canonical, { surah: endSurah, ayah: endAyah });
    return positionFromAnchor(book, canonical, resolveGoalEnd(start.anchor.id, goal, index));
  }, [book, canonical, index, start, goal, endSurah, endAyah]);

  /** A range that ends before it begins is not a range. */
  const rangeBackwards = goal === 'custom' && !!start && !!end && end.anchor.id < start.anchor.id;
  const endJuz = end && index ? index.locOf(end.anchor.id)?.juz : undefined;

  /**
   * The pagination has to be the one this muṣḥaf is set in. If ash-Shamarly's
   * page index failed to load, the text layer would fall back to the Madinah
   * one and quietly show the wrong page breaks — better to say so and not
   * start.
   */
  const paginationReady = !!index && index.mushaf === edition.textPaginationId;
  // Both sides in full, or the majlis does not start: a record naming one of
  // the two is half a record, and half a person cannot be reached.
  // Both sides in full, or the majlis does not start. Reciting alone there is
  // no second side to name and nobody to reach afterwards, so the whole gate
  // lifts rather than being satisfied with a placeholder.
  const contactsReady = alone
    || (isPlausibleWhatsapp(studentWhatsapp) && isPlausibleWhatsapp(instructorWhatsapp));
  const canStart = paginationReady && !!start && !!end && !rangeBackwards
    && name.trim().length > 0 && (alone || instructor.trim().length > 0) && contactsReady;

  /**
   * What is still standing between this form and a majlis, named.
   *
   * `canStart` gathers six conditions and the button only went dim, which on a
   * phone means the answer is usually a field that has scrolled off the top.
   * The fields are named rather than described — the reader is looking for the
   * one with that label on it, not for a sentence about it.
   */
  const missing: string[] = [];
  if (!name.trim()) missing.push(t('recReciterName'));
  if (!alone && !instructor.trim()) missing.push(t('recListenerName'));
  if (!alone && !isPlausibleWhatsapp(studentWhatsapp)) missing.push(t('recReciterWhatsapp'));
  if (!alone && !isPlausibleWhatsapp(instructorWhatsapp)) missing.push(t('recListenerWhatsapp'));

  /**
   * The two fields lead each other, and the number leads when both speak.
   *
   * Choosing a country writes its code into the number (below, in the picker's
   * handler). Typing a number that carries a code selects the country here.
   * The number wins because it is the thing being sent a message: a majlis in
   * Riyadh typed as +966 is in Riyadh, whatever the list still shows. And a
   * number retyped without a code clears the country rather than leaving the
   * previous one standing under it.
   */
  useEffect(() => {
    const found = countryOfNumber(studentWhatsapp);
    setStudentCountryCode(current => (found ? found.code : (studentWhatsapp.trim() ? current : '')));
  }, [studentWhatsapp]);

  useEffect(() => {
    const found = countryOfNumber(instructorWhatsapp);
    setInstructorCountryCode(current => (found ? found.code : (instructorWhatsapp.trim() ? current : '')));
  }, [instructorWhatsapp]);

  /**
   * A name this device has seen before brings its own number with it, so a
   * halaqa of twenty types each number once in its life. It never writes over
   * something already typed into this form.
   */
  useEffect(() => {
    let alive = true;
    const at = setTimeout(() => {
      contactForName(name, 'student').then(found => {
        if (!alive || !found) return;
        // The country follows the number by itself, so only the number is filled.
        setStudentWhatsapp(cur => cur || found.whatsapp);
      });
    }, 350);
    return () => { alive = false; clearTimeout(at); };
  }, [name]);

  useEffect(() => {
    let alive = true;
    const at = setTimeout(() => {
      contactForName(instructor, 'instructor').then(found => {
        if (!alive || !found) return;
        setInstructorWhatsapp(cur => cur || found.whatsapp);
      });
    }, 350);
    return () => { alive = false; clearTimeout(at); };
  }, [instructor]);

  /**
   * Where this reciter stopped last time, kept as an anchor.
   *
   * The two selects below open at al-Fatiha 1 every time, and a memoriser who
   * recites nightly was scrolling a list of 114 and then a list of up to 286 to
   * say the one thing the tool already knows. Their last majlis says it: this
   * offers it as a chip and leaves the selects alone, so the default never
   * moves under anybody who did not ask.
   *
   * An anchor rather than a surah and an ayah, because the last majlis may have
   * been read in another book — the number that was right there is not the
   * number here, and the anchor is what survives the crossing.
   */
  const [lastAnchor, setLastAnchor] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    setLastAnchor(null);
    const key = name.trim();
    if (!key) return;
    const at = setTimeout(() => {
      // Caught rather than left floating: with no IndexedDB — a private window,
      // a locked-down WebView — this rejects, and the form should simply not
      // offer the chip.
      sessionsForStudent(key)
        .then(found => {
          if (!alive) return;
          const last = found.find(s => s.endedAt !== null);
          setLastAnchor(last ? last.current.anchor.id : null);
        })
        .catch(() => { /* no history to offer */ });
    }, 350);
    return () => { alive = false; clearTimeout(at); };
  }, [name]);

  /**
   * That anchor as a verse of the book on screen — and only when it is somewhere
   * else. A chip that moves nothing is a chip that has to be read to be ignored.
   */
  const resumeAt = useMemo(() => {
    if (lastAnchor === null || !book || !canonical) return null;
    const at = positionFromAnchor(book, canonical, lastAnchor);
    if (!at || (at.surah === surah && at.ayah === ayah)) return null;
    return at;
  }, [lastAnchor, book, canonical, surah, ayah]);

  const handleStart = useCallback(() => {
    if (!index || !start || !end || !name.trim()) return;
    if (!alone && !instructor.trim()) return;
    if (!alone && (!isPlausibleWhatsapp(studentWhatsapp) || !isPlausibleWhatsapp(instructorWhatsapp))) return;
    const studentNumber = normalizeWhatsapp(studentWhatsapp);
    const instructorNumber = normalizeWhatsapp(instructorWhatsapp);
    const studentWhere = countryByCode(studentCountryCode)?.nameAr
      || countryOfNumber(studentWhatsapp)?.nameAr || '';
    const instructorWhere = countryByCode(instructorCountryCode)?.nameAr
      || countryOfNumber(instructorWhatsapp)?.nameAr || '';
    // Only the device owner's own side is remembered here; the other side
    // belongs to whoever was on it, and is looked up by name next time.
    if (!alone) {
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify(role === 'reciter'
          ? { whatsapp: studentNumber, countryCode: studentCountryCode, role }
          : { whatsapp: instructorNumber, countryCode: instructorCountryCode, role }));
      } catch { /* private mode — asked again next time, and that is all */ }
    }
    // Reciting alone, the fields that describe a second person are left off
    // entirely rather than written empty: there was no listener, and a record
    // saying so by omission is truer than one saying so with a blank.
    onStart(createSession(alone
      ? { studentName: name, rosterStudentId, mode, goalKind: goal, start, end, index }
      : {
        studentName: name, rosterStudentId, instructorName: instructor, operatorRole: role,
        studentWhatsapp: studentNumber, studentCountry: studentWhere,
        instructorWhatsapp: instructorNumber, instructorCountry: instructorWhere,
        goalKind: goal, start, end, index,
      }));
  }, [index, start, end, name, instructor, alone, mode, studentWhatsapp, studentCountryCode,
      instructorWhatsapp, instructorCountryCode, role, goal, rosterStudentId, onStart]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('recTitle')}
    >
      <div
        className="my-3 flex max-h-[calc(100dvh-1.5rem)] w-[440px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:max-h-[88vh]"
        onClick={e => e.stopPropagation()}
        dir={dir}
      >
        <div className="flex items-center justify-between border-b border-border bg-accent/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <BookOpenCheck size={20} className="text-emerald-600" />
            <span className="font-bold text-foreground">{t('recTitle')}</span>
          </div>
          <button
            onClick={onClose}
            data-a11y-tap
            aria-label={t('close')}
            title={t('close')}
            className="-me-1.5 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/*
            Who is listening.

            First, because it decides what the rest of this form even asks
            for: a majlis needs both sides named and reachable, and reciting
            alone needs neither. The majlis leads and is the default — it is
            the one that ends in a certificate, and the one that must never be
            started in the wrong mode by accident.
          */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recSessionMode')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([['majlis', t('recModeMajlis')], ['solo', t('recModeSolo')]] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  data-mode={value}
                  aria-pressed={mode === value}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition-all ${
                    mode === value
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-emerald-600/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {alone && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{t('recSoloHint')}</p>
            )}
          </div>

          {!alone && (<>
          {/*
            Who is holding the device.

            Both names are needed either way — a majlis has two sides and the
            certificate names them both. What this settles is which of the two
            is the person filling the form, so the other side is asked for
            plainly rather than as an optional afterthought.
          */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recIAmInSession')}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([['reciter', t('recReciter')], ['listener', t('recListener')]] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setRole(value)}
                  data-role={value}
                  aria-pressed={role === value}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition-all ${
                    role === value
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-emerald-600/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          </>)}

          {/*
            Each side in full: a name, a number, a country.

            A majlis is two people, and a record that names one of them is half
            a record. The country is not a third question — it is read off the
            dialling code and only waits to be corrected, because +1 alone
            cannot tell the United States from Canada.

            Whichever side is holding the device has its contact remembered
            between sessions; the other side is filled in from that person's
            last majlis, so a halaqa of twenty students types each number once
            in its life.
          */}
          {/*
            A teacher's phone runs a halaqa one reciter after another, so the
            reciter can be picked from the roster instead of typed — which is
            also what attaches the majlis to that student, for the teacher's
            view of them. Absent without a roster; the name field below is
            unchanged either way and still wins if it is typed into.
          */}
          {roster && roster.length > 0 && (
            <label className="mb-3 block text-xs">
              <span className="mb-1 block font-bold text-muted-foreground">{rosterLabel}</span>
              <select
                data-roster-pick
                value={rosterStudentId ?? ''}
                onChange={e => {
                  const picked = roster.find(r => r.id === e.target.value);
                  setRosterStudentId(picked?.id);
                  if (picked) setName(picked.name);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">—</option>
                {roster.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          <Party
            idPrefix="rec-student"
            legend={t('recReciter')}
            nameLabel={t('recReciterName')}
            whatsappLabel={t('recReciterWhatsapp')}
            countryLabel={t('recReciterCountry')}
            isYou={role === 'reciter'}
            names={recent}
            name={name}
            onName={value => { setName(value); setRosterStudentId(undefined); }}
            whatsapp={studentWhatsapp}
            onWhatsapp={setStudentWhatsapp}
            countryCode={studentCountryCode}
            onCountryCode={code => {
              setStudentCountryCode(code);
              const dial = countryByCode(code)?.dial;
              if (dial) setStudentWhatsapp(current => applyDialCode(current, dial));
            }}
            namePlaceholder={t('recStudentPlaceholder')}
            // Reciting alone, the reciter is the only person in the record
            // and there is nobody to reach afterwards — so the name stays and
            // the ways of contacting them go.
            nameOnly={alone}
          />

          {!alone && (<>

          <Party
            idPrefix="rec-instructor"
            legend={t('recListener')}
            nameLabel={t('recListenerName')}
            whatsappLabel={t('recListenerWhatsapp')}
            countryLabel={t('recListenerCountry')}
            isYou={role === 'listener'}
            names={recentInstructors}
            name={instructor}
            onName={setInstructor}
            whatsapp={instructorWhatsapp}
            onWhatsapp={setInstructorWhatsapp}
            countryCode={instructorCountryCode}
            onCountryCode={code => {
              setInstructorCountryCode(code);
              const dial = countryByCode(code)?.dial;
              if (dial) setInstructorWhatsapp(current => applyDialCode(current, dial));
            }}
            namePlaceholder={role === 'listener' ? t('recYourName') : t('recWhomYouReciteTo')}
          />

          </>)}

          {/* Which book this majlis is recited from. The session records it, and
              every ayah number in the report will be that book's own. */}
          <MushafPicker />

          {/* Goal */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recGoal')}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {GOALS.map(g => (
                <button
                  key={g.kind}
                  onClick={() => setGoal(g.kind)}
                  aria-pressed={goal === g.kind}
                  className={`rounded-lg border-2 px-2 py-2 text-xs font-bold transition-all ${
                    goal === g.kind
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-border bg-background text-foreground hover:border-emerald-600/40'
                  }`}
                >
                  {t(g.key)}
                </button>
              ))}
            </div>
          </div>

          {/* Start position */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recStartPos')}</div>
            <div className="flex items-center gap-3">
              <select
                value={surah}
                onChange={e => { setSurah(Number(e.target.value)); setAyah(1); }}
                aria-label={t('recSurah')}
                className="flex-[2] rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all focus:border-primary focus:ring-2"
              >
                {SURAHS.map(s => <option key={s.n} value={s.n}>{s.n}. {surahName(s.n, lang)}</option>)}
              </select>
              <select
                value={ayah}
                onChange={e => setAyah(Number(e.target.value))}
                aria-label={t('recAyah')}
                className="flex-1 rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all focus:border-primary focus:ring-2"
              >
                {Array.from({ length: ayahCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
            {/*
              One tap for the answer the two lists above would take a minute to
              give. Offered, never applied by itself: a majlis begun somewhere
              the teacher did not choose is worse than one they had to scroll to.
            */}
            {resumeAt && (
              <button
                type="button"
                data-resume-position
                onClick={() => { setSurah(resumeAt.surah); setAyah(resumeAt.ayah); }}
                className="mt-1.5 rounded-full border-2 border-emerald-600/30 px-3 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600/10 dark:text-emerald-400"
              >
                {t('recContinueFrom').replace('{where}', positionLabel(resumeAt))}
              </button>
            )}
          </div>

          {/* Where a custom majlis stops — asked only when it is asked for. */}
          {goal === 'custom' && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recEndPos')}</div>
              <div className="flex items-center gap-3">
                <select
                  value={endSurah}
                  onChange={e => { setEndSurah(Number(e.target.value)); setEndAyah(1); }}
                  aria-label={`${t('recEndPos')} — ${t('recSurah')}`}
                  className="flex-[2] rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all focus:border-primary focus:ring-2"
                >
                  {SURAHS.map(s => <option key={s.n} value={s.n}>{s.n}. {surahName(s.n, lang)}</option>)}
                </select>
                <select
                  value={endAyah}
                  onChange={e => setEndAyah(Number(e.target.value))}
                  aria-label={`${t('recEndPos')} — ${t('recAyah')}`}
                  className="flex-1 rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all focus:border-primary focus:ring-2"
                >
                  {Array.from({ length: endAyahCount }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
              {rangeBackwards && (
                <p className="mt-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  {t('recEndBeforeStart')}
                </p>
              )}
            </div>
          )}

          {/* Resolved target */}
          <div className="rounded-xl border border-border bg-accent/30 px-3 py-2.5 text-xs">
            {!paginationReady && index ? (
              <span className="text-amber-700 dark:text-amber-400">
                {t('recPaginationUnavailable').replace('{name}', mushafName(edition, lang))}
              </span>
            ) : index && end ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{t('recEndPos')}</span>
                <span className="font-bold text-foreground">
                  {positionLabel(end)}{endJuz ? ` · ${t('recJuzWord')} ${endJuz}` : ''}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground">{t('recLoadingMushaf')}</span>
            )}
          </div>

          <div>
            <button
              onClick={handleStart}
              disabled={!canStart}
              data-start
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              <BookOpenCheck size={16} />
              {t('recStart')}
            </button>
            {/* Said only when there is something to say, and only about the
                fields — the muṣḥaf and the range state their own trouble where
                they sit, above. */}
            {!canStart && missing.length > 0 && (
              <p data-start-missing className="mt-1.5 text-center text-[11px] leading-relaxed text-muted-foreground">
                {t('recStartMissing').replace('{what}', missing.join(' · '))}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FIELD =
  'w-full rounded-lg border-2 border-primary/20 bg-background px-3 py-2.5 text-sm text-foreground ' +
  'outline-none ring-primary/20 transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2';

/**
 * One side of the majlis: who, on what number, from where.
 *
 * The same three fields for the reciter and for the muqri', so neither reads
 * as an afterthought — and the one belonging to whoever is holding the device
 * is marked, because a form that asks twice for a name has to say which name
 * is yours.
 */
/**
 * The fieldset is a component of its own, so it asks the table for its two
 * words directly.
 *
 * These used to be a pair of helpers that branched on Arabic and answered
 * English for everything else — which put «you» and an English sentence about
 * dialling codes in the middle of a French, German or Spanish form. The tool
 * speaks five languages; this is one of them.
 */
const Party: React.FC<{
  idPrefix: string;
  legend: string;
  isYou: boolean;
  names: string[];
  name: string;
  onName: (value: string) => void;
  whatsapp: string;
  onWhatsapp: (value: string) => void;
  countryCode: string;
  onCountryCode: (code: string) => void;
  namePlaceholder: string;
  /**
   * Ask for the name and nothing else.
   *
   * Reciting alone there is one person in the record and nobody to reach
   * afterwards, so the contact fields are not merely optional — they have no
   * subject. The name stays because the report and the history are still
   * about somebody.
   */
  nameOnly?: boolean;
  /* Written out rather than composed from `legend`: "واتساب القارئ" is one
     phrase in Arabic and "Reciter's WhatsApp" is another in English, and glueing
     a preposition between two translated halves produces neither. */
  nameLabel: string;
  whatsappLabel: string;
  countryLabel: string;
}> = ({
  idPrefix, legend, isYou, names, name, onName, whatsapp, onWhatsapp, countryCode, onCountryCode,
  namePlaceholder, nameLabel, whatsappLabel, countryLabel, nameOnly,
}) => {
  const { t } = useI18n();
  return (
  <fieldset className="rounded-xl border border-border bg-accent/20 p-3">
    <legend className="px-1 text-xs font-bold text-muted-foreground">
      {legend}
      {isYou && <span className="ms-1 text-emerald-700 dark:text-emerald-400">({t('recYouWord')})</span>}
    </legend>

    <div className="space-y-2.5">
      <div>
        <input
          id={idPrefix}
          list={`${idPrefix}-recent`}
          value={name}
          onChange={e => onName(e.target.value)}
          placeholder={namePlaceholder}
          autoComplete="off"
          aria-label={nameLabel}
          className={FIELD}
        />
        <datalist id={`${idPrefix}-recent`}>
          {names.map(n => <option key={n} value={n} />)}
        </datalist>
      </div>

      {!nameOnly && (
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div>
          <input
            id={`${idPrefix}-whatsapp`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            value={whatsapp}
            onChange={e => onWhatsapp(e.target.value)}
            placeholder="+20 100 123 4567"
            autoComplete="tel"
            aria-label={whatsappLabel}
            className={`${FIELD} text-start`}
          />
          {whatsapp.trim() && !isPlausibleWhatsapp(whatsapp) && (
            <p className="mt-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
              {t('recWhatsappHint')}
            </p>
          )}
        </div>
{/*
          Searchable, not a plain list. Choosing a country writes its code into
          the number beside it, so only the subscriber digits are typed — and a
          number that already carries a code selects the country back here.
        */}
        <CountryPicker
          id={`${idPrefix}-country`}
          label={countryLabel}
          value={countryCode}
          onChange={onCountryCode}
        />
      </div>
      )}
    </div>
  </fieldset>
  );
};

export default RecitationSetupModal;
