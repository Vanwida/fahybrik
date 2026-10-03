import { SIGNAL_ACTION, SIGNAL_LENS, type AthleteSignal } from '@fahybrid/shared/domain/coach/athlete-state';
import type { FichaShell } from '@/lib/dashboard/v2/atleta-detalle-types';

export function signal(over: Partial<AthleteSignal>): AthleteSignal {
  return {
    kind: 'readiness_low',
    severity: 'critical',
    label: 'Readiness 31',
    evidence: '−24 vs su base 55 · 3 días',
    value: 31,
    baseline: 55,
    window_label: null,
    observed_at: null,
    action: SIGNAL_ACTION[over.kind ?? 'readiness_low'],
    lens: SIGNAL_LENS[over.kind ?? 'readiness_low'],
    first_seen_at: null,
    dedupe_key: over.kind === 'week_adjustment_pending' ? 'week_adjustment_pending:11:42' : 'x',
    ...over,
  };
}

export function shell(over: Partial<FichaShell> = {}): FichaShell {
  return {
    athlete_id: '11',
    name: 'Marc Vidal',
    avatar_url: null,
    email: null,
    level: null,
    division_label: null,
    race: null,
    program: null,
    group: null,
    status: { key: 'al_dia', tone: 'ok', label: 'Al día', reason: null, signals: [], snoozed_until: null, needs_you: false },
    lifecycle: {
      status: 'activo',
      pause_reason: null,
      paused_since: null,
      planned_return: null,
      paused_by_name: null,
      paused_by_kind: null,
      baja_at: null,
      baja_reason: null,
      baja_by_name: null,
      pending_request: null,
      baja_scheduled_for: null,
      baja_scheduled_in_days: null,
      pause_days_available: null,
    },
    unread: 0,
    awaiting_reply: false,
    today: '2026-09-23',
    readiness: null,
    week_days: [],
    adherence: null,
    intake_pending: false,
    has_upcoming_plan: true,
    publish_target: null,
    pending_comunicados: 0,
    last_missed: null,
    last_checkin: null,
    personal_plan: null,
    club_name: 'Club',
    ...over,
  };
}
