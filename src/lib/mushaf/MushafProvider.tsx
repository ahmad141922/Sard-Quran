import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  defaultMushaf, getMushaf, offeredEditionsOfRiwaya,
  type MushafDefinition, type RiwayaId,
} from './registry';

/**
 * A remembered choice is only honoured while it is still on offer: an edition
 * withdrawn between two visits — plates that turned out to be unlicensed —
 * would otherwise pin a teacher to a book the picker no longer lists, with no
 * control on screen to leave it.
 */
const stillOffered = (m: MushafDefinition | undefined) => (m?.offered === false ? undefined : m);

interface MushafContextValue {
  mushaf: MushafDefinition;
  /** Switch edition. Unknown ids fall back to the default rather than blanking. */
  setMushafId: (id: string) => void;
  /** Switch riwaya, keeping the same publisher where that edition exists. */
  setRiwaya: (riwaya: RiwayaId) => void;
}

const MushafContext = createContext<MushafContextValue | null>(null);
const STORAGE_KEY = 'tajweedoo:mushaf-id';

export const MushafProvider: React.FC<{ children: React.ReactNode; initialId?: string }> = ({ children, initialId }) => {
  const [mushaf, setMushaf] = useState<MushafDefinition>(() => {
    const stored = (() => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } })();
    // `initialId` is a caller's explicit instruction — an open session naming
    // its own book — so it is honoured whether or not the picker offers it.
    return getMushaf(initialId ?? '') ?? stillOffered(getMushaf(stored ?? '')) ?? defaultMushaf();
  });

  const remember = (m: MushafDefinition) => {
    try { localStorage.setItem(STORAGE_KEY, m.id); } catch { /* private mode */ }
  };

  const setMushafId = useCallback((id: string) => {
    const next = getMushaf(id) ?? defaultMushaf();
    setMushaf(next);
    remember(next);
  }, []);

  const setRiwaya = useCallback((riwaya: RiwayaId) => {
    setMushaf(current => {
      if (current.riwayaId === riwaya) return current;
      // Prefer staying with the same publisher when they print this riwaya too,
      // so choosing a riwaya does not silently change the book as well.
      const editions = offeredEditionsOfRiwaya(riwaya);
      const next = editions.find(m => m.editionId === current.editionId) ?? editions[0] ?? current;
      remember(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mushaf, setMushafId, setRiwaya }), [mushaf, setMushafId, setRiwaya]);
  return <MushafContext.Provider value={value}>{children}</MushafContext.Provider>;
};

export function useMushaf(): MushafContextValue {
  const ctx = useContext(MushafContext);
  if (!ctx) throw new Error('useMushaf must be used inside MushafProvider');
  return ctx;
}
