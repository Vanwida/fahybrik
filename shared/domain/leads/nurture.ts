// Lead nurturing (funnel #10) — the SINGLE source of truth for the touch-type codes, the
// sequence each belongs to, its cadence (when it becomes due, and relative to which lead
// timestamp) and a stable subject key. Imported by BOTH the selector
// (web/lib/leads/nurture.ts) and the cron/email builder so the cadence lives in exactly
// one place (DRY). Framework-agnostic: no DB, no I/O — pure data + helpers.
//
// Domain: a lead that stalls gets a bounded, idempotent nurture sequence. FOUR sequences,
// SIX touches total; each touch fires AT MOST ONCE per lead (enforced by lead_nurture_log's
// UNIQUE (lead_id, touch_type) — migration 0100). The touch_type code IS the idempotency key.
//
//   parcial       email left, onboarding unfinished     → parcial_t1 (+1d), parcial_t3 (+3d)
//   nuevo         onboarding done, no call booked yet    → nuevo_t1   (+1d), nuevo_t4   (+4d)
//   noshow        missed the booked call                → noshow_rebook (once the slot passed)
//   pensandoselo  call happened, still deciding          → pensandoselo_t3 (+3d after the call)

export const NURTURE_SEQUENCES = ['parcial', 'nuevo', 'noshow', 'pensandoselo'] as const;
export type NurtureSequence = (typeof NURTURE_SEQUENCES)[number];

export const NURTURE_TOUCH_TYPES = [
  'parcial_t1',
  'parcial_t3',
  'nuevo_t1',
  'nuevo_t4',
  'noshow_rebook',
  'pensandoselo_t3',
] as const;
export type NurtureTouchType = (typeof NURTURE_TOUCH_TYPES)[number];

/**
 * A RESERVED lead_nurture_log touch_type that is NOT part of the nurture cadence (#18): the
 * one-time "se ha liberado tu plaza" waitlist email. It reuses lead_nurture_log's UNIQUE
 * (lead_id, touch_type) as a claim-before-send idempotency key, but it has no sequence /
 * anchor / window and is never emitted by the nurture selector — so it deliberately lives
 * OUTSIDE NurtureTouchType (adding it there would force a fake cadence entry). The release
 * route (web/app/api/coach/leads/[id]/release-waitlist) claims it before sending.
 */
export const WAITLIST_RELEASED_TOUCH = 'waitlist_released' as const;

/**
 * Which lead timestamp a touch's due-date is measured from:
 *   created_at   — row created at email capture (parcial sequence)
 *   submitted_at — full onboarding completed (nuevo sequence)
 *   slot         — the booked appointment's requested_start (noshow: due once it passed)
 *   occurred_at  — the sales call's session_report.occurred_at (pensandoselo)
 */
export type NurtureAnchor = 'created_at' | 'submitted_at' | 'slot' | 'occurred_at';

/** Stable presentation key — the web email builder maps it to the ES subject/body. */
export type NurtureSubjectKey =
  | 'termina_solicitud'
  | 'termina_solicitud_urgencia'
  | 'reserva_llamada'
  | 'reserva_llamada_recordatorio'
  | 'reprogramar_llamada'
  | 'seguir_pensando';

export interface NurtureTouchDef {
  sequence: NurtureSequence;
  /** Days after the anchor before the touch is due (0 = due as soon as the anchor has passed). */
  delayDays: number;
  /**
   * How many days AFTER it becomes due the touch stays eligible. A touch fires only inside
   * `[anchor + delayDays, anchor + delayDays + windowDays)`. Two reasons this bound exists:
   *   1. Nurture hygiene — chasing a lead who abandoned onboarding a month ago is spam, not
   *      nurture. The sequence has a natural shelf life.
   *   2. First-run safety — without it, the very first cron run after deploy would email the
   *      ENTIRE historical backlog of qualifying leads at once (a stale blast). The window
   *      means only leads whose anchor is recent enter a sequence, so launch is calm.
   * The daily cron only needs ~2d of slack to survive a missed run; the rest is shelf life.
   */
  windowDays: number;
  anchor: NurtureAnchor;
  subjectKey: NurtureSubjectKey;
}

export const NURTURE_TOUCHES: Record<NurtureTouchType, NurtureTouchDef> = {
  parcial_t1: { sequence: 'parcial', delayDays: 1, windowDays: 3, anchor: 'created_at', subjectKey: 'termina_solicitud' },
  parcial_t3: { sequence: 'parcial', delayDays: 3, windowDays: 4, anchor: 'created_at', subjectKey: 'termina_solicitud_urgencia' },
  nuevo_t1: { sequence: 'nuevo', delayDays: 1, windowDays: 3, anchor: 'submitted_at', subjectKey: 'reserva_llamada' },
  nuevo_t4: { sequence: 'nuevo', delayDays: 4, windowDays: 4, anchor: 'submitted_at', subjectKey: 'reserva_llamada_recordatorio' },
  noshow_rebook: { sequence: 'noshow', delayDays: 0, windowDays: 7, anchor: 'slot', subjectKey: 'reprogramar_llamada' },
  pensandoselo_t3: { sequence: 'pensandoselo', delayDays: 3, windowDays: 7, anchor: 'occurred_at', subjectKey: 'seguir_pensando' },
};

export function isNurtureTouchType(v: unknown): v is NurtureTouchType {
  return typeof v === 'string' && (NURTURE_TOUCH_TYPES as readonly string[]).includes(v);
}

/** The touches that belong to a sequence, in cadence order (soonest-due first). */
export function touchesForSequence(sequence: NurtureSequence): NurtureTouchType[] {
  return NURTURE_TOUCH_TYPES.filter((t) => NURTURE_TOUCHES[t].sequence === sequence).sort(
    (a, b) => NURTURE_TOUCHES[a].delayDays - NURTURE_TOUCHES[b].delayDays,
  );
}

/**
 * Human-readable cadence line for docs/dashboards, e.g. "parcial · +1d, +3d". Pure —
 * derives entirely from NURTURE_TOUCHES so it can never drift from the real schedule.
 */
export function describeCadence(sequence: NurtureSequence): string {
  const days = touchesForSequence(sequence).map((t) => `+${NURTURE_TOUCHES[t].delayDays}d`);
  return `${sequence} · ${days.join(', ')}`;
}
