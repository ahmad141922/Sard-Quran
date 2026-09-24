import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Mail, Globe, ShieldCheck, Info } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { withBase } from '@/lib/asset-url';
import { isNative } from '@/lib/native';

/**
 * The screen a store asks for: what this is, who made it, how to reach them,
 * and what happens to what the teacher types.
 *
 * Its text lives here rather than in `@/hooks/useI18n` on purpose. That
 * dictionary is the board's too and is held to five-language parity by a test,
 * and a privacy policy is not a UI string: it is a paragraph of prose in the
 * two languages this tool actually speaks, and it has to say the same thing as
 * the page published at `PRIVACY_URL` — one wording, kept in one place, in the
 * language the reader chose.
 */

/** Where the same policy is published, because a store needs a public URL. */
const PRIVACY_URL = 'https://sard.tajweedoo.com/privacy';
const SUPPORT_EMAIL = 'support@tajweedoo.com';
const TAJWEEDOO_URL = 'https://tajweedoo.com';

/**
 * Tajweedoo's own channels, the same three the landing page's footer carries.
 *
 * Their names are not translated — they are the platforms' own — so they sit
 * here beside the addresses rather than in the two dictionaries below.
 *
 * The marks are drawn here rather than imported: this lucide build carries no
 * brand glyphs, and three inline paths are lighter than a second icon set.
 */
/** Required by the upstream licences — see the block that renders these. */
const SIMILAR_SOURCES: { name: string; url: string; license?: string }[] = [
  { name: 'Quranic Arabic Corpus', url: 'https://corpus.quran.com', license: 'GNU General Public License' },
  { name: 'Quranpedia', url: 'https://quranpedia.net' },
  { name: 'Quran_Mutashabihat_Data', url: 'https://github.com/Waqar144/Quran_Mutashabihat_Data' },
  // The phonetic labelling the solo-mode recogniser compares against. NPL-1.2
  // dropped the attribution requirement; naming it is still the right thing.
  {
    name: 'Quran-Lab — quran-tajweed-phonetics',
    url: 'https://huggingface.co/datasets/Quran-Lab/quran-tajweed-phonetics',
    license: 'NPL-1.2',
  },
];

const SOCIAL = [
  {
    name: 'Facebook',
    url: 'https://www.facebook.com/Tajweedoo',
    label: { ar: 'فيسبوك', en: 'Facebook' },
    path: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />,
  },
  {
    name: 'Instagram',
    url: 'https://www.instagram.com/Tajweedoo',
    label: { ar: 'انستجرام', en: 'Instagram' },
    path: (
      <>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </>
    ),
  },
  {
    name: 'WhatsApp',
    url: 'https://whatsapp.com/channel/0029VbBtdqVICVfoB2K',
    label: { ar: 'قناة واتساب', en: 'WhatsApp channel' },
    path: (
      <>
        <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.5z" />
        <path d="M9.2 9c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.4l.6 1.3c.1.2 0 .4-.1.5l-.4.4c-.1.2-.2.3-.1.5.4.8 1.2 1.6 2 2 .2.1.4 0 .5-.1l.4-.4c.2-.2.3-.2.5-.1l1.3.6c.4.2.4.4.4.6v.5c0 .2 0 .4-.4.6-.4.2-.9.3-1.5.1-2-.6-3.9-2.5-4.5-4.5-.2-.6-.1-1.1.1-1.5z" />
      </>
    ),
  },
] as const;

/** Last reviewed. Shown, because a policy with no date says nothing. */
const UPDATED = { ar: '٢١ أغسطس ٢٠٢٦', en: '21 August 2026' };

interface Section { title: string; body: string[] }

