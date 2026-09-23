'use client';

// Local chrome for the Tests section — mirrors the Niveles/Periodización pattern
// (PanelButton, DialogScrim, ErrorBanner) plus a themed <select>. Kept local (each
// v2 section owns its dialog/button chrome; `ui/list-row` + SidePanel are the
// shared primitives) so a change here never ripples into Periodización.

import { cn } from '@/lib/utils';

export function PanelButton({
  variant,
  onClick,
  disabled = false,
  children,
}: {
  variant: 'primary' | 'ghost' | 'outline' | 'danger';
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const base =
    'v2-focus inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--v2-r-pill)] px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
  const cls = cn(
    base,
    variant === 'primary' &&
      'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
    variant === 'ghost' &&
      'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
    variant === 'outline' &&
      'border border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
    variant === 'danger' &&
      'border border-[color:var(--v2-danger)] text-[color:var(--v2-danger)] hover:bg-[color:var(--v2-danger-soft)]',
  );
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

// Themed <select>, styled to match the SidePanel TextInput.
export function SelectInput({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'v2-focus h-[34px] w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)]',
        'bg-[color:var(--v2-surface-2)] px-2.5 text-body text-[color:var(--v2-fg)]',
        'focus:border-[color:var(--v2-border-strong)]',
      )}
    >
      {children}
    </select>
  );
}
