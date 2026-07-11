// Local view-model for the methodology rule engine (web-only, temporary).
//
// WHY LOCAL: the canonical Rule types live in `@fahybrid/shared/domain`
// (spec §2). Another agent is editing shared in parallel, so to avoid a merge
// race this file mirrors the shape the UI needs and is the *only* place the web
// knows about rule structure. Follow-up: replace these with imports from
// `@fahybrid/shared` and delete this file once shared lands. Keep the field
// names identical to the spec so the swap is mechanical.

// ── Vocabulary (spec §3, subset surfaced in the builder UI) ──────────────────
export type RuleOperator =
  | '<'
  | '<='
  | '='
  | '>='
  | '>'
  | 'between'
  | 'trend_down'
  | 'trend_up'
  | 'in';

export type RulePriority = 'critical' | 'high' | 'medium' | 'low';

export type TriggerPhase = 'pre_session' | 'intra_session' | 'cross_session' | 'selection';

export type RuleAuthored = 'coach' | 'ai_suggested' | 'system_default';

export type RuleScope = 'set' | 'exercise' | 'session' | 'day' | 'week' | 'block' | 'global';

// Condition metric option (id = enum value from spec §3, label = athlete-facing-ish).
export interface MetricOption {
  id: string;
  label: string;
  unit: string; // pct | bpm | s/km | s | scale 1-5 | 0-100 | zone | reps | days …
  source: 'checkin' | 'wearable' | 'live_sensor' | 'logged_set' | 'plan_state' | 'derived';
}

// Action verb option (id = ActionVerb from spec §3).
export interface VerbOption {
  id: string;
  label: string;
}

export interface RuleCondition {
  metric: string; // MetricOption.id
  operator: RuleOperator;
  value: number | [number, number] | string;
  unit: string;
  window?: string; // 'today' | 'last_7d' | 'rep1_vs_rep6' | 'session' | '2_consecutive'
}

export interface RuleAction {
  verb: string; // VerbOption.id
  // Free-form params surfaced to the coach as a readable tail of the chip.
  // (Structured params come back when wired to shared; here a label is enough.)
  paramsLabel: string;
}

export interface RuleVM {
  id: string;
  area: number; // 1..14
  triggerPhase: TriggerPhase;
  scope: RuleScope;
  conditions: RuleCondition[]; // AND
  actions: RuleAction[];
  priority: RulePriority;
  authored: RuleAuthored;
  /** Verbatim excerpt of where this rule came from (seed / coach note) — trust signal. */
  sourceExcerpt?: string;
  enabled: boolean;
}

// ── Field-level edit state (spec §6) ─────────────────────────────────────────
export type FieldState = 'empty' | 'prefilled' | 'edited' | 'ai_suggested';

// ── Operator display map ─────────────────────────────────────────────────────
export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  '<': '<',
  '<=': '≤',
  '=': '=',
  '>=': '≥',
  '>': '>',
  between: 'entre',
  trend_down: 'cae',
  trend_up: 'sube',
  in: 'es',
};

export const PRIORITY_LABELS: Record<RulePriority, string> = {
  critical: 'crítica',
  high: 'alta',
  medium: 'media',
  low: 'baja',
};

// Order from most to least severe (used for sorting / future conflict hints).
export const PRIORITY_ORDER: readonly RulePriority[] = ['critical', 'high', 'medium', 'low'];

// ── Vocabulary surfaced in the intra-session builder (Área 7) ────────────────
// Subset of spec §3 relevant to live signals + the verbs those rules use.
export const INTRA_METRICS: readonly MetricOption[] = [
  { id: 'rpe_live', label: 'RPE en vivo', unit: '0-10', source: 'logged_set' },
  { id: 'rir_live', label: 'RIR en vivo', unit: 'reps', source: 'logged_set' },
  { id: 'pace_drift_intra', label: 'deriva de ritmo', unit: 's/km', source: 'live_sensor' },
  { id: 'pace_consistency', label: 'consistencia de ritmo', unit: 's/km', source: 'live_sensor' },
  { id: 'pace_vs_target', label: 'ritmo vs objetivo', unit: 's/km', source: 'live_sensor' },
  { id: 'hr_zone_current', label: 'zona FC actual', unit: 'zona 1-5', source: 'live_sensor' },
  {
    id: 'hr_above_ceiling_duration',
    label: 'tiempo sobre techo FC',
    unit: 's',
    source: 'live_sensor',
  },
  { id: 'time_in_zone_pct', label: '% tiempo en zona', unit: '%', source: 'derived' },
] as const;

// Also expose readiness/checkin metrics so pre-session rules can be shown if needed.
export const READINESS_METRICS: readonly MetricOption[] = [
  { id: 'hrv_delta_vs_baseline', label: 'HRV vs baseline', unit: '%', source: 'wearable' },
  { id: 'sleep_hours', label: 'horas de sueño', unit: 'h', source: 'wearable' },
  { id: 'soreness', label: 'agujetas', unit: '1-5', source: 'checkin' },
  { id: 'fatigue', label: 'fatiga', unit: '1-5', source: 'checkin' },
  {
    id: 'perceived_effort_presession',
    label: 'esfuerzo percibido pre-sesión',
    unit: '0-10',
    source: 'checkin',
  },
] as const;

export const INTRA_VERBS: readonly VerbOption[] = [
  { id: 'scale_load', label: 'ajustar carga' },
  { id: 'set_load_pct_rm', label: 'fijar carga %RM' },
  { id: 'cut_reps', label: 'cortar reps' },
  { id: 'cut_sets', label: 'cortar series' },
  { id: 'walk_jog', label: 'walk-jog' },
  { id: 'walk_break', label: 'pausa caminando' },
  { id: 'cap_pace', label: 'tope de ritmo' },
  { id: 'cap_hr', label: 'tope de FC' },
  { id: 'extend_recovery', label: 'alargar recuperación' },
  { id: 'downgrade_intensity', label: 'bajar intensidad' },
  { id: 'lower_next_week', label: 'bajar la semana que viene' },
  { id: 'flag_coach', label: 'avisar al coach' },
] as const;

export const ALL_METRICS: readonly MetricOption[] = [...INTRA_METRICS, ...READINESS_METRICS];

export function findMetric(id: string): MetricOption | undefined {
  return ALL_METRICS.find((m) => m.id === id);
}

export function findVerb(id: string): VerbOption | undefined {
  return INTRA_VERBS.find((v) => v.id === id);
}
