/**
 * TODO(prescription-scheme): the W11 AFAP / "6 rounds for time" WODs below were
 * authored with `scheme: 'rounds'` as a workaround because the prescription model
 * lacked a dedicated for-time scheme. The model now has `scheme: 'for_time'`
 * (shared/domain/prescription/types.ts). When this seed is next intentionally
 * re-run, switch those WOD prescriptions to `scheme: 'for_time'`. NOT re-run now
 * to avoid churning athlete-assignment data.
 *
 * Seed Weeks 10, 11, 12 (BALANCED / base profile) of the HYROX 12-week plan —
 * MACROCICLO 3 · REALIZACIÓN.
 *
 * Source: docs/Plantilla_HYROX_12sem (1) 2.xlsx
 *   · "Semana 10" → week_number 10 · Carga ligera + Simulación
 *   · "Semana 11" → week_number 11 · TAPERING (7-10 días)
 *   · "Semana 12" → week_number 12 · COMPETICIÓN (activación + carrera)
 *
 * Mirrors EXACTLY the shape of the existing balanced Week 1 (program_week_templates
 * id 51, templates 76-81): N session `templates` per week (rest days as in the
 * sheet → empty `sessions` for that day_of_week), their `template_segments` with
 * structured `prescription_json` (validated against @fahybrid/shared/domain/
 * prescription), and one `program_week_templates` row per week whose slots_json
 * copies 51's verbatim shape (days[] keyed by day_of_week 1-7; each item carries
 * exercise_id + exercise_name + params_json + notes; the structured per-set model
 * lives in template_segments, exactly as in 51).
 *
 * CAPA 1 (day logic) → template.coach_notes + session.notes in slots_json.
 * CAPA 2 (Pablo's detailed example, RPE/%RM/pace/zones) → segments + prescription_json.
 *
 * THE SHOWCASE — Week 10 Saturday "SIMULACIÓN HYROX COMPLETA": the full race
 * modeled as 16 ordered modality segments — 8×(1km run) interleaved with the 8
 * stations in official competition order (Ski → Sled Push → Sled Pull → Burpee
 * Broad Jump → Row → Farmers Carry → Sandbag Lunges → Wall Balls). Each segment
 * carries its OWN modality + measure (distance|reps) + target (pace /km, pace
 * /500m, or kg). ZERO free text in prescription_json. Official HYROX Pro
 * distances/loads are sport facts (not fabrication): Ski/Row 1000m, sled 50m,
 * burpee BBJ 80m, farmers 200m @2×32kg, lunges 100m @30kg, wall balls 100 reps.
 *
 * Race targets (from "Semana 12" CAPA2, in seconds):
 *   Run 3'40-3'50/km = 220-230 s/km · Ski 1'55/500m = 115 s · Row 1'50/500m = 110 s.
 *
 * Genuine gaps (a session with no matching library block) get a new `blocks` row
 * with needs_review=true, slug prefixed w10/w11/w12; referenced by slug in
 * meta_json.maps_to_block. No exercises are created — every line maps to the
 * existing catalog.
 *
 * Idempotent: re-runs delete these 3 weeks + their templates (by name + meta
 * source) + the new blocks (by slug prefix) and rebuild. Week 51 is never touched.
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/seed_hyrox_weeks_10_11_12_realizacion.ts
 */
import { parsePrescription } from '@fahybrid/shared/domain/prescription';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const COACH_ID = 4;

// ── Exercise catalog ids (resolved from DB; every line maps — see report) ─────
const EX = {
  run: 3479,
  walk: 3571,
  rowing: 3481, // Rowing erg (cardio) — HYROX station 5
  skierg: 3480, // SkiErg (cardio) — HYROX station 1
  bikeerg: 3482,
  assaultBike: 3483,
  hipMobility: 2807,
  runDrills: 3572,
  backSquat: 3484,
  // HYROX stations (hyrox_station category)
  sledPush: 2, // station 2
  sledPull: 3, // station 3
  burpeeBroadJump: 4, // station 4
  farmersCarry: 6, // station 6
  sandbagLunges: 7, // station 7
  wallBalls: 8, // station 8
} as const;

// ── Race / training targets (seconds) — derived from the sheet, named not magic ─
const RUN_RACE_PACE_MIN_S = 220; // 3'40/km
const RUN_RACE_PACE_MAX_S = 230; // 3'50/km
const SKI_RACE_PACE_S = 115; // 1'55 / 500m
const ROW_RACE_PACE_S = 110; // 1'50 / 500m
const RUN_THRESHOLD_FAST_S = 211; // ~17 km/h treadmill (W11 threshold)
const RUN_THRESHOLD_REC_S = 327; // ~11 km/h treadmill jog recovery (W11)
const RUN_WOD_PACE_S = 230; // 3'50/km (W11 AFAP WOD run)

// ── Official HYROX Pro station prescriptions (sport facts) ────────────────────
const HYROX = {
  runMeters: 1000,
  skiMeters: 1000,
  sledPushMeters: 50,
  sledPullMeters: 50,
  burpeeBroadJumpMeters: 80,
  rowMeters: 1000,
  farmersCarryMeters: 200,
  farmersCarryKgPerHand: 32, // Pro: 2×32kg
  sandbagLungesMeters: 100,
  sandbagLungesKg: 30, // Pro sandbag
  wallBallReps: 100,
  wallBallKg: 9, // Pro: 9kg / 6kg target line; Pro men 9kg @ high target
} as const;

type SegmentSpec = {
  exercise_id: number;
  params: Record<string, number>;
  notes: string;
  block_position: number;
  block_format: string;
  block_title: string;
  prescription: Prescription;
};

type SessionTemplateSpec = {
  name: string;
  format: 'intervals' | 'strength_block' | 'tempo' | 'circuit' | 'amrap' | 'for_time' | 'emom' | 'hyrox_sim';
  day_position: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  day_of_week: number; // 1=Mon .. 7=Sun
  methodology_group_id: number;
  warmup: string;
  cooldown: string;
  coach_notes: string; // CAPA 1 day logic
  meta_json: Record<string, unknown>;
  segments: SegmentSpec[];
};

type NewBlockSpec = {
  slug: string; // prefixed w10/w11/w12
  title: string;
  description: string;
  methodology_group_id: number;
  format: string;
  atr_block_hint: 'REAL';
  source_ref: string;
  exercises: Array<{
    exercise_id: number;
    params: Record<string, number>;
    reps_scheme: string | null;
    notes: string;
    prescription: Prescription;
  }>;
};

type WeekSpec = {
  week_number: 10 | 11 | 12;
  week_name: string;
  focus: string;
  coach_notes: string;
  source_sheet: string;
  sessions: SessionTemplateSpec[];
  new_blocks: NewBlockSpec[];
};

// ── Shared prescription builders ──────────────────────────────────────────────
const steady = (total_s: number): Prescription => ({ scheme: 'steady', total_s });
const steadyZ = (total_s: number, zone: number): Prescription => ({ scheme: 'steady', total_s, target: { kind: 'hr_zone', value: zone } });
const steadyRpe = (total_s: number, rpe: number): Prescription => ({ scheme: 'steady', total_s, target: { kind: 'rpe', value: rpe } });
const interval = (rounds: number, work_s: number, rest_s?: number): Prescription =>
  rest_s === undefined ? { scheme: 'interval', rounds, work_s } : { scheme: 'interval', rounds, work_s, rest_s };

// Run distance @ pace /km (race-pace running)
const runDistAtPace = (meters: number, min_s: number, max_s: number): Prescription => ({
  scheme: 'steady',
  modality: 'run',
  sets: [{ measure: { kind: 'distance', meters }, target: { kind: 'pace', unit: 'per_km', min_s, max_s } }],
});
const runDistAtPacePoint = (meters: number, value_s: number): Prescription => ({
  scheme: 'steady',
  modality: 'run',
  sets: [{ measure: { kind: 'distance', meters }, target: { kind: 'pace', unit: 'per_km', value_s } }],
});

