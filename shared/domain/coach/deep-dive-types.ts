// Athlete deep-dive payload types.
//
// Mirrors the Resumen tab spec in /docs/ux/06-athlete-deep-dive.md. All values
// are pre-formatted server-side so the client component is purely presentational.
//
// NOTE: `AthleteIdParamSchema` is intentionally NOT exported here. Its regex
// diverges by surface (web accepts demo-* ids; coach is numeric-only), so each
// app defines it in its own wrapper.

import { z } from 'zod';
import { type AlertReason } from './types';
import type { LoadCoverage } from '../training-load/coverage';

// Modality categories Pablo cares about — mapped from exercise.category +
// segment heuristics. See deep-dive helpers.
export const MODALITY_KEYS = ['running', 'strength', 'hyrox', 'skill', 'recovery'] as const;
export type ModalityKey = (typeof MODALITY_KEYS)[number];

export const PERFORMANCE_GROUPS = ['running', 'hyrox_stations', 'strength'] as const;
export type PerformanceGroup = (typeof PERFORMANCE_GROUPS)[number];

export interface AthleteHeader {
  athlete_id: string;
  full_name: string;
  is_demo: boolean;
  age_years: number | null;
  sex_label: string | null;        // 'M' | 'F' | 'X'
  height_cm: number | null;
  weight_kg: number | null;
  experience_label: string | null; // e.g. "Pro · 5y entrenando"
}

export interface AEvent {
  name: string;
  iso_date: string;
  days_until: number;        // negative if past
}

export interface MacrocycleBlockSegment {
  /** Microciclo NAME (coach data) — NOT a catalogued phase. */
  type: string;
  weeks: number;
  position: number;
  is_current: boolean;
}

export interface MacrocycleRibbon {
  blocks: MacrocycleBlockSegment[];
  /** Current microciclo NAME (coach data), null when none active. */
  current_block: string | null;
  current_week: number | null;
  current_day_of_week: number | null;   // 1..7
  total_weeks: number;
  weeks_to_event: number | null;
}

export interface KpiCarga {
  ctl: number | null;
  ctl_trend: 'up' | 'down' | 'flat' | null;
  atl: number | null;
  atl_trend: 'up' | 'down' | 'flat' | null;
  tsb: number | null;
  tsb_label: string | null;          // "fresco", "neutral", "cargado"
  acr: number | null;
  acr_label: string | null;          // "normal", "alto", "bajo"
  z34_pct_7d: number | null;
  polarization_pct: { low: number; mid: number; high: number } | null;
  polarization_warn: boolean;
  /**
   * How much of the athlete's executed work these numbers saw, plus the wording
   * to declare it. When `coverage.allows_verdict` is false, `tsb_label` and
   * `acr_label` above are NULL on purpose: the numbers stand, the sentence does
   * not. See shared/domain/training-load/coverage.ts.
   */
  coverage: LoadCoverage;
}

export interface KpiCompliance {
  pct_7d: number | null;
  pct_30d: number | null;
  pct_total: number | null;
  streak_days: number | null;
  checkin_done_7d: number | null;     // count out of 7
}

export interface KpiReadiness {
  daily_readiness_score: number | null;
  daily_readiness_delta_7d: number | null;
  race_readiness: number | null;
  race_readiness_trend: 'up' | 'down' | 'flat' | null;
  hrv_ms: number | null;
  hrv_delta_ms: number | null;
  sleep_avg_h: number | null;
  rhr: number | null;
  rhr_delta: number | null;
  recovery_pct: number | null;
  mood: number | null;        // 1..5
  fatigue: number | null;     // 1..5
}

export interface ModalityRow {
  key: ModalityKey;
  label: string;
  hours: number;
  pct: number;          // share of last-7d session time
  km: number | null;          // running only
  kg: number | null;          // strength only (volume tonnage)
}

export interface ModalityDistribution {
  rows: ModalityRow[];
  total_hours: number;
  sessions_count: number;
  twice_daily_days_label: string | null;  // e.g. "Mar/Mié/Vie"
}

export interface SparkPoint {
  iso_date: string;
  value: number | null;
}

export interface CtlAtlPoint {
  iso_date: string;
  ctl: number;
  atl: number;
  tsb: number;
  /**
   * Executed seconds that day that emitted no load because nobody rated them.
   * A day like this contributes 0 TSS, so on the curve alone it is
   * indistinguishable from a rest day and the line sags as if the athlete had
   * recovered. Carried per point so the chart can MARK the day instead of
   * drawing through it (docs/CONTRATO-UI.md §7: el hueco no se interpola).
   */
  unknown_seconds: number;
  /** Sessions behind those seconds — what the coach would ask the athlete for. */
  unknown_sessions: number;
}

export interface CompliancePoint {
  iso_date: string;
  state: 'completed' | 'missed' | 'rest' | 'future';
}

