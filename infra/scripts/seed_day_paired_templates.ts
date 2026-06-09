/**
 * Seed 6 day-paired example templates demonstrating the élite 2x/day
 * pattern.
 *
 * PLACEHOLDER content — Pablo will replace with real methodology. All
 * coach notes carry the "DEMO — pending Pablo input" tag.
 *
 * The 6 templates form three day-pairs (or singletons):
 *   1. ACC w3 d2 AM — Lower body strength + accessory     (paired ↔ #2)
 *   2. ACC w3 d2 PM — Z2 long run                          (paired ↔ #1)
 *   3. TRANS w2 d1 AM — Threshold intervals running        (singleton)
 *   4. TRANS w2 d3 AM — HYROX simulation half              (singleton)
 *   5. REAL w1 d2 AM — Race-pace intervals + station       (paired ↔ #6)
 *   6. REAL w1 d2 PM — Recovery + skill                    (paired ↔ #5)
 *
 * Pairing is stored in `templates.paired_with_template_id` (added in
 * migration 0003). Pairs reference each other — we insert all 6 first,
 * then set the cross-references in a second pass.
 *
 * Day-position token (`templates.day_position`, e.g. "ACC w3 d2 AM") is
 * the human-readable handle used by Plan/Today UI to know where the
 * session sits in the macrocycle.
 *
 * Idempotent: re-runs upsert by (coach_id, name). Segments deleted and
 * re-inserted to stay in sync with this file. The 5 templates from
 * `seed_example_templates.ts` (task #19) remain in DB untouched — these
 * 6 are net-new names. Templates from #19 can later be archived via the
 * `archived_at` field once Pablo confirms the new pattern set is the
 * canonical demo.
 *
 * Run: pnpm --filter @fahybrid/infra seed:day-paired
 */
import { z } from 'zod';
import {
  atrBlockType,
  templateFormat,
  segmentParamsSchema,
} from '@fahybrid/shared/schema';
import { getSql } from './_db.js';

type TemplateFormat = z.infer<typeof templateFormat>;
type AtrBlockType = z.infer<typeof atrBlockType>;
type TargetBlock = AtrBlockType | 'any';
type SegmentParams = z.infer<typeof segmentParamsSchema> & {
  pace_target?: string;
  power_target_watts?: number;
  cadence_target_spm?: number;
  stroke_rate_target_spm?: number;
  damper?: number;
  drag_factor?: number;
  effort_pct?: number;
  rounds_label?: string;
};

type SegmentSpec = {
  exercise_slug: string;
  params: SegmentParams;
  notes: string;
  rounds_label?: string;
};

type TemplateSpec = {
  /** Stable internal key used to wire pairing references across templates. */
  key:
    | 'acc-w3-d2-am'
    | 'acc-w3-d2-pm'
    | 'trans-w2-d1-am'
    | 'trans-w2-d3-am'
    | 'real-w1-d2-am'
    | 'real-w1-d2-pm';
  name: string;
  description: string;
  format: TemplateFormat;
  target_block: TargetBlock;
  target_level: 1 | 2 | 3;
  day_position: string;
  estimated_duration_minutes: number;
  paired_with_key: TemplateSpec['key'] | null;
  warmup_notes: string;
  cooldown_notes: string;
  coach_notes: string;
  segments: SegmentSpec[];
};

const PABLO_COACH = {
  full_name: 'Pablo (DEMO)',
  email: 'pablo@fabrik.training',
  bio:
    'Head coach, Fabrik Training Club BCN. HYROX / hybrid specialist. ' +
    'DEMO row used to anchor placeholder example templates — replace with ' +
    'real coach record before production.',
};

const DEMO_TAG = 'DEMO — pending Pablo input';

