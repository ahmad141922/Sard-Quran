import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, BookOpenCheck, Play } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { SURAHS, surahName } from '@/lib/quran-data';
import { discoverMushafs, loadQuranIndex, type QuranIndex } from '@/lib/quran-index';
import { MUSHAF_LABELS, type MushafId } from '@/lib/mushaf-editions';
import {
  createSession, resolveGoalEnd,
  type GoalKind, type RecitationSession, type SessionMode,
} from '@/lib/recitation-session';
import { wizardProfile } from '@/lib/wizard-profile';
import { recentInstructorNames, recentStudentNames, sessionsForStudent } from '@/lib/recitation-store';
import { mushafName } from '@/lib/mushaf/registry';
import { useMushaf } from '@/lib/mushaf/MushafProvider';
import { useMushafPageIndex } from '@/lib/mushaf/page-index';
import { positionFromAnchor, positionInEdition } from '@/lib/mushaf/position';
import { canonicalBookFromQuranIndex, editionBook } from '@/lib/mushaf/text-pages';
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
  /**
   * Who this device belongs to, when an account says so: a signed-in teacher
   * (the listener) or a participant's phone that joined one (the reciter).
   *
   * That side's name comes from the account and is not typed. A form asking
   * a signed-in person who they are reads as not knowing them — and asking
   * for a phone number on top of it reads worse.
   */
  account?: { name: string; side: 'reciter' | 'listener' };
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
/**
 * Which side of the majlis this device usually holds. The key is the one the
 * form once kept a phone number under too; only the side is read now.
 */
const CONTACT_KEY = 'tajweedoo:contact';

function storedRole(): 'reciter' | 'listener' {
  try {
    const raw = localStorage.getItem(CONTACT_KEY);
    return raw && JSON.parse(raw)?.role === 'reciter' ? 'reciter' : 'listener';
  } catch { return 'listener'; }
}

const RecitationSetupModal: React.FC<Props> = ({ open, onClose, onStart, roster, rosterLabel, account }) => {
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
  const [role, setRole] = useState<'reciter' | 'listener'>(() => account?.side ?? storedRole());
  /** The account's own name, when there is one with a name to give. */
  const mine = account?.name.trim() || '';
  /*
   * The side the account holder is on is named from the account. Followed
   * rather than set once: the account can arrive after the form opens, and a
   * teacher who switches to reciting is still the same person.
   */
  useEffect(() => {
    if (!mine) return;
    if (role === 'listener') setInstructor(mine);
    else { setName(mine); setRosterStudentId(undefined); }
  }, [mine, role]);
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
  // Both sides named, or the majlis does not start: the certificate names
  // them both. Reciting alone there is no second side to name.
  const canStart = paginationReady && !!start && !!end && !rangeBackwards
    && name.trim().length > 0 && (alone || instructor.trim().length > 0);

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
    // Only which side this device held is remembered; names come from the
    // account, the roster, or this device's own history.
    if (!alone) {
      try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ role })); } catch { /* private mode */ }
    }
    // Reciting alone, the fields that describe a second person are left off
    // entirely rather than written empty: there was no listener, and a record
    // saying so by omission is truer than one saying so with a blank.
    onStart(createSession(alone
      ? { studentName: name, rosterStudentId, mode, goalKind: goal, start, end, index }
      : {
        studentName: name, rosterStudentId, instructorName: instructor, operatorRole: role,
        goalKind: goal, start, end, index,
      }));
  }, [index, start, end, name, instructor, alone, mode, role, goal, rosterStudentId, onStart]);

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
            for: a majlis needs both sides named, and reciting
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
            Each side by name, and nothing else.

            A majlis is two people and the certificate names them both. No
            phone number and no country: the tool sends nobody anything, and a
            form that asks for a number it never uses is the shape of a scam.
            Whichever side has an account is named from it.
          */}
          {/*
            A teacher's phone runs a halaqa one reciter after another, so the
            reciter can be picked from the roster instead of typed — which is
            also what attaches the majlis to that student, for the teacher's
            view of them. Absent without a roster; the name field below is
            unchanged either way and still wins if it is typed into.
          */}
          {roster && roster.length > 0 && !(mine && role === 'reciter') && (
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
            isYou={role === 'reciter'}
            names={recent}
            name={name}
            onName={value => { setName(value); setRosterStudentId(undefined); }}
            namePlaceholder={t('recStudentPlaceholder')}
            fromAccount={!!mine && role === 'reciter'}
          />

          {!alone && (<>

          <Party
            idPrefix="rec-instructor"
            legend={t('recListener')}
            nameLabel={t('recListenerName')}
            isYou={role === 'listener'}
            names={recentInstructors}
            name={instructor}
            onName={setInstructor}
            namePlaceholder={role === 'listener' ? t('recYourName') : t('recWhomYouReciteTo')}
            fromAccount={!!mine && role === 'listener'}
          />

          </>)}

          {/* Which book this majlis is recited from. The session records it, and
              every ayah number in the report will be that book's own. */}
          {/* One line, not a field and its paragraph: the book rarely changes
              between sittings, and the form remembers it. */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recMushaf')}</div>
            <MushafPicker compact className="w-full" />
          </div>

          {/* Goal */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t('recGoal')}</div>
            {/* One row that scrolls sideways, rather than a grid of six that
                took the height of a whole field. */}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {GOALS.map(g => (
                <button
                  key={g.kind}
                  onClick={() => setGoal(g.kind)}
                  aria-pressed={goal === g.kind}
                  className={`shrink-0 whitespace-nowrap rounded-full border-2 px-3.5 py-2 text-xs font-bold transition-all ${
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
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-600/40 bg-emerald-600/[0.07] px-3 py-2.5 text-sm font-bold text-emerald-700 transition-colors hover:border-emerald-600 hover:bg-emerald-600/15 dark:text-emerald-400"
              >
                <Play size={15} aria-hidden />
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

        </div>
        {/*
          The start, pinned under the form rather than at the end of it: on a
          phone the end of it was a scroll away, so the one button the whole
          form exists for was the one not on screen.
        */}
        <div className="shrink-0 border-t border-border bg-card px-4 py-3">
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
  namePlaceholder: string;
  nameLabel: string;
  /** Named by the signed-in account: shown, not typed. */
  fromAccount?: boolean;
}> = ({ idPrefix, legend, isYou, names, name, onName, namePlaceholder, nameLabel, fromAccount }) => {
  const { t } = useI18n();
  return (
  <fieldset className="rounded-xl border border-border bg-accent/20 p-3">
    <legend className="px-1 text-xs font-bold text-muted-foreground">
      {legend}
      {isYou && <span className="ms-1 text-emerald-700 dark:text-emerald-400">({t('recYouWord')})</span>}
    </legend>

    <input
      id={idPrefix}
      list={`${idPrefix}-recent`}
      value={name}
      onChange={e => onName(e.target.value)}
      readOnly={fromAccount}
      data-from-account={fromAccount ? '' : undefined}
      placeholder={namePlaceholder}
      autoComplete="off"
      aria-label={nameLabel}
      className={`${FIELD} ${fromAccount ? 'cursor-default opacity-80' : ''}`}
    />
    <datalist id={`${idPrefix}-recent`}>
      {names.map(n => <option key={n} value={n} />)}
    </datalist>
    {fromAccount && (
      <p className="mt-1 text-[11px] text-muted-foreground">{t('recFromAccount')}</p>
    )}
  </fieldset>
  );
};

export default RecitationSetupModal;
