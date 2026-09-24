// Closing supplication for the session report.
//
// Each carries its source: two Qur'anic, one from the sunnah. The report is
// read by parents, so the attribution stays short — no editorial notes.
//
// The pick is derived from the session id, not random: reprinting the same
// report must produce the same sheet.

export type Lang = 'ar' | 'en' | 'fr' | 'de' | 'es';

export interface Dua {
  id: string;
  /** Always shown, in every interface language. */
  ar: string;
  /** Meaning, for the non-Arabic interfaces. */
  meaning: Record<Exclude<Lang, 'ar'>, string>;
  source: Record<Lang, string>;
}

export const DUAS: Dua[] = [
  {
    id: 'zidni-ilma',
    ar: 'رَبِّ زِدْنِي عِلْمًا',
    meaning: {
      en: 'My Lord, increase me in knowledge.',
      fr: 'Mon Seigneur, accrois-moi en science.',
      de: 'Mein Herr, mehre mir das Wissen.',
      es: 'Señor mío, aumenta mi conocimiento.',
    },
    source: {
      ar: 'سورة طه: ١١٤',
      en: 'Qur\'an, Ta-Ha 20:114',
      fr: 'Coran, Ta-Ha 20:114',
      de: 'Koran, Ta-Ha 20:114',
      es: 'Corán, Ta-Ha 20:114',
    },
  },
  {
    id: 'taqabbal-minna',
    ar: 'رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنتَ السَّمِيعُ الْعَلِيمُ',
    meaning: {
      en: 'Our Lord, accept this from us. Indeed You are the Hearing, the Knowing.',
      fr: 'Notre Seigneur, accepte ceci de nous. Tu es certes l\'Audient, l\'Omniscient.',
      de: 'Unser Herr, nimm es von uns an. Du bist der Allhörende, der Allwissende.',
      es: 'Señor nuestro, acéptanoslo. Tú eres Quien todo lo oye, Quien todo lo sabe.',
    },
    source: {
      ar: 'سورة البقرة: ١٢٧',
      en: 'Qur\'an, al-Baqarah 2:127',
      fr: 'Coran, al-Baqara 2:127',
      de: 'Koran, al-Baqara 2:127',
      es: 'Corán, al-Baqara 2:127',
    },
  },
  {
    id: 'rabi-quloobina',
    ar: 'اللَّهُمَّ اجْعَلِ الْقُرْآنَ الْعَظِيمَ رَبِيعَ قُلُوبِنَا',
    meaning: {
      en: 'O Allah, make the Mighty Qur\'an the springtime of our hearts.',
      fr: 'Ô Allah, fais du Noble Coran le printemps de nos cœurs.',
      de: 'O Allah, mache den erhabenen Koran zum Frühling unserer Herzen.',
      es: 'Oh Alá, haz del Noble Corán la primavera de nuestros corazones.',
    },
    source: {
      ar: 'من حديث ابن مسعود رضي الله عنه، رواه أحمد',
      en: 'From the narration of Ibn Mas\'ud, reported by Ahmad',
      fr: 'D\'après Ibn Mas\'ud, rapporté par Ahmad',
      de: 'Nach Ibn Mas\'ud, überliefert von Ahmad',
      es: 'De Ibn Mas\'ud, transmitido por Ahmad',
    },
  },
];

/** Stable per session — the same majlis always prints the same supplication. */
export function duaForSession(sessionId: string): Dua {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) hash = (hash * 31 + sessionId.charCodeAt(i)) >>> 0;
  return DUAS[hash % DUAS.length];
}

/**
 * A word of encouragement scaled to what actually happened. Ordinary praise,
 * not a religious claim — so no attribution and no certainty flag.
 */
export function encouragement(opts: { khatmah: boolean; progressPct: number; notesPerPage: number }, lang: Lang): string {
  const { khatmah, progressPct, notesPerPage } = opts;
  const pick = khatmah ? 'khatmah'
    : progressPct >= 100 ? 'goal'
    : notesPerPage <= 0.5 ? 'clean'
    : progressPct >= 50 ? 'steady'
    : 'start';

  const lines: Record<string, Record<Lang, string>> = {
    khatmah: {
      ar: 'تقبّل الله ختمتك، وجعلها حجّةً لك لا عليك.',
      en: 'May Allah accept your khatmah and make it a witness for you.',
      fr: 'Qu\'Allah accepte ta khatma et en fasse un témoin en ta faveur.',
      de: 'Möge Allah deine Chatma annehmen und sie zu einem Zeugen für dich machen.',
      es: 'Que Alá acepte tu jatma y la haga testigo a tu favor.',
    },
    goal: {
      ar: 'بلغتَ هدف المجلس كاملًا. أحسنت.',
      en: 'You reached the whole goal of this session. Well done.',
      fr: 'Tu as atteint tout l\'objectif de cette séance. Bravo.',
      de: 'Du hast das ganze Ziel dieser Sitzung erreicht. Gut gemacht.',
      es: 'Alcanzaste todo el objetivo de esta sesión. Bien hecho.',
    },
    clean: {
      ar: 'سردٌ متقن، والملاحظات قليلة. ثبّتك الله.',
      en: 'A sound recitation with few notes. May Allah keep you firm.',
      fr: 'Une récitation solide, peu de remarques. Qu\'Allah t\'affermisse.',
      de: 'Eine sichere Rezitation mit wenigen Hinweisen. Möge Allah dich festigen.',
      es: 'Una recitación sólida, con pocas notas. Que Alá te afiance.',
    },
    steady: {
      ar: 'قطعتَ أكثر من نصف الطريق. واصِل.',
      en: 'You are past the halfway mark. Keep going.',
      fr: 'Tu as dépassé la moitié du chemin. Continue.',
      de: 'Du hast mehr als die Hälfte geschafft. Mach weiter.',
      es: 'Has pasado la mitad del camino. Sigue así.',
    },
    start: {
      ar: 'بدايةٌ طيّبة، والمداومة هي الأصل.',
      en: 'A good start — consistency is what counts.',
      fr: 'Un bon début — la régularité est l\'essentiel.',
      de: 'Ein guter Anfang — es kommt auf die Beständigkeit an.',
      es: 'Un buen comienzo: lo que cuenta es la constancia.',
    },
  };
  return lines[pick][lang] ?? lines[pick].en;
}
