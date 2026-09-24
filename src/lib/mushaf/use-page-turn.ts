import { useEffect, useRef, useState } from 'react';

/**
 * Which way the page just turned.
 *
 * The animation itself is two keyframes in the stylesheet; this only says
 * which of them applies, by remembering the page before. A jump from the index
 * or a search result is a turn too — it comes from whichever side it moved
 * towards, which is what a reader would expect of a book being leafed through
 * quickly.
 *
 * The first page of a session is not a turn: nothing was turned to reach it,
 * and animating it would make opening the muṣḥaf feel like a transition.
 */
export type TurnDirection = 'forward' | 'back';

export function usePageTurn(page: number | null): TurnDirection | undefined {
  const previous = useRef<number | null>(null);
  const [turn, setTurn] = useState<TurnDirection | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = page;
    if (page === null || before === null || before === page) return;
    setTurn(page > before ? 'forward' : 'back');
  }, [page]);

  return turn;
}
