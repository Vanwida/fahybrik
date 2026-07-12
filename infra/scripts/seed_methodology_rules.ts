/**
 * Pablo's REAL default RULES (spec §4, all areas) as structured WHEN→THEN data
 * for the methodology_rules engine. Split out of seed_methodology.ts to keep both
 * files under 500 lines. Each rule cites its origin (seed #N / doc §) in
 * source_excerpt; rules without a literal citation are authored 'system_default'
 * (spec §7.4) so the dashboard surfaces them for Pablo to confirm.
 *
 * Shapes match @fahybrid/shared/domain/methodology: conditions = ConditionGroup[]
 * (AND between groups, op within), actions = RuleAction[]. Validated by the seed.
 */
import type {
  ConditionGroup,
  RuleAction,
  RulePriority,
  RuleAuthored,
  RuleScope,
  RuleTriggerPhase,
} from '@fahybrid/shared/domain/methodology';

export interface SeedRule {
  area: number;
  trigger_phase: RuleTriggerPhase;
  scope: RuleScope;
  priority: RulePriority;
  authored: RuleAuthored;
  requires_coach_approval: boolean;
  source_excerpt?: string;
  conditions: ConditionGroup[];
  actions: RuleAction[];
}

// Helper builders keep the data terse and the shapes correct.
const G = (...c: ConditionGroup['conditions']): ConditionGroup => ({ op: 'AND', conditions: c });
const OR = (...c: ConditionGroup['conditions']): ConditionGroup => ({ op: 'OR', conditions: c });

