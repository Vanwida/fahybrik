// Coach-attention signal taxonomy + the pure-evaluator contract.
//
// This is the SINGLE SOURCE OF TRUTH for the HOY signal engine (SPEC §8). It is
// deliberately framework-free (no DB, no `server-only`, no Next): the per-app
// layer feeds it `SignalFacts` and the registry of pure `SignalEvaluator`s turns
// those facts into `SignalResult`s. That purity is what makes the engine
// unit-testable against Pablo's real cohort without a database.

import type { ReviewCadence } from './reviews';
//
// WHY A SEPARATE `SIGNAL_KINDS` FROM `ALERT_KINDS`
// ------------------------------------------------
// `ALERT_KINDS` (types.ts) is the DISPLAY vocabulary the legacy cohort table
// already paints. The attention store is BROADER: it also persists coach-queue
// decision items (intake / week-adjustment / monthly-block) and operational
// signals (readiness_low, a_event_near, billing_at_risk) that were previously
// computed ad-hoc in inbox.ts. `SIGNAL_KINDS` is that superset. Every member is
// either BACKED (an evaluator emits it today) or FLAGGED-OFF (F7 follow-up —
// the evaluator exists but `enabled: false`, so it emits nothing). No member is
// free text: each one drives the card UI, the indexed queue read, and the
// resurface logic.

// ── Severity ──────────────────────────────────────────────────────────────────
//
// Two LIVE tiers (Crítico → Vigilar) per SPEC §10; `info` is the neutral floor
// for non-actionable context. Lower rank = worse = sorts first (peor-primero).
// NOTE: this mirrors SEVERITY_RANK in the app's signal-config.ts; it is repeated
// here only so the pure domain layer has no dependency direction into the app.

export const SIGNAL_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

export const SIGNAL_SEVERITY_RANK: Record<SignalSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Lower rank wins (worse). Returns the more-severe of two severities. */
export function worseSeverity(a: SignalSeverity, b: SignalSeverity): SignalSeverity {
  return SIGNAL_SEVERITY_RANK[a] <= SIGNAL_SEVERITY_RANK[b] ? a : b;
}

// ── Signal kinds ────────────────────────────────────────────────────────────

export const SIGNAL_KINDS = [
  // Biometric / behaviour (extracted from cohort.ts::computeAlerts)
  'hrv_crash',
  'no_sync',
  'missed_sessions',
  'rpe_high',
  // Athlete flagged a body area that hurt on a recent finished session (#58). The
  // earliest, cheapest injury signal — surfaced so the coach can adapt before a
  // niggle becomes an injury.
  'discomfort_reported',
  'checkin_skipped',
  'message_unanswered',
  'readiness_low',
  'transition_ready',
  // Programming
  'programming_status',
  'microcycle_ending',
  'a_event_near',
  // Progression / test events (KEYSTONE-fed: a post-onboarding test or a finished
  // race converts athlete improvement into a coach action — review / progress).
  'test_logged',
  'race_completed',
  // An athlete-originated "entreno libre / no prescrito" the athlete built + ran
  // themselves. It COMPLEMENTS the coach's plan (never alters compliance) and
  // surfaces here so the coach sees the extra work and can react.
  'workout_libre',
  // Coach-queue decision items (fed by existing loaders, persisted here so the
  // HOY queue is ONE indexed read instead of N+1 across surfaces)
  'intake_pending',
  'week_adjustment_pending',
  'monthly_block_pending',
  // Operational (extracted from inbox.ts listInboxAlerts)
  'billing_at_risk',
  'test_due',
  // Comunicados del coach (docs/DECISIONS.md, 2026-08-09). Lo que el coach
  // publicó y el atleta no ha cerrado: una pregunta sin responder deja el plan a
  // medio cerrar, una tarea vencida es trabajo que no se hizo, y un protocolo sin
  // abrir con la carrera encima es un protocolo que no va a servir. El comunicado
  // ya sabe si sigue reclamando (claimsAttention); esto lo sube a /hoy.
  'communication_question_unanswered',
  'communication_task_overdue',
  'communication_protocol_unopened',
  // Revisión 1:1 recurrente vencida (#21): el atleta lleva más días que su cadencia
  // (mensual/trimestral) sin una 1:1 y no tiene una revisión próxima reservada. Silenciada
  // para atletas pausados/baja (#13) — el batch de recompute filtra lifecycle_status='activo'.
  'review_1on1_due',
  // ── F7 follow-up — evaluator FLAGGED-OFF, emits nothing until backed ────────
  'video_review_pending',
  'mass_adjustment_pending',
  'compliance_drop',
] as const;

export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * Signals whose backing data does NOT yet exist (SPEC §8 "gap" rows). Their
 * evaluators are registered but disabled, so the engine shape is complete and a
 * single flag flip (plus the F7 migration) turns them on. They emit NOTHING now.
 */
export const FLAGGED_OFF_SIGNAL_KINDS = [
  'video_review_pending',
  'mass_adjustment_pending',
  'compliance_drop',
] as const satisfies ReadonlyArray<SignalKind>;

