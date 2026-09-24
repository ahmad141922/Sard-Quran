import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { phonemise, fit } from '@/lib/asr/phonemise';

/**
 * The phonemiser, checked one rule at a time against the Qur'an's own answers.
 *
 * The whole of it is measured by `npm run phonemiser:verify`, which needs the
 * Uthmani text off the network. What is here instead is a case per rule, so a
 * change that trades one rule for another cannot hide inside an aggregate.
 *
 * ## Nothing Arabic in this file was typed by hand
 *
 * Both sides come from data: the text from a fixture cut out of the Uthmani
 * source, the sounds from the index the app ships. Typing either would be
 * testing this file's author against themselves — which is exactly the mistake
 * that made an early reading of the symbol table wrong. The literals agreed
 * with the assumption because they had come from it, and the data did not.
 *
 * A ḥaraka and a shadda can also be stored in either order and look identical
 * on screen, so a hand-typed expectation fails while printing the same
 * characters as the value it is compared with. Reading both sides from data
 * removes the whole class.
 */

const index = JSON.parse(readFileSync('sard/public/quran-phonemes.json', 'utf8')) as {
  vocab: string[]; model: (string | null)[]; ayahs: Record<string, { t: string }>;
};
const alphabet = new Set(index.vocab);
const text = JSON.parse(readFileSync('src/test/fixtures/uthmani-sample.json', 'utf8')) as
  Record<string, string>;

/** What the index says an āyah sounds like. */
const expected = (key: string) =>
  [...Buffer.from(index.ayahs[key].t, 'base64')].map(i => index.vocab[i]);

const said = (key: string) => phonemise(text[key], { alphabet });

/** The whole āyah, sound for sound, against the index. */
function check(key: string) {
  expect(said(key).join(' · ')).toBe(expected(key).join(' · '));
}

/** A symbol of the alphabet, fetched by name rather than typed. */
const sym = (name: string) => {
  const found = index.vocab.find(v => v === name);
  if (!found) throw new Error(`no symbol «${name}»`);
  return found;
};

describe('the shape of a sound', () => {
  it('never invents a symbol the recogniser has no name for', () => {
    for (const key of Object.keys(text)) {
      for (const t of said(key)) expect(alphabet.has(t), `${key}: ${t}`).toBe(true);
    }
  });
});

describe('the article', () => {
  /** 1:2 opens on it; 1:1 has the same word mid-āyah and swallows its hamza. */
  it('sounds its hamza when the recitation opens on it, and swallows it after', () => {
    check('1:2');
    check('1:1');
  });

  it('drops its lām into a sun letter and keeps it before a moon letter', () => {
    check('1:4');   // ad-dīn: the lām is gone
    check('1:2');   // al-ḥamd: the lām is said
  });

  /** A hamza the muṣḥaf hangs on a tāṭwīl, in «al-āzifa». */
  it('reads a hamza written on the line as a hamza', () => {
    check('53:57');
  });
});

describe('the Name of God', () => {
  it('says the alif nobody writes, heavy after a fatḥa', () => check('112:1'));
  it('says it light after a kasra', () => check('1:1'));

  /**
   * The trap the rule exists for: «kullahā» in 2:25 is a doubled lām on a fatḥa
   * with a hāʾ behind it, exactly like the Name, and is not the Name. Only the
   * lām in front tells them apart.
   */
  it('is not fooled by a word merely shaped like it', () => {
    check('2:25');
    expect(said('2:25')).not.toContain(sym('لّ^َ'));
  });
});

describe('a sākin nūn, and the tanwīn that is one', () => {
  it('is said plainly before a throat letter', () => check('1:7'));
  it('hides before the letters that hide it', () => check('2:3'));
  it('becomes a mīm before a bāʾ', () => check('2:8'));

  /** «ad-dunyā» in 2:85: inside one word it is said, not swallowed. */
  it('is said before a wāw or yāʾ inside its own word', () => {
    check('2:85');
    expect(said('2:85')).toContain(sym('ن'));
  });
});

describe('pausing at the end', () => {
  it('takes the last vowel away, and echoes a qalqala letter there', () => check('112:1'));

  /** «raqīban» in 4:1 … and «mubīnan» closing 4:50. */
  it('opens a fatḥatān out into its alif rather than sounding a nūn', () => {
    check('4:50');
    const end = said('4:50').slice(-2);
    expect(end).toEqual([sym('نَ'), sym('ا:2')]);
  });

  it('says a tāʾ marbūṭa as a hāʾ', () => {
    check('53:57');
    expect(said('53:57').at(-1)).toBe(sym('ه'));
  });

  it('doubles a letter that was doubled, and echoes it — «wa-tabb»', () => check('111:1'));
});

describe('how long a madd is held', () => {
  it('holds a plain one for two and stretches the last one to four', () => check('1:3'));
  it('holds four where the muṣḥaf marks it and six where it meets a sākin', () => check('1:7'));
  it('drops one that runs into a sākin', () => check('2:25'));

  /**
   * «khawfin» closing 106:4: a līn wāw held at a pause, and the only one in the
   * Qur'an. Only the līn is asserted — the rest of that āyah the phonemiser does
   * not reproduce exactly, and claiming it did would be the test fitting itself
   * to the code.
   */
  it('holds a līn letter at a pause', () => {
    expect(said('106:4')).toContain(sym('و:2'));
  });
});