// ═══════════════════════════════════════════════════════════════════════════
// SEMANA 10 — REALIZACIÓN · Carga ligera + Simulación
// ═══════════════════════════════════════════════════════════════════════════
const SEMANA_10: WeekSpec = {
  week_number: 10,
  week_name: 'Semana 10 — Realización · Simulación',
  focus:
    'Microciclo de Carga ligera + Simulación (macrociclo REALIZACIÓN). Semana de afinado: ' +
    'cargas ligeras e intensidad muy alta para llegar a la simulación fresco. Lunes AMRAP de ' +
    'activación; martes ergómetros Z2 + preventivos; miércoles tempo run a ritmo objetivo (afinar ' +
    'ritmo de carrera); jueves DESCANSO COMPLETO; viernes activación pre-simulación (carrera suave + ' +
    'técnica de estaciones); sábado SIMULACIÓN HYROX COMPLETA a ritmo objetivo (8×1km run + estación ' +
    'en orden de competición — medir parciales y transiciones); domingo bike Z1 regenerativo.',
  coach_notes:
    'Semana 10 importada de Plantilla_HYROX_12sem · hoja "Semana 10". Capa 1 (lógica de día) en ' +
    'coach_notes de cada template; capa 2 (sesión detallada Pablo, RPE/%RM/ritmos/zonas) en los ' +
    'segmentos con prescription_json. El sábado es la SIMULACIÓN HYROX completa: 16 segmentos ordenados ' +
    '(8 carreras de 1km + 8 estaciones en orden de competición), cada uno con su modalidad y objetivo.',
  source_sheet: 'Plantilla_HYROX_12sem · Semana 10',
  new_blocks: [
    {
      // GAP: race-prep AMRAP activation (row+run+farmer+sled) + finisher rounds.
      // Library g7 has HYROX AMRAPs but not this exact light-activation dose.
      slug: 'w10-amrap-activacion-row-run-farmer-sled',
      title: 'AMRAP 15 activación: row/run/farmer/sled + finisher (Semana 10)',
      description:
        'AMRAP 15\': 10 cal row + 100m run + 20m farmer carry 24kg + sled push/pull 130kg. ' +
        'Rest 5\' + 3 rounds lunge/burpee/ski. Activación moderada, carga ligera.',
      methodology_group_id: 6,
      format: 'amrap',
      atr_block_hint: 'REAL',
      source_ref: 'Plantilla_HYROX_12sem · Semana 10 · Lunes (CAPA2)',
      exercises: [
        { exercise_id: EX.rowing, params: { calories: 10 }, reps_scheme: null, notes: 'AMRAP 15\': 10 cal row', prescription: { scheme: 'amrap', modality: 'row', total_s: 900, sets: [{ measure: { kind: 'calories', value: 10 } }] } },
        { exercise_id: EX.run, params: { distance_m: 100 }, reps_scheme: null, notes: '+ 100m run', prescription: { scheme: 'amrap', modality: 'run', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 100 } }] } },
        { exercise_id: EX.farmersCarry, params: { distance_m: 20 }, reps_scheme: null, notes: '+ 20m farmer carry 24kg', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 20 }, target: { kind: 'kg', value: 24 } }] } },
        { exercise_id: EX.sledPush, params: { distance_m: 12.5 }, reps_scheme: null, notes: '+ sled push 130kg', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 130 } }] } },
        { exercise_id: EX.sledPull, params: { distance_m: 12.5 }, reps_scheme: null, notes: '+ sled pull 130kg', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 130 } }] } },
        { exercise_id: EX.sandbagLunges, params: { sets: 3, distance_m: 20 }, reps_scheme: '3 rounds', notes: 'Rest 5\' + 3 rounds: 20m lunge', prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'distance', meters: 20 } }, { measure: { kind: 'distance', meters: 20 } }, { measure: { kind: 'distance', meters: 20 } }] } },
        { exercise_id: EX.burpeeBroadJump, params: { sets: 3, reps: 10 }, reps_scheme: '3 rounds', notes: 'Rest 5\' + 3 rounds: 10 burpee', prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }] } },
        { exercise_id: EX.skierg, params: { sets: 3, distance_m: 250 }, reps_scheme: '3 rounds', notes: 'Rest 5\' + 3 rounds: 250m ski', prescription: { scheme: 'rounds', modality: 'ski', rounds: 3, sets: [{ measure: { kind: 'distance', meters: 250 } }, { measure: { kind: 'distance', meters: 250 } }, { measure: { kind: 'distance', meters: 250 } }] } },
      ],
    },
    {
      // GAP: the full HYROX simulation as a catalog block (race-order, race targets).
      slug: 'w10-simulacion-hyrox-completa',
      title: 'SIMULACIÓN HYROX COMPLETA — 8×(1km run + estación) orden de competición (Semana 10)',
      description:
        'Simulación de competición completa: 8 carreras de 1km alternadas con las 8 estaciones HYROX ' +
        'en orden oficial (Ski 1000m → Sled Push 50m → Sled Pull 50m → Burpee Broad Jump 80m → Row 1000m → ' +
        'Farmers Carry 200m → Sandbag Lunges 100m → Wall Balls 100). Ritmos objetivo: run 3\'40-3\'50/km, ' +
        'ski 1\'55/500m, row 1\'50/500m. Medir parciales y transiciones (RoxZone).',
      methodology_group_id: 7,
      format: 'hyrox_sim',
      atr_block_hint: 'REAL',
      source_ref: 'Plantilla_HYROX_12sem · Semana 10 · Sábado (CAPA2)',
      exercises: [
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 1 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.skierg, params: { distance_m: HYROX.skiMeters }, reps_scheme: 'estación 1', notes: 'Estación 1 — SkiErg 1000m @1\'55/500m', prescription: { scheme: 'steady', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: HYROX.skiMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 2 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPush, params: { distance_m: HYROX.sledPushMeters }, reps_scheme: 'estación 2', notes: 'Estación 2 — Sled Push 50m (carga Pro)', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPushMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 3 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPull, params: { distance_m: HYROX.sledPullMeters }, reps_scheme: 'estación 3', notes: 'Estación 3 — Sled Pull 50m (carga Pro)', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPullMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 4 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.burpeeBroadJump, params: { distance_m: HYROX.burpeeBroadJumpMeters }, reps_scheme: 'estación 4', notes: 'Estación 4 — Burpee Broad Jump 80m', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.burpeeBroadJumpMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 5 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.rowing, params: { distance_m: HYROX.rowMeters }, reps_scheme: 'estación 5', notes: 'Estación 5 — Row 1000m @1\'50/500m', prescription: { scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'distance', meters: HYROX.rowMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 6 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.farmersCarry, params: { distance_m: HYROX.farmersCarryMeters }, reps_scheme: 'estación 6', notes: 'Estación 6 — Farmers Carry 200m @2×32kg', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.farmersCarryMeters }, target: { kind: 'kg', value: HYROX.farmersCarryKgPerHand } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 7 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sandbagLunges, params: { distance_m: HYROX.sandbagLungesMeters }, reps_scheme: 'estación 7', notes: 'Estación 7 — Sandbag Lunges 100m @30kg', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sandbagLungesMeters }, target: { kind: 'kg', value: HYROX.sandbagLungesKg } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, reps_scheme: '1km', notes: 'Run 8 — 1km @3\'40-3\'50/km', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.wallBalls, params: { reps: HYROX.wallBallReps }, reps_scheme: 'estación 8', notes: 'Estación 8 — Wall Balls ×100 @9kg', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'reps', value: HYROX.wallBallReps }, target: { kind: 'kg', value: HYROX.wallBallKg } }] } },
      ],
    },
  ],
  sessions: [
    // ── Lunes — AMRAP/WOD moderado de activación ──
    {
      name: 'AMRAP activación · row/run/farmer/sled',
      format: 'amrap',
      day_position: 'monday',
      day_of_week: 1,
      methodology_group_id: 6,
      warmup: 'Movilidad general + activación',
      cooldown: 'Soltar + movilidad',
      coach_notes: 'CAPA1 — AMRAP/WOD moderado de activación. Carga ligera, intensidad muy alta. Despertar el motor sin vaciar.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Lunes',
        maps_to_block: ['w10-amrap-activacion-row-run-farmer-sled (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.rowing, params: { calories: 10 }, notes: 'AMRAP 15\': 10 cal row', block_position: 0, block_format: 'amrap', block_title: 'A · AMRAP 15\'', prescription: { scheme: 'amrap', modality: 'row', total_s: 900, sets: [{ measure: { kind: 'calories', value: 10 } }] } },
        { exercise_id: EX.run, params: { distance_m: 100 }, notes: '+ 100m run', block_position: 0, block_format: 'amrap', block_title: 'A · AMRAP 15\'', prescription: { scheme: 'amrap', modality: 'run', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 100 } }] } },
        { exercise_id: EX.farmersCarry, params: { distance_m: 20 }, notes: '+ 20m farmer carry 24kg', block_position: 0, block_format: 'amrap', block_title: 'A · AMRAP 15\'', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 20 }, target: { kind: 'kg', value: 24 } }] } },
        { exercise_id: EX.sledPush, params: { distance_m: 12.5 }, notes: '+ sled push 130kg', block_position: 0, block_format: 'amrap', block_title: 'A · AMRAP 15\'', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 130 } }] } },
        { exercise_id: EX.sledPull, params: { distance_m: 12.5 }, notes: '+ sled pull 130kg', block_position: 0, block_format: 'amrap', block_title: 'A · AMRAP 15\'', prescription: { scheme: 'amrap', modality: 'functional', total_s: 900, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 130 } }] } },
        { exercise_id: EX.sandbagLunges, params: { sets: 3, distance_m: 20 }, notes: 'Rest 5\' + 3 rounds: 20m lunge', block_position: 1, block_format: 'circuit', block_title: 'B · Finisher (3 rounds)', prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'distance', meters: 20 } }, { measure: { kind: 'distance', meters: 20 } }, { measure: { kind: 'distance', meters: 20 } }] } },
        { exercise_id: EX.burpeeBroadJump, params: { sets: 3, reps: 10 }, notes: '3 rounds: 10 burpee', block_position: 1, block_format: 'circuit', block_title: 'B · Finisher (3 rounds)', prescription: { scheme: 'rounds', modality: 'functional', rounds: 3, sets: [{ measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }, { measure: { kind: 'reps', value: 10 } }] } },
        { exercise_id: EX.skierg, params: { sets: 3, distance_m: 250 }, notes: '3 rounds: 250m ski', block_position: 1, block_format: 'circuit', block_title: 'B · Finisher (3 rounds)', prescription: { scheme: 'rounds', modality: 'ski', rounds: 3, sets: [{ measure: { kind: 'distance', meters: 250 } }, { measure: { kind: 'distance', meters: 250 } }, { measure: { kind: 'distance', meters: 250 } }] } },
      ],
    },
    // ── Martes — Ergómetros Z2 + preventivos ──
    {
      name: 'Ergómetros Z2 + preventivos',
      format: 'tempo',
      day_position: 'tuesday',
      day_of_week: 2,
      methodology_group_id: 5,
      warmup: 'Movilidad + activación',
      cooldown: 'Plio y preventivos',
      coach_notes: 'CAPA1 — Ergómetros Z2 + preventivos. Volumen aeróbico de bajo impacto, recuperación activa antes de la simulación.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Martes',
        maps_to_block: 'COMPOSICION ergómetros Z2 (g5) — row+ski+run, no existe bloque triple-ergo Z2',
      },
      segments: [
        { exercise_id: EX.rowing, params: { time_seconds: 600 }, notes: '10\' row Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: { ...steadyZ(600, 2), modality: 'row' } },
        { exercise_id: EX.skierg, params: { time_seconds: 600 }, notes: '10\' ski Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: { ...steadyZ(600, 2), modality: 'ski' } },
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' run Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: { ...steadyZ(600, 2), modality: 'run' } },
      ],
    },
    // ── Miércoles — Tempo run a ritmo objetivo ──
    {
      name: 'Tempo run a ritmo objetivo',
      format: 'intervals',
      day_position: 'wednesday',
      day_of_week: 3,
      methodology_group_id: 4,
      warmup: '10\' warm up',
      cooldown: '1km cool down',
      coach_notes: 'CAPA1 — Tempo run a ritmo objetivo (afinar ritmo de carrera). Z4 al ritmo del test 30\'. Recordar sensaciones de ritmo de competición.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Miércoles',
        maps_to_block: 'g4 tempo run (3×10\'/10\' Z4 a ritmo test 30\')',
        uses_result: 'ritmo_umbral_30min',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' warm up', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: { ...steadyRpe(600, 5), modality: 'run' } },
        { exercise_id: EX.run, params: { sets: 3, time_seconds: 600 }, notes: '3×(10\' Z2 / 10\' Z4 a ritmo objetivo — ritmo del test 30\')', block_position: 1, block_format: 'intervals', block_title: 'Tempo Z2/Z4', prescription: { scheme: 'interval', modality: 'run', rounds: 3, work_s: 600, rest_s: 600, target: { kind: 'hr_zone', min: 2, max: 4 } } },
        { exercise_id: EX.run, params: { distance_m: 1000 }, notes: '1km cool down', block_position: 2, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: { scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 1000 }, target: { kind: 'rpe', value: 3 } }] } },
      ],
    },
    // ── Jueves — DESCANSO COMPLETO (rest: no template, empty session) ──
    // ── Viernes — Activación pre-simulación ──
    {
      name: 'Activación pre-simulación · 4km Z2 + técnica estaciones',
      format: 'tempo',
      day_position: 'friday',
      day_of_week: 5,
      methodology_group_id: 10,
      warmup: 'Movilidad',
      cooldown: 'Soltar',
      coach_notes: 'CAPA1 — Activación pre-simulación: carrera suave + estaciones técnicas a baja carga. SIN FATIGAR — llegar fresco a la simulación.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Viernes',
        maps_to_block: 'g10 activación pre-carrera (4km Z2 + técnica estaciones baja carga)',
      },
      segments: [
        { exercise_id: EX.run, params: { distance_m: 4000 }, notes: '4km Z2 activación', block_position: 0, block_format: 'tempo', block_title: 'Activación aeróbica', prescription: { scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 4000 }, target: { kind: 'hr_zone', value: 2 } }] } },
        { exercise_id: EX.skierg, params: { distance_m: 250 }, notes: 'Técnica estaciones baja carga — ski 250m suave', block_position: 1, block_format: 'circuit', block_title: 'Técnica estaciones (baja carga)', prescription: { scheme: 'steady', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: 250 }, target: { kind: 'rpe', value: 4 } }] } },
        { exercise_id: EX.sledPush, params: { distance_m: 25 }, notes: 'Técnica sled push baja carga', block_position: 1, block_format: 'circuit', block_title: 'Técnica estaciones (baja carga)', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: 25 }, target: { kind: 'rpe', value: 4 } }] } },
        { exercise_id: EX.wallBalls, params: { reps: 20 }, notes: 'Técnica wall balls suave ×20', block_position: 1, block_format: 'circuit', block_title: 'Técnica estaciones (baja carga)', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'reps', value: 20 }, target: { kind: 'rpe', value: 4 } }] } },
      ],
    },
    // ── Sábado — SIMULACIÓN HYROX COMPLETA (the showcase) ──
    {
      name: 'SIMULACIÓN HYROX COMPLETA',
      format: 'hyrox_sim',
      day_position: 'saturday',
      day_of_week: 6,
      methodology_group_id: 7,
      warmup: 'Calentamiento de competición (movilidad + activación + estaciones suaves)',
      cooldown: 'Cool down trote suave + movilidad',
      coach_notes:
        'CAPA1 — SIMULACIÓN HYROX COMPLETA a ritmo objetivo. 8×(1km run + estación) en orden de competición. ' +
        'Ritmos objetivo de carrera y estaciones. MEDIR TODO: tiempos parciales y transiciones (RoxZone).',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Sábado',
        maps_to_block: ['w10-simulacion-hyrox-completa (NUEVO, needs_review)'],
        store_results: ['parciales_run_x8', 'parciales_estaciones_x8', 'transiciones_roxzone', 'tiempo_total'],
        race_order: 'run→ski→run→sled_push→run→sled_pull→run→burpee_bbj→run→row→run→farmer→run→lunges→run→wall_balls',
      },
      segments: [
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 1 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 0, block_format: 'hyrox_sim', block_title: 'Run 1', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.skierg, params: { distance_m: HYROX.skiMeters }, notes: 'Estación 1 — SkiErg 1000m @1\'55/500m. Marcar parcial + transición.', block_position: 1, block_format: 'hyrox_sim', block_title: 'Estación 1 · SkiErg', prescription: { scheme: 'steady', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: HYROX.skiMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 2 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 2, block_format: 'hyrox_sim', block_title: 'Run 2', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPush, params: { distance_m: HYROX.sledPushMeters }, notes: 'Estación 2 — Sled Push 50m (carga Pro). Marcar parcial + transición.', block_position: 3, block_format: 'hyrox_sim', block_title: 'Estación 2 · Sled Push', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPushMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 3 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 4, block_format: 'hyrox_sim', block_title: 'Run 3', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPull, params: { distance_m: HYROX.sledPullMeters }, notes: 'Estación 3 — Sled Pull 50m (carga Pro). Marcar parcial + transición.', block_position: 5, block_format: 'hyrox_sim', block_title: 'Estación 3 · Sled Pull', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPullMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 4 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 6, block_format: 'hyrox_sim', block_title: 'Run 4', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.burpeeBroadJump, params: { distance_m: HYROX.burpeeBroadJumpMeters }, notes: 'Estación 4 — Burpee Broad Jump 80m. Marcar parcial + transición.', block_position: 7, block_format: 'hyrox_sim', block_title: 'Estación 4 · Burpee Broad Jump', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.burpeeBroadJumpMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 5 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 8, block_format: 'hyrox_sim', block_title: 'Run 5', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.rowing, params: { distance_m: HYROX.rowMeters }, notes: 'Estación 5 — Row 1000m @1\'50/500m. Marcar parcial + transición.', block_position: 9, block_format: 'hyrox_sim', block_title: 'Estación 5 · Row', prescription: { scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'distance', meters: HYROX.rowMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 6 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 10, block_format: 'hyrox_sim', block_title: 'Run 6', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.farmersCarry, params: { distance_m: HYROX.farmersCarryMeters }, notes: 'Estación 6 — Farmers Carry 200m @2×32kg. Marcar parcial + transición.', block_position: 11, block_format: 'hyrox_sim', block_title: 'Estación 6 · Farmers Carry', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.farmersCarryMeters }, target: { kind: 'kg', value: HYROX.farmersCarryKgPerHand } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 7 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 12, block_format: 'hyrox_sim', block_title: 'Run 7', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sandbagLunges, params: { distance_m: HYROX.sandbagLungesMeters }, notes: 'Estación 7 — Sandbag Lunges 100m @30kg. Marcar parcial + transición.', block_position: 13, block_format: 'hyrox_sim', block_title: 'Estación 7 · Sandbag Lunges', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sandbagLungesMeters }, target: { kind: 'kg', value: HYROX.sandbagLungesKg } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 8 — 1km @3\'40-3\'50/km. Marcar parcial.', block_position: 14, block_format: 'hyrox_sim', block_title: 'Run 8', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.wallBalls, params: { reps: HYROX.wallBallReps }, notes: 'Estación 8 — Wall Balls ×100 @9kg. Marcar parcial final.', block_position: 15, block_format: 'hyrox_sim', block_title: 'Estación 8 · Wall Balls', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'reps', value: HYROX.wallBallReps }, target: { kind: 'kg', value: HYROX.wallBallKg } }] } },
      ],
    },
    // ── Domingo — Bike Z1 regenerativo ──
    {
      name: 'Bike Z1 regenerativo',
      format: 'tempo',
      day_position: 'sunday',
      day_of_week: 7,
      methodology_group_id: 5,
      warmup: '',
      cooldown: 'Movilidad',
      coach_notes: 'CAPA1 — Bike Z1 regenerativo / descanso. Recuperación post-simulación, soltar piernas. Movilidad.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Carga ligera + Simulación' },
        source: 'Plantilla_HYROX_12sem · Semana 10 · Domingo',
        maps_to_block: 'g5 bike Z1 regenerativo (1h)',
      },
      segments: [
        { exercise_id: EX.bikeerg, params: { time_seconds: 3600 }, notes: '1h bike Z1 regenerativo (o descanso)', block_position: 0, block_format: 'tempo', block_title: 'Regenerativo Z1', prescription: { ...steadyZ(3600, 1), modality: 'bike' } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SEMANA 11 — REALIZACIÓN · TAPERING (7-10 días)
//   Mantener intensidad (ritmos/%RM), reducir volumen (series, km, rondas).
// ═══════════════════════════════════════════════════════════════════════════
const SEMANA_11: WeekSpec = {
  week_number: 11,
  week_name: 'Semana 11 — Realización · Tapering',
  focus:
    'Microciclo de TAPERING (7-10 días, macrociclo REALIZACIÓN). SEMANA DE DESCARGA: mantener ' +
    'intensidad (ritmos/%RM), recortar mucho volumen (series, km, rondas). Lunes DESCANSO COMPLETO; ' +
    'martes threshold corto en cinta a ritmo carrera (afilar, poco volumen); miércoles WOD corto AFAP ' +
    'con estaciones a ritmo de carrera; jueves DESCANSO COMPLETO; viernes intervalos on/off cortos por ' +
    'estación (recordar intensidades, volumen mínimo); sábado ergómetros Z2 muy suave + preventivos; ' +
    'domingo carrera Z2 corta.',
  coach_notes:
    'Semana 11 importada de Plantilla_HYROX_12sem · hoja "Semana 11". TAPERING: intensidad alta, ' +
    'volumen bajo. Capa 1 (lógica de día) en coach_notes de cada template; capa 2 (sesión detallada ' +
    'Pablo, ritmos/%RM/zonas) en los segmentos con prescription_json. Dos días de descanso completo (lun, jue).',
  source_sheet: 'Plantilla_HYROX_12sem · Semana 11',
  new_blocks: [
    {
      // GAP: short AFAP WOD with race-pace stations (squat+sled+run+burpee) for taper.
      slug: 'w11-wod-corto-afap-squat-sled-run-burpee',
      title: 'WOD corto AFAP: squat/sled/run/burpee a ritmo carrera (Semana 11)',
      description:
        '3\' ski/row/AB + 400m easy run. 6 rounds AFAP: 8 back squat 75% + 12,5m sled push 260kg + ' +
        '2\' run 3\'50/km + 10 burpee BBJ. Intensidad de competición, volumen recortado (tapering).',
      methodology_group_id: 6,
      format: 'for_time',
      atr_block_hint: 'REAL',
      source_ref: 'Plantilla_HYROX_12sem · Semana 11 · Miércoles (CAPA2)',
      exercises: [
        { exercise_id: EX.backSquat, params: { sets: 6, reps: 8 }, reps_scheme: '8 @75%', notes: '6 rounds AFAP: 8 back squat 75%', prescription: { scheme: 'rounds', modality: 'strength', rounds: 6, sets: [{ measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } }] } },
        { exercise_id: EX.sledPush, params: { sets: 6, distance_m: 12.5 }, reps_scheme: '12,5m', notes: '6 rounds AFAP: 12,5m sled push 260kg', prescription: { scheme: 'rounds', modality: 'functional', rounds: 6, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 260 } }] } },
        { exercise_id: EX.run, params: { sets: 6, time_seconds: 120 }, reps_scheme: '2\'', notes: '6 rounds AFAP: 2\' run 3\'50/km', prescription: { scheme: 'rounds', modality: 'run', rounds: 6, sets: [{ measure: { kind: 'duration', seconds: 120 }, target: { kind: 'pace', unit: 'per_km', value_s: RUN_WOD_PACE_S } }] } },
        { exercise_id: EX.burpeeBroadJump, params: { sets: 6, reps: 10 }, reps_scheme: '10', notes: '6 rounds AFAP: 10 burpee BBJ', prescription: { scheme: 'rounds', modality: 'functional', rounds: 6, sets: [{ measure: { kind: 'reps', value: 10 } }] } },
      ],
    },
    {
      // GAP: per-station on/off intervals (3×1' on/1' off) at race pace for taper sharpening.
      slug: 'w11-intervalos-on-off-por-estacion',
      title: 'Intervalos on/off por estación a ritmo de carrera (Semana 11)',
      description:
        'Warm up ergos 15\'. 3×(1\' on / 1\' off) por estación (ski, row, AB, sled) a ritmo de carrera. ' +
        'Volumen mínimo, intensidad de competición — recordar intensidades en tapering.',
      methodology_group_id: 7,
      format: 'intervals',
      atr_block_hint: 'REAL',
      source_ref: 'Plantilla_HYROX_12sem · Semana 11 · Viernes (CAPA2)',
      exercises: [
        { exercise_id: EX.skierg, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, reps_scheme: '3×1\'on/1\'off', notes: 'Ski: 3×1\' on/1\' off a ritmo carrera (1\'55/500m)', prescription: { scheme: 'interval', modality: 'ski', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } } },
        { exercise_id: EX.rowing, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, reps_scheme: '3×1\'on/1\'off', notes: 'Row: 3×1\' on/1\' off a ritmo carrera (1\'50/500m)', prescription: { scheme: 'interval', modality: 'row', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } } },
        { exercise_id: EX.assaultBike, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, reps_scheme: '3×1\'on/1\'off', notes: 'AB: 3×1\' on/1\' off a ritmo carrera (RPE9)', prescription: { scheme: 'interval', modality: 'bike', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'rpe', value: 9 } } },
        { exercise_id: EX.sledPush, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, reps_scheme: '3×1\'on/1\'off', notes: 'Sled push: 3×1\' on/1\' off a ritmo carrera (RPE9)', prescription: { scheme: 'interval', modality: 'functional', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'rpe', value: 9 } } },
      ],
    },
  ],
  sessions: [
    // ── Lunes — DESCANSO COMPLETO (rest, empty session) ──
    // ── Martes — Threshold corto en cinta ──
    {
      name: 'Threshold corto en cinta',
      format: 'intervals',
      day_position: 'tuesday',
      day_of_week: 2,
      methodology_group_id: 4,
      warmup: 'Warm up 8\'',
      cooldown: '5\' cool down',
      coach_notes: 'CAPA1 — Threshold corto en cinta a ritmo carrera (afilar, poco volumen). Solo recordar ritmo, SIN fatigar.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Tapering' },
        source: 'Plantilla_HYROX_12sem · Semana 11 · Martes',
        maps_to_block: 'g4 threshold cinta (4×2\'30" a 17 km/h / 2\' trote 11 km/h, inclinación 1)',
        notes_intensity: 'Mantener intensidad, recortar volumen (tapering).',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 480 }, notes: 'Warm up 8\'', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: { ...steadyRpe(480, 4), modality: 'run' } },
        { exercise_id: EX.run, params: { sets: 4, work_seconds: 150, rest_seconds: 120 }, notes: '4×2\'30" a 17 km/h / 2\' trote 11 km/h. Inclinación 1. Solo recordar ritmo, sin fatigar.', block_position: 1, block_format: 'intervals', block_title: 'Threshold 4×2\'30"', prescription: { scheme: 'interval', modality: 'run', rounds: 4, work_s: 150, rest_s: 120, target: { kind: 'pace', unit: 'per_km', value_s: RUN_THRESHOLD_FAST_S } } },
        { exercise_id: EX.run, params: { time_seconds: 300 }, notes: '5\' cool down', block_position: 2, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: { ...steadyRpe(300, 3), modality: 'run' } },
      ],
    },
    // ── Miércoles — WOD corto AFAP ──
    {
      name: 'WOD corto AFAP · squat/sled/run/burpee',
      format: 'for_time',
      day_position: 'wednesday',
      day_of_week: 3,
      methodology_group_id: 6,
      warmup: '3\' ski/row/AB + 400m easy run',
      cooldown: 'Soltar + movilidad',
      coach_notes: 'CAPA1 — WOD corto AFAP con estaciones a ritmo de carrera. Intensidad de competición, volumen recortado (tapering).',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Tapering' },
        source: 'Plantilla_HYROX_12sem · Semana 11 · Miércoles',
        maps_to_block: ['w11-wod-corto-afap-squat-sled-run-burpee (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.skierg, params: { time_seconds: 180 }, notes: 'Warm up: 3\' ski/row/AB', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: { ...steadyRpe(180, 4), modality: 'ski' } },
        { exercise_id: EX.run, params: { distance_m: 400 }, notes: 'Warm up: 400m easy run', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: { scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 400 }, target: { kind: 'rpe', value: 4 } }] } },
        { exercise_id: EX.backSquat, params: { sets: 6, reps: 8 }, notes: '6 rounds AFAP: 8 back squat 75%', block_position: 1, block_format: 'for_time', block_title: 'WOD 6 rounds AFAP', prescription: { scheme: 'rounds', modality: 'strength', rounds: 6, sets: [{ measure: { kind: 'reps', value: 8 }, target: { kind: 'percent_rm', value: 75 } }] } },
        { exercise_id: EX.sledPush, params: { sets: 6, distance_m: 12.5 }, notes: '6 rounds AFAP: 12,5m sled push 260kg', block_position: 1, block_format: 'for_time', block_title: 'WOD 6 rounds AFAP', prescription: { scheme: 'rounds', modality: 'functional', rounds: 6, sets: [{ measure: { kind: 'distance', meters: 12.5 }, target: { kind: 'kg', value: 260 } }] } },
        { exercise_id: EX.run, params: { sets: 6, time_seconds: 120 }, notes: '6 rounds AFAP: 2\' run 3\'50/km', block_position: 1, block_format: 'for_time', block_title: 'WOD 6 rounds AFAP', prescription: { scheme: 'rounds', modality: 'run', rounds: 6, sets: [{ measure: { kind: 'duration', seconds: 120 }, target: { kind: 'pace', unit: 'per_km', value_s: RUN_WOD_PACE_S } }] } },
        { exercise_id: EX.burpeeBroadJump, params: { sets: 6, reps: 10 }, notes: '6 rounds AFAP: 10 burpee BBJ', block_position: 1, block_format: 'for_time', block_title: 'WOD 6 rounds AFAP', prescription: { scheme: 'rounds', modality: 'functional', rounds: 6, sets: [{ measure: { kind: 'reps', value: 10 } }] } },
      ],
    },
    // ── Jueves — DESCANSO COMPLETO (rest, empty session) ──
    // ── Viernes — Intervalos on/off por estación ──
    {
      name: 'Intervalos on/off por estación',
      format: 'intervals',
      day_position: 'friday',
      day_of_week: 5,
      methodology_group_id: 7,
      warmup: 'Warm up ergos 15\'',
      cooldown: 'Soltar suave',
      coach_notes: 'CAPA1 — Intervalos on/off cortos por estación (recordar intensidades). Volumen mínimo, intensidad de competición.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Tapering' },
        source: 'Plantilla_HYROX_12sem · Semana 11 · Viernes',
        maps_to_block: ['w11-intervalos-on-off-por-estacion (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.rowing, params: { time_seconds: 900 }, notes: 'Warm up ergos 15\'', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento ergos', prescription: { ...steadyRpe(900, 4), modality: 'row' } },
        { exercise_id: EX.skierg, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, notes: 'Ski: 3×1\' on/1\' off a ritmo carrera (1\'55/500m)', block_position: 1, block_format: 'intervals', block_title: 'On/off por estación', prescription: { scheme: 'interval', modality: 'ski', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } } },
        { exercise_id: EX.rowing, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, notes: 'Row: 3×1\' on/1\' off a ritmo carrera (1\'50/500m)', block_position: 1, block_format: 'intervals', block_title: 'On/off por estación', prescription: { scheme: 'interval', modality: 'row', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } } },
        { exercise_id: EX.assaultBike, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, notes: 'AB: 3×1\' on/1\' off a ritmo carrera', block_position: 1, block_format: 'intervals', block_title: 'On/off por estación', prescription: { scheme: 'interval', modality: 'bike', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'rpe', value: 9 } } },
        { exercise_id: EX.sledPush, params: { sets: 3, work_seconds: 60, rest_seconds: 60 }, notes: 'Sled push: 3×1\' on/1\' off a ritmo carrera', block_position: 1, block_format: 'intervals', block_title: 'On/off por estación', prescription: { scheme: 'interval', modality: 'functional', rounds: 3, work_s: 60, rest_s: 60, target: { kind: 'rpe', value: 9 } } },
      ],
    },
    // ── Sábado — Ergómetros Z2 suave + preventivos ──
    {
      name: 'Ergómetros Z2 suave + preventivos',
      format: 'tempo',
      day_position: 'saturday',
      day_of_week: 6,
      methodology_group_id: 5,
      warmup: 'Movilidad',
      cooldown: 'Plio y preventivos ligeros',
      coach_notes: 'CAPA1 — Ergómetros Z2 muy suave + preventivos. Mantener movimiento, sin carga. Plio y preventivos ligeros.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Tapering' },
        source: 'Plantilla_HYROX_12sem · Semana 11 · Sábado',
        maps_to_block: 'COMPOSICION ergómetros Z2 suave (g5) — row+ski+run',
      },
      segments: [
        { exercise_id: EX.rowing, params: { time_seconds: 600 }, notes: '10\' row Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2 suave', prescription: { ...steadyZ(600, 2), modality: 'row' } },
        { exercise_id: EX.skierg, params: { time_seconds: 600 }, notes: '10\' ski Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2 suave', prescription: { ...steadyZ(600, 2), modality: 'ski' } },
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' run Z2', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2 suave', prescription: { ...steadyZ(600, 2), modality: 'run' } },
      ],
    },
    // ── Domingo — Carrera Z2 corta ──
    {
      name: 'Carrera Z2 corta',
      format: 'tempo',
      day_position: 'sunday',
      day_of_week: 7,
      methodology_group_id: 5,
      warmup: '',
      cooldown: 'Movilidad',
      coach_notes: 'CAPA1 — Carrera Z2 corta. 1h Z2 RPE3 (o 40\' si se compite el finde siguiente). Soltar piernas.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Tapering' },
        source: 'Plantilla_HYROX_12sem · Semana 11 · Domingo',
        maps_to_block: 'g5 carrera Z2 corta (1h o 40\' RPE3)',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 3600 }, notes: '1h Z2 RPE3 (o 40\' si se compite el finde siguiente)', block_position: 0, block_format: 'tempo', block_title: 'Carrera Z2', prescription: { scheme: 'steady', modality: 'run', total_s: 3600, target: { kind: 'hr_zone', value: 2 } } },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SEMANA 12 — REALIZACIÓN · COMPETICIÓN (activación y puesta a punto)
