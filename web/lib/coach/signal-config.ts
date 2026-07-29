// Signal thresholds — the single source of truth for the numbers that decide
// WHEN a coach-attention signal fires (HOY redesign, SPEC §8 "motor de señales",
// §10 "Umbrales: TODOS en signal-config.ts — cero números mágicos").
//
// These values were EXTRACTED verbatim from the inline magic numbers previously
// hardcoded in:
//   - lib/coach/cohort.ts            (per-athlete biometric / behaviour alerts)
//   - lib/dashboard/coach/inbox.ts   (intake / inactivity / renewal escalation)
//   - lib/dashboard/coach/team-pulse.ts (compliance attention floor)
// plus a few NEW thresholds the redesign introduces (microcycle ending, A-event
// proximity, queue cap, severity ranking).
//
// Units are explicit in each field name (`_ms`, `_hours`, `_days`, `_pct`).
// Readiness bands are NOT redefined here — they are re-exported from the existing
// single source `lib/dashboard/constants/readiness.ts` so the 67/45 numbers live
// in exactly one place.

import { z } from 'zod';
import {
  READINESS_OK_MIN,
  READINESS_CAUTION_MIN,
  readinessBucket,
  type ReadinessBucket,
} from '@/lib/dashboard/constants/readiness';

// Re-export the readiness band single-source so consumers can pull both the
// signal thresholds and the readiness bands from one module if they wish.
export { READINESS_OK_MIN, READINESS_CAUTION_MIN, readinessBucket };
export type { ReadinessBucket };

/**
 * Severity rank — lower is worse. Used to sort the attention queue (peor-primero)
 * and to pick the single-highest-severity signal per athlete for the readiness
 * ring (SPEC §8). Two live tiers: `critical` → `warning`; `info` is the neutral
 * floor for non-actionable context.
 */
export const SEVERITY_RANK = {
  critical: 0,
  warning: 1,
  info: 2,
} as const;

export type SignalSeverity = keyof typeof SEVERITY_RANK;

export const SIGNAL_THRESHOLDS = {
  // ── Biometric / behaviour signals (extracted from cohort.ts) ──────────────
  /** HRV ≤ this many ms below the 60d baseline → HRV crash (Crítico). */
  hrv_crash_delta_ms: -10,
  /** No wearable sync for ≥ this many hours → no_sync Crítico. */
  no_sync_critical_hours: 48,
  /** No wearable sync for ≥ this many hours (but < critical) → no_sync Vigilar. */
  no_sync_warning_hours: 24,
  /** Missed sessions in the trailing 7d at or above this → missed_sessions (Vigilar). */
  missed_sessions_min: 2,
  /** Yesterday's RPE at or above this → rpe_high (Vigilar). */
  rpe_high_min: 9,
  /** A reported body-area discomfort within this many days → discomfort_reported
   *  (Vigilar). Auto-clears after the window if it doesn't recur (#58). */
  discomfort_recent_days: 10,
  /** Unanswered athlete message older than this many hours → message_unanswered (Vigilar). */
  message_unanswered_hours: 12,
  /** No daily check-in for more than this many hours → checkin_skipped (Vigilar). */
  checkin_skipped_hours: 48,

  // ── Inbox escalation (extracted from inbox.ts) ────────────────────────────
  /** Intake pending for ≥ this many hours escalates from Vigilar to Crítico. */
  intake_critical_hours: 48,
  /** Days without a completed session NOR check-in before the inactivity alert fires. */
  inactivity_alert_days: 2,
  /** Subscription ends (cancel_at_period_end) within this many days → renewal alert. */
  renewal_alert_days: 7,
  /** Max diff rows surfaced inline on a week-adjustment card. */
  max_diff_rows: 3,

  // ── Team-pulse (extracted from team-pulse.ts) ─────────────────────────────
  /** Weekly compliance at or below this % marks an athlete as needing attention. */
  compliance_attention_max_pct: 70,

  // ── NEW (HOY redesign) ────────────────────────────────────────────────────
  /** Microcycle ends within this many days → "asigna el siguiente" (Due-Soon, Vigilar). */
  microcycle_ending_days: 7,
  /** A-priority event within this many days → race-near context. */
  a_event_near_days: 30,
  /** Max attention cards surfaced in the HOY queue before paginating. */
  queue_card_limit: 15,

  // ── Progression / test events (KEYSTONE loop) ─────────────────────────────
  /** A post-onboarding test logged within this many days → test_logged (review). */
  test_logged_recent_days: 7,
  /** A finished race within this many days → race_completed (review level/block). */
  race_completed_recent_days: 14,
  /** No test for at least this many days on an active plan → test_due (schedule one). */
  test_due_days: 35,
  /** An athlete-originated "entreno libre" within this many days → workout_libre. */
  workout_libre_recent_days: 3,

  // ── Revisiones 1:1 recurrentes (#21) ──────────────────────────────────────
  /** Cadencia mensual: revisión vencida si pasan más de estos días sin 1:1 → review_1on1_due. */
  review_due_mensual_days: 30,
  /** Cadencia trimestral: revisión vencida si pasan más de estos días sin 1:1 → review_1on1_due. */
  review_due_trimestral_days: 90,
} as const;

export type SignalThresholdKey = keyof typeof SIGNAL_THRESHOLDS;

// ── Zod schema (validates the shape + sane bounds; guards future edits) ───────

export const signalThresholdsSchema = z
  .object({
    hrv_crash_delta_ms: z.number().negative(),
    no_sync_critical_hours: z.number().int().positive(),
    no_sync_warning_hours: z.number().int().positive(),
    missed_sessions_min: z.number().int().positive(),
    rpe_high_min: z.number().min(0).max(10),
    discomfort_recent_days: z.number().int().positive(),
    message_unanswered_hours: z.number().positive(),
    checkin_skipped_hours: z.number().positive(),
    intake_critical_hours: z.number().positive(),
    inactivity_alert_days: z.number().int().positive(),
    renewal_alert_days: z.number().int().positive(),
    max_diff_rows: z.number().int().positive(),
    compliance_attention_max_pct: z.number().min(0).max(100),
    microcycle_ending_days: z.number().int().positive(),
    a_event_near_days: z.number().int().positive(),
    queue_card_limit: z.number().int().positive(),
    test_logged_recent_days: z.number().int().positive(),
    race_completed_recent_days: z.number().int().positive(),
    test_due_days: z.number().int().positive(),
    workout_libre_recent_days: z.number().int().positive(),
    review_due_mensual_days: z.number().int().positive(),
    review_due_trimestral_days: z.number().int().positive(),
  })
  .strict()
  // Trimestral debe ser una ventana MÁS larga que mensual (coherencia de cadencia).
  .refine((t) => t.review_due_trimestral_days > t.review_due_mensual_days, {
    message: 'review_due_trimestral_days must be > review_due_mensual_days',
    path: ['review_due_trimestral_days'],
  })
  // Warning window must be shorter than (or equal to) the critical one.
  .refine((t) => t.no_sync_warning_hours <= t.no_sync_critical_hours, {
    message: 'no_sync_warning_hours must be <= no_sync_critical_hours',
    path: ['no_sync_warning_hours'],
  });

export type SignalThresholds = z.infer<typeof signalThresholdsSchema>;

// Validate the seeded config at module load — fails fast on a bad edit.
signalThresholdsSchema.parse(SIGNAL_THRESHOLDS);