const CONTENT: Record<'ar' | 'en', {
  aboutTool: Section;
  aboutTajweedoo: Section;
  contact: { title: string; body: string[]; email: string; site: string; follow: string };
  privacy: { title: string; intro: string; sections: Section[]; published: string };
  credits: Section;
  /** The one place the similarity data's licences are satisfied. */
  similarSources: { title: string; body: string };
  back: string;
  updated: string;
  version: string;
}> = {
  ar: {
    aboutTool: {
      title: 'عن الأداة',
      body: [
        'أداة السرد القرآني تسجّل مجلس السرد كما يجري: المصحف أمامك، وثلاثة أزرار للملاحظة — تردّد، وخطأ حفظ، وتنبيه تجويد — تُضغط بلا مقاطعة القارئ. وفي آخر المجلس تقرير وشهادة.',
        'الصفحات المعروضة صفحات مصحف حقيقيّة لا نصّ مُعاد صفّه، بخمس روايات: حفص وورش وقالون والدوري وشعبة. والأداة تعمل بلا إنترنت، والمجلس ينجو من إغلاق التطبيق.',
        'الأداة مجّانيّة بالكامل، بلا إعلانات وبلا اشتراك.',
      ],
    },
    aboutTajweedoo: {
      title: 'عن تجويدوو',
      body: [
        'تجويدوو منصّة وأدوات رقميّة تساعد معلّم القرآن على تقديم حصّة أكثر تفاعلًا وتنظيمًا ومتعة. وأداة السرد إحدى إصداراتها، صُنعت للسرد والمراجعة وحدهما.',
      ],
    },
    contact: {
      title: 'تواصل معنا',
      body: ['للدعم أو الاقتراح أو الإبلاغ عن خطأ في صفحة مصحف، راسلنا وسنردّ.'],
      email: 'راسلنا بالبريد',
      site: 'موقع تجويدوو',
      follow: 'تابع تجويدوو',
    },
    privacy: {
      title: 'سياسة الخصوصيّة',
      intro: 'باختصار: ما تكتبه يُحفظ على جهازك أوّلًا، ويُرفع مجلسٌ منتهٍ إلى قاعدة بيانات الأداة ليظهر في تقارير صاحبها. لا إعلانات، ولا تتبّع، ولا بيع بيانات — لا اليوم ولا لاحقًا.',
      sections: [
        {
          title: 'ما يبقى على جهازك',
          body: [
            'المجالس كلّها — الملاحظات والمواضع والمدد — تُكتب في تخزين التطبيق على جهازك أثناء المجلس، لا على الشبكة. ولذلك يعمل السرد بلا إنترنت، ويرجع المجلس كما تركته بعد إغلاق التطبيق.',
            'ويُحفظ معها تفضيلك للّغة والوضع الليلي والطبعة المختارة.',
          ],
        },
        {
          title: 'ما يُرفع، ومتى',
          body: [
            'عند **إنهاء** المجلس تُرسل نسخته إلى قاعدة بيانات الأداة. والمجلس الجاري لا يُرفع.',
            'المرفوع: اسم القارئ واسم المقرئ، ورقما واتساب ودولتاهما إن أدخلتهما، والطبعة والرواية والموضع الذي بلغه المجلس، وملاحظاته وأعدادها ومدده، وبريد المعلّم إن كان مسجّلًا في تجويدوو.',
            'وإن لم تكن متّصلًا وقت الإنهاء فالمجلس ينتظر على جهازك ويُرفع في أوّل مرّة تفتح فيها الأداة وأنت متّصل.',
          ],
        },
        {
          title: 'لماذا، ومن يقرأ',
          body: [
            'يُرفع ليظهر في تقارير صاحب الأداة، وليصحّ التحقّق من شهادة السرد حين تُمسح بالهاتف.',
            'وقراءة هذه البيانات محصورة في إدارة الأداة عبر واجهة محميّة؛ لا يستطيع مستخدم آخر — ولا التطبيق نفسه — قراءة صفٍّ ليس له.',
          ],
        },
        {
          title: 'خدمات تُطلب من خارج التطبيق',
          body: [
            '**Supabase** — قاعدة بيانات المجالس المرفوعة.',
            '**Cloudflare R2** — صفحات المصاحف تُجلب من مستودع ملفّات عند فتح كل صفحة، ويُرسل معها ما ترسله أيّ زيارة لملفّ على الإنترنت (عنوان IP ونوع الجهاز) بلا أيّ بيانات عن المجلس.',
            '**Google Fonts** — خطوط الواجهة تُحمَّل من خوادم جوجل، فيصلها عنوان IP الجهاز.',
          ],
        },
        {
          title: 'إن كان القارئ طفلًا',
          body: [
            'هذه أداة معلّم، والقارئ قد يكون طفلًا. فإدخال اسم طفل أو رقم واتصاله مسؤوليّة المعلّم، وعليه أخذ إذن وليّ الأمر قبله. ويمكن تشغيل المجلس بلا رقم واتساب أصلًا، وبالاسم الأوّل وحده.',
          ],
        },
        {
          title: 'حذف بياناتك',
          body: [
            'المجلس على جهازك يُحذف من قائمة المجالس في الأداة.',
            'وللمرفوع: راسلنا على البريد أدناه ونحذف ما يخصّك من قاعدة البيانات.',
          ],
        },
      ],
      published: 'هذه السياسة منشورة أيضًا على',
    },
    credits: {
      title: 'أصول صفحات المصحف',
      body: [
        'صفحات المصاحف المعروضة من مصاحف مجمّع الملك فهد لطباعة المصحف الشريف، تُعرض كما نُشرت بلا إعادة صفّ ولا تعديل في الرسم.',
      ],
    },
    similarSources: {
      title: 'أصول بيانات المتشابهات',
      body: 'بيانات مواضع التشابه بين الآيات مبنيّة على المصادر الآتية، وذكرها هنا شرطٌ في تراخيصها:',
    },
    back: 'رجوع',
    updated: 'آخر تحديث',
    version: 'الإصدار',
  },
  en: {
    aboutTool: {
      title: 'About the tool',
      body: [
        'The Quran Recitation Tool records a recitation session as it happens: the mushaf in front of you and three note buttons — hesitation, memory slip, tajweed correction — pressed without interrupting the reciter. At the end it gives you a report and a certificate.',
        'The pages shown are real mushaf pages, not re-typeset text, in five riwayat: Hafs, Warsh, Qalun, ad-Duri and Shu\'bah. The tool works offline, and a session survives the app being closed.',
        'It is entirely free: no ads, no subscription.',
      ],
    },
    aboutTajweedoo: {
      title: 'About Tajweedoo',
      body: [
        'Tajweedoo is a platform and a set of digital tools that help a Quran teacher give a lesson that is more interactive, better organised and more enjoyable. This tool is one of its releases, built for reciting and reviewing alone.',
      ],
    },
    contact: {
      title: 'Contact us',
      body: ['For support, a suggestion, or to report an error on a mushaf page, write to us and we will answer.'],
      email: 'Email us',
      site: 'Tajweedoo website',
      follow: 'Follow Tajweedoo',
    },
    privacy: {
      title: 'Privacy policy',
      intro: 'In short: what you type is saved on your device first, and a finished session is uploaded to the tool\'s database so it appears in its owner\'s reports. No ads, no tracking, no selling of data — not now and not later.',
      sections: [
        {
          title: 'What stays on your device',
          body: [
            'Every session — its notes, positions and durations — is written to the app\'s storage on your device during the majlis, not over the network. That is why recitation works offline, and why a session comes back as you left it after the app is closed.',
            'Your language, dark-mode and edition preferences are kept with it.',
          ],
        },
        {
          title: 'What is uploaded, and when',
          body: [
            'When a session is **ended**, a copy is sent to the tool\'s database. A session still running is not uploaded.',
            'What is sent: the reciter\'s and the listener\'s names, their WhatsApp numbers and countries if you entered them, the edition, riwaya and position the session reached, its notes and their counts and durations, and the teacher\'s email if one is registered with Tajweedoo.',
            'If you are offline when the session ends, it waits on your device and is uploaded the first time you open the tool with a connection.',
          ],
        },
        {
          title: 'Why, and who can read it',
          body: [
            'It is uploaded so it appears in the reports of whoever runs the tool, and so a recitation certificate can be verified when its code is scanned.',
            'Reading this data is limited to the tool\'s administration through a protected interface; no other user — and not the app itself — can read a row that is not theirs.',
          ],
        },
        {
          title: 'Services requested from outside the app',
          body: [
            '**Supabase** — the database holding uploaded sessions.',
            '**Cloudflare R2** — mushaf pages are fetched from a file store as each page opens; that request carries what any request for a file on the internet carries (an IP address and a device type) and nothing about the session.',
            '**Google Fonts** — the interface fonts are loaded from Google\'s servers, which therefore see the device\'s IP address.',
          ],
        },
        {
          title: 'If the reciter is a child',
          body: [
            'This is a teacher\'s tool, and the reciter may be a child. Entering a child\'s name or contact number is the teacher\'s responsibility, and the guardian\'s permission must be taken first. A session can be run with no WhatsApp number at all, and with a first name alone.',
          ],
        },
        {
          title: 'Deleting your data',
          body: [
            'A session on your device is deleted from the session list in the tool.',
            'For what has been uploaded: write to the address below and we will delete what is yours from the database.',
          ],
        },
      ],
      published: 'This policy is also published at',
    },
    credits: {
      title: 'Mushaf page originals',
      body: [
        'The mushaf pages shown are from the King Fahd Complex for the Printing of the Holy Quran, displayed as published — not re-typeset and not altered.',
      ],
    },
    similarSources: {
      title: 'Similar-passage data',
      body: 'The data behind look-alike verses is built on the sources below, and naming them here is a condition of their licences:',
    },
    back: 'Back',
    updated: 'Last updated',
    version: 'Version',
  },
};

