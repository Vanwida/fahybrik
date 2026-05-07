// Athlete deep-dive payload types.
//
// Mirrors the Resumen tab spec in /docs/ux/06-athlete-deep-dive.md. All values
// are pre-formatted server-side so the client component is purely presentational.

import { z } from 'zod';
import { ATR_BLOCK_TYPES, type AlertReason, type AtrBlockType } from './types';

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
  type: AtrBlockType;
  weeks: number;
  position: number;
  is_current: boolean;
}

export interface MacrocycleRibbon {
  blocks: MacrocycleBlockSegment[];
  current_block: AtrBlockType | null;
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
}

export interface KpiCompliance {
  pct_7d: number | null;
  pct_30d: number | null;
  pct_total: number | null;
  streak_days: number | null;
  checkin_done_7d: number | null;     // count out of 7
}

export interface KpiReadiness {
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
  zone_time: ZoneTimePct;
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

export const AthleteIdParamSchema = z.object({
  id: z.string().regex(/^(\d+|demo-[a-z0-9-]+)$/, 'athlete_id inválido'),
});

export type DeepDiveTabKey = 'resumen' | 'plan' | 'body' | 'performance' | 'notas' | 'ajustes';

export const DEEP_DIVE_TABS: ReadonlyArray<{ key: DeepDiveTabKey; label: string; href: string }> = [
  { key: 'resumen', label: 'Resumen', href: '' },
  { key: 'plan', label: 'Plan', href: 'plan' },
  { key: 'body', label: 'Body', href: 'body' },
  { key: 'performance', label: 'Performance', href: 'performance' },
  { key: 'notas', label: 'Notas', href: 'notas' },
  { key: 'ajustes', label: 'Ajustes', href: 'ajustes' },
];

// Re-export so consumers don't have to import from two places.
export { ATR_BLOCK_TYPES };
export type { AtrBlockType };
