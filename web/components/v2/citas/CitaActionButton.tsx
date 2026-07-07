'use client';

// CitaActionButton — one coach action on an appointment (Aceptar / Rechazar / Cancelar
// / Completada / No asistió / Guardar enlace). Mirrors the LeadStatusControl button
// language: h-9 pill-ish, icon + label, a `progress_activity` spinner while its own
// request is in flight. `tone` picks the emphasis; only `accent` is a filled button.

import { MIcon } from '@/components/ui/MIcon';
import { cn } from '@/lib/utils';

export type CitaActionTone = 'accent' | 'neutral' | 'danger' | 'ok';

const TONE_CLS: Record<CitaActionTone, string> = {
  accent:
    'bg-[color:var(--v2-accent)] text-[color:var(--v2-accent-fg)] hover:opacity-90',
  neutral:
    'border border-[color:var(--v2-border)] text-[color:var(--v2-fg)] hover:border-[color:var(--v2-border-strong)]',
  danger:
    'border border-[color:var(--v2-border)] text-[color:var(--v2-danger)] hover:border-[color:var(--v2-danger)]',
  ok: 'border border-[color:var(--v2-border)] text-[color:var(--v2-ok)] hover:border-[color:var(--v2-ok)]',
};

export function CitaActionButton({
  label,
  icon,
  tone = 'neutral',
  onClick,
  spinning = false,
  disabled = false,
  className,
}: {
  label: string;
  icon: string;
  tone?: CitaActionTone;
  onClick: () => void;
  spinning?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'v2-focus inline-flex h-9 items-center gap-1.5 rounded-[var(--v2-r-s)] px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        TONE_CLS[tone],
        className,
      )}
    >
      <MIcon
        name={spinning ? 'progress_activity' : icon}
        size={16}
        className={spinning ? 'animate-spin' : undefined}
      />
      {label}
    </button>
  );
}
