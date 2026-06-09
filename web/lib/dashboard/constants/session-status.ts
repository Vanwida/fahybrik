import type { PlanSessionStatus } from '@/lib/dashboard/coach/athlete-plan';

export type StatusDotVariant = PlanSessionStatus | 'pending' | 'warning';

/** CSS color token per session / status variant — single source of truth. */
export const SESSION_STATUS_COLOR: Record<StatusDotVariant, string> = {
  scheduled: 'var(--text-muted)',
  completed: 'var(--status-success)',
  missed: 'var(--danger)',
  skipped: 'var(--status-warning)',
  pending: 'var(--accent)',
  warning: 'var(--status-warning)',
};

export function sessionStatusColor(status: PlanSessionStatus): string {
  return SESSION_STATUS_COLOR[status];
}

/** Etiqueta castellana de cada estado de sesión — single source of truth. */
export const SESSION_STATUS_LABEL: Record<PlanSessionStatus, string> = {
  scheduled: 'Pendiente',
  completed: 'Completada',
  missed: 'Perdida',
  skipped: 'Saltada',
};
