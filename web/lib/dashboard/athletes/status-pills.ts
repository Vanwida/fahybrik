import type { ProgrammingStatus } from '@/lib/dashboard/coach/programming-status';

export type StatusPillKind = 'revision' | 'descanso' | 'optimo';

export type StatusPill = {
  kind: StatusPillKind;
  label: string;
  dotClass: string;
  pulse?: boolean;
};

const PILL: Record<StatusPillKind, Omit<StatusPill, 'kind'>> = {
  revision: {
    label: 'Revisión',
    dotClass: 'bg-[color:var(--status-warning)]',
    pulse: true,
  },
  descanso: {
    label: 'Descanso',
    dotClass: 'bg-[color:var(--text-muted)]',
  },
  optimo: {
    label: 'Óptimo',
    dotClass: 'bg-[color:var(--status-success)]',
  },
};

export function resolveStatusPill(params: {
  programming_status: ProgrammingStatus;
  readiness_score: number | null;
  week_ok: boolean;
}): StatusPill {
  const { programming_status, readiness_score, week_ok } = params;

  if (programming_status === 'empty_week') {
    return { kind: 'descanso', ...PILL.descanso };
  }

  if (
    programming_status === 'pending_proposal' ||
    programming_status === 'month_2_pending' ||
    programming_status === 'block_ended' ||
    programming_status === 'no_month'
  ) {
    return { kind: 'revision', ...PILL.revision };
  }

  if (readiness_score != null && readiness_score < 45) {
    return { kind: 'revision', ...PILL.revision };
  }

  if (week_ok && (readiness_score == null || readiness_score >= 70)) {
    return { kind: 'optimo', ...PILL.optimo };
  }

  if (readiness_score != null && readiness_score >= 70) {
    return { kind: 'optimo', ...PILL.optimo };
  }

  return { kind: 'revision', ...PILL.revision };
}

export function readinessTone(score: number | null): 'success' | 'warning' | 'muted' {
  if (score == null) return 'muted';
  if (score >= 70) return 'success';
  if (score >= 45) return 'warning';
  return 'warning';
}

export function alertChipVariant(
  severity: 'critical' | 'warning' | null,
): 'critical' | 'warning' | 'info' {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'warning';
  return 'info';
}
