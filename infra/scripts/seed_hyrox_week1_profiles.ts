/**
 * Seed Week-1 PROFILE VARIANTS of the HYROX 12-week plan.
 *
 * Source: docs/Plantilla_HYROX_12sem_perfiles.xlsx
 *   · "Res S1" → endurance_focus (Perfil 2: fuerte, poca base aeróbica)
 *   · "Fue S1" → strength_focus  (Perfil 3: runner, poca fuerza)
 *
 * The BALANCED variant of Week 1 already exists as program_week_templates id 51
 * (coach_id 4, templates 76-81). This script builds the two sibling variants for
 * the SAME week_number=1 microcycle (ATR ACUMULACIÓN), mirroring 51's exact row
 * shapes: 6 session `templates` (Lun-Sáb; Dom rest), their `template_segments`
 * with structured `prescription_json` (validated against @fahybrid/shared/domain/
 * prescription), and one `program_week_templates` row per profile whose
 * slots_json copies 51's structure verbatim (params_json + notes per item; the
 * structured per-set model lives in template_segments, exactly as in 51).
 *
 * CAPA 1 (day logic, incl. the [+]/[=] priority marker) → template.coach_notes
 *   + session.notes in slots_json.
 * CAPA 2 (Pablo's detailed example, %RM/RPE) → segments + prescription_json.
 *
 * Genuine gaps (a profile-specific session with no matching library block) get a
 * new `blocks` row with needs_review=true; everything else references existing
 * block slugs in meta_json.maps_to_block (same convention as 51). No exercises
 * are created — every line maps to the existing catalog.
 *
 * Idempotent: re-runs delete the two profile weeks + their templates by name and
 * rebuild. Week 51 (balanced) is never touched.
 *
 * Run: pnpm --filter @fahybrid/infra exec tsx scripts/seed_hyrox_week1_profiles.ts
 */
import { parsePrescription } from '@fahybrid/shared/domain/prescription';
import type { Prescription } from '@fahybrid/shared/domain/prescription';
import { getSql } from './_db.js';

const COACH_ID = 4;

// ── Exercise catalog ids (resolved from DB; every line maps — see report) ─────
const EX = {
  run: 3479,
  walk: 3571,
  rowing: 3481,
  skierg: 3480,
  bikeerg: 3482,
  hipMobility: 2807,
  runDrills: 3572,
  backSquat: 3484,
  hipThrust: 3493,
  bulgarianSplitSquat: 3500,
  powerClean: 3494,
  boxJump: 3512,
  sledPush: 2,
  walkingLunge: 3498,
  wallBalls: 8,
  overheadPress: 3488, // Shoulder Press
  pullUp: 3492,
  dip: 3573,
  turkishGetUp: 3505,
} as const;

type SegmentSpec = {
  exercise_id: number;
  params: Record<string, number>;
  notes: string;
  block_position: number;
  block_format: string; // template_segments.block_format (free text, mirrors 51)
  block_title: string;
  prescription: Prescription;
};

type SessionTemplateSpec = {
  name: string;
  format: 'intervals' | 'strength_block' | 'tempo' | 'circuit';
  target_block: 'ACC';
  day_position:
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday';
  day_of_week: number; // 1=Mon .. 6=Sat
  methodology_group_id: number;
  warmup: string;
  cooldown: string;
  coach_notes: string; // CAPA 1 day logic, INCLUDING [+]/[=] marker
  meta_json: Record<string, unknown>;
  segments: SegmentSpec[];
};

type ProfileWeekSpec = {
  athlete_profile: 'strength_focus' | 'endurance_focus';
  week_name: string;
  focus: string;
  coach_notes: string;
  source_sheet: string;
  sessions: SessionTemplateSpec[];
  // New blocks to create for genuine gaps (needs_review=true). Referenced by
  // slug from session meta_json. Block exercises carry prescription_json too.
  new_blocks: NewBlockSpec[];
};

type NewBlockSpec = {
  slug: string;
  title: string;
  description: string;
  methodology_group_id: number;
  format: string;
  atr_block_hint: 'ACC';
  source_ref: string;
  exercises: Array<{
    exercise_id: number;
    params: Record<string, number>;
    reps_scheme: string | null;
    notes: string;
    prescription: Prescription;
  }>;
};

// ── Shared prescription builders (steady run/erg work mirrors 51 exactly: no
//    hr_zone set even when notes say Z2 — 51's canonical rows omit it). ────────
const steady = (total_s: number): Prescription => ({ scheme: 'steady', total_s });
const interval = (rounds: number, work_s: number, rest_s?: number): Prescription =>
  rest_s === undefined
    ? { scheme: 'interval', rounds, work_s }
    : { scheme: 'interval', rounds, work_s, rest_s };

