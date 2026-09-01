'use client';

// React binding for createCoalescedAdjacentMove. Handler identity is stable;
// latest items/commit/project live in a bag updated only in layout effect
// (react-hooks/refs forbids touching refs during render).

import { useCallback, useLayoutEffect, useRef } from 'react';
import { createCoalescedAdjacentMove } from './list-reorder';

type Bag<T> = {
  items: readonly T[];
  setItems: (next: T[]) => void;
  commit: (next: readonly T[], previous: readonly T[]) => void;
  project?: (list: T[]) => T[];
};

/**
 * `onMove(index, delta)` for ListRow consumers: multi-step drag applies every
 * adjacent step against the live list and persists once with the final order.
 */
export function useListReorderMove<T>(
  items: readonly T[],
  setItems: (next: T[]) => void,
  commit: (next: readonly T[], previous: readonly T[]) => void,
  project?: (list: T[]) => T[],
): (index: number, delta: -1 | 1) => void {
  const bagRef = useRef<Bag<T>>({ items, setItems, commit, project });
  const moveRef = useRef<(index: number, delta: -1 | 1) => void>(() => {});

  useLayoutEffect(() => {
    bagRef.current = { items, setItems, commit, project };
  }, [items, setItems, commit, project]);

  useLayoutEffect(() => {
    moveRef.current = createCoalescedAdjacentMove<T>({
      getList: () => bagRef.current.items,
      setList: (next) => bagRef.current.setItems(next),
      commit: (next, previous) => bagRef.current.commit(next, previous),
      project: (list) => {
        const p = bagRef.current.project;
        return p ? p(list) : list;
      },
    });
  }, []);

  return useCallback((index: number, delta: -1 | 1) => {
    moveRef.current(index, delta);
  }, []);
}
