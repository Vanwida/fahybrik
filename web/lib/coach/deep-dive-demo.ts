// Demo deep-dive payloads. Used when the requested athlete_id is `demo-N`
// (cohort linked from CohortTable) OR when a real athlete has no real data
// yet (Pablo's onboarding). The Marc Vidal payload is the canonical example
// from /docs/ux/06-athlete-deep-dive.md and is what we screen-recorded for
// design sign-off.

import { summarizeLoad } from '@fahybrid/shared/domain/training-load/banister';
import { readLoadCoverage } from '@fahybrid/shared/domain/training-load/coverage';
import type {
  AthleteDeepDive,
  ModalityDistribution,
  PerformanceBlock,
  RecentDay,
  TrendsBlock,
  CtlAtlPoint,
  SparkPoint,
  CompliancePoint,
} from './deep-dive-types';

const DEMO_GENERATED_AT = '2026-05-08T08:00:00.000Z';

// The demo athlete rates every session, so his load reading is whole. Derived
// from the real reader over an all-known window rather than written by hand: a
// literal here could describe a coverage the engine cannot produce, and this is
// the payload Pablo sees on his very first athlete.
const DEMO_LOAD_COVERAGE = readLoadCoverage(
  summarizeLoad(
    Array.from({ length: 28 }, (_, i) => ({
      date: new Date(Date.parse(DEMO_GENERATED_AT) - (27 - i) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      tss: 60,
      known_seconds: 3600,
      unknown_seconds: 0,
      unknown_sessions: 0,
    })),
  ),
);

// Demo microciclo names — plausible coach DATA (agnostic strings, NOT a fixed
// ACC/TRANS/REAL phase enum). Any string is valid here.
const DEMO_MICROCICLOS = ['Base', 'Construcción', 'Pico'] as const;

// ---------------------------------------------------------------------------
// Helpers — shape data so we don't repeat 30 numbers by hand.
// ---------------------------------------------------------------------------

function pseudoRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildCtlAtl(
  ctlEnd: number,
  atlEnd: number,
  days = 30,
  seed = 7,
): CtlAtlPoint[] {
  const rand = pseudoRandom(seed);
  const out: CtlAtlPoint[] = [];
  const today = new Date(DEMO_GENERATED_AT);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const t = (days - 1 - i) / (days - 1);
    const drift = (rand() - 0.5) * 4;
    const ctl = round1(ctlEnd - 12 + 12 * t + drift * 0.5);
    const atl = round1(atlEnd - 8 + 8 * t + drift);
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      ctl,
      atl,
      tsb: round1(ctl - atl),
      unknown_seconds: 0,
      unknown_sessions: 0,
    });
  }
  return out;
}

function buildSpark(
  baseline: number,
  amplitude: number,
  days = 30,
  seed = 11,
): SparkPoint[] {
  const rand = pseudoRandom(seed);
  const out: SparkPoint[] = [];
  const today = new Date(DEMO_GENERATED_AT);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    out.push({
      iso_date: d.toISOString().slice(0, 10),
      value: round1(baseline + (rand() - 0.5) * amplitude),
    });
  }
  return out;
}

