'use client';

// Shared presentational bits for the athlete-lifecycle surfaces (#13): the reason
// chips, dialog field wrapper, the standard dialog buttons and the ES date format.
// One home so the pause dialog, the baja dialog and the pending-request banner all
// read the same — reason labels come from shared/domain (DRY), never re-typed here.

import { Button } from '@/components/v2/ui';
import { ChipGroup } from '@/components/v2/controls/ChipGroup';
import {
  PAUSE_REASONS,
  PAUSE_REASON_LABELS,
  type PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

// ── Campo ───────────────────────────────────────────────────────────────────────
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
      <span className="t-meta font-medium text-v2-fg">
        {label}
        {required ? <span className="sr-only"> (obligatorio)</span> : null}
        {hint ? <span className="ml-1.5 font-normal text-v2-faint">· {hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

// ── Motivo (pausa y baja): una elección a un toque ─────────────────────
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
    <ChipGroup
      mono={false}
      ariaLabel="Motivo"
      value={value}
      onChange={onChange}
      options={PAUSE_REASONS.map((r) => ({ value: r, label: PAUSE_REASON_LABELS[r], disabled }))}
    />
  );
}

// ── Botones del pie (el primitivo Button) ───────────────────────────────────────
export function DialogPrimaryButton({
  onClick,
  disabled = false,
  busy = false,
  label,
  tone = 'accent',
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Heredado: los diálogos lo siguen pasando; el pie no lleva icono. */
  icon?: string;
  label: string;
  tone?: 'accent' | 'danger';
}) {
  return (
    <Button variant={tone === 'danger' ? 'destructive' : 'primary'} onClick={onClick} disabled={disabled} loading={busy}>
      {label}
    </Button>
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
    <Button variant="ghost" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}

export function DialogError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="t-body-sm text-v2-danger">
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