// ═══════════════════════════════════════════════════════════════════════════
// RES S1 — endurance_focus (Perfil 2: fuerte, poca base aeróbica)
//   Prioriza aeróbico [+]; fuerza en mantenimiento [=].
// ═══════════════════════════════════════════════════════════════════════════
const RES_S1: ProfileWeekSpec = {
  athlete_profile: 'endurance_focus',
  week_name: 'Semana 1 — Acumulación · Tests · Resistencia',
  focus:
    'Microciclo de Carga + Tests (ATR ACUMULACIÓN) — variante RESISTENCIA (Perfil 2: ' +
    'fuerte, poca base aeróbica). Mismo esqueleto que la semana base: lunes y miércoles ' +
    'fijan ritmos (test 3\'/9\' y test umbral 30\'). Diferencias de perfil: martes fuerza ' +
    'inferior EN MANTENIMIENTO [=] (sin progresión agresiva); se AÑADEN tres estímulos ' +
    'aeróbicos [+] — jueves carrera de calidad, viernes ergómetros Z2, sábado largo mixto ' +
    'Z2 ampliado — para construir la base aeróbica que le falta. Domingo descanso.',
  coach_notes:
    'Variante RESISTENCIA de la Semana 1 (Plantilla_HYROX_12sem_perfiles · hoja "Res S1"). ' +
    'Capa 1 (lógica de día, con marcador [+]/[=]) en coach_notes de cada template; capa 2 ' +
    '(sesión detallada Pablo, %RM+RPE) en los segmentos con prescription_json. Tests almacenan ritmos.',
  source_sheet: 'Plantilla_HYROX_12sem_perfiles · Res S1',
  new_blocks: [
    {
      // GAP: maintenance lower-body block (3r squat 8/6/6 + hip thrust + row Z2)
      // — the library has heavy/accumulation lower-body blocks, not a
      // maintenance-dose one for an endurance-focus athlete.
      slug: 'res-s1-fuerza-inferior-mantenimiento',
      title: 'Fuerza inferior EN MANTENIMIENTO (Perfil Resistencia)',
      description:
        'Dosis de mantenimiento de fuerza para atleta con foco resistencia: Back Squat ' +
        '3 rounds 8/6/6 @70-75% / 2\' rest, Hip Thrust 3 rounds 10/8/8, Row 10\' técnica Z2. ' +
        'Conservar fuerza sin progresión agresiva.',
      methodology_group_id: 1,
      format: 'strength_block',
      atr_block_hint: 'ACC',
      source_ref: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Martes (CAPA2)',
      exercises: [
        {
          exercise_id: EX.backSquat,
          params: { sets: 3, rest_seconds: 120 },
          reps_scheme: '8/6/6',
          notes: '3 rounds Back Squat 8/6/6 @70-75% / 2\' rest. Mantenimiento.',
          prescription: {
            scheme: 'sets',
            sets: [
              { reps: 8, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 },
              { reps: 6, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 },
              { reps: 6, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 },
            ],
          },
        },
        {
          exercise_id: EX.hipThrust,
          params: { sets: 3 },
          reps_scheme: '10/8/8',
          notes: '3 rounds Hip Thrust 10/8/8.',
          prescription: {
            scheme: 'sets',
            sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }],
          },
        },
        {
          exercise_id: EX.rowing,
          params: { time_seconds: 600 },
          reps_scheme: null,
          notes: 'Row 10\' técnica Z2.',
          prescription: steady(600),
        },
      ],
    },
  ],
  sessions: [
    // ── Lunes — TEST 3'/9' (idéntico a la semana base) ──
    {
      name: 'Test carrera 3\'/9\' en pista',
      format: 'intervals',
      target_block: 'ACC',
      day_position: 'monday',
      day_of_week: 1,
      methodology_group_id: 4,
      warmup: 'Movilidad 10\' + técnica carrera 5\'',
      cooldown: '15\' cool down trote',
      coach_notes:
        'CAPA1 — TEST de carrera 3\'/9\' + activación. Fija ritmos (clave para todo el bloque). Almacenar ritmos de ambos tests.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Lunes',
        maps_to_block: 'g4-test-pista-3-9',
        store_results: ['ritmo_3min', 'ritmo_9min'],
      },
      segments: [
        { exercise_id: EX.hipMobility, params: { time_seconds: 600 }, notes: '10\' movilidad', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(600) },
        { exercise_id: EX.runDrills, params: { time_seconds: 300 }, notes: '5\' técnica carrera', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(300) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' easy run RPE5', block_position: 1, block_format: 'tempo', block_title: 'Activación', prescription: steady(900) },
        { exercise_id: EX.run, params: { time_seconds: 180 }, notes: '3\' RPE10 — marcar lap. ALMACENAR ritmo', block_position: 2, block_format: 'intervals', block_title: "TEST 3'", prescription: steady(180) },
        { exercise_id: EX.walk, params: { time_seconds: 600 }, notes: '10\' caminando', block_position: 3, block_format: 'tempo', block_title: 'Recuperación', prescription: steady(600) },
        { exercise_id: EX.run, params: { time_seconds: 540 }, notes: '9\' RPE10 — marcar lap. ALMACENAR ritmo', block_position: 4, block_format: 'intervals', block_title: "TEST 9'", prescription: steady(540) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' cool down trote', block_position: 5, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: steady(900) },
      ],
    },
    // ── Martes [=] — Fuerza inferior EN MANTENIMIENTO ──
    {
      name: 'Fuerza inferior (mantenimiento) + Row Z2',
      format: 'strength_block',
      target_block: 'ACC',
      day_position: 'tuesday',
      day_of_week: 2,
      methodology_group_id: 1,
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: 'Row 10\' técnica Z2',
      coach_notes:
        'CAPA1 — [=] Fuerza tren inferior EN MANTENIMIENTO + técnica de ergómetro suave.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Martes',
        profile_marker: '[=]',
        maps_to_block: ['res-s1-fuerza-inferior-mantenimiento (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.backSquat, params: { sets: 3, rest_seconds: 120 }, notes: '3 rounds Back Squat 8/6/6 @70-75% / 2\' rest. Mantenimiento, sin progresión agresiva.', block_position: 0, block_format: 'strength_block', block_title: 'A · Back Squat (mantenimiento)', prescription: { scheme: 'sets', sets: [ { reps: 8, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 }, { reps: 6, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 }, { reps: 6, load: { type: 'percent_rm', min: 70, max: 75 }, rest_s: 120 } ] } },
        { exercise_id: EX.hipThrust, params: { sets: 3 }, notes: '3 rounds Hip Thrust 10/8/8', block_position: 1, block_format: 'strength_block', block_title: 'B · Hip Thrust', prescription: { scheme: 'sets', sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }] } },
        { exercise_id: EX.rowing, params: { time_seconds: 600 }, notes: 'Row 10\' técnica Z2', block_position: 2, block_format: 'tempo', block_title: 'C · Row técnico Z2', prescription: steady(600) },
      ],
    },
    // ── Miércoles — TEST umbral 30' ──
    {
      name: 'Test umbral 30\' en pista',
      format: 'intervals',
      target_block: 'ACC',
      day_position: 'wednesday',
      day_of_week: 3,
      methodology_group_id: 4,
      warmup: 'Movilidad 10\' + técnica 5\'',
      cooldown: '10\' cool down RPE4',
      coach_notes:
        'CAPA1 — TEST de umbral (30\') + movilidad. Recoge ritmo sostenible. Almacenar ritmo medio.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Miércoles',
        maps_to_block: 'g4-test-pista-30-umbral',
        store_results: ['ritmo_umbral_30min'],
      },
      segments: [
        { exercise_id: EX.hipMobility, params: { time_seconds: 600 }, notes: '10\' movilidad', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(600) },
        { exercise_id: EX.runDrills, params: { time_seconds: 300 }, notes: '5\' técnica', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(300) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' easy run RPE5', block_position: 1, block_format: 'tempo', block_title: 'Activación', prescription: steady(900) },
        { exercise_id: EX.run, params: { time_seconds: 1800 }, notes: '30\' RPE10 — los últimos 20\' valen. ALMACENAR ritmo medio', block_position: 2, block_format: 'intervals', block_title: "TEST 30'", prescription: steady(1800) },
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' cool down RPE4', block_position: 3, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: steady(600) },
      ],
    },
    // ── Jueves [+] — Carrera de calidad AÑADIDA ──
    {
      name: 'Carrera calidad (extra) · Fartlek Z3-Z4',
      format: 'intervals',
      target_block: 'ACC',
      day_position: 'thursday',
      day_of_week: 4,
      methodology_group_id: 4,
      warmup: '10\' warm up RPE5',
      cooldown: '10\' cool down trote',
      coach_notes:
        'CAPA1 — [+] CARRERA DE CALIDAD añadida: fartlek suave para empezar a crear base.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Jueves',
        profile_marker: '[+]',
        maps_to_block: 'g4-38-fartlek (ADAPTADO: 5x4\' Z3-Z4 / 1\' Z2, RPE-based)',
        uses_result: 'ritmo_9min',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' warm up RPE5', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(600) },
        { exercise_id: EX.run, params: { sets: 5, rest_seconds: 60, time_seconds: 240 }, notes: '5×(4\' Z3-Z4 RPE6-7 / 1\' Z2). Construir motor sin vaciar.', block_position: 1, block_format: 'intervals', block_title: 'Fartlek', prescription: interval(5, 240, 60) },
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' cool down trote', block_position: 2, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: steady(600) },
      ],
    },
    // ── Viernes [+] — Ergómetros Z2 (extra) ──
    {
      name: 'Ergómetros Z2 (extra) · Row+Ski+Bike',
      format: 'tempo',
      target_block: 'ACC',
      day_position: 'friday',
      day_of_week: 5,
      methodology_group_id: 5,
      warmup: '',
      cooldown: '6×30" strides al final',
      coach_notes:
        'CAPA1 — [+] Día aeróbico de ergómetros Z2 (extra vs general). Volumen aeróbico de bajo impacto.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Viernes',
        profile_marker: '[+]',
        maps_to_block: 'COMPOSICION ergómetros Z2 (g5) — row+ski+bike, no existe bloque triple-ergo Z2',
      },
      segments: [
        { exercise_id: EX.rowing, params: { time_seconds: 900 }, notes: '15\' row Z2 RPE3-4', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: steady(900) },
        { exercise_id: EX.skierg, params: { time_seconds: 900 }, notes: '15\' ski Z2 RPE3-4', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: steady(900) },
        { exercise_id: EX.bikeerg, params: { time_seconds: 900 }, notes: '15\' bike Z2 RPE3-4', block_position: 0, block_format: 'tempo', block_title: 'Ergómetros Z2', prescription: steady(900) },
        { exercise_id: EX.run, params: { sets: 6, time_seconds: 30 }, notes: '6×30" strides al final', block_position: 1, block_format: 'intervals', block_title: 'Strides', prescription: interval(6, 30) },
      ],
    },
    // ── Sábado [+] — Día largo mixto Z2 AMPLIADO ──
    {
      name: 'Día largo mixto Z2 ampliado (run + bike)',
      format: 'tempo',
      target_block: 'ACC',
      day_position: 'saturday',
      day_of_week: 6,
      methodology_group_id: 5,
      warmup: 'Calentar trotando',
      cooldown: 'Enfriar trotando',
      coach_notes:
        'CAPA1 — [+] DÍA LARGO aeróbico MIXTO Z2 AMPLIADO (carrera + bike).',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Res S1 · Sábado',
        profile_marker: '[+]',
        maps_to_block: 'COMPOSICION run Z2 (g5) + bike — largo mixto ampliado (60+30), no existe bloque mixto',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 3600 }, notes: '60\' carrera Z2 RPE3-4', block_position: 0, block_format: 'tempo', block_title: 'Aeróbico Z2 mixto', prescription: steady(3600) },
        { exercise_id: EX.bikeerg, params: { time_seconds: 1800 }, notes: '30\' bike Z2 RPE3-4', block_position: 0, block_format: 'tempo', block_title: 'Aeróbico Z2 mixto', prescription: steady(1800) },
      ],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// FUE S1 — strength_focus (Perfil 3: runner, poca fuerza)
