import { useEffect, useRef } from 'react';

interface UseDebouncedAutosaveOptions {
  dirty: boolean;
  /** Cambia en cada edición — reinicia el debounce aunque dirty siga true. */
  revision?: unknown;
  enabled?: boolean;
  delayMs?: number;
  onSave: () => Promise<void>;
}

/** Dispara onSave tras delayMs sin cambios mientras dirty === true. */
export function useDebouncedAutosave({
  dirty,
  revision,
  enabled = true,
  delayMs = 1200,
  onSave,
}: UseDebouncedAutosaveOptions) {
  // "Latest ref" pattern: keep onSaveRef pointing at the current onSave WITHOUT
  // making it a dependency of the debounce effect (so editing onSave doesn't reset
  // the timer). Updating the ref in an effect (not during render) satisfies
  // react-hooks/refs.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const timer = window.setTimeout(() => {
      void onSaveRef.current();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [dirty, revision, delayMs, enabled]);
}

interface UseUnloadGuardOptions {
  when: boolean;
}

export function useUnloadGuard({ when }: UseUnloadGuardOptions) {
  useEffect(() => {
    if (!when) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);
}
