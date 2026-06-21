// v2 ATLETAS — roster status derivation. The roster loader (AthleteRow) does not
// persist an explicit account state; we derive a single coach-facing status from
// the real fields it DOES produce (intake_pending, programming_status,
// alert_severity). One function so the StatusDot, the row tint and the top-bar
// count chips all agree on what "needs attention" / "new" means.
//
// Status → token mapping follows the spec's status color rules:
//   activa  = ok/green     (clean, training)
//   atencion= danger/red   (alert_severity present → missed work / readiness)
//   nuevo   = info/blue     (finished onboarding, coach hasn't reviewed intake)
//   sin_plan= warn/gold     (no active plan / structurally broken week)
//
// There is intentionally NO "pausa" state: the loader surfaces no
// subscription-paused signal, so fabricating one would be fake data. If a real
// `subscription.status='paused'` field is later surfaced on the roster row, add
// a 'pausa' case here (muted token) and a count chip — every consumer updates
// from this one place. // TODO(model): real account-pause signal.

import type { AthleteRow } from '@/lib/dashboard/athletes/list';

export type RosterStatus = 'activa' | 'atencion' | 'nuevo' | 'sin_plan';

export interface RosterStatusMeta {
  /** Coach-facing label (Spanish). */
  label: string;
  /** Token var for the dot color. */
  colorVar: string;
  /** Soft token var for an optional row tint (null = no tint). */
  rowTintVar: string | null;
}

export const ROSTER_STATUS_META: Record<RosterStatus, RosterStatusMeta> = {
  activa: { label: 'Activa', colorVar: '--v2-ok', rowTintVar: null },
  atencion: { label: 'Atención', colorVar: '--v2-danger', rowTintVar: '--v2-danger-soft' },
  nuevo: { label: 'Nuevo', colorVar: '--v2-info', rowTintVar: '--v2-info-soft' },
  sin_plan: { label: 'Sin plan', colorVar: '--v2-warn', rowTintVar: null },
};

/** True when the athlete has no usable plan / a structurally broken week. */
function hasPlanGap(a: AthleteRow): boolean {
  return (
    a.programming_status === 'no_month' ||
    a.programming_status === 'month_2_pending' ||
    a.programming_status === 'empty_week'
  );
}

/**
 * Derive the single roster status for an athlete. Priority (most actionable
 * first): a fresh intake to review wins (you can't coach who you haven't set
 * up), then an active alert, then a plan gap, else the athlete is training.
 */
export function rosterStatus(a: AthleteRow): RosterStatus {
  if (a.intake_pending) return 'nuevo';
  if (a.alert_severity != null) return 'atencion';
  if (hasPlanGap(a)) return 'sin_plan';
  return 'activa';
}
