'use client';

// Estado del atleta con su MOTIVO (H1): nunca un «Atención» pelado. Es el mismo
// estado que Hoy y el roster (§4.1) y la evidencia de sus señales (valor, base,
// ventana). Con el ciclo de vida delante: en pausa, de baja, baja programada o
// una pausa pedida por el atleta (que se confirma o rechaza aquí mismo).

import { PAUSE_REASON_LABELS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import { Button, StatusBadge, type StatusTone } from '@/components/v2/ui';
import { StatusBadgeFor } from '@/components/v2/shared';
import { shortDate } from '@/components/v2/shared/format';
import { statusReasonParts } from '@/lib/dashboard/v2/ficha-actions';
import { cn } from '@/lib/utils';
import { useFicha } from '../FichaContext';
import { useLifecycleMutation } from '../lifecycle/lifecycle-mutations';

const SOFT: Record<StatusTone, string> = {
  danger: 'bg-v2-danger-soft',
  warn: 'bg-v2-warn-soft',
  info: 'bg-v2-info-soft',
  ok: '',
  neutral: '',
};

function join(parts: (string | null | undefined)[]): string {
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}

function Row({ tone, badge, children, actions }: { tone: StatusTone; badge: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  const soft = SOFT[tone];
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-ctl t-body-sm',
        soft ? cn(soft, 'px-3 py-2') : 'px-0.5',
      )}
    >
      {badge}
      {children ? <span className="min-w-0 flex-1 text-v2-fg">{children}</span> : <span className="flex-1" />}
      {actions ? <span className="flex shrink-0 items-center gap-2">{actions}</span> : null}
    </div>
  );
}

function PendingPause() {
  const { shell } = useFicha();
  const { resolveRequest, busy, error } = useLifecycleMutation(shell.athlete_id);
  const req = shell.lifecycle.pending_request!;
  return (
    <Row
      tone="warn"
      badge={<StatusBadge tone="warn" label="Pide una pausa" variant="text" />}
      actions={
        <>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolveRequest(req.request_id, 'decline')}>
            Rechazar
          </Button>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => resolveRequest(req.request_id, 'confirm')}>
            Confirmar pausa
          </Button>
        </>
      }
    >
      Motivo: {PAUSE_REASON_LABELS[req.reason].toLowerCase()}
      {error ? <span className="ml-2 text-v2-danger">{error}</span> : null}
    </Row>
  );
}

export function StatusBanner() {
  const { shell } = useFicha();
  const lc = shell.lifecycle;

  if (lc.pending_request) return <PendingPause />;
  if (lc.status === 'pausado') {
    return (
      <Row tone="neutral" badge={<StatusBadgeFor status={shell.status} />}>
        <span className="text-v2-muted">
          {join([
            lc.paused_since ? `Desde el ${shortDate(lc.paused_since)}` : null,
            lc.pause_reason ? PAUSE_REASON_LABELS[lc.pause_reason] : null,
            lc.planned_return ? `vuelve el ${shortDate(lc.planned_return)}` : 'sin fecha de vuelta',
            'su plan está congelado y estos días no cuentan',
          ])}
        </span>
      </Row>
    );
  }
  if (lc.status === 'baja') {
    return (
      <Row tone="neutral" badge={<StatusBadge tone="neutral" label="De baja" />}>
        <span className="text-v2-muted">
          {join([
            lc.baja_at ? `Desde el ${shortDate(lc.baja_at)}` : null,
            lc.baja_reason ? PAUSE_REASON_LABELS[lc.baja_reason] : null,
            'el historial se conserva; puedes darle de re-alta en ···',
          ])}
        </span>
      </Row>
    );
  }

  const parts = statusReasonParts(shell);
  const bajaProgramada = lc.baja_scheduled_for
    ? `Se da de baja el ${shortDate(lc.baja_scheduled_for)}${lc.baja_scheduled_in_days != null && lc.baja_scheduled_in_days > 0 ? ` (en ${lc.baja_scheduled_in_days} d)` : ''}`
    : null;
  const adh = shell.adherence;
  const calm =
    parts.length === 0 && adh && adh.due > 0 ? `${adh.done} de ${adh.due} debidas hechas en ${adh.window_days} d` : null;
  const text = join([bajaProgramada, ...parts, calm]);
  const tone: StatusTone = bajaProgramada && shell.status.tone === 'ok' ? 'warn' : shell.status.tone;

  return (
    <Row tone={tone} badge={<StatusBadgeFor status={shell.status} />}>
      {text ? <span className={tone === 'ok' || tone === 'neutral' ? 'text-v2-muted' : undefined}>{text}</span> : null}
    </Row>
  );
}
