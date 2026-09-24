/**
 * The places a native shell — Android or iOS — differs from a browser.
 *
 * Every export here is a no-op or the plain web behaviour off-device, so call
 * sites read the same on all three and the board — which never runs in a shell
 * — carries nothing extra. The Capacitor plugins are imported dynamically for
 * the same reason: on the web that branch is never taken, so its chunk is
 * never fetched.
 *
 * Three of them, and one is Android's alone:
 *
 *   saveImage         both — neither WebView will save a `blob:` download
 *   matchStatusBar    both, but iOS has no bar colour to set (see below)
 *   onHardwareBack    Android — iPhones have no back button to answer
 *
 * What is *not* here: anything about the majlis. A shell may decide where a
 * PNG goes; it does not get an opinion about recitation.
 */
import { Capacitor } from '@capacitor/core';

/** True inside either shell, Android or iOS. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/**
 * Hands the teacher a finished PNG — the majlis report or a certificate.
 *
 * On the web that is a download, which is what `<a download>` has always done
 * here. Inside a shell it is not: an Android WebView drops a `blob:`/`data:`
 * download on the floor with no error and no file, and WKWebView on iOS has
 * no notion of a download directory to put one in either — which is the single
 * most confusing way this app could break. So the bytes are written to the
 * app's own cache and handed to the system share sheet, which is also where a
 * teacher was going anyway — WhatsApp, in one step instead of three.
 */
export async function saveImage(dataUrl: string, filename: string): Promise<void> {
  const name = filename.replace(/[\/:*?"<>|]/g, '-');

  if (!isNative()) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = name;
    a.click();
    return;
  }

  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);

  // Cache, not Documents: this is a copy on its way out to another app. On
  // Android the Cache directory needs no storage permission on any version,
  // and on iOS it is the app's own container — the share sheet reads it, and
  // the system reclaims it later without the file ever showing up in Files.
  const { uri } = await Filesystem.writeFile({
    path: name,
    // `writeFile` wants base64 without the data-URL preamble.
    data: dataUrl.slice(dataUrl.indexOf(',') + 1),
    directory: Directory.Cache,
  });

  await Share.share({ title: name, files: [uri] });
}

/**
 * Paints the status bar with the app, instead of leaving the system's own
 * strip above a cream page — or black text on the dark theme.
 *
 * The style — which names the *background*, so `Dark` means light glyphs — is
 * all iOS takes: there the bar has no fill of its own, the page runs under it,
 * and what shows through is the header's own background. Android is the one
 * that also wants a colour, and the two here mirror `--background` in
 * `sard/src/theme.css`; there is no way to read a CSS variable as the hex
 * string this wants without converting HSL by hand, so they are written here
 * with this line as the tie.
 */
export async function matchStatusBar(theme: 'light' | 'dark'): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // `Style.Dark` names the background, not the text: dark bar, light glyphs.
    await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() !== 'android') return;
    await StatusBar.setBackgroundColor({ color: theme === 'dark' ? '#110f0d' : '#fdf6e9' });
  } catch { /* edge-to-edge devices refuse the colour; the style still took */ }
}

/**
 * The hardware back button, which a WebView otherwise answers by closing the
 * app — including in the middle of a session.
 *
 * `handler` returns true if it handled the press. If nothing does, the app is
 * minimised rather than destroyed, which is what every Android user means by
 * back on a first screen: the majlis is still there when they return.
 *
 * Android only, and deliberately: iOS has no such button, and its edge swipe
 * belongs to a navigation stack this app does not have. On an iPhone the way
 * out of the report and out of the majlis is the close button already on the
 * screen — which is the same one the Android handler drives, so nothing here
 * is a screen an iPhone cannot leave.
 */
export async function onHardwareBack(handler: () => boolean): Promise<() => void> {
  if (Capacitor.getPlatform() !== 'android') return () => { /* nothing to unbind */ };
  const { App } = await import('@capacitor/app');
  const sub = await App.addListener('backButton', () => {
    if (handler()) return;
    void App.minimizeApp();
  });
  return () => { void sub.remove(); };
}

/**
 * The channel the ward reminder is posted on.
 *
 * A fixed range of ids, cleared and rewritten together, so a person who moves
 * their reminder from the evening to dawn does not end up with both. Ids and
 * not a wildcard because the plugin can only cancel what it is named.
 */
const REMINDER_IDS = Array.from({ length: 16 }, (_, i) => 4100 + i);

/**
 * Whether the device can hold a reminder while the app is shut.
 *
 * False in a browser, and truthfully so. A page can raise a notification while
 * it is open, but nothing in a browser will wake at dawn to do it — and a
 * reminder that only arrives when you are already looking at the app is not a
 * reminder. The setting says so rather than pretending.
 */
export const canRemind = (): boolean => isNative();

/** Asks once, and reports what the answer was. Never throws. */
export async function askReminderPermission(): Promise<boolean> {
  if (!canRemind()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const now = await LocalNotifications.checkPermissions();
    if (now.display === 'granted') return true;
    const asked = await LocalNotifications.requestPermissions();
    return asked.display === 'granted';
  } catch {
    return false;
  }
}

/**
 * Replaces the pending reminders with exactly these times.
 *
 * Replaces rather than adds: the caller works out the whole run — see
 * `reminder.ts` — and handing over a fresh list is the only way the set on the
 * device can be reasoned about. Times already past are dropped by the plugin.
 */
export async function setReminders(
  times: number[],
  text: { title: string; body: string },
): Promise<boolean> {
  if (!canRemind()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map(id => ({ id })) });
    const wanted = times.slice(0, REMINDER_IDS.length);
    if (!wanted.length) return true;
    await LocalNotifications.schedule({
      notifications: wanted.map((at, i) => ({
        id: REMINDER_IDS[i],
        title: text.title,
        body: text.body,
        schedule: { at: new Date(at), allowWhileIdle: true },
      })),
    });
    return true;
  } catch {
    // A refused permission, a shell without the plugin, a clock the system
    // will not take: none of them is a reason to break the screen that asked.
    return false;
  }
}

/** Takes every pending reminder back off the device. */
export async function clearReminders(): Promise<void> {
  if (!canRemind()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map(id => ({ id })) });
  } catch { /* nothing scheduled is the same outcome */ }
}
