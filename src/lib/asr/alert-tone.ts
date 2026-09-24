/**
 * The sound made when a recitation leaves the text.
 *
 * ## Why it is synthesised and not a file
 *
 * It has to be short, quiet, and available the instant it is wanted. A file
 * would be an asset to ship, a fetch that can fail, and a decode that can
 * arrive late — for something that is two sine tones. Nothing here is a
 * judgement about audio quality; it is that the simplest thing that works has
 * no failure modes.
 *
 * ## What it is trying to sound like
 *
 * Not an error. A reciter is mid-line and trying to remember; a buzzer would
 * be a hand on their shoulder. Two soft descending tones, brief and well under
 * the voice in level, are the sound of somebody clearing their throat behind
 * you — enough to notice, not enough to stop for.
 *
 * It is also **not** a claim. The machine is wrong sometimes and this is the
 * moment it is most likely to be, so what the sound says is «check», never
 * «wrong».
 */

/** Kept between alerts: opening a context per tone is what makes them stutter. */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (context) return context;
  const Ctor = typeof window === 'undefined'
    ? undefined
    : (window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  try { context = new Ctor(); } catch { return null; }
  return context;
}

/** One tone of the pair. */
function tone(ctx: AudioContext, hz: number, startsIn: number, seconds: number, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = hz;

  const at = ctx.currentTime + startsIn;
  /*
   * Faded in and out rather than switched on: an oscillator that starts and
   * stops at full level clicks, and a click is exactly the startling sound
   * this is trying not to make.
   */
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

/**
 * Sounds the alert, or does nothing where there is no audio to sound it with.
 *
 * Never throws and never waits: it is called from a poll that is also driving
 * the marker, and a rejected promise or a blocked autoplay must not reach it.
 */
export function alertStray(): void {
  const ctx = audio();
  if (!ctx) return;
  try {
    // A blocked context stays suspended until a gesture; resuming is worth
    // trying and not worth waiting for.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    tone(ctx, 660, 0, 0.11, 0.09);
    tone(ctx, 495, 0.1, 0.16, 0.075);
  } catch { /* an alert that cannot sound is not a reason to stop reciting */ }
}

/** Drops the audio context. For tests, and for leaving a session. */
export function resetAlertTone(): void {
  try { void context?.close(); } catch { /* already gone */ }
  context = null;
}
