import React, { useEffect, useRef, useState } from 'react';

/**
 * The first second of the app.
 *
 * ## Why there is one at all, when there is nothing to wait for
 *
 * The bundle is on the device and the muṣḥaf is on the device, so this is not
 * covering a load. It is covering a **handover**: the system paints its own
 * static splash, then the WebView paints its first frame, and without something
 * between them the app arrives with a blink. What is here is the join.
 *
 * Which is why the background is exactly the native splash's colour. If the two
 * matched perfectly nobody would be able to say where one ended.
 *
 * ## Why the animation is this animation
 *
 * Lines of a page revealing one after another, right to left. That is not a
 * decoration chosen for movement — it is the single thing this tool does, shown
 * before it is explained: the cover lifts off a line once it has been recited.
 * A generic spinner or a bouncing logo would say nothing about the app it is
 * the front of.
 *
 * ## Why it can always be skipped, and never blocks
 *
 * An animation that delays a fast app is a tax on every launch, paid daily by
 * the person who uses it most. So it is short, a touch anywhere ends it, and
 * `prefers-reduced-motion` collapses it to a plain fade — the reveal is the
 * kind of staggered movement that setting exists for.
 */

/** Line widths, as fractions — a page of prose, not a bar chart. */
const LINES = [0.92, 0.78, 0.88, 0.64, 0.83];

const STAGGER_MS = 90;
const WIPE_MS = 300;
/** When the whole thing starts leaving. */
const HOLD_MS = LINES.length * STAGGER_MS + WIPE_MS + 240;
const FADE_MS = 320;

export const SardSplash: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [leaving, setLeaving] = useState(false);
  // Called once however the splash ends — timer or touch — because `onDone`
  // unmounts the tree and a second call would land on nothing.
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };
    const out = setTimeout(() => setLeaving(true), HOLD_MS);
    const end = setTimeout(finish, HOLD_MS + FADE_MS);
    return () => { clearTimeout(out); clearTimeout(end); };
  }, [onDone]);

  const skip = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  return (
    <div
      data-sard-splash
      role="presentation"
      onPointerDown={skip}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <style>{`
        @keyframes sard-wipe {
          from { transform: scaleX(0); opacity: 0.35; }
          to   { transform: scaleX(1); opacity: 1; }
        }
        @keyframes sard-rise {
          from { transform: translateY(6px); opacity: 0; }
          to   { transform: translateY(0);   opacity: 1; }
        }
        .sard-line {
          transform-origin: right center;
          animation: sard-wipe ${WIPE_MS}ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
        }
        .sard-word { animation: sard-rise 380ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .sard-line, .sard-word {
            animation-name: sard-rise;
            animation-duration: 200ms;
            animation-delay: 0ms !important;
            transform: none;
          }
        }
      `}</style>

      {/* The page. Right-aligned, because that is the edge a line begins at. */}
      <div className="flex w-40 flex-col items-end gap-2" aria-hidden="true">
        {LINES.map((width, i) => (
          <div
            key={i}
            className="sard-line h-1.5 rounded-full bg-primary/80"
            style={{ width: `${width * 100}%`, animationDelay: `${i * STAGGER_MS}ms` }}
          />
        ))}
      </div>

      <div
        className="sard-word mt-7 text-lg font-extrabold text-foreground"
        style={{ animationDelay: `${LINES.length * STAGGER_MS + 60}ms` }}
      >
        أداة السرد القرآني
      </div>
    </div>
  );
};

export default SardSplash;
