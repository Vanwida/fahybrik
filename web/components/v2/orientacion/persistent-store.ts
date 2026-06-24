'use client';

// v2 · ORIENTACIÓN — a tiny localStorage-backed store read via useSyncExternalStore.
//
// Why this exists: the orientation primitives persist a little state per coach +
// per section (IntroStrip dismissal/expansion, PipelineCue collapse). Reading that
// in a useEffect + setState trips React's cascading-render guard and risks
// hydration flashes. useSyncExternalStore is the purpose-built primitive for
// subscribing to an external store (here, localStorage) with a correct SSR
// snapshot — no effect, no cascading render, no mismatch.
//
// Each key holds a JSON object. Writes update localStorage and notify subscribers
// (same tab via an internal emitter; other tabs via the native `storage` event),
// so multiple consumers of the same key stay in sync.

import { useCallback, useMemo, useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();

function subscribe(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);

  // Cross-tab sync: a storage event for our key notifies this tab's subscribers.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) listener();
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);

  return () => {
    set!.delete(listener);
    if (set!.size === 0) listeners.delete(key);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function readRaw(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage full / blocked — degrade to defaults, non-fatal. */
  }
  emit(key);
}

/**
 * Read a JSON-serialised object from localStorage as reactive state, plus a
 * setter that persists + notifies. `null` snapshot = "no stored value yet"
 * (the consumer decides what that means, e.g. first visit). SSR snapshot is
 * always `null` so the server render is deterministic.
 */
export function usePersistentState<T>(
  key: string,
): { value: T | null; set: (next: T) => void } {
  const getSnapshot = useCallback(() => readRaw(key), [key]);
  const getServerSnapshot = useCallback(() => null, []);
  const sub = useCallback((l: Listener) => subscribe(key, l), [key]);

  const raw = useSyncExternalStore(sub, getSnapshot, getServerSnapshot);

  const value = useMemo<T | null>(() => {
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [raw]);

  const set = useCallback((next: T) => writeRaw(key, JSON.stringify(next)), [key]);

  return { value, set };
}

// ── Hydration flag ────────────────────────────────────────────────────────────
// `false` on the server + first client paint, `true` after hydration — via
// useSyncExternalStore (no effect-driven setState, so it never trips the
// cascading-render guard). Used to defer SSR-unsafe bits (e.g. the recall ⓘ,
// which depends on stored state) until the client has reconciled.
const noopSubscribe = () => () => {};

/** True only once we are running on the hydrated client. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );
}
