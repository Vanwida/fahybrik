'use client';

// Shared presentational bits for the athlete-lifecycle surfaces (#13): the reason
// chips, dialog field wrapper, the standard dialog buttons and the ES date format.
// One home so the pause dialog, the baja dialog and the pending-request banner all
// read the same — reason labels come from shared/domain (DRY), never re-typed here.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';
import {
  PAUSE_REASONS,
  PAUSE_REASON_LABELS,
  type PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

// ── Shared button class strings (v2 tokens only) ────────────────────────────────
const BTN_BASE =
  'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] text-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export const DIALOG_PRIMARY_CLS = cn(
  BTN_BASE,
  'bg-[color:var(--v2-accent)] px-4 text-[color:var(--v2-accent-fg)] hover:bg-[color:var(--v2-accent-press)]',
);
export const DIALOG_DANGER_CLS = cn(
  BTN_BASE,
  'bg-[color:var(--v2-danger)] px-4 text-white hover:opacity-90',
);
export const DIALOG_GHOST_CLS = cn(
  BTN_BASE,
  'px-3 text-[color:var(--v2-muted)] hover:text-[color:var(--v2-fg)]',
);
export const DIALOG_OUTLINE_CLS = cn(
  BTN_BASE,
  'border border-[color:var(--v2-border)] bg-[color:var(--v2-surface)] px-3 text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
);

// ── Shared input class strings ──────────────────────────────────────────────────
const FIELD_BASE =
  'v2-focus w-full rounded-[var(--v2-r-s)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-3 text-sm text-[color:var(--v2-fg)] placeholder:text-[color:var(--v2-faint)] focus:border-[color:var(--v2-border-strong)] disabled:opacity-50';

export const DATE_INPUT_CLS = cn(FIELD_BASE, 'h-10');
export const TEXTAREA_CLS = cn(FIELD_BASE, 'resize-y py-2 leading-relaxed');

// ── Field wrapper ───────────────────────────────────────────────────────────────
export function DialogField({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="v2-micro">
        {label}
        {required ? <span className="ml-0.5 text-[color:var(--v2-danger)]">*</span> : null}
        {hint ? (
          <span className="ml-1.5 font-medium normal-case text-[color:var(--v2-faint)]">
            · {hint}
          </span>
        ) : null}
      </span>
      {children}
    </div>
  );
}

// ── Reason chips (shared by pause + baja dialogs) ───────────────────────────────
export function ReasonChips({
  value,
  onChange,
  disabled = false,
}: {
  value: PauseReason | null;
  onChange: (r: PauseReason) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PAUSE_REASONS.map((r) => {
        const active = r === value;
        return (
          <button
            key={r}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(r)}
            className={cn(
              'v2-focus inline-flex h-9 items-center rounded-[var(--v2-r-s)] border px-3 text-xs font-semibold transition-colors disabled:opacity-50',
              active
                ? 'border-[color:var(--v2-accent)] bg-[color:var(--v2-accent-soft)] text-[color:var(--v2-accent)]'
                : 'border-[color:var(--v2-border)] text-[color:var(--v2-muted)] hover:border-[color:var(--v2-border-strong)] hover:text-[color:var(--v2-fg)]',
            )}
          >
            {PAUSE_REASON_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

// ── Dialog buttons ──────────────────────────────────────────────────────────────
export function DialogPrimaryButton({
  onClick,
  disabled = false,
  busy = false,
  icon,
  label,
  tone = 'accent',
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon: string;
  label: string;
  tone?: 'accent' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={tone === 'danger' ? DIALOG_DANGER_CLS : DIALOG_PRIMARY_CLS}
    >
      <MIcon
        name={busy ? 'progress_activity' : icon}
        size={16}
        className={busy ? 'animate-spin' : undefined}
      />
      {label}
    </button>
  );
}

export function DialogGhostButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={DIALOG_GHOST_CLS}>
      {children}
    </button>
  );
}

export function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
      {children}
    </p>
  );
}

// ── Date helpers ────────────────────────────────────────────────────────────────

/** Today as a local YYYY-MM-DD (for a date input's `min`). */
export function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Render an ISO date as "3 jul". A date-only string (YYYY-MM-DD) is built from parts
 * so it never shifts a day across timezones; an instant is parsed directly.
 */
export function formatEsDate(iso: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  let d: Date;
  if (dateOnly) {
    const [y, m, day] = iso.split('-').map(Number);
    d = new Date(y!, m! - 1, day!);
  } else {
    d = new Date(iso);
  }
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}
