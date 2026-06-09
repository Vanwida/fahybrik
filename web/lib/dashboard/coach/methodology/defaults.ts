// Pablo's real methodology defaults (spec §4). These are the values the form
// is PRE-FILLED with — every one carries a "default Pablo · confirma" badge in
// the UI. Source citations from the spec are kept inline so the trust signal is
// auditable. MOCK/LOCAL for now: structured to swap for an API fetch later
// (the shape mirrors the persistence tables in spec §5).

import type {
  RuleVM,
  RulePriority,
  TriggerPhase,
  RuleScope,
  RuleAuthored,
  RuleOperator,
} from './rule-vm';

// ── 14-area catalog (spec §4) ────────────────────────────────────────────────
export type AreaStatus = 'built' | 'coming_soon';

export interface MethodologyArea {
  id: number; // 1..14
  slug: string;
  title: string;
  /** One-line scope tag from the spec, e.g. "selection", "intra_session". */
  phase: string;
  summary: string;
  /** Material Symbols icon name. */
  icon: string;
  status: AreaStatus;
  /** href segment under /metodologia when built. */
  segment?: string;
}

// Ordered to match the spec's "form flow" (Filosofía → ... → Voz), not numeric id.
export const METHODOLOGY_AREAS: readonly MethodologyArea[] = [
  {
    id: 1,
    slug: 'filosofia',
    title: 'Filosofía & no-negociables',
    phase: 'selection · global',
    summary:
      'Capa de validación global: toda salida de la IA pasa por tus 14 no-negociables antes de entregarse.',
    icon: 'gavel',
    status: 'coming_soon',
  },
  {
    id: 2,
    slug: 'periodizacion-atr',
    title: 'Periodización ATR',
    phase: 'selection',
    summary: 'Acumulación · Transformación · Realización. La estructura de bloques de tu macrociclo.',
    icon: 'view_timeline',
    status: 'built',
    segment: 'periodizacion-atr',
  },
  {
    id: 3,
    slug: 'progresion-intra-bloque',
    title: 'Progresión intra-bloque',
    phase: 'selection',
    summary: 'Cómo la misma plantilla sube carga y volumen sola, semana a semana, hasta la descarga.',
    icon: 'trending_up',
    status: 'coming_soon',
  },
  {
    id: 4,
    slug: 'estructura-semanal',
    title: 'Estructura semanal',
    phase: 'selection',
    summary: 'Sesiones por semana y nivel, dobles, mezcla de modalidades, patrón duro-fácil.',
    icon: 'calendar_view_week',
    status: 'coming_soon',
  },
  {
    id: 5,
    slug: 'zonas-intensidad',
    title: 'Modelo de zonas e intensidad',
    phase: 'derivación por atleta',
    summary: 'Traduce Z2 / @RPE7 / race pace / split 2:00 a un número concreto por atleta.',
    icon: 'speed',
    status: 'coming_soon',
  },
  {
    id: 6,
    slug: 'gates-readiness',
    title: 'Gates de readiness',
    phase: 'pre_session',
    summary: 'Umbrales de HRV, sueño y agujetas que saltan o modifican la sesión antes de empezar.',
    icon: 'health_metrics',
    status: 'coming_soon',
  },
  {
    id: 7,
    slug: 'autorregulacion',
    title: 'Autorregulación intra-sesión',
    phase: 'intra_session',
    summary: 'Señales en vivo (FC, ritmo, RPE por serie) → micro-ajustes inmediatos.',
    icon: 'tune',
    status: 'built',
    segment: 'autorregulacion',
  },
  {
    id: 8,
    slug: 'tests-benchmarks',
    title: 'Tests & benchmarks',
    phase: 'recálculo',
    summary: 'Cada test alimenta un ancla y recalibra zonas y cargas. Cadencia y propagación.',
    icon: 'fact_check',
    status: 'coming_soon',
  },
  {
    id: 9,
    slug: 'sustituciones',
    title: 'Sustituciones (equipo/lesión)',
    phase: 'selection',
    summary: 'Sustituir preservando el estímulo: patrón + sistema energético + carga relativa.',
    icon: 'swap_horiz',
    status: 'coming_soon',
  },
  {
    id: 10,
    slug: 'individualizacion',
    title: 'Individualización por atleta',
    phase: 'selection',
    summary: 'Cómo ajustas por nivel, perfil de modalidad y énfasis de grupo metodológico.',
    icon: 'person_pin',
    status: 'coming_soon',
  },
  {
    id: 11,
    slug: 'desviaciones',
    title: 'Manejo de desviaciones',
    phase: 'cross_session',
    summary: 'Sesiones perdidas, demasiado fácil/difícil, mesetas, señales de sobreentrenamiento.',
    icon: 'rule',
    status: 'coming_soon',
  },
  {
    id: 12,
    slug: 'prep-competicion',
    title: 'Prep competición HYROX',
    phase: 'selection · cross_session',
    summary: 'Simulaciones, estrategia por estación, tapering y protocolo de la semana de carrera.',
    icon: 'sports_score',
    status: 'coming_soon',
  },
  {
    id: 13,
    slug: 'nutricion',
    title: 'Nutrición / Fueling',
    phase: 'pilar estructurado',
    summary: 'Reglas CUANDO momento ENTONCES pauta: g/kg + gramos absolutos + timing.',
    icon: 'nutrition',
    status: 'coming_soon',
  },
  {
    id: 14,
    slug: 'voz',
    title: 'Voz & comunicación',
    phase: 'gobernador de estilo global',
    summary: 'Gobierna cada mensaje IA → atleta. Tono, profundidad del porqué, muestras de voz.',
    icon: 'forum',
    status: 'coming_soon',
  },
] as const;