//   Prioriza fuerza [+]; aeróbico en mantenimiento [=].
// ═══════════════════════════════════════════════════════════════════════════
const FUE_S1: ProfileWeekSpec = {
  athlete_profile: 'strength_focus',
  week_name: 'Semana 1 — Acumulación · Tests · Fuerza',
  focus:
    'Microciclo de Carga + Tests (ATR ACUMULACIÓN) — variante FUERZA (Perfil 3: runner, ' +
    'poca fuerza). Mismo esqueleto que la semana base: lunes y miércoles fijan ritmos (test ' +
    '3\'/9\' y test umbral 30\'; los aeróbicos se MANTIENEN). Diferencias de perfil: martes ' +
    'fuerza inferior PESADA [+], jueves fuerza-potencia + WOD HYROX [+], sábado fuerza superior ' +
    '+ core [+]; viernes carrera EN MANTENIMIENTO [=] (rodaje Z2 corto). Domingo descanso.',
  coach_notes:
    'Variante FUERZA de la Semana 1 (Plantilla_HYROX_12sem_perfiles · hoja "Fue S1"). ' +
    'Capa 1 (lógica de día, con marcador [+]/[=]) en coach_notes de cada template; capa 2 ' +
    '(sesión detallada Pablo, %RM+RPE) en los segmentos con prescription_json. Tests almacenan ritmos.',
  source_sheet: 'Plantilla_HYROX_12sem_perfiles · Fue S1',
  new_blocks: [
    {
      // GAP: heavy lower-body strength block for strength-focus profile
      // (5r squat 6/6/4/4/3 @75-85% + bulgarian + hip thrust). Library has
      // accumulation-rep lower blocks but not this heavy/low-rep dose.
      slug: 'fue-s1-fuerza-inferior-pesada',
      title: 'Fuerza inferior PESADA (Perfil Fuerza)',
      description:
        'Bloque de fuerza pesada para atleta con foco fuerza: Back Squat 5 rounds 6/6/4/4/3 ' +
        '@75-85% / 2\'30" rest, Bulgarian split squat 4 rounds 8/lado, Hip Thrust 4 rounds ' +
        '10/8/8/6. Progresión de carga semana a semana.',
      methodology_group_id: 1,
      format: 'strength_block',
      atr_block_hint: 'ACC',
      source_ref: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Martes (CAPA2)',
      exercises: [
        {
          exercise_id: EX.backSquat,
          params: { sets: 5, rest_seconds: 150 },
          reps_scheme: '6/6/4/4/3',
          notes: '5 rounds Back Squat 6/6/4/4/3 @75-85% / 2\'30" rest.',
          prescription: {
            scheme: 'sets',
            sets: [
              { reps: 6, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 },
              { reps: 6, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 },
              { reps: 4, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 },
              { reps: 4, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 },
              { reps: 3, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 },
            ],
          },
        },
        {
          exercise_id: EX.bulgarianSplitSquat,
          params: { sets: 4 },
          reps_scheme: '8/lado',
          notes: '4 rounds Bulgarian split squat 8/lado.',
          prescription: {
            scheme: 'sets',
            sets: [
              { reps: 8, note: 'por lado' },
              { reps: 8, note: 'por lado' },
              { reps: 8, note: 'por lado' },
              { reps: 8, note: 'por lado' },
            ],
          },
        },
        {
          exercise_id: EX.hipThrust,
          params: { sets: 4 },
          reps_scheme: '10/8/8/6',
          notes: '4 rounds Hip Thrust 10/8/8/6.',
          prescription: {
            scheme: 'sets',
            sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }, { reps: 6 }],
          },
        },
      ],
    },
    {
      // GAP: strength-power + HYROX WOD combo (power clean EMOM-ish + sled/lunge/
      // wall-ball WOD) specific to the strength profile.
      slug: 'fue-s1-fuerza-potencia-wod-hyrox',
      title: 'Fuerza-potencia + WOD HYROX (Perfil Fuerza)',
      description:
        'Fuerza-potencia: 5 rounds c/2\' → 3 Power Clean 70-80% + 5 high box jump. ' +
        'WOD 4 rounds: 20m sled push 150kg + 10 walking lunge 30kg + 12 wall ball 9kg.',
      methodology_group_id: 2,
      format: 'circuit',
      atr_block_hint: 'ACC',
      source_ref: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Jueves (CAPA2)',
      exercises: [
        {
          exercise_id: EX.powerClean,
          params: { sets: 5, reps: 3, rest_seconds: 120 },
          reps_scheme: '3 c/2\'',
          notes: '5 rounds c/2\': 3 Power Clean 70-80%.',
          prescription: {
            scheme: 'interval',
            rounds: 5,
            work_s: 120, // EMOM-style window: 2' per round
            sets: [{ reps: 3, load: { type: 'percent_rm', min: 70, max: 80 } }],
          },
        },
        {
          exercise_id: EX.boxJump,
          params: { sets: 5, reps: 5 },
          reps_scheme: '5 c/2\'',
          notes: '5 rounds c/2\': 5 high box jump (mismo bloque EMOM que el power clean).',
          prescription: {
            scheme: 'interval',
            rounds: 5,
            work_s: 120,
            sets: [{ reps: 5, note: 'high box jump' }],
          },
        },
        {
          exercise_id: EX.sledPush,
          params: { sets: 4, distance_m: 20 },
          reps_scheme: '20m',
          notes: 'WOD 4 rounds: 20m sled push 150kg.',
          prescription: {
            scheme: 'rounds',
            rounds: 4,
            sets: [{ distance_m: 20, load: { type: 'kg', value: 150 } }],
          },
        },
        {
          exercise_id: EX.walkingLunge,
          params: { sets: 4, reps: 10 },
          reps_scheme: '10',
          notes: 'WOD 4 rounds: 10 walking lunge 30kg.',
          prescription: {
            scheme: 'rounds',
            rounds: 4,
            sets: [{ reps: 10, load: { type: 'kg', value: 30 } }],
          },
        },
        {
          exercise_id: EX.wallBalls,
          params: { sets: 4, reps: 12 },
          reps_scheme: '12',
          notes: 'WOD 4 rounds: 12 wall ball 9kg.',
          prescription: {
            scheme: 'rounds',
            rounds: 4,
            sets: [{ reps: 12, load: { type: 'kg', value: 9 } }],
          },
        },
      ],
    },
  ],
  sessions: [
    // ── Lunes — TEST 3'/9' ──
    {
      name: 'Test carrera 3\'/9\' en pista',
      format: 'intervals',
      target_block: 'ACC',
      day_position: 'monday',
      day_of_week: 1,
      methodology_group_id: 4,
      warmup: 'Movilidad 10\' + técnica 5\'',
      cooldown: '15\' cool down trote',
      coach_notes:
        'CAPA1 — TEST de carrera 3\'/9\' + activación. Fija ritmos (se mantienen los aeróbicos). Almacenar ritmos.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Lunes',
        maps_to_block: 'g4-test-pista-3-9',
        store_results: ['ritmo_3min', 'ritmo_9min'],
      },
      segments: [
        { exercise_id: EX.hipMobility, params: { time_seconds: 600 }, notes: '10\' movilidad', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(600) },
        { exercise_id: EX.runDrills, params: { time_seconds: 300 }, notes: '5\' técnica', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(300) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' easy run RPE5', block_position: 1, block_format: 'tempo', block_title: 'Activación', prescription: steady(900) },
        { exercise_id: EX.run, params: { time_seconds: 180 }, notes: '3\' RPE10 — marcar lap. ALMACENAR ritmo', block_position: 2, block_format: 'intervals', block_title: "TEST 3'", prescription: steady(180) },
        { exercise_id: EX.walk, params: { time_seconds: 600 }, notes: '10\' caminando', block_position: 3, block_format: 'tempo', block_title: 'Recuperación', prescription: steady(600) },
        { exercise_id: EX.run, params: { time_seconds: 540 }, notes: '9\' RPE10 — marcar lap. ALMACENAR ritmo', block_position: 4, block_format: 'intervals', block_title: "TEST 9'", prescription: steady(540) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' cool down trote', block_position: 5, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: steady(900) },
      ],
    },
    // ── Martes [+] — Fuerza inferior PESADA ──
    {
      name: 'Fuerza inferior pesada',
      format: 'strength_block',
      target_block: 'ACC',
      day_position: 'tuesday',
      day_of_week: 2,
      methodology_group_id: 1,
      warmup: 'Movilidad + activación cadera/tobillo',
      cooldown: '10\' trote suave',
      coach_notes:
        'CAPA1 — [+] FUERZA TREN INFERIOR pesada (prioridad del bloque).',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Martes',
        profile_marker: '[+]',
        maps_to_block: ['fue-s1-fuerza-inferior-pesada (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.backSquat, params: { sets: 5, rest_seconds: 150 }, notes: '5 rounds Back Squat 6/6/4/4/3 @75-85% / 2\'30" rest. Progresión semana a semana.', block_position: 0, block_format: 'strength_block', block_title: 'A · Back Squat (pesada)', prescription: { scheme: 'sets', sets: [ { reps: 6, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 }, { reps: 6, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 }, { reps: 4, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 }, { reps: 4, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 }, { reps: 3, load: { type: 'percent_rm', min: 75, max: 85 }, rest_s: 150 } ] } },
        { exercise_id: EX.bulgarianSplitSquat, params: { sets: 4 }, notes: '4 rounds Bulgarian split squat 8/lado', block_position: 1, block_format: 'strength_block', block_title: 'B · Bulgarian split squat', prescription: { scheme: 'sets', sets: [ { reps: 8, note: 'por lado' }, { reps: 8, note: 'por lado' }, { reps: 8, note: 'por lado' }, { reps: 8, note: 'por lado' } ] } },
        { exercise_id: EX.hipThrust, params: { sets: 4 }, notes: '4 rounds Hip Thrust 10/8/8/6', block_position: 2, block_format: 'strength_block', block_title: 'C · Hip Thrust', prescription: { scheme: 'sets', sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }, { reps: 6 }] } },
      ],
    },
    // ── Miércoles — TEST umbral 30' ──
    {
      name: 'Test umbral 30\' en pista',
      format: 'intervals',
      target_block: 'ACC',
      day_position: 'wednesday',
      day_of_week: 3,
      methodology_group_id: 4,
      warmup: 'Movilidad 10\' + técnica 5\'',
      cooldown: '10\' cool down',
      coach_notes: 'CAPA1 — TEST de umbral (30\') + movilidad. Almacenar ritmo medio.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Miércoles',
        maps_to_block: 'g4-test-pista-30-umbral',
        store_results: ['ritmo_umbral_30min'],
      },
      segments: [
        { exercise_id: EX.hipMobility, params: { time_seconds: 600 }, notes: '10\' movilidad', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(600) },
        { exercise_id: EX.runDrills, params: { time_seconds: 300 }, notes: '5\' técnica', block_position: 0, block_format: 'tempo', block_title: 'Calentamiento', prescription: steady(300) },
        { exercise_id: EX.run, params: { time_seconds: 900 }, notes: '15\' easy run RPE5', block_position: 1, block_format: 'tempo', block_title: 'Activación', prescription: steady(900) },
        { exercise_id: EX.run, params: { time_seconds: 1800 }, notes: '30\' RPE10 — los últimos 20\' valen. ALMACENAR ritmo medio', block_position: 2, block_format: 'intervals', block_title: "TEST 30'", prescription: steady(1800) },
        { exercise_id: EX.run, params: { time_seconds: 600 }, notes: '10\' cool down', block_position: 3, block_format: 'tempo', block_title: 'Vuelta a la calma', prescription: steady(600) },
      ],
    },
    // ── Jueves [+] — Fuerza-potencia + WOD HYROX ──
    {
      name: 'Fuerza-potencia + WOD HYROX',
      format: 'circuit',
      target_block: 'ACC',
      day_position: 'thursday',
      day_of_week: 4,
      methodology_group_id: 2,
      warmup: 'Activación + movilidad torácica/cadera',
      cooldown: 'Movilidad + soltar',
      coach_notes:
        'CAPA1 — [+] FUERZA-POTENCIA + WOD específico HYROX (sled, lunge).',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Jueves',
        profile_marker: '[+]',
        maps_to_block: ['fue-s1-fuerza-potencia-wod-hyrox (NUEVO, needs_review)'],
      },
      segments: [
        { exercise_id: EX.powerClean, params: { sets: 5, reps: 3, rest_seconds: 120 }, notes: '5 rounds c/2\': 3 Power Clean 70-80%', block_position: 0, block_format: 'circuit', block_title: 'A · Fuerza-potencia (5r c/2\')', prescription: { scheme: 'interval', rounds: 5, work_s: 120, sets: [{ reps: 3, load: { type: 'percent_rm', min: 70, max: 80 } }] } },
        { exercise_id: EX.boxJump, params: { sets: 5, reps: 5 }, notes: '5 rounds c/2\': 5 high box jump', block_position: 0, block_format: 'circuit', block_title: 'A · Fuerza-potencia (5r c/2\')', prescription: { scheme: 'interval', rounds: 5, work_s: 120, sets: [{ reps: 5, note: 'high box jump' }] } },
        { exercise_id: EX.sledPush, params: { sets: 4, distance_m: 20 }, notes: 'WOD 4 rounds: 20m sled push 150kg', block_position: 1, block_format: 'circuit', block_title: 'B · WOD HYROX (4 rounds)', prescription: { scheme: 'rounds', rounds: 4, sets: [{ distance_m: 20, load: { type: 'kg', value: 150 } }] } },
        { exercise_id: EX.walkingLunge, params: { sets: 4, reps: 10 }, notes: 'WOD 4 rounds: 10 walking lunge 30kg', block_position: 1, block_format: 'circuit', block_title: 'B · WOD HYROX (4 rounds)', prescription: { scheme: 'rounds', rounds: 4, sets: [{ reps: 10, load: { type: 'kg', value: 30 } }] } },
        { exercise_id: EX.wallBalls, params: { sets: 4, reps: 12 }, notes: 'WOD 4 rounds: 12 wall ball 9kg', block_position: 1, block_format: 'circuit', block_title: 'B · WOD HYROX (4 rounds)', prescription: { scheme: 'rounds', rounds: 4, sets: [{ reps: 12, load: { type: 'kg', value: 9 } }] } },
      ],
    },
    // ── Viernes [=] — Carrera EN MANTENIMIENTO ──
    {
      name: 'Carrera mantenimiento Z2',
      format: 'tempo',
      target_block: 'ACC',
      day_position: 'friday',
      day_of_week: 5,
      methodology_group_id: 5,
      warmup: '',
      cooldown: '6×20" strides',
      coach_notes:
        'CAPA1 — [=] Carrera EN MANTENIMIENTO: rodaje Z2 corto. Solo conservar base aeróbica.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Viernes',
        profile_marker: '[=]',
        maps_to_block: 'g5 run Z2 (mantenimiento, 40\' corto)',
      },
      segments: [
        { exercise_id: EX.run, params: { time_seconds: 2400 }, notes: '40\' Z2 RPE3-4. Solo conservar base aeróbica.', block_position: 0, block_format: 'tempo', block_title: 'Rodaje Z2', prescription: steady(2400) },
        { exercise_id: EX.run, params: { sets: 6, time_seconds: 20 }, notes: '6×20" strides', block_position: 1, block_format: 'intervals', block_title: 'Strides', prescription: interval(6, 20) },
      ],
    },
    // ── Sábado [+] — Fuerza superior + Core ──
    {
      name: 'Fuerza superior + Core',
      format: 'strength_block',
      target_block: 'ACC',
      day_position: 'saturday',
      day_of_week: 6,
      methodology_group_id: 1,
      warmup: 'Movilidad hombro + activación escapular',
      cooldown: '10\' trote suave',
      coach_notes: 'CAPA1 — [+] FUERZA TREN SUPERIOR + core.',
      meta_json: {
        atr: { macrocycle: 'ACUMULACION', microcycle: 'Carga + Tests' },
        source: 'Plantilla_HYROX_12sem_perfiles · Fue S1 · Sábado',
        profile_marker: '[+]',
        maps_to_block: ['g1-2-strict-shoulder-press-5r-10-8-8-6-4-al-65-85 (ADAPTADO a 8/8/6/6/4 @70-85%)', 'COMPOSICION pull-ups+dips', 'turkish-get-up (catalogo)'],
      },
      segments: [
        { exercise_id: EX.overheadPress, params: { sets: 5, rest_seconds: 120 }, notes: '5 rounds Shoulder Press 8/8/6/6/4 @70-85%', block_position: 0, block_format: 'strength_block', block_title: 'A · Shoulder Press', prescription: { scheme: 'sets', sets: [ { reps: 8, load: { type: 'percent_rm', min: 70, max: 85 }, rest_s: 120 }, { reps: 8, load: { type: 'percent_rm', min: 70, max: 85 }, rest_s: 120 }, { reps: 6, load: { type: 'percent_rm', min: 70, max: 85 }, rest_s: 120 }, { reps: 6, load: { type: 'percent_rm', min: 70, max: 85 }, rest_s: 120 }, { reps: 4, load: { type: 'percent_rm', min: 70, max: 85 }, rest_s: 120 } ] } },
        { exercise_id: EX.pullUp, params: { sets: 5 }, notes: '5 rounds Pull-ups 10-8-8-6-6', block_position: 1, block_format: 'circuit', block_title: 'B · Tracción/Empuje', prescription: { scheme: 'sets', sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }, { reps: 6 }, { reps: 6 }] } },
        { exercise_id: EX.dip, params: { sets: 5 }, notes: '5 rounds Dips 10-8-8-6-6. (COMPOSICIÓN: no existe bloque pull-ups+dips combinado)', block_position: 1, block_format: 'circuit', block_title: 'B · Tracción/Empuje', prescription: { scheme: 'sets', sets: [{ reps: 10 }, { reps: 8 }, { reps: 8 }, { reps: 6 }, { reps: 6 }] } },
        { exercise_id: EX.turkishGetUp, params: { sets: 4, reps: 4 }, notes: 'Core: Turkish get-up 4x4/lado', block_position: 2, block_format: 'circuit', block_title: 'C · Core', prescription: { scheme: 'sets', sets: [ { reps: 4, note: 'por lado' }, { reps: 4, note: 'por lado' }, { reps: 4, note: 'por lado' }, { reps: 4, note: 'por lado' } ] } },
      ],
    },
  ],
};

