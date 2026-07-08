'use client';

// LifecycleBanner (#13) — the context strip under the ficha header. Renders one of:
//   • pending request (athlete asked for a pause, coach still activo) → Confirmar / Rechazar
//   • pausado  → "En pausa desde el X · motivo · vuelve el Y" (plan frozen)
//   • baja     → "De baja desde el X · motivo" (plan frozen, history preserved)
// Nothing for a plain activo athlete. Reason labels come from shared/domain (DRY).

import { MIcon } from '@/components/ui/MIcon';
import {
  PAUSE_REASON_LABELS,
  type PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import type { DetalleLifecycle } from '@/lib/dashboard/v2/atleta-detalle-types';
import { useLifecycleMutation } from './lifecycle-mutations';
import { DIALOG_OUTLINE_CLS, DIALOG_PRIMARY_CLS, formatEsDate } from './lifecycle-ui';

function joinParts(parts: (string | null)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}

function PendingRequestBanner({
  athleteId,
  athleteName,
  request,
}: {
  athleteId: string;
  athleteName: string;
  request: { request_id: string; reason: PauseReason };
}) {
  const { resolveRequest, busy, error } = useLifecycleMutation(athleteId);

  return (
    <div className="flex flex-col gap-3 rounded-[var(--v2-r-l)] border border-[color:var(--v2-warn)]/35 bg-[color:var(--v2-warn-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <MIcon name="pan_tool" size={20} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold text-[color:var(--v2-fg)]">
            {athleteName} ha pedido una pausa
          </span>
          <span className="text-xs text-[color:var(--v2-muted)]">
            Motivo: {PAUSE_REASON_LABELS[request.reason]}. Confírmala para congelar su plan o recházala.
          </span>
          {error ? (
            <span role="alert" className="text-xs font-medium text-[color:var(--v2-danger)]">
              {error}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => resolveRequest(request.request_id, 'decline')}
          className={DIALOG_OUTLINE_CLS}
        >
          Rechazar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => resolveRequest(request.request_id, 'confirm')}
          className={DIALOG_PRIMARY_CLS}
        >
          <MIcon
            name={busy ? 'progress_activity' : 'check'}
            size={16}
            className={busy ? 'animate-spin' : undefined}
          />
          Confirmar pausa
        </button>
      </div>
    </div>
  );
}

function PausedBanner({
  reason,
  since,
  until,
}: {
  reason: PauseReason | null;
  since: string | null;
  until: string | null;
}) {
  const headline = joinParts([
    since ? `En pausa desde el ${formatEsDate(since)}` : 'En pausa',
    reason ? PAUSE_REASON_LABELS[reason] : null,
    until ? `vuelve el ${formatEsDate(until)}` : null,
  ]);
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-warn)]/30 bg-[color:var(--v2-warn-soft)] px-4 py-3">
      <MIcon name="pause_circle" size={20} className="mt-0.5 shrink-0 text-[color:var(--v2-warn)]" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{headline}</span>
        <span className="text-xs text-[color:var(--v2-muted)]">
          Su plan está congelado y estos días no cuentan para la adherencia.
        </span>
      </div>
    </div>
  );
}

function BajaBanner({ reason, since }: { reason: PauseReason | null; since: string | null }) {
  const headline = joinParts([
    since ? `De baja desde el ${formatEsDate(since)}` : 'De baja',
    reason ? PAUSE_REASON_LABELS[reason] : null,
  ]);
  return (
    <div className="flex items-start gap-2.5 rounded-[var(--v2-r-l)] border border-[color:var(--v2-border)] bg-[color:var(--v2-surface-2)] px-4 py-3">
      <MIcon name="person_off" size={20} className="mt-0.5 shrink-0 text-[color:var(--v2-faint)]" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-[color:var(--v2-fg)]">{headline}</span>
        <span className="text-xs text-[color:var(--v2-muted)]">
          Plan congelado y facturación cancelada a fin de periodo. El historial se conserva; puedes
          darle de re-alta cuando quiera volver.
        </span>
      </div>
    </div>
  );
}

export function LifecycleBanner({
  athleteId,
  athleteName,
  lifecycle,
}: {
  athleteId: string;
  athleteName: string;
  lifecycle: DetalleLifecycle;
}) {
  // Pending request wins (only ever set while activo) — it is the one that needs the coach.
  if (lifecycle.pending_request) {
    return (
      <PendingRequestBanner
        athleteId={athleteId}
        athleteName={athleteName}
        request={lifecycle.pending_request}
      />
    );
  }
  if (lifecycle.status === 'pausado') {
    return (
      <PausedBanner
        reason={lifecycle.pause_reason}
        since={lifecycle.paused_since}
        until={lifecycle.planned_return}
      />
    );
  }
  if (lifecycle.status === 'baja') {
    return <BajaBanner reason={lifecycle.baja_reason} since={lifecycle.baja_at} />;
  }
  return null;
}
