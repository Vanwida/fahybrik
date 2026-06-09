'use client';

import { Link } from '@/i18n/navigation';
import { MIcon } from '@/components/dashboard/MIcon';
import { fmtDayShort, sesionesLabel } from '@/components/dashboard/assign-flow/helpers';

// =============================================================================
// AssignFlow · toast de éxito (mockup 04b) — "Publicado · N sesiones del X al Y"
// + link "Ver calendario". Sobrevive al cierre del modal porque AssignFlow
// queda montado en el call site; auto-dismiss gestionado por AssignFlow (6s).
// =============================================================================

export interface SuccessToast {
  athlete_id: string;
  athlete_name: string;
  month_name: string;
  session_count: number;
  start_date: string;
  end_date: string;
}

export function PublishedToast({ toast }: { toast: SuccessToast }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[60] flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-[var(--r-l)] border border-[color:color-mix(in_srgb,var(--ok)_35%,transparent)] bg-[color:var(--surface-elevated)] px-5 py-4 shadow-[var(--shadow-modal)]"
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-pill)] bg-[color:color-mix(in_srgb,var(--ok)_14%,transparent)] text-[color:var(--ok)]"
      >
        <MIcon name="check" size={18} filled weight={500} />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm font-bold">
          Publicado · {sesionesLabel(toast.session_count)} del {fmtDayShort(toast.start_date)} al{' '}
          {fmtDayShort(toast.end_date)}
        </span>
        <span className="truncate text-xs text-[color:var(--text-muted)]">
          {[toast.month_name, toast.athlete_name].filter(Boolean).join(' · ')}
        </span>
      </div>
      <Link
        href={`/atletas/${toast.athlete_id}`}
        className="focus-ring ml-auto shrink-0 rounded-[var(--r-m)] px-3 py-2 text-[13px] font-semibold text-[color:var(--accent)] hover:underline hover:underline-offset-2"
      >
        Ver calendario
      </Link>
    </div>
  );
}