// ── Completion status per area (mock — real value comes from saved fields) ────
// 0 = empty, value 0..1 = completion fraction. Prefilled defaults count as
// "ready to confirm", surfaced as a distinct state in the card.
export interface AreaCompletion {
  /** Fraction of fields that have a value (prefilled or edited). */
  prefilled: number;
  /** Fraction the coach has explicitly confirmed/edited. */
  confirmed: number;
  /** ISO date of last edit, or null if never touched. */
  lastEditedAt: string | null;
}

export const AREA_COMPLETION: Record<number, AreaCompletion> = {
  1: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  2: { prefilled: 1, confirmed: 0, lastEditedAt: '2026-06-09' },
  3: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  4: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  5: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  6: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  7: { prefilled: 1, confirmed: 0, lastEditedAt: '2026-06-09' },
  8: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  9: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  10: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  11: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  12: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  13: { prefilled: 1, confirmed: 0, lastEditedAt: null },
  14: { prefilled: 1, confirmed: 0, lastEditedAt: null },
};

// ════════════════════════════════════════════════════════════════════════════
// ÁREA 2 — Periodización ATR (spec §4 · Área 2)
// ════════════════════════════════════════════════════════════════════════════
export type AtrBlock = 'ACC' | 'TRANS' | 'REAL';

export interface AtrBlockDefault {
  block: AtrBlock;
  /** Athlete-facing label (block_label_athlete). */
  labelAthlete: string;
  /** block_duration_weeks. */
  durationWeeks: number;
  /** block_sequence_order. */
  order: number;
  /** block_objective[] — keys map to OBJECTIVE_OPTIONS. */
  objectives: string[];
  /** block_intensity_ceiling. */
  intensityCeiling: 'Z2' | 'Z3' | 'Z4' | 'Z5';
}

// Objective vocabulary (block_objective multiselect, spec §4 Área 2).
export const OBJECTIVE_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'volumen_aerobico', label: 'Volumen aeróbico' },
  { id: 'densidad_muscular', label: 'Densidad muscular' },
  { id: 'umbral_anaerobico', label: 'Umbral anaeróbico' },
  { id: 'lactate_clearance', label: 'Lactate clearance' },
  { id: 'pace_consistency', label: 'Consistencia de ritmo' },
  { id: 'especificidad_carrera', label: 'Especificidad de carrera' },
  { id: 'peaking_freshness', label: 'Peaking / frescura' },
  { id: 'mantenimiento_fuerza', label: 'Mantenimiento de fuerza' },
] as const;

export const INTENSITY_CEILING_OPTIONS = ['Z2', 'Z3', 'Z4', 'Z5'] as const;

// Defaults: ACC=5 / TRANS=4 / REAL=3 (ground-truth assignment_microciclo).
export const ATR_BLOCKS_DEFAULT: readonly AtrBlockDefault[] = [
  {
    block: 'ACC',
    labelAthlete: 'Acumulación',
    durationWeeks: 5,
    order: 1,
    objectives: ['volumen_aerobico', 'densidad_muscular'],
    intensityCeiling: 'Z2',
  },
  {
    block: 'TRANS',
    labelAthlete: 'Intensificación',
    durationWeeks: 4,
    order: 2,
    objectives: ['umbral_anaerobico', 'lactate_clearance', 'pace_consistency'],
    intensityCeiling: 'Z4',
  },
  {
    block: 'REAL',
    labelAthlete: 'Tapering / Realización',
    durationWeeks: 3,
    order: 3,
    objectives: ['especificidad_carrera', 'peaking_freshness', 'mantenimiento_fuerza'],
    intensityCeiling: 'Z5',
  },
] as const;