// ═══════════════════════════════════════════════════════════════════════════
const SEMANA_12: WeekSpec = {
  week_number: 12,
  week_name: 'Semana 12 — Realización · Competición',
  focus:
    'Microciclo de COMPETICIÓN (macrociclo REALIZACIÓN). Activación y puesta a punto. Lunes apertura: ' +
    'ritmos de carrera y estaciones a intensidad de competición (muy corto); martes carrera Z2 muy suave ' +
    '(soltar piernas); miércoles EMOM corto de ergómetros a ritmo de carrera (recordatorio); jueves descanso ' +
    '(o activación según día de carrera); viernes activación (easy run 4km + sprints cortos); sábado ' +
    'COMPETICIÓN HYROX (ejecutar a ritmos objetivo de los tests); domingo descanso completo.',
  coach_notes:
    'Semana 12 importada de Plantilla_HYROX_12sem · hoja "Semana 12". COMPETICIÓN: volúmenes muy bajos, ' +
    'recordatorios de ritmo, llegar fresco y afilado. Capa 1 (lógica de día) en coach_notes de cada template; ' +
    'capa 2 (sesión detallada Pablo, ritmos/zonas) en los segmentos con prescription_json. El sábado es la ' +
    'competición real (no simulación): calentamiento de competición + ejecutar a ritmos objetivo de los tests.',
  source_sheet: 'Plantilla_HYROX_12sem · Semana 12',
  new_blocks: [
    {
      // GAP: race-pace opener (on/off at competition speeds across modalities).
      slug: 'w12-apertura-ritmos-on-off',
      title: 'Apertura ritmos: on/off a intensidades de competición (Semana 12)',
      description:
        'Warm up 3\' bike/row/ski. 2×(1\'30" on / 1\' off) a ritmos de competición: run 3\'40-3\'50/km, ' +
        'ski 1\'55/500m, sled push 280kg, row 1\'50/500m. Muy corto — abrir piernas y recordar ritmos.',
      methodology_group_id: 7,
      format: 'intervals',
      atr_block_hint: 'REAL',
      source_ref: 'Plantilla_HYROX_12sem · Semana 12 · Lunes (CAPA2)',
      exercises: [
        { exercise_id: EX.run, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, reps_scheme: '2×1\'30"on/1\'off', notes: 'Run: 2×1\'30" on/1\' off @3\'40-3\'50/km', prescription: { scheme: 'interval', modality: 'run', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_km', min_s: RUN_RACE_PACE_MIN_S, max_s: RUN_RACE_PACE_MAX_S } } },
        { exercise_id: EX.skierg, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, reps_scheme: '2×1\'30"on/1\'off', notes: 'Ski: 2×1\'30" on/1\' off @1\'55/500m', prescription: { scheme: 'interval', modality: 'ski', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } } },
        { exercise_id: EX.rowing, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, reps_scheme: '2×1\'30"on/1\'off', notes: 'Row: 2×1\'30" on/1\' off @1\'50/500m', prescription: { scheme: 'interval', modality: 'row', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } } },
        { exercise_id: EX.sledPush, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, reps_scheme: '2×1\'30"on/1\'off', notes: 'Sled push: 2×1\'30" on/1\' off 280kg', prescription: { scheme: 'interval', modality: 'functional', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'kg', value: 280 } } },
      ],
    },
  ],
  sessions: [
    // ── Lunes — Apertura ritmos ──
    {
      name: 'Apertura ritmos de competición',
      format: 'intervals',
      day_position: 'monday',
      day_of_week: 1,
      methodology_group_id: 7,
      warmup: 'Warm up 3\' bike/row/ski',
      cooldown: 'Soltar',
      coach_notes: 'CAPA1 — Apertura: ritmos de carrera y estaciones a intensidad de competición (muy corto). Abrir piernas, recordar ritmos.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Lunes',
        maps_to_block: ['w12-apertura-ritmos-on-off (NUEVO, needs_review)'],
        uses_result: ['ritmo_3min', 'ritmo_9min', 'ritmo_umbral_30min'],
      },
      segments: [
        { exercise_id: EX.bikeerg, params: { time_seconds: 180 }, notes: 'Warm up 3\' bike/row/ski', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: { ...steadyRpe(180, 4), modality: 'bike' } },
        { exercise_id: EX.run, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, notes: 'Run: 2×1\'30" on/1\' off @3\'40-3\'50/km', block_position: 1, block_format: 'intervals', block_title: 'Apertura ritmos', prescription: { scheme: 'interval', modality: 'run', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_km', min_s: RUN_RACE_PACE_MIN_S, max_s: RUN_RACE_PACE_MAX_S } } },
        { exercise_id: EX.skierg, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, notes: 'Ski: 2×1\'30" on/1\' off @1\'55/500m', block_position: 1, block_format: 'intervals', block_title: 'Apertura ritmos', prescription: { scheme: 'interval', modality: 'ski', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } } },
        { exercise_id: EX.rowing, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, notes: 'Row: 2×1\'30" on/1\' off @1\'50/500m', block_position: 1, block_format: 'intervals', block_title: 'Apertura ritmos', prescription: { scheme: 'interval', modality: 'row', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } } },
        { exercise_id: EX.sledPush, params: { sets: 2, work_seconds: 90, rest_seconds: 60 }, notes: 'Sled push: 2×1\'30" on/1\' off 280kg', block_position: 1, block_format: 'intervals', block_title: 'Apertura ritmos', prescription: { scheme: 'interval', modality: 'functional', rounds: 2, work_s: 90, rest_s: 60, target: { kind: 'kg', value: 280 } } },
      ],
    },
    // ── Martes — Carrera suave ──
    {
      name: 'Carrera suave · soltar piernas',
      format: 'tempo',
      day_position: 'tuesday',
      day_of_week: 2,
      methodology_group_id: 5,
      warmup: '',
      cooldown: 'Movilidad',
      coach_notes: 'CAPA1 — Carrera Z2 muy suave (soltar piernas). 30\' Z2 RPE2-3 + movilidad.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Martes',
        maps_to_block: 'g5 carrera Z2 suave (30\' RPE2-3)',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 1800 }, notes: '30\' Z2 RPE2-3', block_position: 0, block_format: 'tempo', block_title: 'Carrera suave', prescription: { scheme: 'steady', modality: 'run', total_s: 1800, target: { kind: 'hr_zone', value: 2 } } },
      ],
    },
    // ── Miércoles — EMOM ritmo carrera ──
    {
      name: 'EMOM ergómetros a ritmo carrera',
      format: 'emom',
      day_position: 'wednesday',
      day_of_week: 3,
      methodology_group_id: 7,
      warmup: 'Movilidad + activación ergos',
      cooldown: 'Soltar',
      coach_notes: 'CAPA1 — EMOM corto de ergómetros a ritmo de carrera (recordatorio). EMOM 20\' 45" on / 15" off. Sensaciones de ritmo, SIN fatiga.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Miércoles',
        maps_to_block: 'g7 EMOM 20\' ergómetros (45" on/15" off, row 1\'40-1\'45 / ski 1\'50-1\'55)',
      },
      segments: [
        { exercise_id: EX.rowing, params: { sets: 10, work_seconds: 45, rest_seconds: 15 }, notes: 'EMOM 20\' (impares): Row 45" on/15" off @1\'40-1\'45/500m', block_position: 0, block_format: 'emom', block_title: 'EMOM 20\' (45" on/15" off)', prescription: { scheme: 'emom', modality: 'row', rounds: 10, work_s: 45, rest_s: 15, target: { kind: 'pace', unit: 'per_500m', min_s: 100, max_s: 105 } } },
        { exercise_id: EX.skierg, params: { sets: 10, work_seconds: 45, rest_seconds: 15 }, notes: 'EMOM 20\' (pares): Ski 45" on/15" off @1\'50-1\'55/500m', block_position: 0, block_format: 'emom', block_title: 'EMOM 20\' (45" on/15" off)', prescription: { scheme: 'emom', modality: 'ski', rounds: 10, work_s: 45, rest_s: 15, target: { kind: 'pace', unit: 'per_500m', min_s: 110, max_s: 115 } } },
      ],
    },
    // ── Jueves — DESCANSO (rest, empty session) ──
    // ── Viernes — Activación pre-carrera ──
    {
      name: 'Activación pre-carrera · easy run + strides',
      format: 'intervals',
      day_position: 'friday',
      day_of_week: 5,
      methodology_group_id: 10,
      warmup: 'Movilidad',
      cooldown: 'Soltar',
      coach_notes: 'CAPA1 — Activación: easy run 4km + algún sprint corto. Easy run 4km RPE3 + 4-5 strides de 30". Piernas listas para competir.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Viernes',
        maps_to_block: 'g10 activación pre-carrera (4km RPE3 + 4-5 strides 30")',
      },
      segments: [
        { exercise_id: EX.run, params: { distance_m: 4000 }, notes: 'Easy run 4km RPE3', block_position: 0, block_format: 'tempo', block_title: 'Activación aeróbica', prescription: { scheme: 'steady', modality: 'run', sets: [{ measure: { kind: 'distance', meters: 4000 }, target: { kind: 'rpe', value: 3 } }] } },
        { exercise_id: EX.run, params: { sets: 5, time_seconds: 30 }, notes: '4-5 strides de 30"', block_position: 1, block_format: 'intervals', block_title: 'Strides', prescription: { scheme: 'interval', modality: 'run', rounds: 5, work_s: 30 } },
      ],
    },
    // ── Sábado — COMPETICIÓN HYROX ──
    {
      name: 'COMPETICIÓN HYROX',
      format: 'hyrox_sim',
      day_position: 'saturday',
      day_of_week: 6,
      methodology_group_id: 7,
      warmup: 'Calentamiento de competición',
      cooldown: 'Recuperación post-competición',
      coach_notes: 'CAPA1 — COMPETICIÓN HYROX. Calentamiento de competición. Ejecutar a ritmos objetivo de los tests. ¡A por todas!',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Sábado',
        is_competition: true,
        maps_to_block: 'COMPETICIÓN real (ejecutar a ritmos objetivo de los tests, 8×1km + 8 estaciones orden oficial)',
        uses_result: ['ritmo_3min', 'ritmo_9min', 'ritmo_umbral_30min'],
        store_results: ['tiempo_total_competicion', 'parciales_oficiales'],
        race_order: 'run→ski→run→sled_push→run→sled_pull→run→burpee_bbj→run→row→run→farmer→run→lunges→run→wall_balls',
      },
      segments: [
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 1 — 1km a ritmo objetivo (test)', block_position: 0, block_format: 'hyrox_sim', block_title: 'Run 1', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.skierg, params: { distance_m: HYROX.skiMeters }, notes: 'Estación 1 — SkiErg 1000m @1\'55/500m', block_position: 1, block_format: 'hyrox_sim', block_title: 'Estación 1 · SkiErg', prescription: { scheme: 'steady', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: HYROX.skiMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: SKI_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 2 — 1km a ritmo objetivo', block_position: 2, block_format: 'hyrox_sim', block_title: 'Run 2', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPush, params: { distance_m: HYROX.sledPushMeters }, notes: 'Estación 2 — Sled Push 50m (carga Pro)', block_position: 3, block_format: 'hyrox_sim', block_title: 'Estación 2 · Sled Push', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPushMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 3 — 1km a ritmo objetivo', block_position: 4, block_format: 'hyrox_sim', block_title: 'Run 3', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sledPull, params: { distance_m: HYROX.sledPullMeters }, notes: 'Estación 3 — Sled Pull 50m (carga Pro)', block_position: 5, block_format: 'hyrox_sim', block_title: 'Estación 3 · Sled Pull', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sledPullMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 4 — 1km a ritmo objetivo', block_position: 6, block_format: 'hyrox_sim', block_title: 'Run 4', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.burpeeBroadJump, params: { distance_m: HYROX.burpeeBroadJumpMeters }, notes: 'Estación 4 — Burpee Broad Jump 80m', block_position: 7, block_format: 'hyrox_sim', block_title: 'Estación 4 · Burpee Broad Jump', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.burpeeBroadJumpMeters } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 5 — 1km a ritmo objetivo', block_position: 8, block_format: 'hyrox_sim', block_title: 'Run 5', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.rowing, params: { distance_m: HYROX.rowMeters }, notes: 'Estación 5 — Row 1000m @1\'50/500m', block_position: 9, block_format: 'hyrox_sim', block_title: 'Estación 5 · Row', prescription: { scheme: 'steady', modality: 'row', sets: [{ measure: { kind: 'distance', meters: HYROX.rowMeters }, target: { kind: 'pace', unit: 'per_500m', value_s: ROW_RACE_PACE_S } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 6 — 1km a ritmo objetivo', block_position: 10, block_format: 'hyrox_sim', block_title: 'Run 6', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.farmersCarry, params: { distance_m: HYROX.farmersCarryMeters }, notes: 'Estación 6 — Farmers Carry 200m @2×32kg', block_position: 11, block_format: 'hyrox_sim', block_title: 'Estación 6 · Farmers Carry', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.farmersCarryMeters }, target: { kind: 'kg', value: HYROX.farmersCarryKgPerHand } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 7 — 1km a ritmo objetivo', block_position: 12, block_format: 'hyrox_sim', block_title: 'Run 7', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.sandbagLunges, params: { distance_m: HYROX.sandbagLungesMeters }, notes: 'Estación 7 — Sandbag Lunges 100m @30kg', block_position: 13, block_format: 'hyrox_sim', block_title: 'Estación 7 · Sandbag Lunges', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'distance', meters: HYROX.sandbagLungesMeters }, target: { kind: 'kg', value: HYROX.sandbagLungesKg } }] } },
        { exercise_id: EX.run, params: { distance_m: HYROX.runMeters }, notes: 'Run 8 — 1km a ritmo objetivo', block_position: 14, block_format: 'hyrox_sim', block_title: 'Run 8', prescription: runDistAtPace(HYROX.runMeters, RUN_RACE_PACE_MIN_S, RUN_RACE_PACE_MAX_S) },
        { exercise_id: EX.wallBalls, params: { reps: HYROX.wallBallReps }, notes: 'Estación 8 — Wall Balls ×100 @9kg. ¡A por todas!', block_position: 15, block_format: 'hyrox_sim', block_title: 'Estación 8 · Wall Balls', prescription: { scheme: 'steady', modality: 'functional', sets: [{ measure: { kind: 'reps', value: HYROX.wallBallReps }, target: { kind: 'kg', value: HYROX.wallBallKg } }] } },
      ],
    },
    // ── Domingo — DESCANSO COMPLETO ──
    {
      name: 'Descanso completo · recuperación post-competición',
      format: 'tempo',
      day_position: 'sunday',
      day_of_week: 7,
      methodology_group_id: 10,
      warmup: '',
      cooldown: '',
      coach_notes: 'CAPA1 — DESCANSO COMPLETO. Recuperación post-competición. Movilidad suave opcional.',
      meta_json: {
        atr: { macrocycle: 'REALIZACION', microcycle: 'Competición' },
        source: 'Plantilla_HYROX_12sem · Semana 12 · Domingo',
        maps_to_block: 'descanso completo (recuperación post-competición)',
        is_rest: true,
      },
      segments: [
        { exercise_id: EX.walk, params: { time_seconds: 1200 }, notes: 'Opcional: 20\' caminar suave + movilidad. Recuperación.', block_position: 0, block_format: 'tempo', block_title: 'Recuperación (opcional)', prescription: { scheme: 'steady', modality: 'other', total_s: 1200, target: { kind: 'rpe', value: 1 } } },
      ],
    },
  ],
};