export type FlaggedOffSignalKind = (typeof FLAGGED_OFF_SIGNAL_KINDS)[number];

export function isFlaggedOff(kind: SignalKind): boolean {
  return (FLAGGED_OFF_SIGNAL_KINDS as ReadonlyArray<SignalKind>).includes(kind);
}

// ── Trend ───────────────────────────────────────────────────────────────────

export const SIGNAL_TRENDS = ['up', 'down', 'flat'] as const;
export type SignalTrend = (typeof SIGNAL_TRENDS)[number];

// ── Facts (the per-athlete input to every evaluator) ──────────────────────────
//
// One flat, fully-typed record per athlete. The app's `rollupAthleteFacts`
// builds it from the batched CTEs; the evaluators only READ it. Every field is
// nullable because the source data may be absent (no wearable, no plan yet) —
// an evaluator that needs an absent fact simply does not fire (auto-resolve).

export interface SignalFacts {
  athlete_id: string;
  coach_id: string;
  full_name: string;

  // Biometrics / behaviour
  /** Δ ms of the 7d HRV mean vs the 60d baseline (negative = suppressed). */
  hrv_delta_ms: number | null;
  /** Distinct days of HRV data backing the baseline — guards false crashes. */
  hrv_baseline_days: number | null;
  /** Minutes since the most recent wearable sample of any kind. */
  sync_minutes_ago: number | null;
  /** Sessions with status='missed' in the trailing 7 days. */
  missed_sessions_7d: number;
  /** Max perceived_exertion logged yesterday (0–10), or null if none. */
  rpe_yesterday: number | null;
  /** Most recent daily check-in timestamp (drives "skipped" age). */
  last_checkin_at: Date | null;
  /** Age in minutes of the oldest unanswered athlete message, or null. */
  unread_message_age_min: number | null;
  /** Latest daily readiness score (0–100), or null if uncomputed. */
  readiness_score: number | null;

  // Structured session feedback (#58). The athlete's most recent reported body-area
  // discomfort — a generic area token, when it was reported, and any note. Absent
  // (null) is the common case. Drives discomfort_reported.
  /** Body area flagged as hurting on the most recent report (generic token), or null. */
  discomfort_area: string | null;
  /** When that discomfort was reported (the execution's ended_at), or null. */
  discomfort_at: Date | null;
  /** Optional free-text detail on the discomfort, or null. */
  discomfort_note: string | null;

  // Programming
  /** Programming health from getAthleteProgrammingStatus. */
  programming_status: 'ok' | 'no_month' | 'pending_proposal' | 'empty_week' | 'month_2_pending';
  programming_label: string | null;
  programming_detail: string | null;
  /** End date (YYYY-MM-DD) of the athlete's CURRENT microcycle, or null. */
  current_microcycle_end_iso: string | null;
  /** Current microciclo NAME (coach data), null when none active. */
  current_block_type: string | null;
  /** Readiness engine says 'advance' → ready to move to the next microciclo. */
  transition_recommendation: 'advance' | 'hold' | 'extend' | null;
  transition_detail: string | null;
  /** Days until the soonest A-priority target event, or null. */
  days_to_a_event: number | null;
  a_event_name: string | null;

  // Coach-queue decision items (presence = the item is pending)
  /** Hours since onboarding completed with no plan yet (intake pending), or null. */
  intake_pending_hours: number | null;
  intake_a_event_name: string | null;
  intake_a_event_days: number | null;
  /** Pending week-adjustment proposal id (newest), or null if none. */
  week_adjustment_proposal_id: string | null;
  week_adjustment_summary: string | null;
  /** Pending monthly-block proposal id, or null if none. */
  monthly_block_proposal_id: string | null;
  monthly_block_month_name: string | null;

  // Billing
  /** 'past_due' | 'renewal_soon' | null — derived in the rollup query. */
  billing_risk: 'past_due' | 'renewal_soon' | null;
  /** Days to period end when billing_risk === 'renewal_soon'. */
  billing_days_to_period_end: number | null;

  // Progression / test events (KEYSTONE-fed — real athlete_benchmarks history)
  /** Timestamp of the athlete's most recent POST-onboarding test (a coach/athlete
   *  benchmark row), or null. Drives test_logged. */
  latest_test_at: Date | null;
  /** Human label of that test's benchmark (e.g. "Umbral carrera", "Back squat"). */
  latest_test_label: string | null;
  /** That test beat every prior value for its benchmark (direction-aware PR). */
  latest_test_is_pr: boolean;
  /** Whole days since the athlete's most recent test of ANY kind (incl. onboarding),
   *  or null when they have no benchmark at all. Drives test_due. */
  days_since_last_test: number | null;
  /** Timestamp a finished race result was imported/recorded, or null. Drives
   *  race_completed. */
  latest_race_completed_at: Date | null;
  latest_race_name: string | null;
  latest_race_id: string | null;

  // Entreno libre (athlete-originated, no prescrito). Timestamp of the most recent
  // self-origin executed session, its title, and the prebuilt detail line. Drives
  // workout_libre.
  latest_libre_at: Date | null;
  latest_libre_title: string | null;
  latest_libre_detail: string | null;