const TEMPLATES: TemplateSpec[] = [
  // -------------------------------------------------------------------------
  // 1. ACC w3 d2 AM — Lower body strength + accessory (paired with #2)
  // -------------------------------------------------------------------------
  {
    key: 'acc-w3-d2-am',
    name: 'ACC w3 d2 AM — Lower body strength + accessory',
    format: 'strength_block',
    target_block: 'ACC',
    target_level: 2,
    day_position: 'ACC w3 d2 AM',
    estimated_duration_minutes: 60,
    paired_with_key: 'acc-w3-d2-pm',
    description:
      'Bloque de acumulación, semana 3 día 2 AM. Foco: fuerza máxima ' +
      'tren inferior con cargas moderadas-altas + accesorios unilaterales y ' +
      'posterior chain. Sin glycolítico — la sesión PM (Z2 long run) es ' +
      'aerobic; esta es estructural.',
    warmup_notes:
      '12 min: 5 min row Z1 (drag 110-120, ~22 spm), 3 min movilidad cadera/' +
      'tobillo (90/90 hip switches × 2 min, ankle rocks × 10/lado, cossack ' +
      'squats × 8/lado), 2 × 5 air squats + 2 × 5 box jumps low. ' +
      'Build-up squat: empty bar × 8 → 40% × 5 → 60% × 3 → 75% × 2 antes de ' +
      'series de trabajo. Total ~15 min con build-up.',
    cooldown_notes:
      '8 min: foam-roll-lower-15min versión corta (cuádriceps × 90s/lado, ' +
      'glúteos × 90s/lado, IT band × 60s/lado). 90 s holds en deep squat. ' +
      'Walk easy 3 min para bajar HR. Hidratación + 30 g proteína post-sesión.',
    coach_notes:
      `${DEMO_TAG}. Foco bloque ACC: VOLUMEN + densidad muscular. Cargas ` +
      'submáximas 75-80% 1RM, RPE objetivo 7-8. NO buscar PR — no fatiga ' +
      'neural. Si RPE > 8 en serie 2 → bajar carga 5-10%. ' +
      'PM session (Z2 long run, paired) en 6+ horas — comer carbs + protein ' +
      'post-strength, comer carbs 60-90 min pre-run. ' +
      'Si HRV mañana siguiente <-15% baseline → swap PM run a row Z2 30 min.',
    segments: [
      {
        exercise_slug: 'barbell-squat',
        params: {
          reps: 5,
          rounds: 4,
          weight_pct_1rm: 78,
          rpe: 7,
          rest_seconds: 180,
          tempo: '3-1-1-0',
        },
        rounds_label: '4 × 5 back squat @ 78% 1RM',
        notes:
          'MAIN LIFT. 4 × 5 back squat @ 78% 1RM. Tempo 3-1-1-0 (3s descenso ' +
          'controlado, 1s pausa abajo, 1s ascenso, 0s arriba). 180s descanso. ' +
          'RPE objetivo 7. Si serie 2 RPE 8+ → bajar a 73%. Cinturón opcional ' +
          'desde serie 3.',
      },
      {
        exercise_slug: 'romanian-deadlift',
        params: {
          reps: 8,
          rounds: 4,
          weight_pct_1rm: 65,
          rpe: 7,
          rest_seconds: 120,
          tempo: '3-0-1-0',
        },
        rounds_label: '4 × 8 RDL @ 65% deadlift 1RM',
        notes:
          'Posterior chain primary. 4 × 8 Romanian deadlift @ 65% 1RM ' +
          'deadlift. Tempo 3-0-1-0 (3s descenso, 1s subida explosiva). ' +
          'Bajar hasta sentir hamstrings al límite (NO apoyar suelo). ' +
          '120 s descanso. Cinturón opcional.',
      },
      {
        exercise_slug: 'split-squat-with-dumbbells',
        params: {
          reps: 8,
          rounds: 3,
          weight_kg: 24,
          rpe: 7,
          rest_seconds: 90,
        },
        rounds_label: '3 × 8/pierna BSS',
        notes:
          'Unilateral accessory. 3 × 8/pierna Bulgarian split squat con 2 × ' +
          'DB 24 kg M / 12 kg W. Rodilla trasera al suelo (no rebote), ' +
          'tronco vertical. 10 s entre piernas (8 izq → 10s → 8 der → 90s ' +
          'descanso entre rondas).',
      },
      {
        exercise_slug: 'single-leg-rdl',
        params: {
          reps: 8,
          rounds: 3,
          weight_kg: 20,
          rpe: 7,
          rest_seconds: 75,
          tempo: '3-0-1-0',
        },
        rounds_label: '3 × 8/pierna single-leg RDL',
        notes:
          'Unilateral hinge + balance. 3 × 8/pierna SL RDL con KB 20 kg M / ' +
          '12 kg W (carga homolateral, lado opuesto a pierna activa). ' +
          'Tempo 3-0-1-0. Cadera hinge, rodilla soft, hombros cuadrados ' +
          '(no rotación). 75 s descanso entre rondas.',
      },
      {
        exercise_slug: 'glute-ham-raise',
        params: {
          reps: 8,
          rounds: 3,
          rpe: 8,
          rest_seconds: 75,
          tempo: '3-0-1-0',
        },
        rounds_label: '3 × 8 GHR',
        notes:
          'Posterior chain finisher. 3 × 8 glute-ham raise estricto (banco ' +
          'GHR o nordic curl asistido si no hay banco). Tempo 3-0-1-0. ' +
          'Si no llega a 8 reps estricto → 5 reps + 3 negativas controladas. ' +
          '75 s descanso.',
      },
      {
        exercise_slug: 'hanging-leg-raise',
        params: {
          reps: 10,
          rounds: 3,
          rpe: 7,
          rest_seconds: 60,
        },
        rounds_label: '3 × 10 HLR',
        notes:
          'Core finisher. 3 × 10 hanging leg raise estricto. Sin balanceo. ' +
          'Piernas rectas si posible (rodillas dobladas si no). 60 s ' +
          'descanso. Si no llega a 10 estrictas → 8 reps + 2 negativas lentas.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // 2. ACC w3 d2 PM — Z2 long run (paired with #1)
  // -------------------------------------------------------------------------
  {
    key: 'acc-w3-d2-pm',
    name: 'ACC w3 d2 PM — Z2 long run',
    format: 'tempo',
    target_block: 'ACC',
    target_level: 2,
    day_position: 'ACC w3 d2 PM',
    estimated_duration_minutes: 90,
    paired_with_key: 'acc-w3-d2-am',
    description:
      'Bloque de acumulación, semana 3 día 2 PM (complementaria a strength ' +
      'AM). Long run Z2 90 min: aerobic-base anchor de la semana. Pace ' +
      'controlado por HR ceiling (Z2 alto, NUNCA Z3). Decoupling es la ' +
      'métrica clave del bloque ACC.',
    warmup_notes:
      '10 min: 5 min trote Z1 (HR <130 bpm), drills movilidad dinámica ' +
      '(leg swings × 10/lado, walking lunges × 10, A-skip × 20 m, B-skip × ' +
      '20 m), 2 × 80 m progresivos hasta Z2 alto. NO strides — esto es Z2 ' +
      'puro, no neuromuscular.',
    cooldown_notes:
      '10 min: 5 min walk Z1 (HR a Z1 antes de parar). 5 min mobility-hip-flow ' +
      'corto (90/90 × 90s, pigeon × 60s/lado, deep squat hold × 60s). ' +
      'Hidratación + electrolitos. Comer dentro de 60 min post-sesión.',
    coach_notes:
      `${DEMO_TAG}. SESIÓN MÁS IMPORTANTE DE LA SEMANA EN ACC. Si HR sube ` +
      'a Z3 sostenido → walk-jog 30s para volver a Z2. NO ajustar pace ' +
      'manteniendo HR alto — eso anula el propósito. ' +
      'Decoupling target <5% (Pa:Hr). Si decoupling >8% en sesión → bajar ' +
      'volumen 15% próxima semana, sospechar fatiga acumulada. ' +
      'Recordatorio: AM session fue strength pesado. Carbs 60-90 min antes ' +
      'de empezar (40-60g). Hidratación pre-load.',
    segments: [
      {
        exercise_slug: 'run-z2-long',
        params: {
          time_seconds: 90 * 60,
          hr_zone: 2,
          hr_target_bpm: 142,
          pace_target: '5:20-5:50 /km (ajustar por LT1, NO acelerar)',
          cadence_target_spm: 178,
          rpe: 5,
        },
        rounds_label: '90 min continuo Z2',
        notes:
          '90 min rodaje continuo Z2. HR objetivo 138-148 bpm (ajustar por ' +
          'LT1 individual). Pace ceiling 5:20 /km. Cadencia 174-180 spm. ' +
          'Si HR > 150 bpm más de 2 min → walk 30s. Decoupling <5% objetivo ' +
          '(Pa:Hr en TrainingPeaks o equivalente). ' +
          'Variable clave a registrar: tiempo en Z2 vs Z3. >90% en Z2 = sesión ' +
          'limpia. <80% = pace muy alto, próxima sesión bajar 10 s/km.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // 3. TRANS w2 d1 AM — Threshold intervals running (singleton)
  // -------------------------------------------------------------------------
  {
    key: 'trans-w2-d1-am',
    name: 'TRANS w2 d1 AM — Threshold intervals running',
    format: 'intervals',
    target_block: 'TRANS',
    target_level: 2,
    day_position: 'TRANS w2 d1 AM',
    estimated_duration_minutes: 50,
    paired_with_key: null,
    description:
      'Bloque de transformación, semana 2 día 1 AM. Threshold work running: ' +
      '5 × 1 km @ Z4 con jog de recuperación corto. Foco lactate clearance + ' +
      'pace consistency. Es la sesión que define la semana — todas las demás ' +
      'orbitan alrededor de su recuperación.',
    warmup_notes:
      '15 min progresivos: 6 min trote Z1→Z2, drills (A-skip × 20 m, B-skip ' +
      '× 20 m, butt kicks × 20 m, high knees × 20 m, carioca × 20 m/lado), ' +
      '4 × 100 m strides progresivas hasta pace de Z4 (NO sprint, neuromuscular ' +
      'priming). 90 s rest post-strides antes del primer 1 km.',
    cooldown_notes:
      '12 min: 5 min jog Z1 + 5 min walk Z1 (HR ≤120 antes de parar). ' +
      '2 min mobility hip flow (90/90 × 60s, pigeon × 60s/lado). ' +
      'Hidratación + carbs + protein (3:1 ratio) dentro 30 min.',
    coach_notes:
      `${DEMO_TAG}. SESIÓN BENCHMARK. Cronometrar cada 1 km individualmente. ` +
      'Pace target individualizado: 5K time + 5-10 s/km como punto de partida. ' +
      'Ej: 5K en 18:00 → pace 1km Z4 ~3:45-3:50. ' +
      'Métrica clave: variación entre rep 1 y rep 5. <2 s/km = excelente, ' +
      '2-5 s/km = normal, >5 s/km = cortar a 4 reps. ' +
      'NO hacer si HRV <-10% baseline o sleep <6h. Reschedule a d2.',
    segments: [
      {
        exercise_slug: 'run-threshold-intervals',
        params: {
          rounds: 5,
          distance_meters: 1000,
          rest_seconds: 90,
          hr_zone: 4,
          hr_target_bpm: 168,
          pace_target: 'Z4: 5K pace + 5-10 s/km (~3:50-4:00 /km típico)',
          cadence_target_spm: 184,
          rpe: 8,
          effort_pct: 90,
        },
        rounds_label: '5 × 1 km @ Z4 / 90 s jog Z2 recovery',
        notes:
          'Threshold reps. 5 × 1 km @ Z4 (HR 165-172 bpm objetivo). Pace ' +
          'individualizado por 5K benchmark — calcular pre-sesión. Cadencia ' +
          '≥182 spm. ' +
          'Recovery: 90 s jog Z2 (HR <145 bpm), NO walk. ' +
          'Variables a apuntar: split de cada km, HR media por rep, HRR60 ' +
          '(HR drop primeros 60s post-rep). HRR60 >25 bpm = excelente recovery.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // 4. TRANS w2 d3 AM — HYROX simulation half (singleton)
  // -------------------------------------------------------------------------
  {
    key: 'trans-w2-d3-am',
    name: 'TRANS w2 d3 AM — HYROX simulation half',
    format: 'hyrox_sim',
    target_block: 'TRANS',
    target_level: 2,
    day_position: 'TRANS w2 d3 AM',
    estimated_duration_minutes: 60,
    paired_with_key: null,
    description:
      'Bloque de transformación, semana 2 día 3 AM. Half-distance HYROX ' +
      'simulation: 4 × (500 m run + estación) a pace de carrera. Introduce ' +
      'transiciones bajo fatiga sin el volumen total del race-day. ' +
      'Re-test version del template puede usarse cada 4-6 semanas en TRANS.',
    warmup_notes:
      '15 min protocolo race-day shortened: 5 min trote Z1, 3 min movilidad ' +
      'dinámica, 5 min activación específica (3 × 100 m progresivos hasta ' +
      'pace race + 1 set técnico de cada estación a baja intensidad: ' +
      '5 wall balls light, 100 m row Z2, 5 BBJ, 10 m sled push light).',
    cooldown_notes:
      '10 min: 5 min walk Z1 + 5 min mobility (hip flow corto + shoulder ' +
      'banded × 1 ronda). Recovery nutrition crítica — sesión vacía glucógeno: ' +
      'carbs (1g/kg) + protein (0.3g/kg) dentro 30 min.',
    coach_notes:
      `${DEMO_TAG}. Esta es PRÁCTICA, no benchmark — el benchmark real es ` +
      'test-hyrox-half-sim que se programa por separado. Aquí buscamos: ' +
      '(1) técnica bajo fatiga, (2) pacing strategy, (3) transición run→station ' +
      '(target <5 s). ' +
      'Pace target: race pace + 5 s/km (ligeramente más conservador que race). ' +
      'Variables: tiempo total + per-segment splits + transiciones.',
    segments: [
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace +5 s/km (M: ~4:35 /km · W: ~5:05 /km)',
          cadence_target_spm: 182,
          rpe: 8,
          rounds_label: 'Run #1',
        },
        notes:
          'Run #1 — 500 m a race pace + 5 s/km (más conservador que race ' +
          'real, esto es práctica). Cadencia ≥182 spm. HR debería llegar a ' +
          'Z4 bajo al final de los 500 m. Transición target <5 s al SkiErg.',
      },
      {
        exercise_slug: 'ski-erg-race-pace-intervals',
        params: {
          distance_meters: 500,
          stroke_rate_target_spm: 30,
          power_target_watts: 200,
          rpe: 8,
          effort_pct: 90,
        },
        notes:
          'Estación 1: SkiErg 500 m (mitad de race). Split objetivo M: ' +
          '~2:00 /500 m. W: ~2:15 /500 m. Stroke rate 28-32 spm. Damper 6-8. ' +
          'Salida HR alta del run — settle en split objetivo en primeros ' +
          '100 m, NO sprint inicial.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace +5 s/km',
          cadence_target_spm: 182,
          rpe: 8,
          rounds_label: 'Run #2',
        },
        notes:
          'Run #2 — 500 m. Salida del SkiErg con piernas frescas (lats ' +
          'cargados). Foco: cadencia rápida desde rep 1, no permitir ' +
          'shuffling. HR debe estabilizar en Z4 alto.',
      },
      {
        exercise_slug: 'hyrox-sled-push',
        params: {
          distance_meters: 25,
          weight_kg: 152,
          rpe: 8,
          effort_pct: 88,
        },
        notes:
          'Estación 2: Sled push 25 m (mitad de race). Peso M: +102 kg ' +
          '(152 kg total). W: +52 kg (102 kg total). Estrategia: 2 lengths ' +
          'de 12.5 m con micro-pausa al cambiar (2-3 s). Cuerpo bajo, pasos ' +
          'cortos. Tiempo objetivo M: 0:50-1:10. W: 1:00-1:25.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace +10 s/km (heavy legs post-sled)',
          rpe: 8,
          rounds_label: 'Run #3',
        },
        notes:
          'Run #3 — 500 m. Salida del sled, piernas pesadas. Aceptar pace ' +
          '+10 s/km los primeros 200 m, recuperar pace en últimos 300 m. ' +
          'Esto entrena el "sled-leg".',
      },
      {
        exercise_slug: 'hyrox-burpee-broad-jump',
        params: {
          distance_meters: 40,
          rpe: 8,
          effort_pct: 88,
        },
        notes:
          'Estación 3: BBJ 40 m (mitad de race). ~20 reps. Pacing: micro-' +
          'respiración 2 s arriba cada 5 reps. Tiempo objetivo M: 1:45-2:15. ' +
          'W: 2:00-2:30. Salto mínimo 2 m M / 1.5 m W. Pecho al suelo + ' +
          'dos pies despegue/aterrizaje.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 5,
          pace_target: 'Race pace (final push)',
          rpe: 9,
          rounds_label: 'Run #4 (final)',
        },
        notes:
          'Run #4 — final. 500 m a race pace. HR debe llegar a Z5. Si queda ' +
          'gas — vaciar últimos 200 m. Simula sprint final pre-última estación.',
      },
      {
        exercise_slug: 'hyrox-wall-balls',
        params: {
          reps: 50,
          weight_kg: 6,
          rpe: 9,
          effort_pct: 92,
        },
        notes:
          'Estación 4 (FINAL): 50 wall balls (mitad de race). M: 6 kg @ ' +
          '3.05 m. W: 4 kg @ 2.74 m. Estrategia: 25-15-10 con 5 s respiración ' +
          'entre sets. Tiempo objetivo M: 2:00-2:30. W: 2:30-3:00. Última ' +
          'estación — vaciar tanque.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // 5. REAL w1 d2 AM — Race-pace intervals + station tune-up (paired with #6)
  // -------------------------------------------------------------------------
  {
    key: 'real-w1-d2-am',
    name: 'REAL w1 d2 AM — Race-pace intervals + station tune-up',
    format: 'intervals',
    target_block: 'REAL',
    target_level: 3,
    day_position: 'REAL w1 d2 AM',
    estimated_duration_minutes: 55,
    paired_with_key: 'real-w1-d2-pm',
    description:
      'Bloque de realización, semana 1 día 2 AM. Race-pace specificity + ' +
      'station tune-up. Bajo volumen, alta especificidad. Sharpens ' +
      'race-pace neuromuscular pattern + tune-up técnico de estaciones más ' +
      'críticas (BBJ + wall balls). PM session es recovery + skill (paired).',
    warmup_notes:
      '15 min muy progresivos: 6 min trote Z1→Z2, drills (A-skip, B-skip, ' +
      'high knees, butt kicks × 30 m c/u), 5 × 100 m strides hasta race pace. ' +
      'Activación específica: 2 × (5 wall balls light + 100 m run progresivo).',
    cooldown_notes:
      '8 min: 5 min walk Z1 + 3 min mobility hip flow corto. Hidratación + ' +
      'carbs ligeros (no full meal — PM session en ~6h, skill + recovery, ' +
      'no requiere full glucógeno). Nap window 30 min si posible.',
    coach_notes:
      `${DEMO_TAG}. Sesión en bloque REAL — máxima especificidad. ` +
      'Race-pace runs deben simular EXACTAMENTE el feel del race day. ' +
      'Si pace cae >3 s/km de rep 1 a rep 6 → cortar a 4 reps + descansar 48h. ' +
      'PM (recovery + skill, paired) en 6+ horas — si HRV crash post-AM ' +
      '(<-15% baseline) → swap PM a 30 min mobility-hip-flow + foam-roll-lower, ' +
      'sin skill work.',
    segments: [
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          rounds: 6,
          distance_meters: 400,
          rest_seconds: 75,
          hr_zone: 4,
          hr_target_bpm: 172,
          pace_target: 'HYROX 1km race pace target (M: ~4:30 /km · W: ~5:00 /km)',
          cadence_target_spm: 184,
          rpe: 8,
          effort_pct: 92,
        },
        rounds_label: '6 × 400 m @ HYROX race pace / 75 s walk-jog',
        notes:
          'Race-pace primary block. 6 × 400 m a HYROX 1 km split target ' +
          '(individualizar por benchmark). Cadencia ≥182 spm. ' +
          'Recovery: 75 s walk-jog incompleto (simula fatiga station→run en ' +
          'race day). HR objetivo Z4 alto. ' +
          'Métrica clave: split consistency. Variación rep1 vs rep6 < 3 s/km.',
      },
      {
        exercise_slug: 'hyrox-burpee-broad-jump',
        params: {
          distance_meters: 20,
          rounds: 4,
          rest_seconds: 60,
          rpe: 8,
        },
        rounds_label: '4 × 20 m BBJ tune-up',
        notes:
          'BBJ tune-up. 4 × 20 m. Foco: PRECISIÓN y CADENCIA constante, no ' +
          'velocidad máxima. Salto mínimo 2 m M / 1.5 m W. Tempo objetivo: ' +
          '1 rep cada 4-5 s. 60 s descanso. Apuntar tiempo + reps por rep — ' +
          'consistency target ±0.5 s entre series.',
      },
      {
        exercise_slug: 'hyrox-wall-balls',
        params: {
          reps: 25,
          rounds: 3,
          weight_kg: 6,
          rest_seconds: 75,
          rpe: 8,
        },
        rounds_label: '3 × 25 wall balls unbroken',
        notes:
          'Wall ball tune-up. 3 × 25 reps unbroken. M: 6 kg @ 3.05 m. ' +
          'W: 4 kg @ 2.74 m. Cadencia constante 30-35 reps/min. Hip crease ' +
          'debajo rodilla, target tocado limpio. 75 s descanso. ' +
          'Si rompe unbroken en rep 25 → anotar, ajustar estrategia race-day.',
      },
    ],
  },
  // -------------------------------------------------------------------------
  // 6. REAL w1 d2 PM — Recovery + skill (paired with #5)
  // -------------------------------------------------------------------------
  {
    key: 'real-w1-d2-pm',
    name: 'REAL w1 d2 PM — Recovery + skill',
    format: 'circuit',
    target_block: 'REAL',
    target_level: 1,
    day_position: 'REAL w1 d2 PM',
    estimated_duration_minutes: 35,
    paired_with_key: 'real-w1-d2-am',
    description:
      'Bloque de realización, semana 1 día 2 PM (complementaria a race-pace ' +
      'AM). Active recovery + skill maintenance. Bajo HR, foco neuromuscular ' +
      'fino. NO añade fitness — protege el efecto entrenante de la AM y ' +
      'mantiene patterns críticos (pull-ups, mobility, prehab shoulder) sin ' +
      'gravar el sistema.',
    warmup_notes:
      '5 min: 3 min walk-jog easy Z1, 2 min movilidad dinámica (leg swings, ' +
      'shoulder circles, T-spine rotations). Sin strides, sin nada explosivo.',
    cooldown_notes:
      '5 min stretching estático: pigeon × 90s/lado, hamstring stretch × 60s/' +
      'lado, deep squat hold × 60s. Cero intensidad. Cena dentro 60 min — ' +
      'priorizar recovery (carbs + protein + magnesio).',
    coach_notes:
      `${DEMO_TAG}. PM PROTEGIDA. Si tras la AM session el atleta llega ` +
      'agotado (RPE percibido pre-sesión >5 sin esfuerzo) → SKIP esta sesión, ' +
      'reemplazar con 20 min walk easy + foam-roll-lower-15min. ' +
      'Esta sesión es IMPRESCINDIBLE skip si: HRV <-15% baseline, sleep <6h, ' +
      'soreness self-rating ≥4/5. La AM es la sesión clave; la PM solo ' +
      'añade si el cuerpo lo permite.',
    segments: [
      {
        exercise_slug: 'row-recovery',
        params: {
          time_seconds: 12 * 60,
          hr_zone: 1,
          pace_target: 'Z1 (~20 s/500m slower than 2K PR pace)',
          stroke_rate_target_spm: 19,
          rpe: 3,
        },
        rounds_label: '12 min row recovery Z1',
        notes:
          'Active flush 12 min row. Damper 3-5. Stroke rate 18-20 spm. ' +
          'Pace ~20 s/500m slower than 2K PR. HR objetivo <130 bpm. ' +
          'NO push — esto es flujo sanguíneo, no fitness. Conversación ' +
          'completa posible mientras remas.',
      },
      {
        exercise_slug: 'pullups',
        params: {
          reps: 5,
          rounds: 4,
          rpe: 5,
          rest_seconds: 90,
          tempo: '2-1-2-0',
        },
        rounds_label: '4 × 5 strict pull-ups (skill maintenance)',
        notes:
          'Skill maintenance, NO fatiga. 4 × 5 pull-ups estrictas con tempo ' +
          'controlado 2-1-2-0 (2s subida, 1s top, 2s descenso, 0s bottom). ' +
          'NO ir a fallo. Si en serie 1 RPE >6 → cortar a 3 reps × 4 series. ' +
          '90 s descanso. Foco: calidad de movimiento, scap engagement.',
      },
      {
        exercise_slug: 'prehab-shoulder-banded-15min',
        params: {
          time_seconds: 8 * 60,
          rounds: 1,
          rpe: 3,
        },
        rounds_label: '1 ronda prehab shoulder ~8 min',
        notes:
          'Banded shoulder prehab — versión corta del bloque 15 min ' +
          '(1 ronda ~8 min): band pull-aparts × 20, face pulls × 20, ' +
          'external rotation × 12/lado, Y-T-W × 8 c/u, banded wall slides × 12. ' +
          'Banda ligera, foco tempo (2-1-2-1) y end-range. Crítico para ' +
          'volumen alto SkiErg + pull-up del bloque REAL.',
      },
      {
        exercise_slug: 'foam-roll-lower-15min',
        params: {
          time_seconds: 10 * 60,
          rounds: 1,
          rpe: 2,
        },
        rounds_label: '10 min foam roll lower body',
        notes:
          'Myofascial release tren inferior. Sequence reducida: glúteos × ' +
          '60s/lado, IT band × 60s/lado, cuádriceps × 60s/lado, hamstrings × ' +
          '45s/lado, calves × 45s/lado. Slow rolls (1 inch/s). Pausa 20-30s ' +
          'en puntos sensibles con respiración.',
      },
    ],
  },
];

const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key);

/**
 * Run-through validation of pairing references at module load. Catches
 * typos in `paired_with_key` before we hit the DB.
 */
function validatePairingReferences(): void {
  const keys = new Set<string>(TEMPLATE_KEYS);
  for (const t of TEMPLATES) {
    if (t.paired_with_key === null) continue;
    if (!keys.has(t.paired_with_key)) {
      throw new Error(
        `Template ${t.key} pairs with unknown key ${t.paired_with_key}`,
      );
    }
    const partner = TEMPLATES.find((x) => x.key === t.paired_with_key);
    if (partner && partner.paired_with_key !== t.key) {
      throw new Error(
        `Pairing not symmetric: ${t.key} → ${t.paired_with_key}, ` +
          `but ${partner.key} → ${partner.paired_with_key ?? 'null'}`,
      );
    }
  }
}

/**
 * Canonical slugs that resolve directly without indirection. Mirrors the
 * set in seed_example_templates.ts. If you reference one of these in a
 * segment, it must already exist in the catalog with this exact slug.
 */
const CANONICAL_DIRECT_SLUGS = new Set<string>([
  // HYROX stations
  'hyrox-ski-erg',
  'hyrox-sled-push',
  'hyrox-sled-pull',
  'hyrox-burpee-broad-jump',
  'hyrox-rowing',
  'hyrox-farmer-carry',
  'hyrox-sandbag-lunges',
  'hyrox-wall-balls',
  // Run variants
  'run-z2-long',
  'run-tempo',
  'run-recovery-jog',
  'run-threshold-intervals',
  'run-vo2max-intervals',
  'run-race-pace-intervals',
  'run-strides',
  'run-fartlek',
  'run-hill-repeats',
  // Row variants
  'row-z2-long',
  'row-tempo',
  'row-threshold-intervals',
  'row-race-pace-intervals',
  'row-sprint-intervals',
  'row-recovery',
  // Ski-erg variants
  'ski-erg-z2-long',
  'ski-erg-tempo',
  'ski-erg-threshold-intervals',
  'ski-erg-race-pace-intervals',
  'ski-erg-sprint-intervals',
  'ski-erg-recovery',
  // Bike variants
  'bike-z2-endurance',
  'bike-tempo',
  'bike-threshold-intervals',
  'bike-vo2max-intervals',
  // Strength accessories (canonical)
  'single-leg-rdl',
  'pendlay-row',
  'weighted-pullup',
  'weighted-dip',
  'sled-drag-backwards',
  'atlas-stone-shoulder',
  'sandbag-clean',
  // Mobility / prehab blocks
  'mobility-hip-flow-15min',
  'prehab-shoulder-banded-15min',
  'foam-roll-lower-15min',
]);

/** Source-derived slugs we resolve via lookup (direct catalog match). */
const EXERCISE_SLUG_RESOLUTIONS: Record<string, string[]> = {
  'barbell-squat': ['barbell-squat', 'barbell-full-squat'],
  'pullups': ['pullups'],
  'romanian-deadlift': ['romanian-deadlift'],
  'split-squat-with-dumbbells': ['split-squat-with-dumbbells', 'split-squats'],
  'glute-ham-raise': ['glute-ham-raise', 'natural-glute-ham-raise'],
  'hanging-leg-raise': ['hanging-leg-raise'],
};

async function resolveExerciseSlug(
  sql: ReturnType<typeof getSql>,
  ref: string,
): Promise<string> {
  if (CANONICAL_DIRECT_SLUGS.has(ref)) return ref;
  const candidates = EXERCISE_SLUG_RESOLUTIONS[ref];
  if (!candidates) {
    throw new Error(`No slug resolution defined for "${ref}"`);
  }
  for (const candidate of candidates) {
    const rows = await sql<{ slug: string }[]>`
      select slug from exercises where slug = ${candidate} limit 1
    `;
    if (rows.length > 0) return candidate;
  }
  throw new Error(
    `Could not resolve exercise ref "${ref}" — tried [${candidates.join(', ')}]`,
  );
}

async function ensurePlaceholderCoach(
  sql: ReturnType<typeof getSql>,
): Promise<string> {
  const existingUser = await sql<{ id: string }[]>`
    select id::text as id from users where email = ${PABLO_COACH.email} limit 1
  `;
  let userId: string;
  if (existingUser.length === 0 || !existingUser[0]) {
    const [created] = await sql<{ id: string }[]>`
      insert into users (email, role)
      values (${PABLO_COACH.email}, 'coach')
      returning id::text as id
    `;
    if (!created) throw new Error('Failed to create user row');
    userId = created.id;
    process.stdout.write(`Created placeholder user ${PABLO_COACH.email}\n`);
  } else {
    userId = existingUser[0].id;
  }
  const existingCoach = await sql<{ id: string }[]>`
    select id::text as id from coaches where user_id = ${userId}::bigint limit 1
  `;
  if (existingCoach.length > 0 && existingCoach[0]) {
    return existingCoach[0].id;
  }
  const [created] = await sql<{ id: string }[]>`
    insert into coaches (user_id, full_name, bio)
    values (${userId}::bigint, ${PABLO_COACH.full_name}, ${PABLO_COACH.bio})
    returning id::text as id
  `;
  if (!created) throw new Error('Failed to create coach row');
  process.stdout.write(`Created placeholder coach (id=${created.id})\n`);
  return created.id;
}

function buildDescription(spec: TemplateSpec): string {
  return (
    `${spec.description}\n\n` +
    `**Estimated duration:** ${spec.estimated_duration_minutes} min\n\n` +
    `**Warm-up:** ${spec.warmup_notes}\n\n` +
    `**Cool-down:** ${spec.cooldown_notes}\n\n` +
    `**Coach notes:** ${spec.coach_notes}`
  );
}

async function upsertTemplate(
  sql: ReturnType<typeof getSql>,
  coachId: string,
  spec: TemplateSpec,
): Promise<string> {
  const description = buildDescription(spec);
  const existing = await sql<{ id: string }[]>`
    select id::text as id from templates
    where coach_id = ${coachId}::bigint and name = ${spec.name}
    limit 1
  `;
  if (existing.length > 0 && existing[0]) {
    const templateId = existing[0].id;
    await sql`
      update templates set
        description = ${description},
        format = ${spec.format},
        target_block = ${spec.target_block},
        target_level = ${spec.target_level},
        day_position = ${spec.day_position}
      where id = ${templateId}::bigint
    `;
    return templateId;
  }
  const [created] = await sql<{ id: string }[]>`
    insert into templates (
      coach_id, name, description, format, target_block, target_level, day_position
    ) values (
      ${coachId}::bigint, ${spec.name}, ${description},
      ${spec.format}, ${spec.target_block}, ${spec.target_level},
      ${spec.day_position}
    )
    returning id::text as id
  `;
  if (!created) throw new Error('Failed to create template');
  return created.id;
}

async function replaceSegments(
  sql: ReturnType<typeof getSql>,
  templateId: string,
  spec: TemplateSpec,
): Promise<number> {
  await sql`delete from template_segments where template_id = ${templateId}::bigint`;
  let position = 0;
  for (const seg of spec.segments) {
    const slug = await resolveExerciseSlug(sql, seg.exercise_slug);
    const exerciseRow = await sql<{ id: string }[]>`
      select id::text as id from exercises where slug = ${slug} limit 1
    `;
    if (exerciseRow.length === 0 || !exerciseRow[0]) {
      throw new Error(`Exercise ${slug} not found in catalog`);
    }
    const exerciseId = exerciseRow[0].id;
    const params = {
      ...seg.params,
      ...(seg.rounds_label ? { rounds_label: seg.rounds_label } : {}),
    };
    await sql`
      insert into template_segments (template_id, position, exercise_id, params_json, notes)
      values (
        ${templateId}::bigint, ${position}, ${exerciseId}::bigint,
        ${sql.json(params)}, ${seg.notes}
      )
    `;
    position += 1;
  }
  return position;
}

async function wirePairings(
  sql: ReturnType<typeof getSql>,
  keyToId: Map<string, string>,
): Promise<number> {
  let wired = 0;
  for (const t of TEMPLATES) {
    const id = keyToId.get(t.key);
    if (!id) continue;
    if (t.paired_with_key === null) {
      await sql`
        update templates set paired_with_template_id = null
        where id = ${id}::bigint
      `;
      continue;
    }
    const partnerId = keyToId.get(t.paired_with_key);
    if (!partnerId) {
      throw new Error(
        `Pair partner ${t.paired_with_key} of ${t.key} has no DB id`,
      );
    }
    await sql`
      update templates
      set paired_with_template_id = ${partnerId}::bigint
      where id = ${id}::bigint
    `;
    wired += 1;
  }
  return wired;
}

async function main(): Promise<void> {
  validatePairingReferences();
  const sql = getSql();
  try {
    const coachId = await ensurePlaceholderCoach(sql);
    process.stdout.write(`\nUsing coach_id=${coachId}\n\n`);

    const keyToId = new Map<string, string>();
    let totalSegments = 0;
    for (const spec of TEMPLATES) {
      const templateId = await upsertTemplate(sql, coachId, spec);
      const segCount = await replaceSegments(sql, templateId, spec);
      keyToId.set(spec.key, templateId);
      totalSegments += segCount;
      process.stdout.write(
        `  [${spec.target_block}] ${spec.day_position} → id=${templateId}, segments=${segCount}\n`,
      );
    }

    const wired = await wirePairings(sql, keyToId);
    process.stdout.write(`\nPairings wired: ${wired}\n`);

    const counts = await sql<{ target_block: string; count: string }[]>`
      select target_block::text as target_block, count(*)::text as count
      from templates
      where coach_id = ${coachId}::bigint
      group by target_block
      order by target_block
    `;
    process.stdout.write('\nTemplate counts by block (this coach):\n');
    for (const { target_block, count } of counts) {
      process.stdout.write(`  ${target_block.padEnd(8)} ${count}\n`);
    }
    process.stdout.write(`\nTotal segments inserted (this seed): ${totalSegments}\n`);
    process.stdout.write('Done.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
