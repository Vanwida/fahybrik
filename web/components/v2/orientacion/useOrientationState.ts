'use client';

// v2 · ORIENTACIÓN — per-coach + per-section dismissal state, in localStorage.
//
// Two independent, persisted levels per section (the approved decision 1):
//   · expanded  — are the IntroStrip micro-steps open? (defaults OPEN on the very
//                 first visit, then auto-COLLAPSED on later visits)
//   · dismissed — did the coach ✕ the strip entirely? (then only a recall ⓘ stays)
//
// Persistence is CLEAN (no DB migration): one localStorage key per coach + section,
// read reactively via usePersistentState (useSyncExternalStore — no effect-driven
// setState, no hydration flash). Scoping by coach means a shared browser never
// leaks one coach's "seen" state to another.
//
// First-visit handling: a null stored value = "never seen". We render the strip
// OPEN on that first paint and write a "seen + collapsed" marker in a mount effect
// (a localStorage WRITE, not a setState — so it never triggers cascading renders).
// On every later visit the stored value drives a quiet, collapsed strip.

import { useEffect, useRef } from 'react';
import { usePersistentState, useHydrated } from './persistent-store';

const STORE_PREFIX = 'v2.orient';

interface StoredState {
  /** Has the coach ever visited this section? (drives first-run vs steady state.) */
  seen: boolean;
  /** Are the micro-steps expanded right now? */
  expanded: boolean;
  /** Did the coach dismiss the strip entirely (✕)? */
  dismissed: boolean;
}

function storageKey(coachKey: string, sectionKey: string): string {
  return `${STORE_PREFIX}.${coachKey}.${sectionKey}`;
}

export interface OrientationState {
  /** First time the coach sees this section (no stored state yet). */
  firstRun: boolean;
  /** Whether the IntroStrip is currently visible at all. */
  visible: boolean;
  /** Whether the micro-steps are expanded (only meaningful while visible). */
  expanded: boolean;
  /** Toggle the "Cómo funciona" expansion. */
  toggleExpanded: () => void;
  /** ✕ — hide the strip; leaves a recall ⓘ. */
  dismiss: () => void;
  /** ⓘ — bring the strip back, expanded (the approved decision 5). */
  recall: () => void;
  /** True once we're on the client (avoids rendering the recall ⓘ during SSR). */
  hydrated: boolean;
}

/**
 * Manage one section's IntroStrip lifecycle, persisted per coach + per section.
 * `coachKey` scopes the storage to the logged-in coach (pass the coach id).
 */
export function useOrientationState(coachKey: string, sectionKey: string): OrientationState {
  const key = storageKey(coachKey, sectionKey);
  const { value, set } = usePersistentState<StoredState>(key);
  const hydrated = useHydrated();

  // null stored value → first visit: show the strip OPEN, mark seen + collapse for
  // next time. The write happens once in an effect (a localStorage write, not a
  // setState — the store's notify re-renders us cleanly).
  const firstRun = value == null;
  const markedSeen = useRef(false);
  useEffect(() => {
    if (value == null && !markedSeen.current) {
      markedSeen.current = true;
      set({ seen: true, expanded: false, dismissed: false });
    }
  }, [value, set]);

  // Effective state: stored value when present, else first-run defaults (open).
  const state: StoredState = value ?? { seen: true, expanded: true, dismissed: false };

  return {
    firstRun,
    visible: !state.dismissed,
    expanded: state.expanded,
    toggleExpanded: () => set({ ...state, expanded: !state.expanded }),
    dismiss: () => set({ ...state, dismissed: true, expanded: false }),
    // Brought back on request → return it fully useful (expanded).
    recall: () => set({ ...state, dismissed: false, expanded: true }),
    hydrated,
  };
}
