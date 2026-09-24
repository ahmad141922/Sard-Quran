import React from 'react';

export interface Rect { x: number; y: number; w: number; h: number }

export interface FloatingRectOptions {
  /** Stable key: where this window was left is remembered under it. */
  id: string;
  defaultWidth: number;
  defaultHeight: number;
  minWidth?: number;
  minHeight?: number;
}

const EDGE = 8;

/**
 * The geometry of a window on the board: where it is, how big, and the gestures
 * that change either.
 *
 * Split out from the window chrome because most panels here already have a
 * header they have earned — a gradient, a credit badge, a subtitle. Replacing
 * those with a generic title bar to gain a drag handle would be trading
 * something for nothing, so instead the header they have becomes the handle:
 * spread `dragHandleProps` onto it and render `resizeHandles` inside the frame.
 */
export function useFloatingRect({ id, defaultWidth, defaultHeight, minWidth = 320, minHeight = 240 }: FloatingRectOptions) {
  const storeKey = `tajweedoo_win_${id}`;

  const [narrow, setNarrow] = React.useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640,
  );
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const [maximised, setMaximised] = React.useState(false);

  /**
   * The whole window stays on screen — not merely a grip of it.
   *
   * Letting it hang over an edge costs the resize handles that live there: a
   * window dragged low has its bottom corner below the viewport, and then it
   * cannot be made smaller again. It also covers the window remembered from a
   * large screen and reopened on a small one, which would otherwise be open and
   * unreachable.
   */
  const clamp = React.useCallback((r: Rect): Rect => {
    // A container that reports nothing is not a small screen. It happens while
    // the board is hidden or embedded and being measured, and clamping to it
    // collapses the window to its minimum in the corner — the same zero-size
    // trap the canvas had. Nothing to clamp to, so nothing is clamped.
    if (window.innerWidth < 1 || window.innerHeight < 1) return r;
    const w = Math.max(minWidth, Math.min(r.w, window.innerWidth - 16));
    const h = Math.max(minHeight, Math.min(r.h, window.innerHeight - 16));
    const x = Math.max(8, Math.min(r.x, window.innerWidth - w - 8));
    const y = Math.max(8, Math.min(r.y, window.innerHeight - h - 8));
    return { x, y, w, h };
  }, [minWidth, minHeight]);

  const [rect, setRect] = React.useState<Rect>(() => {
    const room = window.innerWidth > 0 && window.innerHeight > 0;
    const w = room ? Math.min(defaultWidth, window.innerWidth - 24) : defaultWidth;
    const h = room ? Math.min(defaultHeight, window.innerHeight - 24) : defaultHeight;
    const fallback: Rect = { x: (window.innerWidth - w) / 2, y: (window.innerHeight - h) / 2, w, h };
    try {
      const saved = localStorage.getItem(storeKey);
      if (!saved) return fallback;
      const r = JSON.parse(saved) as Rect;
      if (![r.x, r.y, r.w, r.h].every(n => typeof n === 'number' && isFinite(n))) return fallback;
      return clamp(r);
    } catch {
      return fallback;
    }
  });

  /**
   * Saved when the gesture ends, not on every change of the rectangle.
   *
   * Saving continuously also saved the clamp's work: a viewport that shrinks
   * for a moment — a phone rotating, a soft keyboard opening, a pane being
   * dragged — squeezes the window to its minimum, and that minimum was written
   * down as if the teacher had chosen it. It never grew back. Only a drag or a
   * resize is a choice worth remembering.
   */
  const remember = React.useCallback((r: Rect) => {
    try { localStorage.setItem(storeKey, JSON.stringify(r)); } catch { /* private mode */ }
  }, [storeKey]);

  React.useEffect(() => {
    const onResize = () => setRect(r => clamp(r));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  /**
   * One gesture handler for moving and for every resize edge.
   *
   * Pointer capture is what makes this survive a fast drag: without it the
   * pointer leaves the 8px handle, the element stops hearing about it, and the
   * window sticks halfway.
   */
  const startDrag = (mode: 'move' | 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw') =>
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (narrow || maximised) return;
      // A control inside the header is not the header.
      if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
      e.preventDefault();
      e.stopPropagation();
      const handle = e.currentTarget as HTMLElement;
      handle.setPointerCapture(e.pointerId);
      const startX = e.clientX, startY = e.clientY;
      const start = { ...rect };

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (mode === 'move') {
          setRect(clamp({ ...start, x: start.x + dx, y: start.y + dy }));
          return;
        }
        let { x, y, w, h } = start;
        if (mode.includes('e')) w = start.w + dx;
        if (mode.includes('s')) h = start.h + dy;
        if (mode.includes('w')) { w = start.w - dx; x = start.x + dx; }
        if (mode.includes('n')) { h = start.h - dy; y = start.y + dy; }
        // Pushing a left or top edge past the minimum must not drag the window
        // along with it — pin the far edge and stop.
        if (w < minWidth) { if (mode.includes('w')) x = start.x + (start.w - minWidth); w = minWidth; }
        if (h < minHeight) { if (mode.includes('n')) y = start.y + (start.h - minHeight); h = minHeight; }
        setRect(clamp({ x, y, w, h }));
      };
      const onUp = (ev: PointerEvent) => {
        setRect(r => { remember(r); return r; });
        handle.releasePointerCapture?.(ev.pointerId);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

  const full = narrow || maximised;

  const style: React.CSSProperties = full
    ? { position: 'fixed', inset: narrow ? 0 : 12 }
    : { position: 'fixed', left: rect.x, top: rect.y, width: rect.w, height: rect.h };

  /** Spread onto whatever the window should be dragged by — usually its header. */
  const dragHandleProps = {
    onPointerDown: startDrag('move'),
    onDoubleClick: () => { if (!narrow) setMaximised(v => !v); },
    style: { touchAction: 'none' as const, cursor: full ? undefined : 'grab' },
  };

  const handle = (mode: 'e' | 'w' | 's' | 'n' | 'se' | 'sw' | 'ne' | 'nw', css: React.CSSProperties, cursor: string) => (
    <div
      key={mode}
      onPointerDown={startDrag(mode)}
      style={{ position: 'absolute', cursor, touchAction: 'none', zIndex: 5, ...css }}
      aria-hidden
    />
  );

  const resizeHandles = full ? null : (
    <>
      {handle('n', { top: 0, left: EDGE, right: EDGE, height: EDGE }, 'ns-resize')}
      {handle('s', { bottom: 0, left: EDGE, right: EDGE, height: EDGE }, 'ns-resize')}
      {handle('w', { left: 0, top: EDGE, bottom: EDGE, width: EDGE }, 'ew-resize')}
      {handle('e', { right: 0, top: EDGE, bottom: EDGE, width: EDGE }, 'ew-resize')}
      {handle('nw', { top: 0, left: 0, width: EDGE * 2, height: EDGE * 2 }, 'nwse-resize')}
      {handle('ne', { top: 0, right: 0, width: EDGE * 2, height: EDGE * 2 }, 'nesw-resize')}
      {handle('sw', { bottom: 0, left: 0, width: EDGE * 2, height: EDGE * 2 }, 'nesw-resize')}
      {handle('se', { bottom: 0, right: 0, width: EDGE * 2, height: EDGE * 2 }, 'nwse-resize')}
    </>
  );

  return { style, dragHandleProps, resizeHandles, full, narrow, maximised, setMaximised };
}
