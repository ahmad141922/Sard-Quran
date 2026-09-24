// Entry point for the standalone Recitation tool (أداة السرد القرآني).
//
// A second Vite input rather than a copy of the project: the whole feature
// already lives in pure modules under src/lib, so both the board and this tool
// build from one source. Nothing here is duplicated.

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
// After the board's stylesheet, never before: it retunes the same tokens.
import './theme.css';
import { Toaster } from 'sonner';
import { I18nProvider, useI18n, type Lang } from '@/hooks/useI18n';
import { MushafProvider } from '@/lib/mushaf/MushafProvider';
import { applyTheme, initialTheme, subscribeTheme } from '@/lib/theme';
import { matchStatusBar } from '@/lib/native';
import { isNative } from '@/lib/native';
import { installNativeAsr } from '@/lib/asr/native-engine';
import { routeFor } from './route';

// Before React paints anything: a bright flash on the way into a dark room is
// exactly what the dark mode was asked for.
applyTheme(initialTheme());

/**
 * A deploy that lands mid-visit refreshes the page once.
 *
 * The worker takes control the moment it installs (`skipWaiting` +
 * `clientsClaim`), and the page it takes over is the previous build's shell —
 * whose script and stylesheet names no longer exist on the server. The result
 * is one blank load and a user who has to know to press refresh.
 *
 * So the page refreshes itself, once, and only when a worker *replaces* an
 * existing one: on a first visit there is nothing to replace and nothing to
 * reload.
 */
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
}
// And in the Android shell the bar above the page is painted too — it is not
// part of the document, so the theme has to be told to it. No-op on the web.
void matchStatusBar(initialTheme());
subscribeTheme(t => { void matchStatusBar(t); });

/*
 * The recogniser, in the Android shell alone.
 *
 * Off-device this is never called and `asrEngine()` keeps returning
 * `nullEngine()`, so the browser build carries no microphone button and does
 * not fetch the plugin's chunk. Inside the shell the plugin still reports
 * itself unavailable until the model is on the device — installing it is not
 * the same as offering it.
 */
if (isNative()) installNativeAsr();
import SardApp from './SardApp';

/** Stable identity, so the provider does not re-derive its language each render. */
const SARD_LANGS: Lang[] = ['ar', 'en'];

const SardAdmin = lazy(() => import('./SardAdmin'));
const CertPage = lazy(() => import('./CertPage'));
const SharedReportView = lazy(() => import('@/components/board/SharedReportView'));
const AboutPage = lazy(() => import('./AboutPage'));

/**
 * Four screens, switched by hand rather than by a router: the tool is one page
 * and pulling in react-router for three extra views would cost more than it
 * explains.
 *
 * The admin view rides the hash (`#/admin`), which survives a static host with
 * no rewrite rules. The certificate page cannot: it is the address printed in a
 * QR square — `/cert` — and its own data lives in the fragment, so the path is
 * matched instead, and `sard/deploy/_redirects` tells the host to serve the app
 * for it.
 */
function Root() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const back = useCallback(() => { window.location.hash = ''; }, []);

  switch (routeFor(window.location.pathname, route)) {
    case 'cert':
      return <Suspense fallback={null}><CertPage /></Suspense>;
    /*
     * A shared report. The fragment carries the decryption key and is read
     * here without ever being sent anywhere — `route` is `window.location
     * .hash`, which no server sees. That is the whole design of the link, and
     * this is where it is finally honoured.
     */
    case 'shared':
      return <Suspense fallback={null}><SharedReportView hash={route} /></Suspense>;
    case 'admin':
      return <Suspense fallback={null}><SardAdmin onBack={back} /></Suspense>;
    // What a store asks an app to say about itself — and the privacy policy in
    // the reader's own language, not only at a link they must leave to read.
    case 'about':
      return <Suspense fallback={null}><AboutPage onBack={back} /></Suspense>;
    default:
      break;
  }
  return <SardApp />;
}

/**
 * The tab says the tool's name in the language the tool is speaking.
 *
 * The toaster too: it is positioned by `dir`, and a toast that slides in from
 * the wrong side of an English page is the one thing here that would still
 * read as Arabic.
 */
function Shell() {
  const { t, dir } = useI18n();
  useEffect(() => { document.title = t('recToolName'); }, [t]);
  return (
    <>
      <Root />
      <Toaster position="top-center" dir={dir} />
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  // Arabic and English, under the tool's own key — opening this tool must not
  // switch the board's language if the two ever share an origin and a
  // localStorage, and the board's four other languages are not offered here
  // because the muṣḥaf, the certificate and the reports are written in these
  // two.
  <I18nProvider langs={SARD_LANGS} storageKey="sard_lang">
    {/* Which riwaya and which print run are one choice the whole tool shares,
        and it outlives a single majlis. */}
    <MushafProvider>
      <Shell />
    </MushafProvider>
  </I18nProvider>,
);