function buildCompliance(
  pattern: ReadonlyArray<CompliancePoint['state']>,
): CompliancePoint[] {
  const today = new Date(DEMO_GENERATED_AT);
  return pattern.map((state, i) => ({
    iso_date: new Date(today.getTime() - (pattern.length - 1 - i) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    state,
  }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------
// Marc Vidal — the canonical demo athlete from spec 06.
// ---------------------------------------------------------------------------

const MARC_TRENDS: TrendsBlock = {
  ctl_atl_tsb: buildCtlAtl(75, 63, 30, 17),
  hrv: buildSpark(64, 10, 30, 23),
  hrv_baseline_ms: 64,
  sleep: buildSpark(7.2, 0.9, 30, 41),
  sleep_avg_h: 7.2,
  compliance: buildCompliance([
    'completed', 'completed', 'completed', 'completed', 'completed', 'missed', 'completed',
    'completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed',
    'missed', 'completed', 'completed', 'completed', 'completed', 'completed', 'completed',
    'completed', 'completed', 'completed', 'missed', 'completed', 'completed', 'completed',
    'completed', 'completed',
  ]),
  compliance_pct: 86,
  compliance_done: 26,
  compliance_total: 30,
  zone_time: { z2: 24, z3: 38, z4: 31, z5: 7 },
};

const MARC_MODALITY: ModalityDistribution = {
  rows: [
    { key: 'running', label: 'Running', hours: 4.53, pct: 38, km: 47, kg: null },
    { key: 'strength', label: 'Strength', hours: 3.07, pct: 26, km: null, kg: 14_200 },
    { key: 'hyrox', label: 'HYROX-spec', hours: 2.30, pct: 19, km: null, kg: null },
    { key: 'skill', label: 'Skill/Mob', hours: 1.73, pct: 15, km: null, kg: null },
    { key: 'recovery', label: 'Recovery', hours: 0.37, pct: 3, km: null, kg: null },
  ],
  total_hours: 11.97,
  sessions_count: 12,
  twice_daily_days_label: 'Mar/Mié/Vie',
};

const MARC_PERFORMANCE: PerformanceBlock = {
  groups: [
    {
      key: 'running',
      label: 'Running',
      rows: [
        { exercise_label: 'Run Z2 60min',       group: 'running', best_label: '5:18/km',  avg_label: 'cad 178', trend: 'flat', trend_pct: 0,   variability: 'low',  last_done_label: '-1d',  hint_text: 'Z2 92%' },
        { exercise_label: 'Run tempo Z3',        group: 'running', best_label: '4:32/km',  avg_label: '30 min',  trend: 'flat', trend_pct: 0,   variability: 'low',  last_done_label: '-3d',  hint_text: '@ Z3' },
        { exercise_label: 'Run threshold 1km',   group: 'running', best_label: '3:50',     avg_label: '4:00',    trend: 'up',   trend_pct: 1.5, variability: 'low',  last_done_label: 'hoy',  hint_text: '90% LT' },
        { exercise_label: 'Run VO2max 3min',     group: 'running', best_label: '3:38/km',  avg_label: 'Z5 conf', trend: 'flat', trend_pct: 0,   variability: 'med',  last_done_label: '-5d',  hint_text: 'Z5 conf' },
        { exercise_label: 'Run race pace 400m',  group: 'running', best_label: '1:42',     avg_label: '1:48',    trend: 'down', trend_pct: -2,  variability: 'med',  last_done_label: '-7d',  hint_text: null },
        { exercise_label: 'Strides 100m',        group: 'running', best_label: '6.2s',     avg_label: 'cad 198', trend: 'flat', trend_pct: 0,   variability: 'low',  last_done_label: '-6d',  hint_text: null },
      ],
    },
    {
      key: 'hyrox_stations',
      label: 'HYROX stations',
      rows: [
        { exercise_label: 'Wall ball 9kg/50',    group: 'hyrox_stations', best_label: '1:24', avg_label: '1:42', trend: 'up',   trend_pct: 8,  variability: 'low',  last_done_label: 'hoy', hint_text: null },
        { exercise_label: 'Sled push 50kg/100m', group: 'hyrox_stations', best_label: '0:53', avg_label: '0:58', trend: 'flat', trend_pct: 0,  variability: 'med',  last_done_label: 'hoy', hint_text: null },
        { exercise_label: 'Burpee BBJ 80m',      group: 'hyrox_stations', best_label: '3:10', avg_label: '3:24', trend: 'flat', trend_pct: 0,  variability: 'med',  last_done_label: '-3d', hint_text: null },
        { exercise_label: 'Row 1km',             group: 'hyrox_stations', best_label: '3:42', avg_label: '3:48', trend: 'up',   trend_pct: 2,  variability: 'low',  last_done_label: '-2d', hint_text: null },
        { exercise_label: 'Ski erg 1km',         group: 'hyrox_stations', best_label: '3:55', avg_label: '4:02', trend: 'down', trend_pct: -3, variability: 'high', last_done_label: '-1d', hint_text: 'CV alto' },
      ],
    },
    {
      key: 'strength',
      label: 'Strength',
      rows: [
        { exercise_label: 'Back squat 1RM',  group: 'strength', best_label: '140 kg', avg_label: null, trend: 'up',   trend_pct: 3, variability: null, last_done_label: 'tested -7d',  hint_text: null },
        { exercise_label: 'Deadlift 1RM',    group: 'strength', best_label: '180 kg', avg_label: null, trend: 'flat', trend_pct: 0, variability: null, last_done_label: 'tested -14d', hint_text: null },
        { exercise_label: 'Bench press 1RM', group: 'strength', best_label: '100 kg', avg_label: null, trend: 'up',   trend_pct: 2, variability: null, last_done_label: 'tested -10d', hint_text: null },
        { exercise_label: 'Clean 1RM',       group: 'strength', best_label: '95 kg',  avg_label: null, trend: 'up',   trend_pct: 4, variability: null, last_done_label: 'tested -21d', hint_text: null },
      ],
    },
  ],
};

const MARC_RECENT: RecentDay[] = [
  {
    iso_date: '2026-05-08',
    label: 'HOY',
    sessions: [
      { slot: 'AM', title: 'Strength upper body',       duration_seconds: 52 * 60,       rpe: 7,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'Threshold intervals 4×1km', duration_seconds: 50 * 60,       rpe: 8.5, status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-07',
    label: 'AYER',
    sessions: [
      { slot: 'AM', title: 'Z2 long run 90min',          duration_seconds: 90 * 60,       rpe: 5,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'Skill + mobility (banded)',  duration_seconds: 35 * 60,       rpe: 4,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-06',
    label: '−2d',
    sessions: [
      { slot: 'AM', title: 'Lower body strength',         duration_seconds: 58 * 60,       rpe: 7,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'HYROX simulation half',       duration_seconds: 47 * 60 + 23,  rpe: 8,   status: 'completed', is_pr: true, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-05',
    label: '−3d',
    sessions: [
      { slot: 'AM', title: 'Tempo run 30min Z3',          duration_seconds: 32 * 60,       rpe: 7,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'Recovery + drills',           duration_seconds: 25 * 60,       rpe: 3,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-04',
    label: '−4d',
    sessions: [
      { slot: 'SOLO', title: 'Rest / mobility',           duration_seconds: 20 * 60,       rpe: 2,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-03',
    label: '−5d',
    sessions: [
      { slot: 'AM', title: 'Strength full body',          duration_seconds: 65 * 60,       rpe: 8,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'VO2max intervals 5×3min',     duration_seconds: 42 * 60,       rpe: 9,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
  {
    iso_date: '2026-05-02',
    label: '−6d',
    sessions: [
      { slot: 'AM', title: 'Strides + skill',             duration_seconds: 35 * 60,       rpe: 5,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
      { slot: 'PM', title: 'Sled accumulation block',     duration_seconds: 48 * 60,       rpe: 7,   status: 'completed', is_pr: false, perceived_difficulty: null, pain_area: null, pain_note: null },
    ],
  },
];

const MARC_NOTES: AthleteDeepDive['notes'] = [
  { id: 'demo-note-1', body: 'Sled push limita — trabajar tronco antero',  created_at_iso: '2026-05-03T09:14:00.000Z', date_label: '03/05/26' },
  { id: 'demo-note-2', body: 'Buena adaptación en Construcción, tirar bien al Pico', created_at_iso: '2026-04-28T08:50:00.000Z', date_label: '28/04/26' },
  { id: 'demo-note-3', body: 'Quejándose hombro derecho, vigilar OHP',     created_at_iso: '2026-04-20T17:32:00.000Z', date_label: '20/04/26' },
];

const MARC: AthleteDeepDive = {
  generated_at_iso: DEMO_GENERATED_AT,
  is_demo: true,
  header: {
    athlete_id: 'demo-1',
    full_name: 'Marc Vidal',
    is_demo: true,
    age_years: 34,
    sex_label: 'M',
    height_cm: 184,
    weight_kg: 78,
    experience_label: 'Pro · 5y entrenando',
  },
  a_event: {
    name: 'HYROX BCN',
    iso_date: '2026-06-18',
    days_until: 41,
  },
  macrocycle: {
    blocks: [
      { type: DEMO_MICROCICLOS[0], weeks: 6, position: 1, is_current: false },
      { type: DEMO_MICROCICLOS[1], weeks: 4, position: 2, is_current: false },
      { type: DEMO_MICROCICLOS[2], weeks: 2, position: 3, is_current: true },
    ],
    current_block: DEMO_MICROCICLOS[2],
    current_week: 1,
    current_day_of_week: 4,
    total_weeks: 12,
    weeks_to_event: 6,
  },
  carga: {
    ctl: 75, ctl_trend: 'up',
    atl: 63, atl_trend: 'up',
    tsb: 12, tsb_label: 'fresco',
    acr: 1.1, acr_label: 'normal',
    z34_pct_7d: 68,
    polarization_pct: { low: 78, mid: 8, high: 14 },
    polarization_warn: true,
    coverage: DEMO_LOAD_COVERAGE,
  },
  compliance: {
    pct_7d: 83,
    pct_30d: 86,
    pct_total: 91,
    streak_days: 12,
    checkin_done_7d: 6,
  },
  readiness: {
    daily_readiness_score: 78,
    daily_readiness_delta_7d: 4,
    race_readiness: 78, race_readiness_trend: 'up',
    hrv_ms: 58,
    hrv_delta_ms: -8,
    sleep_avg_h: 7.2,
    rhr: 48,
    rhr_delta: 3,
    recovery_pct: 72,
    mood: 4,
    fatigue: 2,
  },
  modality: MARC_MODALITY,
  trends: MARC_TRENDS,
  performance: MARC_PERFORMANCE,
  recent_days: MARC_RECENT,
  notes: MARC_NOTES,
  alerts: [],
  banner: null,
  transition_suggest: null,
};

// ---------------------------------------------------------------------------
// Sara Puig — inactive sync, used to demo the inactive banner.
// ---------------------------------------------------------------------------

const SARA: AthleteDeepDive = {
  ...MARC,
  is_demo: true,
  header: {
    athlete_id: 'demo-2',
    full_name: 'Sara Puig',
    is_demo: true,
    age_years: 29,
    sex_label: 'F',
    height_cm: 170,
    weight_kg: 62,
    experience_label: 'Pro · 4y entrenando',
  },
  a_event: { name: 'HYROX BCN', iso_date: '2026-07-04', days_until: 56 },
  macrocycle: {
    blocks: [
      { type: DEMO_MICROCICLOS[0], weeks: 6, position: 1, is_current: false },
      { type: DEMO_MICROCICLOS[1], weeks: 4, position: 2, is_current: true },
      { type: DEMO_MICROCICLOS[2], weeks: 2, position: 3, is_current: false },
    ],
    current_block: DEMO_MICROCICLOS[1],
    current_week: 3,
    current_day_of_week: 4,
    total_weeks: 12,
    weeks_to_event: 8,
  },
  alerts: [
    { kind: 'no_sync', severity: 'critical', label: '4d sin sync', detail: 'Garmin off' },
  ],
  banner: {
    kind: 'inactive',
    severity: 'critical',
    title: 'Sara no sincroniza datos hace 4 días',
    detail: 'última sync 04/05',
    cta_label: 'Enviar mensaje',
  },
  notes: [],
};

// ---------------------------------------------------------------------------
// Generic demo (unknown demo-N): scaled-down Marc with a different name.
// ---------------------------------------------------------------------------

function genericDemo(athleteId: string, fullName: string): AthleteDeepDive {
  return { ...MARC, header: { ...MARC.header, athlete_id: athleteId, full_name: fullName }, notes: [] };
}

const PERSONAS: ReadonlyArray<{ id: string; full_name: string }> = [
  { id: 'demo-3',  full_name: 'Jordi Llopis' },
  { id: 'demo-4',  full_name: 'Andreu Roig' },
  { id: 'demo-5',  full_name: 'Núria Bofill' },
  { id: 'demo-6',  full_name: 'Pol Aguirre' },
  { id: 'demo-7',  full_name: 'Laia Ferré' },
  { id: 'demo-8',  full_name: 'Ignasi Brú' },
  { id: 'demo-9',  full_name: 'Marta Cisneros' },
  { id: 'demo-10', full_name: 'Bernat Oliva' },
  { id: 'demo-11', full_name: 'Helena Sastre' },
  { id: 'demo-12', full_name: 'Aleix Tort' },
  { id: 'demo-13', full_name: 'Júlia Camps' },
];

export function getDemoDeepDive(athleteId: string): AthleteDeepDive | null {
  if (athleteId === 'demo-1') return MARC;
  if (athleteId === 'demo-2') return SARA;
  const persona = PERSONAS.find((p) => p.id === athleteId);
  if (persona) return genericDemo(persona.id, persona.full_name);
  return null;
}

export function isDemoAthleteId(athleteId: string): boolean {
  return athleteId.startsWith('demo-');
}

// Used as fallback when a real athlete has no real data — Pablo still wants
// the screen to look alive while he's onboarding.
export function getDemoFallback(athleteId: string, fullName: string, currentMicrociclo: string | null): AthleteDeepDive {
  return {
    ...MARC,
    is_demo: true,
    header: {
      ...MARC.header,
      athlete_id: athleteId,
      full_name: fullName,
      is_demo: true,
    },
    macrocycle: currentMicrociclo
      ? { ...(MARC.macrocycle as NonNullable<AthleteDeepDive['macrocycle']>), current_block: currentMicrociclo }
      : MARC.macrocycle,
    notes: [],
  };
}
