import { useEffect, useState } from 'react';

// Light or dark, remembered.
//
// A majlis runs after 'isha as often as after fajr, and a bright page in a dim
// room is the first thing a teacher complains about. The choice is the
// teacher's and it is remembered, rather than following the system: the room
// and the operating system rarely agree.

export type Theme = 'light' | 'dark';

const KEY = 'tajweedoo:theme';

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch { return null; }
}

/** What to open with: the remembered choice, else the system's. */
export function initialTheme(): Theme {
  const stored = storedTheme();
  if (stored) return stored;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}

/**
 * One theme for the whole tool.
 *
 * The home screen and the open majlis are two components that can both offer
 * the switch, and two `useState`s would each believe their own answer — the
 * one that rendered last would win and the other would put it back. So the
 * value lives here, once, and both subscribe to it.
 */
let current: Theme | null = null;
const listeners = new Set<(t: Theme) => void>();

export function currentTheme(): Theme {
  if (current === null) current = initialTheme();
  return current;
}

export function toggleTheme(): void {
  setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

export function subscribeTheme(fn: (t: Theme) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  // Tells the browser to paint its own furniture — scrollbars, form controls —
  // to match, so the page has no bright edges around it.
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme): void {
  current = theme;
  applyTheme(theme);
  try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  for (const fn of listeners) fn(theme);
}


/** React binding for that one value. */
export function useTheme(): [Theme, () => void] {
  const [theme, setLocal] = useState<Theme>(() => currentTheme());
  useEffect(() => {
    applyTheme(currentTheme());
    return subscribeTheme(setLocal);
  }, []);
  return [theme, toggleTheme];
}
