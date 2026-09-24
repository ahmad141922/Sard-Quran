import type { DisplayLang } from '@/lib/display-lang';

/**
 * The copy for signing in, the roster, and the consent question.
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
  signInWhy: string;
  emailLabel: string;
  sendCode: string;
  codeLabel: string;
  codeSent: string;
  confirm: string;
  badEmail: string;
  badCode: string;
  signInFailed: string;
  offline: string;
  signOut: string;
  nameLabel: string;
  save: string;

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
    signInTitle: 'حساب المقرئ',
    signInWhy: 'سجّل الدخول لتتابع طلابك. والسرد وحده لا يحتاج حسابًا.',
    emailLabel: 'البريد الإلكتروني',
    sendCode: 'أرسل الرمز',
    codeLabel: 'الرمز الذي وصل بريدك',
    codeSent: 'أُرسل رمز إلى بريدك.',
    confirm: 'تأكيد',
    badEmail: 'هذا ليس بريدًا صحيحًا.',
    badCode: 'الرمز غير مكتمل.',
    signInFailed: 'تعذّر تسجيل الدخول.',
    offline: 'لا اتّصال بالشبكة.',
    signOut: 'تسجيل الخروج',
    nameLabel: 'اسمك كما يظهر لطلابك',
    save: 'حفظ',

    rosterTitle: 'طلابي',
    addStudent: 'إضافة طالب',
    studentName: 'اسم الطالب',
    add: 'إضافة',
    noStudents: 'لا طلاب بعد.',
    joined: 'انضمّ جهازه',
    notJoined: 'لم ينضمّ جهازه بعد',
    issueCode: 'رمز انضمام',
    codeReadOut: 'اقرأ هذا الرمز على الطالب ليكتبه في جهازه.',
    codeExpires: 'ينتهي الرمز بعد نصف ساعة، ويسقط بمجرّد استعماله.',
    remove: 'إخراج من القائمة',
    removeSaid: 'خرج من القائمة، ومجالسه محفوظة.',

    sessionsOf: 'مجالس {name}',
    noSessions: 'لا مجالس بعد.',
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

    joinTitle: 'الانضمام إلى مقرئ',
    joinBody: 'اكتب الرمز الذي قرأه عليك المقرئ.',
    joinLabel: 'الرمز',
    join: 'انضمام',
    joinFailed: 'الرمز غير صالح أو انتهت مدّته.',
    joinedTo: 'أنت في قائمة {name}.',
    leave: 'مغادرة القائمة',
  },
  en: {
    signInTitle: 'Teacher account',
    signInWhy: 'Sign in to follow your students. Reciting alone needs no account.',
    emailLabel: 'Email',
    sendCode: 'Send the code',
    codeLabel: 'The code sent to you',
    codeSent: 'A code has been sent to your email.',
    confirm: 'Confirm',
    badEmail: 'That is not a valid email address.',
    badCode: 'The code is incomplete.',
    signInFailed: 'Could not sign in.',
    offline: 'No connection.',
    signOut: 'Sign out',
    nameLabel: 'Your name, as your students see it',
    save: 'Save',

    rosterTitle: 'My students',
    addStudent: 'Add a student',
    studentName: "Student's name",
    add: 'Add',
    noStudents: 'No students yet.',
    joined: 'Device joined',
    notJoined: 'Device has not joined yet',
    issueCode: 'Join code',
    codeReadOut: 'Read this code out so the student can type it into their device.',
    codeExpires: 'It expires in half an hour, and stops working the moment it is used.',
    remove: 'Remove from the list',
    removeSaid: 'Removed from the list. Their sessions are kept.',

    sessionsOf: "{name}'s sessions",
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

    joinTitle: 'Join a teacher',
    joinBody: 'Type the code your teacher read out to you.',
    joinLabel: 'Code',
    join: 'Join',
    joinFailed: 'That code is not usable, or it has expired.',
    joinedTo: 'You are on {name}’s list.',
    leave: 'Leave the list',
  },
  fr: {
    signInTitle: 'Compte du récitateur',
    signInWhy: 'Connectez-vous pour suivre vos élèves. Réciter seul ne demande aucun compte.',
    emailLabel: 'Courriel',
    sendCode: 'Envoyer le code',
    codeLabel: 'Le code reçu',
    codeSent: 'Un code a été envoyé à votre adresse.',
    confirm: 'Confirmer',
    badEmail: "Cette adresse n'est pas valide.",
    badCode: 'Le code est incomplet.',
    signInFailed: 'Connexion impossible.',
    offline: 'Aucune connexion.',
    signOut: 'Se déconnecter',
    nameLabel: 'Votre nom, tel que vos élèves le voient',
    save: 'Enregistrer',

    rosterTitle: 'Mes élèves',
    addStudent: 'Ajouter un élève',
    studentName: "Nom de l'élève",
    add: 'Ajouter',
    noStudents: 'Aucun élève pour le moment.',
    joined: 'Appareil rattaché',
    notJoined: "L'appareil n'est pas encore rattaché",
    issueCode: 'Code de rattachement',
    codeReadOut: "Lisez ce code à l'élève pour qu'il le saisisse sur son appareil.",
    codeExpires: "Il expire dans une demi-heure et cesse de fonctionner dès qu'il est utilisé.",
    remove: 'Retirer de la liste',
    removeSaid: 'Retiré de la liste. Ses séances sont conservées.',

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

    joinTitle: 'Rejoindre un récitateur',
    joinBody: 'Saisissez le code que votre récitateur vous a lu.',
    joinLabel: 'Code',
    join: 'Rejoindre',
    joinFailed: "Ce code est inutilisable ou expiré.",
    joinedTo: 'Vous êtes sur la liste de {name}.',
    leave: 'Quitter la liste',
  },
  de: {
    signInTitle: 'Lehrerkonto',
    signInWhy: 'Melde dich an, um deine Schüler zu begleiten. Allein zu rezitieren braucht kein Konto.',
    emailLabel: 'E-Mail',
    sendCode: 'Code senden',
    codeLabel: 'Der zugesandte Code',
    codeSent: 'Ein Code wurde an deine E-Mail geschickt.',
    confirm: 'Bestätigen',
    badEmail: 'Das ist keine gültige E-Mail-Adresse.',
    badCode: 'Der Code ist unvollständig.',
    signInFailed: 'Anmeldung nicht möglich.',
    offline: 'Keine Verbindung.',
    signOut: 'Abmelden',
    nameLabel: 'Dein Name, wie deine Schüler ihn sehen',
    save: 'Speichern',

    rosterTitle: 'Meine Schüler',
    addStudent: 'Schüler hinzufügen',
    studentName: 'Name des Schülers',
    add: 'Hinzufügen',
    noStudents: 'Noch keine Schüler.',
    joined: 'Gerät verbunden',
    notJoined: 'Gerät noch nicht verbunden',
    issueCode: 'Beitrittscode',
    codeReadOut: 'Lies diesen Code vor, damit der Schüler ihn auf seinem Gerät eingeben kann.',
    codeExpires: 'Er läuft in einer halben Stunde ab und gilt nur ein einziges Mal.',
    remove: 'Von der Liste nehmen',
    removeSaid: 'Von der Liste genommen. Die Sitzungen bleiben erhalten.',

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

    joinTitle: 'Einem Lehrer beitreten',
    joinBody: 'Gib den Code ein, den dein Lehrer vorgelesen hat.',
    joinLabel: 'Code',
    join: 'Beitreten',
    joinFailed: 'Dieser Code ist nicht nutzbar oder abgelaufen.',
    joinedTo: 'Du stehst auf der Liste von {name}.',
    leave: 'Liste verlassen',
  },
  es: {
    signInTitle: 'Cuenta del recitador',
    signInWhy: 'Inicia sesión para seguir a tus alumnos. Recitar a solas no necesita cuenta.',
    emailLabel: 'Correo electrónico',
    sendCode: 'Enviar el código',
    codeLabel: 'El código que recibiste',
    codeSent: 'Se ha enviado un código a tu correo.',
    confirm: 'Confirmar',
    badEmail: 'Ese correo no es válido.',
    badCode: 'El código está incompleto.',
    signInFailed: 'No se pudo iniciar sesión.',
    offline: 'Sin conexión.',
    signOut: 'Cerrar sesión',
    nameLabel: 'Tu nombre, tal como lo ven tus alumnos',
    save: 'Guardar',

    rosterTitle: 'Mis alumnos',
    addStudent: 'Añadir alumno',
    studentName: 'Nombre del alumno',
    add: 'Añadir',
    noStudents: 'Aún no hay alumnos.',
    joined: 'Dispositivo unido',
    notJoined: 'El dispositivo aún no se ha unido',
    issueCode: 'Código de unión',
    codeReadOut: 'Lee este código en voz alta para que el alumno lo escriba en su dispositivo.',
    codeExpires: 'Caduca en media hora y deja de servir en cuanto se usa.',
    remove: 'Quitar de la lista',
    removeSaid: 'Quitado de la lista. Sus sesiones se conservan.',

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

    joinTitle: 'Unirse a un recitador',
    joinBody: 'Escribe el código que te leyó tu recitador.',
    joinLabel: 'Código',
    join: 'Unirse',
    joinFailed: 'Ese código no sirve o ha caducado.',
    joinedTo: 'Estás en la lista de {name}.',
    leave: 'Salir de la lista',
  },
};

/** The table for the language on screen, falling back to Arabic. */
export const teacherText = (lang: DisplayLang): TeacherStrings =>
  TEACHER_TEXT[lang] ?? TEACHER_TEXT.ar;
