'use client';

// UndoToast — a self-contained "✓ {n} resueltos — Deshacer ◷4s" toast with a
// live countdown + progress bar (SPEC §4 undo toast; reuses the 5s undo-window
// pattern proven in InboxQueue). Controlled primitive: it runs the countdown
// and fires `onElapsed` exactly ONCE when the window closes, or `onUndo` if the
// coach cancels. The parent owns the optimistic state and the commit; this just
// renders the window. Pairs with BulkActionBar and the Toast provider.

import { useEffect, useRef, useState } from 'react';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

/** Default undo window (s), matching the inbox approval flow (SPEC §4/§6). */
export const UNDO_TOAST_SECONDS = 5;

export interface UndoToastProps {
  /** Toast copy, e.g. "2 resueltos" / "Plan pospuesto". */
  message: string;
  /** Fired once when the countdown reaches 0 (commit the action). */
  onElapsed: () => void;
  /** Fired if the coach taps "Deshacer" before the window closes. */
  onUndo: () => void;
  /** Window length in seconds. Default 5. */
  seconds?: number;
  className?: string;
}

export function UndoToast({
  message,
  onElapsed,
  onUndo,
  seconds = UNDO_TOAST_SECONDS,
  className,
}: UndoToastProps) {
  const [remaining, setRemaining] = useState(seconds);
  // Latest commit callback in a ref so the interval effect runs ONCE and the
  // commit fires exactly once even under StrictMode double-invoke (same guard
  // proven in InboxQueue). The ref is written inside an effect, never in render.
  const elapsedRef = useRef(onElapsed);
  useEffect(() => {
    elapsedRef.current = onElapsed;
  }, [onElapsed]);

  useEffect(() => {
    // Live countdown in a local so we never read `remaining` from a stale
    // closure; setRemaining is only ever called from this async interval
    // callback (never synchronously in the effect body). Initial display comes
    // from useState(seconds); a new action remounts the toast, resetting it.
    let count = seconds;
    let fired = false;
    const timer = setInterval(() => {
      count -= 1;
      setRemaining(Math.max(0, count));
      if (count <= 0) {
        clearInterval(timer);
        if (!fired) {
          fired = true;
          elapsedRef.current();
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  return (
    <div
      role="status"
      className={cn(
        'card-elevated flex items-center gap-3 px-4 py-3',
        'border-[color:color-mix(in_srgb,var(--ok)_30%,var(--border-subtle))]',
        className,
      )}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--ok-tint)] text-[color:var(--ok)]"
      >
        <MIcon name="check" size={15} weight={600} filled />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] text-[color:var(--fg)]">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        aria-label={`Deshacer, ${remaining} segundos restantes`}
        className={cn(
          'focus-ring relative inline-flex shrink-0 items-center gap-2 overflow-hidden',
          'rounded-[var(--r-m)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] px-3 py-1.5',
          'text-[11px] font-bold uppercase tracking-[0.08em] text-[color:var(--fg)]',
          'hover:bg-[color:var(--surface-container-high)]',
        )}
      >
        Deshacer{' '}
        <span aria-hidden className="metric-num text-[10px] text-[color:var(--text-muted)]">
          {remaining}s
        </span>
        <span
          aria-hidden
          className="absolute bottom-0 left-0 h-0.5 bg-[color:var(--ok)] transition-all duration-1000 ease-linear motion-reduce:transition-none"
          style={{ width: `${(remaining / seconds) * 100}%` }}
        />
      </button>
    </div>
  );
}