const WEEKS: WeekSpec[] = [SEMANA_10, SEMANA_11, SEMANA_12];

// ── slots_json builder — copies week 51's EXACT shape (days[] keyed by
//    day_of_week 1-7; rest day → empty sessions; items carry exercise_name). ────
function buildSlotsJson(spec: WeekSpec, templateIdByDay: Map<number, number>) {
  const days: unknown[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    const session = spec.sessions.find((s) => s.day_of_week === dow);
    if (!session) {
      days.push({ day_of_week: dow, sessions: [] });
      continue;
    }
    const blockMap = new Map<number, { title: string; format: string; items: unknown[] }>();
    for (const seg of session.segments) {
      let b = blockMap.get(seg.block_position);
      if (!b) {
        b = { title: seg.block_title, format: seg.block_format, items: [] };
        blockMap.set(seg.block_position, b);
      }
      b.items.push({
        exercise_id: seg.exercise_id,
        exercise_name: undefined, // resolved below
        params_json: seg.params,
        notes: seg.notes,
      });
    }
    const blocks = [...blockMap.entries()]
      .sort((a, b2) => a[0] - b2[0])
      .map(([, b]) => ({ title: b.title, format: b.format, config_json: {}, items: b.items }));
    days.push({
      day_of_week: dow,
      sessions: [
        {
          kind: 'workout',
          focus: session.name,
          notes: session.coach_notes,
          template_id: templateIdByDay.get(dow),
          blocks,
        },
      ],
    });
  }
  return { days };
}