export interface ZoneTimePct {
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

/**
 * Time-in-zone, WITH the anchor it was measured against.
 *
 * The percentages are meaningless without knowing what "Z4" meant for this
 * athlete, and until 28-jul-2026 they were computed against a 200 bpm max
 * hardcoded in the SQL — identical for a 20-year-old and a 44-year-old. The
 * anchor now travels with the number so the coach can see whether it rests on a
 * measured threshold or on an estimate from a birth date.
 */
export interface ZoneTimeBlock {
  pct: ZoneTimePct;
  /** The threshold HR (LTHR) the bands are a fraction of. */
  lthr_bpm: number;
  /** True when the threshold was inferred rather than measured. */
  estimated: boolean;
  /** Athlete-facing explanation of where the anchor came from. */
  source_label: string;
}

export interface TrendsBlock {
  ctl_atl_tsb: CtlAtlPoint[];
  hrv: SparkPoint[];
  hrv_baseline_ms: number | null;
  sleep: SparkPoint[];
  sleep_avg_h: number | null;
  compliance: CompliancePoint[];
  compliance_pct: number | null;
  compliance_done: number;
  compliance_total: number;
  /** Null when the athlete has no HR anchor at all — no zones, so no time in
   *  them. A zero would read as "trained nothing hard", which is a different
   *  claim entirely. */
  zone_time: ZoneTimeBlock | null;
}

export interface PerformanceRow {
  exercise_label: string;
  group: PerformanceGroup;
  best_label: string | null;
  avg_label: string | null;
  trend: 'up' | 'down' | 'flat' | null;
  trend_pct: number | null;
  variability: 'low' | 'med' | 'high' | null;
  last_done_label: string | null;          // "hoy", "-1d", "tested -7d"
  hint_text: string | null;                // extra context (e.g. "Z2 92%")
}

export interface PerformanceBlock {
  groups: ReadonlyArray<{ key: PerformanceGroup; label: string; rows: PerformanceRow[] }>;
}

export interface RecentSession {
  slot: 'AM' | 'PM' | 'SOLO';
  title: string;
  duration_seconds: number | null;
  rpe: number | null;
  status: 'completed' | 'missed' | 'in_progress' | 'scheduled';
  is_pr: boolean;
  /** Structured feedback (#58): calibration verdict vs the plan's intent, null when unanswered. */
  perceived_difficulty: 'too_easy' | 'as_expected' | 'too_hard' | null;
  /** Body area the athlete flagged as hurting (generic token), null when nothing hurt. */
  pain_area: string | null;
  /** Optional free-text detail on the discomfort, null when none. */
  pain_note: string | null;
}

export interface RecentDay {
  iso_date: string;
  label: string;     // "HOY", "AYER", "-2d", "Sáb 03/05"
  sessions: RecentSession[];
}

export interface CoachNote {
  id: string;
  body: string;
  created_at_iso: string;
  date_label: string;  // "03/05/26"
}

export interface DeepDiveBanner {
  kind: 'new_athlete' | 'inactive' | 'alert' | 'a_event_passed' | 'macrocycle_missing';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string | null;
  cta_label: string | null;
}

export type TransitionSuggestPayload = {
  recommendation: 'advance' | 'hold' | 'regress';
  confidence: string;
  reasons: string[];
};

export interface AthleteDeepDive {
  generated_at_iso: string;
  is_demo: boolean;
  header: AthleteHeader;
  a_event: AEvent | null;
  macrocycle: MacrocycleRibbon | null;
  carga: KpiCarga;
  compliance: KpiCompliance;
  readiness: KpiReadiness;
  modality: ModalityDistribution;
  trends: TrendsBlock;
  performance: PerformanceBlock;
  recent_days: RecentDay[];
  notes: CoachNote[];
  alerts: AlertReason[];
  banner: DeepDiveBanner | null;
  transition_suggest: TransitionSuggestPayload | null;
}

// ---------------------------------------------------------------------------
// Zod schemas — used by the API layer to validate inbound payloads (notes
// POST). The deep-dive GET response is not validated client-side; if needed
// later, derive a runtime schema from this.
// ---------------------------------------------------------------------------

export const NoteCreateSchema = z.object({
  body: z
    .string()
    .min(1, 'La nota no puede estar vacía')
    .max(2000, 'La nota es demasiado larga')
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1, 'La nota no puede estar vacía'),
});
export type NoteCreateInput = z.infer<typeof NoteCreateSchema>;

export type DeepDiveTabKey =
  | 'resumen'
  | 'plan'
  | 'body'
  | 'performance'
  | 'race_plan'
  | 'notas'
  | 'ajustes';

export const DEEP_DIVE_TABS: ReadonlyArray<{ key: DeepDiveTabKey; label: string; href: string }> = [
  { key: 'resumen', label: 'Resumen', href: '' },
  { key: 'plan', label: 'Plan', href: 'plan' },
  { key: 'body', label: 'Body', href: 'body' },
  { key: 'performance', label: 'Performance', href: 'performance' },
  { key: 'race_plan', label: 'Race plan', href: 'race-plan' },
  { key: 'notas', label: 'Notas', href: 'notas' },
  { key: 'ajustes', label: 'Ajustes', href: 'ajustes' },
];
