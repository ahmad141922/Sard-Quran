import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Loader2, LogOut, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import LangToggle from '@/components/board/LangToggle';
import { sardSupabase } from '@/lib/sard-supabase';
import { RecitationSection } from '@/components/dashboard/RecitationSection';
import { useTheme } from '@/lib/theme';

/**
 * The tool's own admin view.
 *
 * The board's dashboard no longer carries the recitation tab — the tool owns
 * its data, so it owns the screen that reads it, and since the split it owns
 * the Supabase project that data lives in too. The account is created in
 * *that* project, and the `sard-admin` function is what actually enforces who
 * may read: this screen is a gate, not the lock itself.
 */
const SardAdmin: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t, dir } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The same one value the home screen switches: crossing screens must not
  // reset the room's lighting.
  const [theme, toggleTheme] = useTheme();
  /**
   * A recovery link was followed.
   *
   * Supabase sends the reset link back with `type=recovery` in the fragment;
   * the client exchanges it for a session before this renders, so the visitor
   * arrives *signed in* with a password they do not know. Without somewhere to
   * type a new one, the reset does nothing at all.
   */
  const [recovering, setRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    sardSupabase.auth.getUser()
      .then(({ data }) => setUser(data.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
    if (window.location.hash.includes('type=recovery')) setRecovering(true);
    const { data: sub } = sardSupabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const savePassword = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await sardSupabase.auth.updateUser({ password: newPassword });
    if (err) setError(`${t('recPasswordChangeFailed')}: ${err.message}`);
    else {
      setDone(t('recPasswordChanged'));
      setRecovering(false);
      setNewPassword('');
      // The fragment still carries the used token; clearing it stops a refresh
      // from replaying a link that is spent.
      window.history.replaceState(null, '', window.location.pathname + '#/admin');
    }
    setBusy(false);
  }, [newPassword, t]);

  /**
   * Says what actually went wrong.
   *
   * "تحقّق من البريد وكلمة المرور" is the wrong answer to half of these: a user
   * added from the dashboard without *Auto Confirm* cannot sign in at all, and
   * no amount of retyping the password fixes it. The messages below name the
   * cause so the fix is obvious.
   */
  const signIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await sardSupabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      const raw = (err.message || '').toLowerCase();
      setError(
        raw.includes('not confirmed')
          ? t('recAccountNotConfirmed')
          : raw.includes('invalid login')
            ? t('recBadCredentials')
            : raw.includes('failed to fetch') || raw.includes('network')
              ? t('recServerUnreachable')
              : `${t('recSignInFailed')}: ${err.message}`,
      );
    }
    setBusy(false);
  }, [email, password, t]);

  const signOut = useCallback(async () => { await sardSupabase.auth.signOut(); }, []);

  return (
    <div dir={dir} className="min-h-dvh bg-background text-foreground">
      {/* Same bar as the tool's home screen — brand chip, then the controls —
          so crossing into the reports does not feel like a second product. */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck size={19} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-extrabold leading-tight">{t('recReportsTitle')}</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {user?.email ?? t('recAdminOnly')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={toggleTheme}
            data-a11y-tap
            aria-label={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            title={theme === 'dark' ? t('recLightMode') : t('recDarkMode')}
            className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <LangToggle iconOnly className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />
          {user && (
            <button
              onClick={signOut}
              data-a11y-tap
              aria-label={t('recSignOut')}
              title={t('recSignOut')}
              className="flex items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut size={17} />
            </button>
          )}
          <button
            onClick={onBack}
            data-a11y-tap
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))]"
          >
            <ArrowRight size={14} />
            {t('recTheTool')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {checking ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-primary" /></div>
        ) : recovering ? (
          <form onSubmit={savePassword} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
            <p className="text-sm font-bold">{t('recChooseNewPassword')}</p>
            <p className="text-xs text-muted-foreground">
              {t('recResetHint')}
            </p>
            <input
              type="password" required minLength={8} autoFocus
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder={t('recNewPasswordPlaceholder')} autoComplete="new-password"
              className="w-full rounded-lg border-2 border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
            {error && <p className="text-xs font-bold text-destructive">{error}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-50">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {t('recSave')}
            </button>
          </form>
        ) : !user ? (
          <form onSubmit={signIn} className="mx-auto max-w-sm space-y-3 rounded-2xl border border-border bg-card/70 p-5 shadow-sm">
            {done && <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{done}</p>}
            <p className="text-sm text-muted-foreground">{t('recSignInHint')}</p>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder={t('recEmail')} autoComplete="username"
              className="w-full rounded-lg border-2 border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('recPassword')} autoComplete="current-password"
              className="w-full rounded-lg border-2 border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-primary/20 transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2"
            />
            {error && <p className="text-xs font-bold text-destructive">{error}</p>}
            <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-[hsl(var(--primary-hover))] disabled:opacity-50">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {t('recSignIn')}
            </button>
          </form>
        ) : (
          <RecitationSection />
        )}
      </main>
    </div>
  );
};

export default SardAdmin;