// Macrocycle math: ACC(5)+TRANS(4)+REAL(3) = 12 weeks to race.
export const MACROCYCLE_TOTAL_WEEKS = ATR_BLOCKS_DEFAULT.reduce((n, b) => n + b.durationWeeks, 0);

// ════════════════════════════════════════════════════════════════════════════
// ÁREA 7 — Autorregulación intra-sesión (spec §4 · Área 7)
// Real rules from the seed, pre-loaded as confirmable chips.
// ════════════════════════════════════════════════════════════════════════════
const intra = (
  id: string,
  priority: RulePriority,
  authored: RuleAuthored,
  conditions: RuleVM['conditions'],
  actions: RuleVM['actions'],
  sourceExcerpt: string,
): RuleVM => ({
  id,
  area: 7,
  triggerPhase: 'intra_session' as TriggerPhase,
  scope: 'set' as RuleScope,
  conditions,
  actions,
  priority,
  authored,
  sourceExcerpt,
  enabled: true,
});

const op = (o: string) => o as RuleOperator;

export const INTRA_SESSION_RULES_DEFAULT: RuleVM[] = [
  intra(
    'intra-rpe-redflag',
    'high',
    'pablo',
    [{ metric: 'rpe_live', operator: op('>'), value: 8, unit: '0-10', window: 'session' }],
    [{ verb: 'scale_load', paramsLabel: '−5 a −10% carga' }],
    'seed #1 — "RPE>8 en serie 2 → bajar carga 5-10%"',
  ),
  intra(
    'intra-rpe-squat',
    'high',
    'pablo',
    [{ metric: 'rpe_live', operator: op('>='), value: 8, unit: '0-10', window: 'session' }],
    [{ verb: 'set_load_pct_rm', paramsLabel: 'fijar 73% RM' }],
    'seed — "RPE≥8 en squat → bajar a 73% RM"',
  ),
  intra(
    'intra-rpe-accessory',
    'medium',
    'pablo',
    [{ metric: 'rpe_live', operator: op('>'), value: 6, unit: '0-10', window: 'session' }],
    [{ verb: 'cut_sets', paramsLabel: 'cortar a 3×4' }],
    'seed #6 — "RPE>6 en serie 1 de accesorio → 3×4"',
  ),
  intra(
    'intra-pace-drift',
    'high',
    'pablo',
    [
      {
        metric: 'pace_drift_intra',
        operator: op('>'),
        value: 3,
        unit: 's/km',
        window: 'rep1_vs_rep6',
      },
    ],
    [{ verb: 'cut_reps', paramsLabel: 'cortar a 4 + descanso 48h' }],
    'seed #5 — "deriva de ritmo >3 s/km rep1→6 → cortar a 4 reps"',
  ),
  intra(
    'intra-pace-consistency',
    'medium',
    'pablo',
    [{ metric: 'pace_consistency', operator: op('>'), value: 5, unit: 's/km', window: 'session' }],
    [{ verb: 'cut_reps', paramsLabel: 'cortar a 4' }],
    'seed #3 — "consistencia de ritmo >5 s/km → cortar a 4 reps"',
  ),
  intra(
    'intra-hr-ceiling',
    'high',
    'pablo',
    [
      { metric: 'hr_zone_current', operator: op('>='), value: 3, unit: 'zona 1-5' },
      { metric: 'hr_above_ceiling_duration', operator: op('>'), value: 120, unit: 's' },
    ],
    [{ verb: 'walk_jog', paramsLabel: '30s · hasta volver a Z2' }],
    'seed #2 — "FC en Z3 sostenida >120s → walk-jog 30s"',
  ),
  intra(
    'intra-time-in-zone',
    'medium',
    'pablo',
    [{ metric: 'time_in_zone_pct', operator: op('<'), value: 80, unit: '%', window: 'session' }],
    [{ verb: 'lower_next_week', paramsLabel: 'ritmo +10 s/km' }],
    'seed #2 — "tiempo en Z2 <80% → bajar ritmo +10 s/km la semana que viene"',
  ),
];
