import type { DisplayLang } from '@/lib/display-lang';

/**
 * The copy for signing in, the participants, and the consent question.
 *
 * Kept beside the screens that speak it rather than in `useI18n`, the same
 * trade `SardWizard` and `SplashScreen` make: it is one feature's worth of
 * words that no other part of the tool says, and most installs never see any of
 * it. Typed by `DisplayLang`, so a language left out does not compile.
 *
 * The Arabic is فصحى throughout — this is the register the rest of the tool
 * speaks, and a consent question in particular is not the place to be chatty.
 */
export interface TeacherStrings {
  // Signing in
  signInTitle: string;
  signUpTitle: string;
  signInWhy: string;
  signUpWhy: string;
  privacyNote: string;
  google: string;
  orEmail: string;
  emailLabel: string;
  passwordLabel: string;
  showPassword: string;
  hidePassword: string;
  passwordHint: string;
  signIn: string;
  signUp: string;
  toSignUp: string;
  toSignIn: string;
  confirmNote: string;
  forgot: string;
  forgotTitle: string;
  forgotBody: string;
  sendReset: string;
  resetSent: string;
  newPasswordTitle: string;
  newPasswordBody: string;
  savePassword: string;
  passwordSaved: string;
  inboxTitle: string;
  inboxBody: string;
  inboxSpam: string;
  resend: string;
  resent: string;
  badEmail: string;
  wrongPassword: string;
  unconfirmed: string;
  weakPassword: string;
  exists: string;
  linkExpired: string;
  signInFailed: string;
  offline: string;
  signOut: string;
  nameLabel: string;
  save: string;
  asParticipant: string;

  // The roster
  rosterTitle: string;
  addStudent: string;
  studentName: string;
  add: string;
  noStudents: string;
  joined: string;
  notJoined: string;
  issueCode: string;
  codeReadOut: string;
  codeExpires: string;
  remove: string;
  removeSaid: string;
  sendWhatsapp: string;
  copyLink: string;
  linkCopied: string;
  copyFailed: string;
  inviteMessage: string;

  // One student
  sessionsOf: string;
  noSessions: string;
  ayahsUnit: string;
  pagesUnit: string;
  faultsUnit: string;
  back: string;

  // What may leave the device
  consentTitle: string;
  consentBody: string;
  consentData: string;
  consentAudio: string;
  consentAudioNote: string;
  consentAccept: string;
  consentDecline: string;
  consentOn: string;
  consentOff: string;
  consentRevoke: string;
  consentOwed: string;

  // A student's device joining
  joinTitle: string;
  joinBody: string;
  joinLabel: string;
  join: string;
  joinFailed: string;
  joinedTo: string;
  leave: string;
}

