// Piezas puras de la fila del roster: etiquetas, alertas y redondeos. Los días se
// cuentan entre fechas ya resueltas en el calendario del club (DECISIONS «Qué
// día es en cada sitio»), nunca desde el día UTC del reloj.

import { daysBetweenIso } from '@fahybrid/shared/domain/coach/signals';
import type { AlertReason, CohortRow } from '@fahybrid/shared/domain/coach/types';
import { SIGNAL_THRESHOLDS } from './signal-config';

export function hrvTrend(delta: number | null): 'up' | 'down' | 'flat' | null {
  if (delta == null) return null;
  if (delta >= 2) return 'up';
  if (delta <= -2) return 'down';
  return 'flat';
}

export function sessionsTodayLabel(
  scheduled: number,
  done: number,
): CohortRow['sessions_today'] {
  if (scheduled === 0) return { am: null, pm: null };
  if (scheduled === 1) {
    return { am: done >= 1 ? 'done' : 'pending', pm: null };
  }
  return {
    am: done >= 1 ? 'done' : 'pending',
    pm: done >= 2 ? 'done' : 'pending',
  };
}

/** «Hoy» / «Mañana» / fecha, contado desde el día del club (`todayIso`), no el UTC. */
export function nextSessionLabel(iso: string, todayIso: string): string {
  const diff = daysBetweenIso(todayIso, iso);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function computeAlerts(params: {
  hrv_delta_ms: number | null;
  sync_minutes_ago: number | null;
  missed_sessions_7d: number;
  rpe_yesterday: number | null;
  unread_message_age_min: number | null;
  last_checkin_at: Date | null;
  now: Date;
}): AlertReason[] {
  const out: AlertReason[] = [];

  if (
    params.hrv_delta_ms != null &&
    params.hrv_delta_ms <= SIGNAL_THRESHOLDS.hrv_crash_delta_ms
  ) {
    out.push({
      kind: 'hrv_crash',
      severity: 'critical',
      label: 'HRV crash',
      detail: `▼ ${Math.abs(params.hrv_delta_ms).toFixed(0)} ms vs baseline`,
    });
  }
  if (
    params.sync_minutes_ago != null &&
    params.sync_minutes_ago > SIGNAL_THRESHOLDS.no_sync_critical_hours * 60
  ) {
    out.push({
      kind: 'no_sync',
      severity: 'critical',
      label: `${Math.floor(params.sync_minutes_ago / 60 / 24)}d sin sync`,
      detail: 'wearable offline',
    });
  } else if (
    params.sync_minutes_ago != null &&
    params.sync_minutes_ago > SIGNAL_THRESHOLDS.no_sync_warning_hours * 60
  ) {
    out.push({
      kind: 'no_sync',
      severity: 'warning',
      label: `Sync >${SIGNAL_THRESHOLDS.no_sync_warning_hours}h`,
      detail: 'comprobar wearable',
    });
  }
  if (params.missed_sessions_7d >= SIGNAL_THRESHOLDS.missed_sessions_min) {
    out.push({
      kind: 'missed_sessions',
      severity: 'warning',
      label: `${params.missed_sessions_7d} sesiones perdidas`,
      detail: 'última 7 días',
    });
  }
  if (params.rpe_yesterday != null && params.rpe_yesterday >= SIGNAL_THRESHOLDS.rpe_high_min) {
    out.push({
      kind: 'rpe_high',
      severity: 'warning',
      label: `RPE ${params.rpe_yesterday.toFixed(1)} ayer`,
      detail: 'monitor sobreesfuerzo',
    });
  }
  if (
    params.unread_message_age_min != null &&
    params.unread_message_age_min > SIGNAL_THRESHOLDS.message_unanswered_hours * 60
  ) {
    out.push({
      kind: 'message_unanswered',
      severity: 'warning',
      label: `Mensaje ${Math.floor(params.unread_message_age_min / 60)}h sin responder`,
      detail: 'inbox',
    });
  }
  const checkinAgeH =
    params.last_checkin_at == null
      ? Number.POSITIVE_INFINITY
      : (params.now.getTime() - params.last_checkin_at.getTime()) / 3_600_000;
  if (checkinAgeH > SIGNAL_THRESHOLDS.checkin_skipped_hours) {
    out.push({
      kind: 'checkin_skipped',
      severity: 'warning',
      label: 'Check-in 2d',
      detail: 'sin daily',
    });
  }
  return out;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
