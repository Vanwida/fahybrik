'use client';

// Toast — a single polite aria-live region for the dashboard (SPEC §9 Toast
// provider). One ToastProvider mounts the live region near the root; anything
// below calls `useToast().show(...)`. Success/info auto-dismiss; errors persist
// (no auto-dismiss) so a failed action is never lost. Toasts carry color + icon
// + text (never color alone) and an optional inline action (e.g. "Reintentar"),
// which is what UndoToast specializes for the 5s undo window.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { SemanticTier } from '@/lib/dashboard/constants/status-semantics';
import { SEMANTIC_TIER_META } from '@/lib/dashboard/constants/status-semantics';
import { MIcon } from '@/components/dashboard/MIcon';
import { cn } from '@/lib/utils';

/** Toast flavours map onto the shared semantic tiers (color + icon source). */
export type ToastTone = Extract<SemanticTier, 'success' | 'info' | 'error'>;

/** Default auto-dismiss for non-error toasts (ms). Errors never auto-dismiss. */
const DEFAULT_DURATION_MS = 5000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  tone?: ToastTone;
  /** Optional inline action button (e.g. "Deshacer" / "Reintentar"). */
  action?: ToastAction;
  /** Override auto-dismiss ms; `null` = persist until dismissed. */
  durationMs?: number | null;
}

export interface ToastRecord extends Required<Pick<ToastOptions, 'tone'>> {
  id: string;
  message: string;
  action?: ToastAction;
  durationMs: number | null;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Access the toast API. Throws if used outside <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  const show = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = `toast-${++toastSeq}`;
      const tone: ToastTone = options?.tone ?? 'success';
      // Errors persist by default; everything else auto-dismisses.
      const durationMs =
        options?.durationMs !== undefined
          ? options.durationMs
          : tone === 'error'
            ? null
            : DEFAULT_DURATION_MS;

      setToasts((prev) => [...prev, { id, message, tone, action: options?.action, durationMs }]);

      if (durationMs != null) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ── Viewport (single polite live region) ─────────────────────────────────────

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      // One polite live region for the whole app — announces additions without
      // stealing focus (SPEC §9 aria-live polite).
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const meta = SEMANTIC_TIER_META[toast.tone];
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'card-elevated pointer-events-auto flex w-full max-w-md items-center gap-3 px-4 py-3',
        'animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none',
      )}
      style={{ borderColor: `color-mix(in srgb, ${meta.token} 35%, var(--border-subtle))` }}
    >
      <span
        aria-hidden
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: meta.tintToken, color: meta.token }}
      >
        <MIcon name={meta.icon} size={15} weight={600} filled />
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] text-[color:var(--fg)]">{toast.message}</span>
      {toast.action ? (
        <button
          type="button"
          onClick={toast.action.onClick}
          className={cn(
            'focus-ring shrink-0 rounded-[var(--r-s)] px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]',
            'text-[color:var(--fg)] underline underline-offset-2 hover:bg-[color:var(--surface-container)]',
          )}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="focus-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-s)] text-[color:var(--text-muted)] hover:text-[color:var(--fg)]"
      >
        <MIcon name="close" size={15} />
      </button>
    </div>
  );
}