describe('the rāʾ', () => {
  it('is heavy on a fatḥa and light on a kasra', () => check('1:2'));

  /** Sākin it takes the colour of the vowel before it, and a madd yāʾ is one. */
  it('is light after a madd yāʾ, stopped on', () => check('2:8'));
});

describe('the readings only one āyah in the Qur’an asks for', () => {
  it('pauses inside a word where the muṣḥaf marks a sakt', () => {
    check('75:27');
    check('83:14');
  });

  /*
   * These two āyāt are long and the phonemiser does not reproduce either of
   * them whole, so what is asserted is the reading itself: that the one rāʾ in
   * the Qur'an said with imāla, and the one hamza eased, both come out.
   */
  it('bends the rāʾ of «majrāhā»', () => {
    expect(said('11:41')).toContain(sym('ر۪'));
  });

  it('eases the second hamza of «a-aʿjamiyyun»', () => {
    expect(said('41:44')).toContain(sym('ٲَ'));
  });
});

/**
 * A matn is not a muṣḥaf, and the differences are in the writing rather than in
 * the language: no joining-hamza spelling, marks written after their alif
 * instead of before it, and whole words left unvowelled. These are the only
 * cases whose text is written here rather than taken from data, because the
 * text *is* what is under test — each is a spelling a muṣḥaf never uses.
 */
describe('reading an ordinary printed matn', () => {
  it('reads a plain alif as the hamza the muṣḥaf would have spelled', () => {
    // «bi-l-kasri»: the article's alif falls inside the word here.
    expect(phonemise('بِالْكَسْرِ', { pause: false, alphabet }))
      .toEqual(phonemise('بِٱلْكَسْرِ', { pause: false, alphabet }));
  });

  it('takes a mark written after an alif as belonging to the letter before it', () => {
    // «wa-lā», as most matn prints spell it against how a muṣḥaf does.
    expect(phonemise('وَلاَ', { pause: false, alphabet }))
      .toEqual(phonemise('وَلَا', { pause: false, alphabet }));
  });

  /**
   * «al-kamāl» as the Tuhfa prints it, with the mīm left bare.
   *
   * The alif still lengthens — that is what is asserted. The missing fatḥa is
   * **not** recovered, and the sound comes out bare where a muṣḥaf would have
   * said «ma»: a vowel lost, not a word, and the honest limit of reading a text
   * that does not mark everything.
   */
  it('reads an alif as a prolongation even where the word is left unvowelled', () => {
    const bare = phonemise('الْكَمالِ', { pause: false, alphabet });
    const marked = phonemise('الْكَمَالِ', { pause: false, alphabet });
    expect(bare).toContain(sym('ا:2'));
    expect(bare).toHaveLength(marked.length);
    expect(bare.filter(t => t !== sym('م'))).toEqual(marked.filter(t => t !== sym('مَ')));
  });

  /*
   * Given room beyond the default five seconds. It phonemises 2,895 abyāt from
   * seven books and is genuinely that slow — but only under a full parallel
   * run, so it passed alone and failed about one suite in three. A test that
   * fails on machine load teaches people to re-run rather than to look.
   */
  it('says every one of the seven matns in sounds the recogniser knows', { timeout: 20_000 }, () => {
    for (const id of ['tuhfa', 'jazariyya', 'salsabil', 'laali', 'durra', 'shatibiyya', 'tayyiba']) {
      const file = JSON.parse(readFileSync(`sard/public/matn-${id}.json`, 'utf8')) as {
        abyat: { n: number; sadr: string; ajz: string }[];
      };
      for (const bayt of file.abyat) {
        for (const half of [bayt.sadr, bayt.ajz]) {
          for (const t of phonemise(half, { alphabet })) {
            expect(alphabet.has(t), `${id} bayt ${bayt.n}: ${t}`).toBe(true);
          }
        }
      }
    }
  });

  /** Enough sounds to align against: a bayt is a line of verse, not a word. */
  it('gets a bayt’s worth of sounds out of a bayt', () => {
    const file = JSON.parse(readFileSync('sard/public/matn-jazariyya.json', 'utf8')) as {
      abyat: { sadr: string; ajz: string }[];
    };
    const counts = file.abyat.map(b =>
      phonemise(b.sadr, { alphabet }).length + phonemise(b.ajz, { alphabet }).length);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(mean).toBeGreaterThan(25);
    expect(Math.min(...counts)).toBeGreaterThan(10);
  });
});

describe('bending a sound the alphabet does not have', () => {
  /**
   * The 233 symbols are the sounds the **Qur'an** makes, which is not every
   * sound Arabic makes: a doubled dāl echoed at a pause occurs in a matn and
   * has no symbol. Dropping the gemination keeps the consonant and its echo,
   * which is what an alignment matches on.
   */
  it('drops the detail rather than emitting something nothing can hear', () => {
    const doubledDal = sym('دڇ').replace('دڇ', 'د') + 'ّ' + 'ڇ';
    expect(alphabet.has(doubledDal)).toBe(false);
    expect(fit(doubledDal, alphabet)).toBe(sym('دڇ'));
  });

  it('leaves a sound the alphabet does have exactly as it is', () => {
    for (const name of ['بّڇ', 'رّ^َ', 'ۦ:4', 'ں']) {
      expect(fit(sym(name), alphabet)).toBe(sym(name));
    }
  });
});
