'use client';

// SkeletonRow — loading placeholder shape-matched to a triage card (SPEC §4
// "loading (skeleton shape-matched)"): the readiness ring, the name + reason
// chip line, the evidence line and the action buttons, so the layout doesn't
// jump when real cards arrive. Paired with `useSkeletonVisibility`, which gates
// the skeleton behind a show-delay (no flash on cache hits) and holds it a
// minimum time once shown (no flicker) — SPEC §9 "show-delay 150–300ms,
// min-visible 300–500ms".

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Delay before showing the skeleton — skips it entirely on fast/cache hits. */
const DEFAULT_SHOW_DELAY_MS = 200;
/** Once shown, keep it at least this long to avoid a flicker. */
const DEFAULT_MIN_VISIBLE_MS = 400;

/**
 * Returns whether a skeleton should be visible given a `loading` flag, applying
 * a show-delay (avoid flash) and a minimum-visible window (avoid flicker).
 */
export function useSkeletonVisibility(
  loading: boolean,
  opts?: { showDelayMs?: number; minVisibleMs?: number },
): boolean {
  const showDelayMs = opts?.showDelayMs ?? DEFAULT_SHOW_DELAY_MS;
  const minVisibleMs = opts?.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    if (loading) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showDelayMs);
    } else if (shownAtRef.current != null) {
      const elapsed = Date.now() - shownAtRef.current;
      const wait = Math.max(0, minVisibleMs - elapsed);
      hideTimer = setTimeout(() => {
        shownAtRef.current = null;
        setVisible(false);
      }, wait);
    } else {
      setVisible(false);
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [loading, showDelayMs, minVisibleMs]);

  return visible;
}

function Bar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block rounded-[var(--r-s)] bg-[color:var(--surface-container-high)]',
        'animate-pulse motion-reduce:animate-none',
        className,
      )}
    />
  );
}

export interface SkeletonRowProps {
  /** Render N stacked skeleton cards. Default 1. */
  count?: number;
  className?: string;
}

export function SkeletonRow({ count = 1, className }: SkeletonRowProps) {
  return (
    <div role="status" aria-label="Cargando" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">Cargando…</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card-elevated flex items-start gap-4 p-6" aria-hidden>
          {/* Readiness ring placeholder */}
          <Bar className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center gap-2">
              <Bar className="h-4 w-32" />
              <Bar className="h-4 w-20 rounded-[var(--r-s)]" />
            </div>
            <Bar className="h-3 w-3/4" />
            <Bar className="h-3 w-1/2" />
          </div>
          {/* Actions placeholder */}
          <div className="hidden shrink-0 flex-col gap-2 md:flex">
            <Bar className="h-9 w-28 rounded-[var(--r-m)]" />
            <Bar className="h-9 w-28 rounded-[var(--r-m)]" />
          </div>
        </div>
      ))}
    </div>
  );
}