export const PABLO_DEFAULT_RULES: SeedRule[] = [
  // ── Área 1 — Filosofía & no-negociables (selection/global) ─────────────────
  {
    area: 1, trigger_phase: 'selection', scope: 'week', priority: 'critical', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'Máximo 1 día de alta intensidad seguido.',
    conditions: [G({ metric: 'block_phase', operator: 'in', value: ['ACC', 'TRANS', 'REAL'], unit: 'enum', source: 'plan_state' })],
    actions: [{ verb: 'no_op_log_only', params: { constraint: 'max_consecutive_high_intensity_days=1' }, requires_coach_approval: false }],
  },
  {
    area: 1, trigger_phase: 'selection', scope: 'block', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'ACC no glucolítico (flag si la IA propone trabajo glucolítico en Acumulación).',
    conditions: [G({ metric: 'block_phase', operator: '=', value: 'ACC', unit: 'enum', source: 'plan_state' })],
    actions: [{ verb: 'flag_coach', params: { severity: 'medium', message: 'trabajo glucolítico propuesto en ACC' }, requires_coach_approval: false }],
  },
  {
    area: 1, trigger_phase: 'selection', scope: 'exercise', priority: 'critical', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'Completitud de prescripción: fuerza sin {reps,carga,RIR/RPE,tempo,descanso} → forbid.',
    conditions: [G({ metric: 'load_progression_stalled', operator: 'is_true', value: false, unit: 'bool', source: 'derived' })],
    actions: [{ verb: 'forbid_selection', params: { reason: 'prescripcion_incompleta_fuerza' }, requires_coach_approval: false }],
  },
  {
    area: 1, trigger_phase: 'selection', scope: 'exercise', priority: 'critical', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'Completitud: run/ergo sin (medida + objetivo) → forbid.',
    conditions: [G({ metric: 'load_progression_stalled', operator: 'is_true', value: false, unit: 'bool', source: 'derived' })],
    actions: [{ verb: 'forbid_selection', params: { reason: 'prescripcion_incompleta_cardio' }, requires_coach_approval: false }],
  },
  {
    area: 1, trigger_phase: 'pre_session', scope: 'session', priority: 'critical', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'Z2 long keystone never_skip; si HRV<-15% swap a row Z2 30min (seed #3).',
    conditions: [G({ metric: 'hrv_delta_vs_baseline', operator: '<', value: -15, unit: 'pct', source: 'wearable', window: 'today' })],
    actions: [{ verb: 'swap_modality', params: { exercise: 'run', to_modality: 'row', target: 'Z2', duration_min: 30 }, requires_coach_approval: true }],
  },

  // ── Área 2 — Periodización ATR (selection) ─────────────────────────────────
  {
    area: 2, trigger_phase: 'selection', scope: 'block', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'weeks_to_race==3 → set_block(REAL).',
    conditions: [G({ metric: 'days_to_race', operator: 'between', value: [15, 21], unit: 'days', source: 'plan_state' })],
    actions: [{ verb: 'advance_block', params: { to_phase: 'REAL' }, requires_coach_approval: false }],
  },
  {
    area: 2, trigger_phase: 'selection', scope: 'block', priority: 'critical', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'REAL & weeks_to_race<=1 → taper profundo.',
    conditions: [G(
      { metric: 'block_phase', operator: '=', value: 'REAL', unit: 'enum', source: 'plan_state' },
      { metric: 'days_to_race', operator: '<=', value: 7, unit: 'days', source: 'plan_state' },
    )],
    actions: [{ verb: 'deload_week', params: { pct: 50, keep_intensity: true }, requires_coach_approval: false }],
  },
  {
    area: 2, trigger_phase: 'selection', scope: 'block', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'weeks_to_race<12 → truncate ACC (REAL siempre completo).',
    conditions: [G({ metric: 'days_to_race', operator: '<', value: 84, unit: 'days', source: 'plan_state' })],
    actions: [{ verb: 'repeat_block', params: { phase: 'ACC', truncate_from: 'start' }, requires_coach_approval: false }],
  },

  // ── Área 3 — Progresión intra-bloque (selection) ───────────────────────────
  {
    area: 3, trigger_phase: 'cross_session', scope: 'week', priority: 'high', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'decoupling>8% → reduce_volume(15%) next week (seed #2).',
    conditions: [G({ metric: 'decoupling', operator: '>', value: 8, unit: 'pct', source: 'derived', window: 'session' })],
    actions: [{ verb: 'lower_next_week', params: { pct: 15, dimension: 'volume' }, requires_coach_approval: true }],
  },
  {
    area: 3, trigger_phase: 'selection', scope: 'week', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'ACC week++ → increase_load(3%).',
    conditions: [G({ metric: 'block_phase', operator: '=', value: 'ACC', unit: 'enum', source: 'plan_state' })],
    actions: [{ verb: 'progress_next_week', params: { pct: 3, dimension: 'load' }, requires_coach_approval: false }],
  },
  {
    area: 3, trigger_phase: 'selection', scope: 'week', priority: 'high', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'weeks_to_race<10 & strength → reduce a 70% + vol −30%.',
    conditions: [G(
      { metric: 'days_to_race', operator: '<', value: 70, unit: 'days', source: 'plan_state' },
    )],
    actions: [
      { verb: 'set_load_pct_rm', params: { to_pct: 70 }, requires_coach_approval: true },
      { verb: 'reduce_volume', params: { pct: 30, scope: 'strength' }, requires_coach_approval: true },
    ],
  },
  {
    area: 3, trigger_phase: 'selection', scope: 'week', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'REAL → hold_load (85% × 3, mantener fuerza no PR).',
    conditions: [G({ metric: 'block_phase', operator: '=', value: 'REAL', unit: 'enum', source: 'plan_state' })],
    actions: [{ verb: 'set_load_pct_rm', params: { to_pct: 85 }, requires_coach_approval: false }],
  },

  // ── Área 6 — Gates de readiness (pre_session) ──────────────────────────────
  {
    area: 6, trigger_phase: 'pre_session', scope: 'session', priority: 'critical', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'HRV<-15% O sleep<6h O soreness>=4 → skip (critical, seed #6).',
    conditions: [OR(
      { metric: 'hrv_delta_vs_baseline', operator: '<', value: -15, unit: 'pct', source: 'wearable', window: 'today' },
      { metric: 'sleep_hours', operator: '<', value: 6, unit: 'h', source: 'wearable', window: 'today' },
      { metric: 'soreness', operator: '>=', value: 4, unit: 'scale_1_5', source: 'checkin', window: 'today' },
    )],
    actions: [{ verb: 'skip', params: { session: 'current', reason: 'readiness_gate' }, requires_coach_approval: true }],
  },
  {
    area: 6, trigger_phase: 'pre_session', scope: 'session', priority: 'high', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'HRV<-10% O sleep<6h (threshold) → reschedule d2 (high, seed #3).',
    conditions: [OR(
      { metric: 'hrv_delta_vs_baseline', operator: '<', value: -10, unit: 'pct', source: 'wearable', window: 'today' },
      { metric: 'sleep_hours', operator: '<', value: 6, unit: 'h', source: 'wearable', window: 'today' },
    )],
    actions: [{ verb: 'reschedule', params: { to_day: '+2', reason: 'readiness_modify' }, requires_coach_approval: true }],
  },
  {
    area: 6, trigger_phase: 'pre_session', scope: 'session', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'RPE_pre>5 (sesión complementaria) → skip (medium, seed #6).',
    conditions: [G({ metric: 'perceived_effort_presession', operator: '>', value: 5, unit: 'points', source: 'checkin', window: 'today' })],
    actions: [{ verb: 'skip', params: { session: 'current', reason: 'presession_rpe_complementary' }, requires_coach_approval: false }],
  },
  {
    area: 6, trigger_phase: 'pre_session', scope: 'session', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'HRV trend_down & sub_score<40 & planned_rpe>=8 → adaptive_flag + flag_coach (0010).',
    conditions: [G(
      { metric: 'hrv_delta_vs_baseline', operator: 'trend_down', value: 0, unit: 'pct', source: 'wearable', window: 'last_7d' },
      { metric: 'sub_score', operator: '<', value: 40, unit: 'score_0_100', source: 'checkin', window: 'today' },
    )],
    actions: [
      { verb: 'set_adaptive_flag', params: { flag: 'readiness_low' }, requires_coach_approval: false },
      { verb: 'flag_coach', params: { severity: 'high', message: 'readiness baja + sesión planificada dura' }, requires_coach_approval: false },
    ],
  },

  // ── Área 7 — Autorregulación intra-sesión (intra_session) ──────────────────
  {
    area: 7, trigger_phase: 'intra_session', scope: 'set', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'RPE>8 serie2 → scale_load(−5..−10%) (seed #1).',
    conditions: [G({ metric: 'rpe_live', operator: '>', value: 8, unit: 'points', source: 'logged_set', window: 'session' })],
    actions: [{ verb: 'scale_load', params: { pct: -8, scope: 'exercise' }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'set', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'RPE>=8 squat → set_load_pct_rm(73%).',
    conditions: [G({ metric: 'rpe_live', operator: '>=', value: 8, unit: 'points', source: 'logged_set', window: 'session' })],
    actions: [{ verb: 'set_load_pct_rm', params: { to_pct: 73 }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'exercise', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'RPE>6 serie1 accesorio → cut a 3×4 (seed #6).',
    conditions: [G({ metric: 'rpe_live', operator: '>', value: 6, unit: 'points', source: 'logged_set', window: 'session' })],
    actions: [{ verb: 'cut_sets', params: { to: 3 }, requires_coach_approval: false }, { verb: 'cut_reps', params: { to: 4, scope: 'exercise' }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'exercise', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'pace_drift>3s/km rep1→6 → cut a 4 + rest 48h (seed #5).',
    conditions: [G({ metric: 'pace_drift_intra', operator: '>', value: 3, unit: 's_per_km', source: 'live_sensor', window: 'rep1_vs_rep6' })],
    actions: [{ verb: 'cut_reps', params: { to: 4, scope: 'exercise' }, requires_coach_approval: false }, { verb: 'extend_recovery', params: { rest_hours: 48 }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'exercise', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'pace_consistency>5 → cut a 4 (seed #3).',
    conditions: [G({ metric: 'pace_consistency', operator: '>', value: 5, unit: 's_per_km', source: 'live_sensor', window: 'session' })],
    actions: [{ verb: 'cut_reps', params: { to: 4, scope: 'exercise' }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'session', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'HR Z3 sostenido >120s en sesión Z2 → walk_jog 30s (seed #2).',
    conditions: [G(
      { metric: 'hr_zone_current', operator: '>=', value: 3, unit: 'zone_1_5', source: 'live_sensor', window: 'session' },
      { metric: 'hr_above_ceiling_duration', operator: '>', value: 120, unit: 's', source: 'live_sensor', window: 'session' },
    )],
    actions: [{ verb: 'walk_jog', params: { duration_s: 30, until: 'back_to_zone_2' }, requires_coach_approval: false }],
  },
  {
    area: 7, trigger_phase: 'intra_session', scope: 'session', priority: 'medium', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'time_in_zone<80% Z2 → lower_next_week pace +10s/km (seed #2).',
    conditions: [G({ metric: 'time_in_zone_pct', operator: '<', value: 80, unit: 'pct', source: 'derived', window: 'session' })],
    actions: [{ verb: 'lower_next_week', params: { pace_offset_s_per_km: 10, dimension: 'pace' }, requires_coach_approval: true }],
  },

  // ── Área 11 — Manejo de desviaciones (cross_session) ───────────────────────
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'critical', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'overtraining>=3 señales 7d → insert recovery + flag(critical).',
    conditions: [G({ metric: 'overtraining_composite', operator: '>=', value: 3, unit: 'count', source: 'derived', window: 'last_7d' })],
    actions: [
      { verb: 'insert_session', params: { type: 'recovery', duration_min: 30 }, requires_coach_approval: true },
      { verb: 'flag_coach', params: { severity: 'critical', message: 'señales de sobreentrenamiento sostenidas' }, requires_coach_approval: true },
    ],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'high', authored: 'coach',
    requires_coach_approval: true,
    source_excerpt: 'days_to_race<10 → set_load 70% + reduce_volume −30% (doc §4).',
    conditions: [G({ metric: 'days_to_race', operator: '<', value: 10, unit: 'days', source: 'plan_state' })],
    actions: [{ verb: 'set_load_pct_rm', params: { to_pct: 70 }, requires_coach_approval: true }, { verb: 'reduce_volume', params: { pct: 30, scope: 'week' }, requires_coach_approval: true }],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'taper_window & sharpener Z5 → flag_coach (doc §4).',
    conditions: [G(
      { metric: 'is_taper_window', operator: 'is_true', value: true, unit: 'bool', source: 'plan_state' },
      { metric: 'days_to_race', operator: '<=', value: 7, unit: 'days', source: 'plan_state' },
    )],
    actions: [{ verb: 'flag_coach', params: { severity: 'high', message: 'sharpener Z5 dentro del taper' }, requires_coach_approval: false }],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'medium', authored: 'system_default',
    requires_coach_approval: true,
    source_excerpt: 'too_easy ×2 → progress +5% [system_default, confirmar].',
    conditions: [G({ metric: 'perceived_difficulty', operator: 'in', value: ['too_easy'], unit: 'enum', source: 'checkin', window: '2_consecutive' })],
    actions: [{ verb: 'progress_next_week', params: { pct: 5, dimension: 'load' }, requires_coach_approval: true }],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'medium', authored: 'system_default',
    requires_coach_approval: true,
    source_excerpt: 'too_hard O rpe_vs_target>2 → reduce_volume −10% + downgrade [system_default].',
    conditions: [OR(
      { metric: 'perceived_difficulty', operator: 'in', value: ['too_hard'], unit: 'enum', source: 'checkin', window: 'session' },
      { metric: 'rpe_vs_target_delta', operator: '>', value: 2, unit: 'points', source: 'derived', window: 'session' },
    )],
    actions: [{ verb: 'reduce_volume', params: { pct: 10, scope: 'week' }, requires_coach_approval: true }, { verb: 'downgrade_intensity', params: { to_rpe: 7 }, requires_coach_approval: true }],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'block', priority: 'medium', authored: 'system_default',
    requires_coach_approval: true,
    source_excerpt: 'plateau 3 sem → repeat_block | flag [system_default, confirmar].',
    conditions: [G({ metric: 'pace_pr_trend', operator: '=', value: 'flat', unit: 'enum', source: 'derived', window: 'last_14d' })],
    actions: [{ verb: 'repeat_block', params: { phase: 'current' }, requires_coach_approval: true }, { verb: 'flag_coach', params: { severity: 'medium', message: 'meseta de rendimiento 3 semanas' }, requires_coach_approval: true }],
  },
  {
    area: 11, trigger_phase: 'cross_session', scope: 'week', priority: 'high', authored: 'system_default',
    requires_coach_approval: true,
    source_excerpt: 'missed_consecutive>=3 → deload [system_default, confirmar].',
    conditions: [G({ metric: 'sessions_missed_consecutive', operator: '>=', value: 3, unit: 'count', source: 'plan_state', window: 'last_7d' })],
    actions: [{ verb: 'deload_week', params: { pct: 30, keep_intensity: false }, requires_coach_approval: true }],
  },

  // ── Área 10 — Individualización por atleta (selection) ─────────────────────
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'strength<=2 & run>=4 → set_emphasis(g1 ×1.5, g9 ×1.3), g4 ×1.0.',
    conditions: [G(
      { metric: 'modality_score', operator: '<=', value: 2, unit: 'scale_1_5', source: 'derived', arg: 'strength' },
      { metric: 'modality_score', operator: '>=', value: 4, unit: 'scale_1_5', source: 'derived', arg: 'run' },
    )],
    actions: [
      { verb: 'set_emphasis', params: { group_id: 1, mult: 1.5 }, requires_coach_approval: false },
      { verb: 'set_emphasis', params: { group_id: 9, mult: 1.3 }, requires_coach_approval: false },
    ],
  },
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'run<=2 → g4 ×1.5 + g5 ×1.3.',
    conditions: [G({ metric: 'modality_score', operator: '<=', value: 2, unit: 'scale_1_5', source: 'derived', arg: 'run' })],
    actions: [
      { verb: 'set_emphasis', params: { group_id: 4, mult: 1.5 }, requires_coach_approval: false },
      { verb: 'set_emphasis', params: { group_id: 5, mult: 1.3 }, requires_coach_approval: false },
    ],
  },
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'medium', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'goal=podium → g7 ×1.5 + g6 ×1.3.',
    conditions: [G({ metric: 'goal_type', operator: '=', value: 'podium', unit: 'enum', source: 'plan_state' })],
    actions: [
      { verb: 'set_emphasis', params: { group_id: 7, mult: 1.5 }, requires_coach_approval: false },
      { verb: 'set_emphasis', params: { group_id: 6, mult: 1.3 }, requires_coach_approval: false },
    ],
  },
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'low', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'age>=45 → +1 recovery, g2 ×0.7, g8 ×1.3.',
    conditions: [G({ metric: 'age', operator: '>=', value: 45, unit: 'count', source: 'plan_state' })],
    actions: [
      { verb: 'insert_session', params: { type: 'recovery', duration_min: 30 }, requires_coach_approval: false },
      { verb: 'set_emphasis', params: { group_id: 2, mult: 0.7 }, requires_coach_approval: false },
      { verb: 'set_emphasis', params: { group_id: 8, mult: 1.3 }, requires_coach_approval: false },
    ],
  },
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'sex=female → station_loads(W).',
    conditions: [G({ metric: 'sex', operator: '=', value: 'female', unit: 'enum', source: 'plan_state' })],
    actions: [{ verb: 'set_station_loads', params: { profile: 'W' }, requires_coach_approval: false }],
  },
  {
    area: 10, trigger_phase: 'selection', scope: 'global', priority: 'high', authored: 'coach',
    requires_coach_approval: false,
    source_excerpt: 'level=1 → variante cargas bajas, 1/día, estaciones 50%.',
    conditions: [G({ metric: 'level', operator: '=', value: 1, unit: 'count', source: 'plan_state' })],
    actions: [{ verb: 'select_level_variant', params: { n: 1 }, requires_coach_approval: false }],
  },
];
