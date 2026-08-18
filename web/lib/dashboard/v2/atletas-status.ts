// v2 ATLETAS — roster status derivation. We derive a single coach-facing status
// from the athlete's lifecycle state (#13) plus the real activity fields the loader
// produces (intake_pending, programming_status, alert_severity). One function so the
// StatusDot, the row tint and the top-bar count chips all agree.
//
// Status → token mapping follows the spec's status color rules:
//   activa  = ok/green     (clean, training)
//   atencion= danger/red   (alert_severity present → missed work / readiness)
//   nuevo   = info/blue     (finished onboarding, coach hasn't reviewed intake)
//   sin_plan= warn/gold     (no active plan / structurally broken week)
//   pausa   = warn, muted   (lifecycle_status=pausado — plan frozen, resting)
//   baja    = faint, muted  (lifecycle_status=baja — left the roster, history kept)
//
// pausa / baja are RESTING states (their plan is frozen), so the row is muted and
// they win over every activity-derived state — a paused athlete isn't "sin plan".

import type { AthleteRow } from '@/lib/dashboard/athletes/list';

export type RosterStatus =
  | 'activa'
  | 'atencion'
  | 'nuevo'
  | 'sin_plan'
  | 'pausa'
  | 'baja'
  | 'se_va';

export interface RosterStatusMeta {
  /** Coach-facing label (Spanish). */
  label: string;
  /** Token var for the dot color. */
  colorVar: string;
  /** Soft token var for an optional row tint (null = no tint). */
  rowTintVar: string | null;
  /** De-emphasize the whole row (reduced opacity) — the resting lifecycle states
   *  (pausa / baja) that sit outside the daily triage. */
  muted?: boolean;
}

export const ROSTER_STATUS_META: Record<RosterStatus, RosterStatusMeta> = {
  activa: { label: 'Activa', colorVar: '--v2-ok', rowTintVar: null },
  atencion: { label: 'Atención', colorVar: '--v2-danger', rowTintVar: '--v2-danger-soft' },
  nuevo: { label: 'Nuevo', colorVar: '--v2-info', rowTintVar: '--v2-info-soft' },
  sin_plan: { label: 'Sin plan', colorVar: '--v2-warn', rowTintVar: null },
  pausa: { label: 'En pausa', colorVar: '--v2-warn', rowTintVar: null, muted: true },
  baja: { label: 'Baja', colorVar: '--v2-faint', rowTintVar: null, muted: true },
  // NOT muted: they are still training and still winnable. Muting the row would hide
  // exactly the athlete the coach has the least time to notice.
  se_va: { label: 'Se va', colorVar: '--v2-danger', rowTintVar: '--v2-danger-soft' },
};

/** True when the athlete has no usable plan / a structurally broken week. */
function hasPlanGap(a: AthleteRow): boolean {
  return (
    a.programming_status === 'no_month' ||
    a.programming_status === 'month_2_pending' ||
    a.programming_status === 'block_ended' ||
    a.programming_status === 'empty_week'
  );
}

/**
 * Derive the single roster status for an athlete. Lifecycle (#13) wins first: a
 * paused / baja athlete reads pausa / baja regardless of activity (their plan is
 * frozen). Then, among live athletes (most actionable first): a fresh intake to
 * review, then an active alert, then a plan gap, else training.
 */
export function rosterStatus(a: AthleteRow): RosterStatus {
  if (a.lifecycle_status === 'pausado') return 'pausa';
  if (a.lifecycle_status === 'baja') return 'baja';
  // Leaving on a date (0137) but still activo and still training. It outranks every
  // live signal below: a plan gap can wait a day, a person walking out cannot.
  if (a.baja_scheduled_for) return 'se_va';
  if (a.intake_pending) return 'nuevo';
  if (a.alert_severity != null) return 'atencion';
  if (hasPlanGap(a)) return 'sin_plan';
  return 'activa';
}