// ── slots_json builder — copies week 51's EXACT shape (params_json + notes per
//    item; no prescription_json in slots_json, matching 51). ──────────────────
function buildSlotsJson(spec: ProfileWeekSpec, templateIdByDay: Map<number, number>) {
  const days: unknown[] = [];
  for (let dow = 1; dow <= 7; dow++) {
    if (dow === 7) {
      days.push({ day_of_week: 7, sessions: [] });
      continue;
    }
    const session = spec.sessions.find((s) => s.day_of_week === dow);
    if (!session) {
      days.push({ day_of_week: dow, sessions: [] });
      continue;
    }
    // Group segments into blocks by block_position (mirrors 51's blocks[]).
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
  for (const spec of [RES_S1, FUE_S1]) {
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

  for (const spec of [RES_S1, FUE_S1]) {
    // ── Idempotent cleanup: drop this profile's week + templates by name ──
    await sql`delete from program_week_templates where coach_id = ${COACH_ID} and name = ${spec.week_name}`;
    const tmplNames = spec.sessions.map((s) => s.name);
    // Only delete templates that belong to this profile week (match by name +
    // meta source sheet) to avoid clobbering the balanced week's templates,
    // which share some session names (e.g. the test sessions).
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
        values (${COACH_ID}, ${s.name}, ${s.format}, ${s.target_block}, ${s.day_position}, ${s.methodology_group_id}, ${s.warmup || null}, ${s.cooldown || null}, ${s.coach_notes}, ${sql.json(s.meta_json as Parameters<typeof sql.json>[0])})
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
      values (${COACH_ID}, ${spec.week_name}, 'pro', 'ACC', ${spec.athlete_profile}, 1, ${spec.focus}, ${spec.coach_notes}, ${sql.json(slots as Parameters<typeof sql.json>[0])})
      returning id
    `;

    report[spec.athlete_profile] = {
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
