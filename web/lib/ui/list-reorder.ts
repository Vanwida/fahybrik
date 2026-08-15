// list-reorder — applies ListRow's adjacent-step contract against the LATEST
// list and coalesces persistence into one final commit.
//
// ListRow (deliberately) emits N synchronous onMove(index, delta) calls when a
// row is dragged across multiple positions. Callers that close over a single
// render's array only keep the last swap and fire N incoherent writes. This
// module is the shared mechanism: each step mutates a live snapshot, React
// state tracks the progressive order, and commit runs once with the final list.

export type AdjacentStep = readonly [index: number, delta: -1 | 1];

/**
 * One adjacent swap. Returns null when the step is out of bounds or not a
 * unit step — callers treat null as no-op (same as ListRow's canMove gate).
 */
export function applyAdjacentSwap<T>(
  items: readonly T[],
  index: number,
  delta: -1 | 1,
): T[] | null {
  if (!Number.isInteger(index) || (delta !== -1 && delta !== 1)) return null;
  const target = index + delta;
  if (index < 0 || index >= items.length) return null;
  if (target < 0 || target >= items.length) return null;
  const next = items.slice();
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

/**
 * Apply a burst of adjacent steps against one snapshot. Each step sees the
 * result of the previous one — the invariant ListRow's multi-step drop needs
 * and that a stale useCallback closure breaks.
 */
export function reduceAdjacentSwaps<T>(
  items: readonly T[],
  steps: readonly AdjacentStep[],
): T[] {
  let current: T[] = items.slice() as T[];
  for (const [index, delta] of steps) {
    const next = applyAdjacentSwap(current, index, delta);
    if (next) current = next;
  }
  return current;
}

export type CoalescedAdjacentMoveOptions<T> = {
  /** Latest list. Read on the first step of a burst. */
  getList: () => readonly T[];
  /** Push the progressive list after every successful step. */
  setList: (next: T[]) => void;
  /**
   * Fired once per burst with the final list and the pre-burst snapshot.
   * Adjacent arrow clicks are a burst of one; a multi-step drop is one burst
   * of N steps → one commit (not N network writes).
   */
  commit: (next: readonly T[], previous: readonly T[]) => void;
  /** Optional map after each swap (e.g. renumber sort_order from position). */
  project?: (list: T[]) => T[];
  /**
   * Schedule the coalesced commit. Injectable for tests.
   * Default: macrotask (`setTimeout(fn, 0)`) so a synchronous for-loop of
   * onMove calls collapses into a single write after the drop handler returns.
   * Returns a cancel function for the pending schedule.
   */
  schedule?: (fn: () => void) => () => void;
};

/**
 * Build an `onMove(index, delta)` handler safe under ListRow multi-step drops.
 *
 * Holds a live list for the duration of a burst so successive synchronous
 * calls do not re-read a stale render closure, then commits once.
 */
export function createCoalescedAdjacentMove<T>(
  options: CoalescedAdjacentMoveOptions<T>,
): (index: number, delta: -1 | 1) => void {
  let live: T[] | null = null;
  let previous: readonly T[] | null = null;
  let cancelScheduled: (() => void) | null = null;

  const schedule =
    options.schedule ??
    ((fn: () => void) => {
      const id = setTimeout(fn, 0);
      return () => clearTimeout(id);
    });

  return (index, delta) => {
    if (live == null) {
      previous = options.getList();
      live = previous.slice() as T[];
    }

    const swapped = applyAdjacentSwap(live, index, delta);
    if (!swapped) return;

    live = options.project ? options.project(swapped) : swapped;
    options.setList(live);

    if (cancelScheduled) cancelScheduled();
    cancelScheduled = schedule(() => {
      cancelScheduled = null;
      const next = live;
      const prev = previous;
      live = null;
      previous = null;
      if (next && prev) options.commit(next, prev);
    });
  };
}
