/**
 * The two native shells for the Recitation tool (أداة السرد القرآني):
 * Android and iOS.
 *
 * Shells, not second apps: the tool is already a PWA whose logic lives in
 * `src/lib`, so both platforms carry the very same build into a WebView.
 * Adding a platform must never mean a second implementation of the majlis —
 * which is also why there is one `webDir` here and not one per platform.
 *
 * `webDir` is **not** `dist-sard/`. That folder holds the 1.5 GB of muṣḥaf
 * plates Vite copies out of `sard/public/`, and their place is the R2 bucket,
 * not an APK — and less still an IPA, which Apple caps far lower.
 * `scripts/build-native.mjs` assembles `dist-native/` — the same build minus
 * the plates — and points it at the bucket exactly as the web deploy does.
 *
 *   npm run android:build     يبني الأداة ويزامنها داخل android/
 *   npm run android:open      يفتح المشروع في Android Studio
 *   npm run ios:build         يبني الأداة ويزامنها داخل ios/   (ماك أو ويندوز)
 *   npm run ios:open          يفتح المشروع في Xcode           (ماك وحده)
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tajweedoo.sard',
  appName: 'أداة السرد القرآني',
  webDir: 'dist-native',
  android: {
    // Keep the default `https` scheme, which makes the app's origin
    // `https://localhost`. Two things ride on it:
    //
    //   1. A plate is fetched as **text** so the polygon layer can be injected,
    //      so it is a CORS request — and the R2 policy has to name this exact
    //      origin. An `http` scheme would need a second entry for no gain.
    //   2. Secure context. Wake lock and crypto are only there on a secure
    //      origin, and `http://localhost` is not one in a WebView.
    //
    // Change it and the muṣḥaf goes blank until the bucket is told.
    backgroundColor: '#fdf8ef',
    // Inset the WebView by whatever the system bars occupy, on every Android
    // version rather than only on 15 — which is what the default `auto` does,
    // and it left the majlis toolbar under the status bar and the note buttons
    // under the gesture bar on a real phone. Where the window is not
    // edge-to-edge the insets the WebView sees are zero, so this adds nothing.
    adjustMarginsForEdgeToEdge: 'force',
  },
  ios: {
    // The origin on iOS is `capacitor://localhost`, and unlike Android it
    // cannot be made to match the site's: WKWebView refuses to hand `https`
    // to a scheme handler, so `server.iosScheme` has no setting that would.
    // What rides on it is the same pair, and both are already answered:
    //
    //   1. CORS. The plate is fetched as text, so the bucket has to name this
    //      exact origin — and it does: `capacitor://localhost` is the fourth
    //      entry in `sard/deploy/r2-cors.json`. Drop it and the tool opens on
    //      a blank muṣḥaf, with nothing in the console worth reading.
    //   2. Secure context. WebKit grants it to any origin whose host is
    //      `localhost`, whatever the scheme — so crypto and the wake lock are
    //      there as they are on the web.
    //
    // The WebView is left covering the whole screen — `contentInset` stays at
    // its default `never` — because the safe-area layer in `src/index.css`
    // already holds the toolbar and the note buttons clear of the notch and
    // the home indicator. An inset from UIKit on top of it would double the
    // gap on every iPhone with a notch.
    backgroundColor: '#fdf8ef',
    // iPadOS serves desktop-class pages by default, which reports the WebView
    // as a Mac. Nothing in the majlis reads the user agent, but the reports do
    // (`src/lib/device-fingerprint.ts`), and an iPad filed as a Mac is a lie
    // told for no gain: this is a touch tool on a touch device.
    preferredContentMode: 'mobile',
  },
  plugins: {
    StatusBar: {
      // The plugin's own default is `true`: installing it for the sake of
      // painting the bar also pushes the page **under** the bar, on every
      // version. This tool has a toolbar pinned to the top of the majlis
      // screen, so that default costs a row of controls.
      //
      // Android only — on iOS the WebView is under the bar by design and the
      // safe-area padding is what keeps the toolbar out from under it.
      overlaysWebView: false,
    },
    SplashScreen: {
      // Short, and hidden by the system itself: the bundle is on the device,
      // so there is nothing to wait for. It exists to cover the WebView's
      // white first frame — which on the dark theme is a flash in a dark room,
      // the same thing `applyTheme` runs before React for.
      launchShowDuration: 600,
      backgroundColor: '#fdf8ef',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