export const TEACHER_TEXT: Record<DisplayLang, TeacherStrings> = {
  ar: {
    signInTitle: 'تسجيل الدخول',
    signUpTitle: 'إنشاء حساب',
    signInWhy: 'الحساب اختياري، والسرد يعمل كاملًا بدونه. تحتاجه فقط لتضيف المشاركين في جلساتك وتتابع مجالسهم.',
    signUpWhy: 'حساب واحد لك أنت، تضيف منه المشاركين في جلساتك وتتابع مجالسهم من أي جهاز.',
    privacyNote: 'لا نشارك بريدك مع أحد، ولا نرسل إليك إعلانات — فقط رسالة تأكيد البريد، ورابط استعادة كلمة السر إن طلبته.',
    google: 'المتابعة بحساب Google',
    orEmail: 'أو بالبريد الإلكتروني',
    emailLabel: 'البريد الإلكتروني',
    passwordLabel: 'كلمة السر',
    showPassword: 'إظهار كلمة السر',
    hidePassword: 'إخفاء كلمة السر',
    passwordHint: '{n} أحرف على الأقل.',
    signIn: 'دخول',
    signUp: 'إنشاء الحساب',
    toSignUp: 'ليس لديك حساب؟ أنشئ حسابًا',
    toSignIn: 'لديك حساب؟ سجّل الدخول',
    confirmNote: 'ستصلك رسالة تأكيد من info@sard.tajweedoo.com',
    forgot: 'نسيت كلمة السر؟',
    forgotTitle: 'استعادة كلمة السر',
    forgotBody: 'اكتب بريدك، وسنرسل إليه رابطًا تختار منه كلمة سر جديدة. وإن كنت تدخل قديمًا برمز يصلك على البريد، فمن هنا تضبط كلمة سر لحسابك نفسه — ومشاركوك ومجالسهم كما هي.',
    sendReset: 'أرسل الرابط',
    resetSent: 'أرسلنا رابطًا إلى {email}. افتحه من هذا الجهاز أو غيره، واختر كلمة سر جديدة.',
    newPasswordTitle: 'كلمة سر جديدة',
    newPasswordBody: 'اختر كلمة السر التي ستدخل بها من الآن.',
    savePassword: 'حفظ كلمة السر',
    passwordSaved: 'حُفظت كلمة السر. أنت داخل حسابك.',
    inboxTitle: 'أكّد بريدك',
    inboxBody: 'أرسلنا رسالة إلى {email}. افتحها واضغط «تأكيد البريد»، ثم ارجع وسجّل الدخول.',
    inboxSpam: 'لم تصلك خلال دقائق؟ انظر في مجلّد الرسائل غير المرغوب فيها (Spam).',
    resend: 'إعادة إرسال رسالة التأكيد',
    resent: 'أُعيد الإرسال.',
    badEmail: 'هذا ليس بريدًا صحيحًا.',
    wrongPassword: 'البريد أو كلمة السر غير صحيحة. إن كان حسابك قديمًا (كنت تدخل برمز يصل بريدك)، فاضغط «نسيت كلمة السر؟» لتضبط كلمة سر له — وبياناتك كما هي.',
    unconfirmed: 'لم يُؤكَّد بريدك بعد. افتح رسالة التأكيد التي أرسلناها، أو اطلبها من جديد.',
    weakPassword: 'كلمة السر قصيرة أو سهلة التخمين. اختر أطول منها.',
    exists: 'لهذا البريد حساب من قبل. سجّل الدخول به، أو اضغط «نسيت كلمة السر؟» إن لم تكن ضبطت له كلمة سر.',
    linkExpired: 'انتهت صلاحية الرابط أو استُعمل من قبل. اطلب رابطًا جديدًا.',
    signInFailed: 'تعذّر تسجيل الدخول.',
    offline: 'لا اتّصال بالشبكة.',
    signOut: 'تسجيل الخروج',
    nameLabel: 'اسمك كما يظهر للمشاركين',
    save: 'حفظ',
    asParticipant: 'دعاك مقرئ للمشاركة في جلساته؟ أدخل الرمز',

    rosterTitle: 'المشاركون في الجلسة',
    addStudent: 'إضافة مشارك',
    studentName: 'اسم المشارك',
    add: 'إضافة',
    noStudents: 'لا مشاركين بعد.',
    joined: 'انضمّ جهازه',
    notJoined: 'لم ينضمّ جهازه بعد',
    issueCode: 'دعوة للانضمام',
    codeReadOut: 'أرسل إليه الدعوة، أو اقرأ عليه الرمز ليكتبه في جهازه.',
    codeExpires: 'ينتهي الرمز بعد نصف ساعة، ويسقط بمجرّد استعماله.',
    remove: 'إخراج من القائمة',
    removeSaid: 'خرج من القائمة، ومجالسه محفوظة.',
    sendWhatsapp: 'إرسال عبر واتساب',
    copyLink: 'نسخ الدعوة',
    linkCopied: 'نُسخت الدعوة، الصقها حيث تشاء.',
    copyFailed: 'تعذّر النسخ.',
    inviteMessage: 'السلام عليكم، هذه دعوتك لتكون مشاركًا في جلسات السرد على تطبيق السرد القرآني.\nافتح الرابط للانضمام:\n{link}\n\nوإن طُلب منك رمز فهو: {code} (صالح لنصف ساعة)',

    sessionsOf: 'جلسات {name}',
    noSessions: 'لا جلسات بعد.',
    ayahsUnit: 'آية',
    pagesUnit: 'صفحة',
    faultsUnit: 'ملاحظة',
    back: 'رجوع',

    consentTitle: 'ما الذي يغادر جهازك',
    consentBody: 'لكي يرى مقرئك سردك، تُرفع بيانات المجلس: مواضعك وملاحظاتك وقدر ما سردت.',
    consentData: 'ارفع بيانات المجلس',
    consentAudio: 'وارفع تسجيل صوتي أيضًا',
    consentAudioNote: 'صوتك لا يغادر جهازك إلا إن اخترت هذا بنفسك.',
    consentAccept: 'أوافق',
    consentDecline: 'لا أوافق',
    consentOn: 'الرفع مُفعَّل.',
    consentOff: 'لا يُرفع شيء.',
    consentRevoke: 'سحب الموافقة',
    consentOwed: 'توقّف الرفع. وما رُفع قبل ذلك يحتاج حذفًا؛ اطلبه من مقرئك.',

    joinTitle: 'الانضمام مشاركًا',
    joinBody: 'اكتب الرمز الذي أرسله إليك المقرئ أو قرأه عليك.',
    joinLabel: 'الرمز',
    join: 'انضمام',
    joinFailed: 'الرمز غير صالح أو انتهت مدّته.',
    joinedTo: 'انضممت مشاركًا باسم {name}.',
    leave: 'مغادرة القائمة',
  },
  en: {
    signInTitle: 'Sign in',
    signUpTitle: 'Create an account',
    signInWhy: 'An account is optional — reciting works fully without one. You only need it to add the participants in your sessions and follow their recitations.',
    signUpWhy: 'One account for you, to add the participants in your sessions and follow them from any device.',
    privacyNote: 'We never share your email and never send you ads — only the confirmation email, and a password link if you ask for one.',
    google: 'Continue with Google',
    orEmail: 'or with email',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    passwordHint: 'At least {n} characters.',
    signIn: 'Sign in',
    signUp: 'Create account',
    toSignUp: 'No account? Create one',
    toSignIn: 'Have an account? Sign in',
    confirmNote: 'A confirmation email will come from info@sard.tajweedoo.com',
    forgot: 'Forgot your password?',
    forgotTitle: 'Reset your password',
    forgotBody: 'Type your email and we will send a link to choose a new password. If you used to sign in with a code sent to your email, this is how you set a password for that same account — your participants and their sessions stay as they are.',
    sendReset: 'Send the link',
    resetSent: 'We sent a link to {email}. Open it on this device or another and choose a new password.',
    newPasswordTitle: 'New password',
    newPasswordBody: 'Choose the password you will sign in with from now on.',
    savePassword: 'Save password',
    passwordSaved: 'Password saved. You are signed in.',
    inboxTitle: 'Confirm your email',
    inboxBody: 'We sent a message to {email}. Open it and press “Confirm email”, then come back and sign in.',
    inboxSpam: 'Nothing after a few minutes? Check your spam folder.',
    resend: 'Resend the confirmation email',
    resent: 'Sent again.',
    badEmail: 'That is not a valid email address.',
    wrongPassword: 'Wrong email or password. If your account is older (you signed in with a code sent to your email), press “Forgot your password?” to set one — your data stays as it is.',
    unconfirmed: 'Your email is not confirmed yet. Open the confirmation email we sent, or ask for it again.',
    weakPassword: 'That password is too short or too easy to guess. Choose a longer one.',
    exists: 'This email already has an account. Sign in with it, or press “Forgot your password?” if you never set one.',
    linkExpired: 'That link has expired or was already used. Ask for a new one.',
    signInFailed: 'Could not sign in.',
    offline: 'No connection.',
    signOut: 'Sign out',
    nameLabel: 'Your name, as participants see it',
    save: 'Save',
    asParticipant: 'Invited by a teacher to their sessions? Enter the code',

    rosterTitle: 'Session participants',
    addStudent: 'Add a participant',
    studentName: 'Participant\'s name',
    add: 'Add',
    noStudents: 'No participants yet.',
    joined: 'Device joined',
    notJoined: 'Device has not joined yet',
    issueCode: 'Invite to join',
    codeReadOut: 'Send them the invitation, or read this code out so they can type it on their device.',
    codeExpires: 'It expires in half an hour, and stops working the moment it is used.',
    remove: 'Remove from the list',
    removeSaid: 'Removed from the list. Their sessions are kept.',
    sendWhatsapp: 'Send on WhatsApp',
    copyLink: 'Copy invitation',
    linkCopied: 'Invitation copied — paste it anywhere.',
    copyFailed: 'Could not copy.',
    inviteMessage: 'Assalamu alaikum — you are invited to take part in recitation sessions on the Quran Recitation app.\nOpen the link to join:\n{link}\n\nIf asked for a code, it is: {code} (valid for half an hour)',

    sessionsOf: '{name}\'s sessions',
    noSessions: 'No sessions yet.',
    ayahsUnit: 'verses',
    pagesUnit: 'pages',
    faultsUnit: 'notes',
    back: 'Back',

    consentTitle: 'What leaves your device',
    consentBody: 'For your teacher to see your recitation, the session is uploaded: where you were, what was noted, and how much you recited.',
    consentData: 'Upload the session',
    consentAudio: 'Upload my recording too',
    consentAudioNote: 'Your voice stays on your device unless you choose this yourself.',
    consentAccept: 'I agree',
    consentDecline: 'I do not agree',
    consentOn: 'Uploading is on.',
    consentOff: 'Nothing is uploaded.',
    consentRevoke: 'Withdraw',
    consentOwed: 'Uploading has stopped. What went up before still needs deleting — ask your teacher.',

    joinTitle: 'Join as a participant',
    joinBody: 'Type the code your teacher sent or read out to you.',
    joinLabel: 'Code',
    join: 'Join',
    joinFailed: 'That code is not usable, or it has expired.',
    joinedTo: 'You joined as {name}.',
    leave: 'Leave the list',
  },
  fr: {
    signInTitle: 'Connexion',
    signUpTitle: 'Créer un compte',
    signInWhy: 'Le compte est facultatif : la récitation fonctionne entièrement sans. Il sert seulement à ajouter les participants de vos séances et à les suivre.',
    signUpWhy: 'Un compte pour vous, pour ajouter les participants de vos séances et les suivre depuis n\'importe quel appareil.',
    privacyNote: 'Nous ne partageons jamais votre adresse et n\'envoyons aucune publicité — seulement le courriel de confirmation, et un lien de mot de passe si vous le demandez.',
    google: 'Continuer avec Google',
    orEmail: 'ou par courriel',
    emailLabel: 'Courriel',
    passwordLabel: 'Mot de passe',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    passwordHint: 'Au moins {n} caractères.',
    signIn: 'Se connecter',
    signUp: 'Créer le compte',
    toSignUp: 'Pas de compte ? Créez-en un',
    toSignIn: 'Déjà un compte ? Connectez-vous',
    confirmNote: 'Un courriel de confirmation viendra de info@sard.tajweedoo.com',
    forgot: 'Mot de passe oublié ?',
    forgotTitle: 'Réinitialiser le mot de passe',
    forgotBody: 'Saisissez votre adresse : nous enverrons un lien pour choisir un nouveau mot de passe. Si vous vous connectiez avec un code reçu par courriel, c\'est ainsi que vous donnez un mot de passe à ce même compte — vos données restent intactes.',
    sendReset: 'Envoyer le lien',
    resetSent: 'Lien envoyé à {email}. Ouvrez-le et choisissez un nouveau mot de passe.',
    newPasswordTitle: 'Nouveau mot de passe',
    newPasswordBody: 'Choisissez le mot de passe que vous utiliserez désormais.',
    savePassword: 'Enregistrer',
    passwordSaved: 'Mot de passe enregistré. Vous êtes connecté.',
    inboxTitle: 'Confirmez votre adresse',
    inboxBody: 'Nous avons écrit à {email}. Ouvrez le message et appuyez sur « Confirmer », puis revenez vous connecter.',
    inboxSpam: 'Rien après quelques minutes ? Regardez dans les indésirables.',
    resend: 'Renvoyer le courriel de confirmation',
    resent: 'Renvoyé.',
    badEmail: 'Cette adresse n\'est pas valide.',
    wrongPassword: 'Adresse ou mot de passe incorrect. Si votre compte est ancien (connexion par code reçu par courriel), utilisez « Mot de passe oublié ? » pour en définir un — vos données restent intactes.',
    unconfirmed: 'Votre adresse n\'est pas encore confirmée. Ouvrez le courriel de confirmation ou redemandez-le.',
    weakPassword: 'Mot de passe trop court ou trop facile. Choisissez-en un plus long.',
    exists: 'Cette adresse a déjà un compte. Connectez-vous, ou utilisez « Mot de passe oublié ? ».',
    linkExpired: 'Ce lien a expiré ou a déjà servi. Demandez-en un nouveau.',
    signInFailed: 'Connexion impossible.',
    offline: 'Aucune connexion.',
    signOut: 'Se déconnecter',
    nameLabel: 'Votre nom, tel que les participants le voient',
    save: 'Enregistrer',
    asParticipant: 'Invité aux séances d’un récitateur ? Saisissez le code',

    rosterTitle: 'Participants aux séances',
    addStudent: 'Ajouter un participant',
    studentName: 'Nom du participant',
    add: 'Ajouter',
    noStudents: 'Aucun participant pour le moment.',
    joined: 'Appareil rattaché',
    notJoined: "L'appareil n'est pas encore rattaché",
    issueCode: 'Inviter',
    codeReadOut: 'Envoyez-lui l\'invitation, ou lisez-lui ce code pour qu\'il le saisisse.',
    codeExpires: "Il expire dans une demi-heure et cesse de fonctionner dès qu'il est utilisé.",
    remove: 'Retirer de la liste',
    removeSaid: 'Retiré de la liste. Ses séances sont conservées.',
    sendWhatsapp: 'Envoyer sur WhatsApp',
    copyLink: 'Copier l\'invitation',
    linkCopied: 'Invitation copiée.',
    copyFailed: 'Copie impossible.',
    inviteMessage: 'Assalamu alaikum — vous êtes invité aux séances de récitation sur l\'application de récitation du Coran.\nOuvrez le lien pour rejoindre :\n{link}\n\nCode si demandé : {code} (valable une demi-heure)',

    sessionsOf: 'Séances de {name}',
    noSessions: 'Aucune séance pour le moment.',
    ayahsUnit: 'versets',
    pagesUnit: 'pages',
    faultsUnit: 'remarques',
    back: 'Retour',

    consentTitle: 'Ce qui quitte votre appareil',
    consentBody: 'Pour que votre récitateur voie votre récitation, la séance est envoyée : où vous en étiez, ce qui a été relevé, et combien vous avez récité.',
    consentData: 'Envoyer la séance',
    consentAudio: 'Envoyer aussi mon enregistrement',
    consentAudioNote: 'Votre voix reste sur votre appareil sauf si vous le choisissez vous-même.',
    consentAccept: "J'accepte",
    consentDecline: "Je n'accepte pas",
    consentOn: "L'envoi est activé.",
    consentOff: "Rien n'est envoyé.",
    consentRevoke: 'Retirer',
    consentOwed: "L'envoi est arrêté. Ce qui a déjà été envoyé doit encore être supprimé — demandez-le à votre récitateur.",

    joinTitle: 'Rejoindre comme participant',
    joinBody: 'Saisissez le code que votre récitateur vous a envoyé ou lu.',
    joinLabel: 'Code',
    join: 'Rejoindre',
    joinFailed: "Ce code est inutilisable ou expiré.",
    joinedTo: 'Vous avez rejoint sous le nom {name}.',
    leave: 'Quitter la liste',
  },
  de: {
    signInTitle: 'Anmelden',
    signUpTitle: 'Konto erstellen',
    signInWhy: 'Ein Konto ist freiwillig — das Rezitieren funktioniert vollständig ohne. Du brauchst es nur, um Teilnehmer deiner Sitzungen hinzuzufügen und ihnen zu folgen.',
    signUpWhy: 'Ein Konto für dich, um Teilnehmer deiner Sitzungen hinzuzufügen und ihnen von jedem Gerät aus zu folgen.',
    privacyNote: 'Wir geben deine E-Mail nie weiter und senden keine Werbung — nur die Bestätigungs-E-Mail und, wenn du es willst, einen Passwort-Link.',
    google: 'Weiter mit Google',
    orEmail: 'oder mit E-Mail',
    emailLabel: 'E-Mail',
    passwordLabel: 'Passwort',
    showPassword: 'Passwort zeigen',
    hidePassword: 'Passwort verbergen',
    passwordHint: 'Mindestens {n} Zeichen.',
    signIn: 'Anmelden',
    signUp: 'Konto erstellen',
    toSignUp: 'Kein Konto? Jetzt erstellen',
    toSignIn: 'Schon ein Konto? Anmelden',
    confirmNote: 'Eine Bestätigungs-E-Mail kommt von info@sard.tajweedoo.com',
    forgot: 'Passwort vergessen?',
    forgotTitle: 'Passwort zurücksetzen',
    forgotBody: 'Gib deine E-Mail ein, wir senden einen Link für ein neues Passwort. Hast du dich früher mit einem Code per E-Mail angemeldet, setzt du so ein Passwort für dasselbe Konto — deine Daten bleiben erhalten.',
    sendReset: 'Link senden',
    resetSent: 'Link an {email} gesendet. Öffne ihn und wähle ein neues Passwort.',
    newPasswordTitle: 'Neues Passwort',
    newPasswordBody: 'Wähle das Passwort, mit dem du dich ab jetzt anmeldest.',
    savePassword: 'Passwort speichern',
    passwordSaved: 'Passwort gespeichert. Du bist angemeldet.',
    inboxTitle: 'Bestätige deine E-Mail',
    inboxBody: 'Wir haben an {email} geschrieben. Öffne die Nachricht, tippe auf „E-Mail bestätigen“ und melde dich dann an.',
    inboxSpam: 'Nach ein paar Minuten nichts da? Sieh im Spam-Ordner nach.',
    resend: 'Bestätigungs-E-Mail erneut senden',
    resent: 'Erneut gesendet.',
    badEmail: 'Das ist keine gültige E-Mail-Adresse.',
    wrongPassword: 'E-Mail oder Passwort falsch. Ist dein Konto älter (Anmeldung per Code), tippe auf „Passwort vergessen?“, um eines festzulegen — deine Daten bleiben erhalten.',
    unconfirmed: 'Deine E-Mail ist noch nicht bestätigt. Öffne die Bestätigungs-E-Mail oder fordere sie neu an.',
    weakPassword: 'Das Passwort ist zu kurz oder zu leicht. Wähle ein längeres.',
    exists: 'Für diese E-Mail gibt es schon ein Konto. Melde dich an oder nutze „Passwort vergessen?“.',
    linkExpired: 'Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere einen neuen an.',
    signInFailed: 'Anmeldung nicht möglich.',
    offline: 'Keine Verbindung.',
    signOut: 'Abmelden',
    nameLabel: 'Dein Name, wie Teilnehmer ihn sehen',
    save: 'Speichern',
    asParticipant: 'Von einem Lehrer zu seinen Sitzungen eingeladen? Code eingeben',

    rosterTitle: 'Sitzungsteilnehmer',
    addStudent: 'Teilnehmer hinzufügen',
    studentName: 'Name des Teilnehmers',
    add: 'Hinzufügen',
    noStudents: 'Noch keine Teilnehmer.',
    joined: 'Gerät verbunden',
    notJoined: 'Gerät noch nicht verbunden',
    issueCode: 'Einladen',
    codeReadOut: 'Schick ihm die Einladung oder lies ihm diesen Code vor.',
    codeExpires: 'Er läuft in einer halben Stunde ab und gilt nur ein einziges Mal.',
    remove: 'Von der Liste nehmen',
    removeSaid: 'Von der Liste genommen. Die Sitzungen bleiben erhalten.',
    sendWhatsapp: 'Über WhatsApp senden',
    copyLink: 'Einladung kopieren',
    linkCopied: 'Einladung kopiert.',
    copyFailed: 'Kopieren nicht möglich.',
    inviteMessage: 'Assalamu alaikum — du bist zu Rezitationssitzungen in der Koran-Rezitations-App eingeladen.\nÖffne den Link zum Beitreten:\n{link}\n\nFalls ein Code verlangt wird: {code} (eine halbe Stunde gültig)',

    sessionsOf: 'Sitzungen von {name}',
    noSessions: 'Noch keine Sitzungen.',
    ayahsUnit: 'Verse',
    pagesUnit: 'Seiten',
    faultsUnit: 'Notizen',
    back: 'Zurück',

    consentTitle: 'Was dein Gerät verlässt',
    consentBody: 'Damit dein Lehrer deine Rezitation sehen kann, wird die Sitzung hochgeladen: wo du warst, was notiert wurde und wie viel du rezitiert hast.',
    consentData: 'Sitzung hochladen',
    consentAudio: 'Auch meine Aufnahme hochladen',
    consentAudioNote: 'Deine Stimme bleibt auf deinem Gerät, es sei denn, du wählst dies selbst.',
    consentAccept: 'Ich stimme zu',
    consentDecline: 'Ich stimme nicht zu',
    consentOn: 'Hochladen ist an.',
    consentOff: 'Es wird nichts hochgeladen.',
    consentRevoke: 'Zurückziehen',
    consentOwed: 'Das Hochladen ist gestoppt. Was bereits oben ist, muss noch gelöscht werden — frag deinen Lehrer.',

    joinTitle: 'Als Teilnehmer beitreten',
    joinBody: 'Gib den Code ein, den dein Lehrer dir geschickt oder vorgelesen hat.',
    joinLabel: 'Code',
    join: 'Beitreten',
    joinFailed: 'Dieser Code ist nicht nutzbar oder abgelaufen.',
    joinedTo: 'Du bist als {name} beigetreten.',
    leave: 'Liste verlassen',
  },
  es: {
    signInTitle: 'Iniciar sesión',
    signUpTitle: 'Crear una cuenta',
    signInWhy: 'La cuenta es opcional: recitar funciona por completo sin ella. Solo la necesitas para añadir a los participantes de tus sesiones y seguirlos.',
    signUpWhy: 'Una cuenta para ti, para añadir a los participantes de tus sesiones y seguirlos desde cualquier dispositivo.',
    privacyNote: 'Nunca compartimos tu correo ni enviamos publicidad: solo el correo de confirmación y, si lo pides, un enlace de contraseña.',
    google: 'Continuar con Google',
    orEmail: 'o con correo',
    emailLabel: 'Correo electrónico',
    passwordLabel: 'Contraseña',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    passwordHint: 'Al menos {n} caracteres.',
    signIn: 'Entrar',
    signUp: 'Crear cuenta',
    toSignUp: '¿Sin cuenta? Crea una',
    toSignIn: '¿Ya tienes cuenta? Entra',
    confirmNote: 'Llegará un correo de confirmación de info@sard.tajweedoo.com',
    forgot: '¿Olvidaste la contraseña?',
    forgotTitle: 'Restablecer contraseña',
    forgotBody: 'Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva. Si antes entrabas con un código por correo, así le pones contraseña a esa misma cuenta: tus datos se conservan.',
    sendReset: 'Enviar el enlace',
    resetSent: 'Enviamos un enlace a {email}. Ábrelo y elige una contraseña nueva.',
    newPasswordTitle: 'Contraseña nueva',
    newPasswordBody: 'Elige la contraseña con la que entrarás desde ahora.',
    savePassword: 'Guardar contraseña',
    passwordSaved: 'Contraseña guardada. Has iniciado sesión.',
    inboxTitle: 'Confirma tu correo',
    inboxBody: 'Escribimos a {email}. Abre el mensaje y pulsa «Confirmar correo»; luego vuelve y entra.',
    inboxSpam: '¿Nada tras unos minutos? Mira en la carpeta de spam.',
    resend: 'Reenviar el correo de confirmación',
    resent: 'Reenviado.',
    badEmail: 'Ese correo no es válido.',
    wrongPassword: 'Correo o contraseña incorrectos. Si tu cuenta es antigua (entrabas con un código por correo), pulsa «¿Olvidaste la contraseña?» para ponerle una: tus datos se conservan.',
    unconfirmed: 'Tu correo aún no está confirmado. Abre el correo de confirmación o pídelo de nuevo.',
    weakPassword: 'Contraseña demasiado corta o fácil. Elige una más larga.',
    exists: 'Este correo ya tiene cuenta. Entra con él o usa «¿Olvidaste la contraseña?».',
    linkExpired: 'El enlace caducó o ya se usó. Pide uno nuevo.',
    signInFailed: 'No se pudo iniciar sesión.',
    offline: 'Sin conexión.',
    signOut: 'Cerrar sesión',
    nameLabel: 'Tu nombre, tal como lo ven los participantes',
    save: 'Guardar',
    asParticipant: '¿Te invitó un recitador a sus sesiones? Escribe el código',

    rosterTitle: 'Participantes de la sesión',
    addStudent: 'Añadir participante',
    studentName: 'Nombre del participante',
    add: 'Añadir',
    noStudents: 'Aún no hay participantes.',
    joined: 'Dispositivo unido',
    notJoined: 'El dispositivo aún no se ha unido',
    issueCode: 'Invitar',
    codeReadOut: 'Envíale la invitación o léele este código para que lo escriba.',
    codeExpires: 'Caduca en media hora y deja de servir en cuanto se usa.',
    remove: 'Quitar de la lista',
    removeSaid: 'Quitado de la lista. Sus sesiones se conservan.',
    sendWhatsapp: 'Enviar por WhatsApp',
    copyLink: 'Copiar invitación',
    linkCopied: 'Invitación copiada.',
    copyFailed: 'No se pudo copiar.',
    inviteMessage: 'Assalamu alaikum: estás invitado a las sesiones de recitación en la app de recitación del Corán.\nAbre el enlace para unirte:\n{link}\n\nSi te piden un código: {code} (válido media hora)',

    sessionsOf: 'Sesiones de {name}',
    noSessions: 'Aún no hay sesiones.',
    ayahsUnit: 'versículos',
    pagesUnit: 'páginas',
    faultsUnit: 'notas',
    back: 'Volver',

    consentTitle: 'Qué sale de tu dispositivo',
    consentBody: 'Para que tu recitador vea tu recitación, se sube la sesión: dónde estabas, qué se anotó y cuánto recitaste.',
    consentData: 'Subir la sesión',
    consentAudio: 'Subir también mi grabación',
    consentAudioNote: 'Tu voz permanece en tu dispositivo salvo que lo elijas tú.',
    consentAccept: 'Acepto',
    consentDecline: 'No acepto',
    consentOn: 'La subida está activada.',
    consentOff: 'No se sube nada.',
    consentRevoke: 'Retirar',
    consentOwed: 'La subida se ha detenido. Lo que ya se subió aún debe borrarse: pídeselo a tu recitador.',

    joinTitle: 'Unirse como participante',
    joinBody: 'Escribe el código que tu recitador te envió o te leyó.',
    joinLabel: 'Código',
    join: 'Unirse',
    joinFailed: 'Ese código no sirve o ha caducado.',
    joinedTo: 'Te uniste como {name}.',
    leave: 'Salir de la lista',
  },
};

/** The table for the language on screen, falling back to Arabic. */
export const teacherText = (lang: DisplayLang): TeacherStrings =>
  TEACHER_TEXT[lang] ?? TEACHER_TEXT.ar;