async function main() {
  const sql = getSql();

  // Validate every prescription against the shared Zod schema BEFORE touching DB.
  for (const spec of WEEKS) {
    for (const s of spec.sessions) {
      for (const seg of s.segments) parsePrescription(seg.prescription);
    }
    for (const b of spec.new_blocks) {
      for (const ex of b.exercises) parsePrescription(ex.prescription);
    }
  }

  // Resolve exercise names for slots_json (mirrors 51 which stores exercise_name).
  const exIds = [...new Set(Object.values(EX))];
  const nameRows = await sql<Array<{ id: number; name: string }>>`
    select id, name from exercises where id in ${sql(exIds)}
  `;
  const exName = new Map(nameRows.map((r) => [Number(r.id), r.name]));

  const report: Record<string, unknown> = {};

  for (const spec of WEEKS) {
    // ── Idempotent cleanup: drop this week + its templates + new blocks ──
    await sql`delete from program_week_templates where coach_id = ${COACH_ID} and name = ${spec.week_name}`;
    const tmplNames = spec.sessions.map((s) => s.name);
    await sql`
      delete from templates
      where coach_id = ${COACH_ID}
        and name in ${sql(tmplNames)}
        and meta_json->>'source' like ${spec.source_sheet + '%'}
    `;
    for (const b of spec.new_blocks) {
      await sql`delete from blocks where slug = ${b.slug}`;
    }

    // ── New blocks (gaps) ──
    const blockIds: number[] = [];
    for (const b of spec.new_blocks) {
      const [{ id: blockId } = { id: 0 }] = await sql<Array<{ id: number }>>`
        insert into blocks (slug, title, description, methodology_group_id, format, atr_block_hint, source_ref, coach_id, needs_review)
        values (${b.slug}, ${b.title}, ${b.description}, ${b.methodology_group_id}, ${b.format}, ${b.atr_block_hint}, ${b.source_ref}, ${COACH_ID}, true)
        returning id
      `;
      blockIds.push(Number(blockId));
      let pos = 0;
      for (const ex of b.exercises) {
        await sql`
          insert into block_exercises (block_id, position, block_position, exercise_id, params_json, reps_scheme, notes, prescription_json, needs_review)
          values (${blockId}, ${pos}, 0, ${ex.exercise_id}, ${sql.json(ex.params)}, ${ex.reps_scheme}, ${ex.notes}, ${sql.json(ex.prescription as unknown as Parameters<typeof sql.json>[0])}, true)
        `;
        pos++;
      }
    }

    // ── Session templates + segments ──
    const templateIdByDay = new Map<number, number>();
    const templateIds: number[] = [];
    for (const s of spec.sessions) {
      const [{ id: tmplId } = { id: 0 }] = await sql<Array<{ id: number }>>`
        insert into templates (coach_id, name, format, target_block, day_position, methodology_group_id, warmup, cooldown, coach_notes, meta_json)
        values (${COACH_ID}, ${s.name}, ${s.format}, 'REAL', ${s.day_position}, ${s.methodology_group_id}, ${s.warmup || null}, ${s.cooldown || null}, ${s.coach_notes}, ${sql.json(s.meta_json as Parameters<typeof sql.json>[0])})
        returning id
      `;
      const id = Number(tmplId);
      templateIdByDay.set(s.day_of_week, id);
      templateIds.push(id);
      let pos = 0;
      for (const seg of s.segments) {
        await sql`
          insert into template_segments (template_id, position, exercise_id, params_json, notes, block_position, block_format, block_title, prescription_json)
          values (${id}, ${pos}, ${seg.exercise_id}, ${sql.json(seg.params)}, ${seg.notes}, ${seg.block_position}, ${seg.block_format}, ${seg.block_title}, ${sql.json(seg.prescription as unknown as Parameters<typeof sql.json>[0])})
        `;
        pos++;
      }
    }

    // ── slots_json (51-shape) with resolved exercise_name ──
    const slots = buildSlotsJson(spec, templateIdByDay) as { days: Array<{ sessions: Array<{ blocks?: Array<{ items: Array<{ exercise_id: number; exercise_name?: string }> }> }> }> };
    for (const d of slots.days) {
      for (const sess of d.sessions) {
        for (const blk of sess.blocks ?? []) {
          for (const it of blk.items) {
            const n = exName.get(it.exercise_id);
            if (n !== undefined) it.exercise_name = n;
          }
        }
      }
    }

    const [{ id: weekId } = { id: 0 }] = await sql<Array<{ id: number }>>`
      insert into program_week_templates (coach_id, name, level, atr_block_hint, athlete_profile, week_number, focus, coach_notes, slots_json)
      values (${COACH_ID}, ${spec.week_name}, 'pro', 'REAL', 'balanced', ${spec.week_number}, ${spec.focus}, ${spec.coach_notes}, ${sql.json(slots as Parameters<typeof sql.json>[0])})
      returning id
    `;

    report[`week_${spec.week_number}`] = {
      week_template_id: Number(weekId),
      template_ids: templateIds,
      block_ids: blockIds,
    };
  }

  console.log(JSON.stringify(report, null, 2));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
