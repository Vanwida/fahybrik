// ErrorState — a per-loader failure surface that NEVER shows a raw error and
// ALWAYS offers a way forward (SPEC §4 "error de carga parcial → sección con
// retry, nunca 500"; SPEC §9 "ErrorState actionable message + Retry"). Use it
// inside an error boundary fallback or a section that failed to load, so one
// dead loader degrades a section instead of 500-ing the page. role="alert" so
// it's announced.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** Human, actionable message (never a stack trace). */
  title?: string;
  description?: string;
  /** Retry handler — renders the Retry button when provided. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Compact inline variant for a small section vs the default card block. */
  inline?: boolean;
  className?: string;
}

export function ErrorState({
  title = 'No se pudo cargar',
  description = 'Algo falló al traer esta sección. Inténtalo de nuevo.',
  onRetry,
  retryLabel = 'Reintentar',
  inline = false,
  className,
}: ErrorStateProps) {
  const RetryButton = onRetry ? (
    <button
      type="button"
      onClick={onRetry}
      className={cn(
        'focus-ring inline-flex items-center gap-2 rounded-[var(--r-m)] px-3.5 py-2',
        'border border-[color:var(--border-subtle)] bg-[color:var(--surface-container)] text-[color:var(--fg)]',
        'hover:bg-[color:var(--surface-container-high)]',
        'text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
      )}
    >
      <MIcon name="refresh" size={15} />
      {retryLabel}
    </button>
  ) : null;

  if (inline) {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center gap-3 rounded-[var(--r-m)] px-3 py-2.5',
          'border border-[color:color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color:var(--danger-tint)]',
          className,
        )}
      >
        <MIcon name="error" size={16} filled className="text-[color:var(--danger)]" />
        <span className="min-w-0 flex-1 text-[12.5px] text-[color:var(--fg)]">{title}</span>
        {RetryButton}
      </div>
    );
  }

  return (
    <section
      role="alert"
      aria-label={title}
      className={cn(
        'card-elevated flex flex-col items-center px-6 py-10 text-center hover:border-[color:var(--border-subtle)]',
        className,
      )}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--danger-tint)] text-[color:var(--danger)]">
        <MIcon name="error" size={26} filled />
      </span>
      <h2 className="text-lg font-semibold text-[color:var(--fg)]">{title}</h2>
      <p className="mt-2 max-w-[44ch] text-sm text-[color:var(--text-muted)]">{description}</p>
      {RetryButton ? <div className="mt-5">{RetryButton}</div> : null}
    </section>
  );
}