  // Revisiones 1:1 recurrentes (#21). Drives review_1on1_due.
  /** Cadencia de revisión que el coach fijó para el atleta ('ninguna' → no dispara). */
  review_cadence: ReviewCadence;
  /** Días desde la última 1:1 (max session_reports.occurred_at con sujeto atleta), con
   *  fallback al alta del atleta cuando nunca hubo revisión. null solo si falta la referencia. */
  days_since_last_1on1: number | null;
  /** Ya hay una revisión próxima reservada (cita futura pendiente|aceptada) → no vence. */
  has_upcoming_review: boolean;

  // Comunicados del coach (docs/DECISIONS.md, 2026-08-09).
  //
  // ANIDADOS Y NO PLANOS, a propósito: las tres señales comparten UNA forma
  // (cuál manda · qué dice · cuántos días · cuántos más igual), así que
  // aplanarlas serían los mismos cuatro campos escritos tres veces. `null` = ese
  // tipo no le reclama nada, que es el caso común.
  /** La pregunta publicada sin responder más antigua. */
  communication_question: CommunicationClaim<{ blocks: boolean }> | null;
  /** La tarea vencida sin hacer con más retraso. */
  communication_task: CommunicationClaim | null;
  /** El protocolo sin abrir cuyo evento anclado cae antes. */
  communication_protocol: CommunicationClaim<{ anchor: 'race' | 'test' }> | null;
}

/**
 * Un comunicado que le reclama algo al atleta, resumido para la señal.
 *
 * `days` significa lo que la señal mide: días publicada sin responder, días de
 * retraso de una tarea, o días QUE FALTAN hasta el evento de un protocolo. Cada
 * evaluador dice cuál en su detalle; el signo lo fija quien monta los hechos.
 */
export type CommunicationClaim<Extra = unknown> = {
  /** Id del comunicado que manda la señal — su identidad para el dedupe. */
  id: string;
  /** Título tal y como lo escribió el coach. */
  title: string;
  days: number;
  /** Cuántos comunicados más del mismo tipo le reclaman lo mismo. */
  others: number;
} & Extra;

// ── Result (the per-fired-signal output) ──────────────────────────────────────

export interface SignalResult {
  kind: SignalKind;
  /** Whether this signal currently fires for the athlete. */
  fires: boolean;
  severity: SignalSeverity;
  /** The signal's defining numeric value (for resurface threshold-crossing). */
  value: number | null;
  /** The baseline the value is measured against, when meaningful. */
  baseline: number | null;
  trend: SignalTrend | null;
  /** Short human label for the card chip (e.g. "HRV crash"). */
  label: string;
  /** One-line evidence detail (e.g. "▼ 14 ms vs baseline 60d"). */
  detail: string;
  /**
   * Stable identity within (athlete, kind). For value-only signals this is just
   * `${kind}:${athlete_id}`; for proposal-backed signals it includes the proposal
   * id so a NEW proposal after one is approved is a distinct item (avoids a
   * resolved card masking a fresh one). Used as the override match key.
   */
  dedupe_key: string;
}

// ── Effective threshold passed to evaluators ──────────────────────────────────
//
// The whole `SIGNAL_THRESHOLDS` object (from the app's signal-config.ts) is
// passed through unchanged — evaluators read only the keys they need. Typed as a
// readonly numeric record so the pure layer needs no import from the app.

export type EffectiveThresholds = Readonly<Record<string, number>>;

// ── Evaluator contract ────────────────────────────────────────────────────────

export interface SignalEvaluator {
  kind: SignalKind;
  /** Default tier when no per-instance severity applies (UI fallback). */
  default_severity: SignalSeverity;
  /** F7 gate — a disabled evaluator always returns `fires: false`. */
  enabled: boolean;
  /**
   * Pure decision. MUST be deterministic given (facts, thresholds, now) and MUST
   * NOT touch I/O. Returns a non-firing result (or null) when the signal is
   * absent — the engine treats both as auto-resolve.
   */
  evaluate(
    facts: SignalFacts,
    thresholds: EffectiveThresholds,
    now: Date,
  ): SignalResult | null;
}

// ── Small shared helpers for evaluators (pure) ────────────────────────────────

export function dedupeKey(kind: SignalKind, athlete_id: string, suffix?: string): string {
  return suffix ? `${kind}:${athlete_id}:${suffix}` : `${kind}:${athlete_id}`;
}

/** A non-firing result — the canonical "auto-resolve / no card" sentinel. */
export function noFire(kind: SignalKind, athlete_id: string): SignalResult {
  return {
    kind,
    fires: false,
    severity: 'info',
    value: null,
    baseline: null,
    trend: null,
    label: '',
    detail: '',
    dedupe_key: dedupeKey(kind, athlete_id),
  };
}

/** Hours between two instants (positive when `later` is after `earlier`). */
export function hoursBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}

/** Whole days from a YYYY-MM-DD date to `now` (positive when the date is future). */
export function daysFromNowToIso(iso: string, now: Date): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y!, m! - 1, d!);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}
