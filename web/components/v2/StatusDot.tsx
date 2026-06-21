// StatusDot — colored ● + optional label. Encodes an athlete's account/training
// status. Color is paired with a text label (never color alone) for a11y.

import { cn } from '@/lib/utils';

/** Athlete status states (roster + lane semantics). */
export type V2Status = 'activa' | 'atencion' | 'alta' | 'pausa';

interface StatusMeta {
  label: string;
  colorVar: string;
}

const STATUS_META: Record<V2Status, StatusMeta> = {
  activa: { label: 'Activa', colorVar: '--v2-ok' },
  atencion: { label: 'Atención', colorVar: '--v2-warn' },
  alta: { label: 'Alta', colorVar: '--v2-danger' },
  pausa: { label: 'Pausa', colorVar: '--v2-faint' },
};

export function StatusDot({
  status,
  showLabel = false,
  className,
}: {
  status: V2Status;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: `var(${meta.colorVar})` }}
      />
      {showLabel ? (
        <span className="text-xs font-medium text-[color:var(--v2-muted)]">{meta.label}</span>
      ) : (
        <span className="sr-only">{meta.label}</span>
      )}
    </span>
  );
}