/** `**bold**` inside a paragraph, and nothing else — the text needs no more. */
const Prose: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="font-bold text-foreground">{part.slice(2, -2)}</strong>
        : <React.Fragment key={i}>{part}</React.Fragment>
    ))}
  </>
);

const Block: React.FC<{ title: string; icon?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h2 className="mb-2.5 flex items-center gap-2 text-sm font-extrabold">
      {icon}
      {title}
    </h2>
    <div className="space-y-2.5 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const AboutPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { lang, dir } = useI18n();
  const c = CONTENT[lang === 'en' ? 'en' : 'ar'];
  const [version, setVersion] = useState<string | null>(null);

  // Only the shell knows its own build number; on the web there is none to
  // show, and an invented one would be worse than the absence.
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    import('@capacitor/app')
      .then(m => m.App.getInfo())
      .then(info => { if (alive) setVersion(`${info.version} (${info.build})`); })
      .catch(() => { /* not available: the line simply does not appear */ });
    return () => { alive = false; };
  }, []);

  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft;

  return (
    <div dir={dir} className="min-h-dvh bg-background pb-safe text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            onClick={onBack}
            data-a11y-tap
            aria-label={c.back}
            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Back size={18} />
          </button>
          <h1 className="text-base font-extrabold">{c.aboutTool.title}</h1>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-5">
        <div className="flex items-center gap-3 px-1 pb-1">
          <img src={withBase('pwa-192x192.png')} alt="" width={48} height={48} className="rounded-xl" />
          <div>
            <p className="text-sm font-extrabold">{CONTENT[lang === 'en' ? 'en' : 'ar'].aboutTool.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {version ? `${c.version} ${version}` : TAJWEEDOO_URL.replace('https://', '')}
            </p>
          </div>
        </div>

        <Block title={c.aboutTool.title} icon={<Info size={15} className="text-primary" />}>
          {c.aboutTool.body.map((p, i) => <p key={i}><Prose text={p} /></p>)}
        </Block>

        <Block title={c.aboutTajweedoo.title}>
          {c.aboutTajweedoo.body.map((p, i) => <p key={i}><Prose text={p} /></p>)}
        </Block>

        <Block title={c.contact.title} icon={<Mail size={15} className="text-primary" />}>
          {c.contact.body.map((p, i) => <p key={i}>{p}</p>)}
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))]"
            >
              <Mail size={14} />
              {c.contact.email}
            </a>
            <a
              href={TAJWEEDOO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-border px-3.5 py-2 text-xs font-bold text-foreground transition-colors hover:bg-accent"
            >
              <Globe size={14} />
              {c.contact.site}
            </a>
          </div>
          <p className="pt-1 text-[12px] font-bold text-foreground/80" dir="ltr">{SUPPORT_EMAIL}</p>

          {/* الحسابات: أيقونات وحدها تحت عنوانها، ٤٤px لكلٍّ منها فهي أهداف
              لمسٍ على هاتف لا روابط بفأرة. و`target="_blank"` يفتحها في
              متصفّح النظام داخل القشرة، كما يفعل رابط الموقع فوقها. */}
          <div className="pt-2">
            <p className="mb-2 text-[12px] font-bold text-foreground/80">{c.contact.follow}</p>
            <div className="flex flex-wrap gap-2">
              {SOCIAL.map(s => (
                <a
                  key={s.name}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label[lang === 'en' ? 'en' : 'ar']}
                  title={s.name}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <svg
                    viewBox="0 0 24 24" width={19} height={19} aria-hidden
                    fill="none" stroke="currentColor" strokeWidth={1.8}
                    strokeLinecap="round" strokeLinejoin="round"
                  >
                    {s.path}
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </Block>

        <Block title={c.privacy.title} icon={<ShieldCheck size={15} className="text-primary" />}>
          <p className="text-foreground/80"><Prose text={c.privacy.intro} /></p>
          {c.privacy.sections.map(s => (
            <div key={s.title} className="pt-1.5">
              <h3 className="mb-1 text-[13px] font-bold text-foreground">{s.title}</h3>
              {s.body.map((p, i) => <p key={i} className="mb-1.5"><Prose text={p} /></p>)}
            </div>
          ))}
          <p className="pt-1 text-[12px]">
            {c.privacy.published}{' '}
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline-offset-2 hover:underline" dir="ltr">
              {PRIVACY_URL.replace('https://', '')}
            </a>
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            {c.updated}: {UPDATED[lang === 'en' ? 'en' : 'ar']}
          </p>
        </Block>

        <Block title={c.credits.title}>
          {c.credits.body.map((p, i) => <p key={i}>{p}</p>)}
        </Block>

        {/*
          Named here rather than under every card in the report.
          The Quranic Arabic Corpus licence requires the source be indicated
          with a link wherever its data is used; one place that says so
          clearly satisfies that, and keeps the report itself uncluttered.
        */}
        <Block title={c.similarSources.title}>
          <p>{c.similarSources.body}</p>
          <ul className="mt-1.5 space-y-1">
            {SIMILAR_SOURCES.map(src => (
              <li key={src.url}>
                <a href={src.url} target="_blank" rel="noreferrer noopener" className="underline">
                  {src.name}
                </a>
                {src.license && <span className="text-muted-foreground"> — {src.license}</span>}
              </li>
            ))}
          </ul>
        </Block>
      </main>
    </div>
  );
};

export default AboutPage;
