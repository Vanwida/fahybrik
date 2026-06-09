/**
 * Seed 5 example templates demonstrating the élite-grade level of detail
 * the system supports. PLACEHOLDER content — Pablo will replace with real
 * methodology. All coach notes are tagged "DEMO — pending Pablo input".
 *
 * Linked to a placeholder coach (Pablo DEMO, pablo@fabrik.training).
 *
 * Idempotent: re-runs upsert template by (coach_id, name). Segments are
 * deleted and re-inserted on each run to keep them in sync with this file.
 *
 * Run: pnpm --filter @fahybrid/infra seed:templates
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
  name: string;
  description: string;
  format: TemplateFormat;
  target_block: TargetBlock;
  target_level: 1 | 2 | 3;
  estimated_duration_minutes: number;
  warmup_notes: string;
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
  {
    name: 'ACC — Volumen aeróbico Z2 + circuito de fuerza-resistencia',
    format: 'circuit',
    target_block: 'ACC',
    target_level: 2,
    estimated_duration_minutes: 75,
    description:
      'Bloque de acumulación. Base aeróbica larga en Z2 con anclaje de eficiencia ' +
      'cardíaca + circuito de fuerza-resistencia con cargas submáximas, foco en ' +
      'patrón motor y volumen acumulado. Sin trabajo en Z4-Z5.',
    warmup_notes:
      '10 min progresivos: 5 min trote Z1 (HR <130 bpm), drills de movilidad de ' +
      'cadera/tobillo (90/90, world\'s greatest stretch, leg swings), 3 × 30 m ' +
      'progresivos hasta Z2 alto. 1 ronda de activación: 10 air squats + 10 push-ups ' +
      '+ 10 ring rows + 10 dead bugs.',
    coach_notes:
      `${DEMO_TAG}. Foco del bloque ACC: VOLUMEN AERÓBICO + densidad muscular. ` +
      'No buscar fatiga neural — el atleta debe poder repetir mañana. ' +
      'Si HR sube por encima de Z2 sostenido en el rodaje → reducir pace, no ajustar HR. ' +
      'Cargas del circuito 60-65% 1RM, RPE objetivo 6-7. Si RPE >8 → bajar carga.',
    segments: [
      {
        exercise_slug: 'run-z2-long',
        params: {
          time_seconds: 50 * 60,
          hr_zone: 2,
          hr_target_bpm: 142,
          pace_target: '5:20-5:40 /km (ajustar por umbral aeróbico)',
          cadence_target_spm: 178,
          rpe: 5,
        },
        notes:
          '50 min rodaje continuo Z2. HR objetivo 138-148 bpm (ajustar por LT1). ' +
          'Pace tope: 5:40 /km. Cadencia 176-180 spm. ' +
          'Si HR sube por encima de 150 bpm más de 2 min → caminar 30 s para resetear. ' +
          'Decoupling objetivo <5% (Pa:Hr). Anota cualquier punto de subida brusca de HR.',
      },
      {
        exercise_slug: 'barbell-squat',
        params: {
          reps: 12,
          rounds: 3,
          weight_pct_1rm: 60,
          rpe: 7,
          rest_seconds: 90,
          tempo: '3-1-1-0',
        },
        notes:
          'Ronda 1 de circuito. 3 × 12 back squat @ 60% 1RM. Tempo 3-1-1-0 ' +
          '(3 s bajada, 1 s pausa abajo, 1 s subida, 0 s pausa arriba). ' +
          '90 s descanso entre series. Si RPE >8 en serie 2 → bajar a 55%.',
      },
      {
        exercise_slug: 'pull-ups',
        params: {
          reps: 8,
          rounds: 3,
          rpe: 7,
          rest_seconds: 90,
          tempo: '2-0-1-0',
        },
        notes:
          'Ronda 2 de circuito. 3 × 8 pull-ups estrictas. Tempo 2-0-1-0. ' +
          'Si no llega a 8 reps en serie 1 → banda elástica + mantener 8 reps. ' +
          '90 s descanso.',
      },
      {
        exercise_slug: 'walking-lunge',
        params: {
          reps: 24,
          rounds: 3,
          weight_kg: 16,
          rpe: 7,
          rest_seconds: 60,
        },
        notes:
          'Ronda 3 de circuito. 3 × 24 walking lunges (12/pierna) ' +
          'con goblet KB 16 kg (M) / 12 kg (W). Rodilla trasera al suelo, ' +
          'tronco vertical. 60 s descanso.',
      },
      {
        exercise_slug: 'plank',
        params: {
          time_seconds: 60,
          rounds: 3,
          rpe: 6,
          rest_seconds: 45,
        },
        notes:
          'Ronda 4 de circuito (core finisher). 3 × 60 s plank frontal. ' +
          'Glúteos activos, costillas hacia abajo. 45 s descanso.',
      },
    ],
  },
  {
    name: 'TRANS — Fartlek Z3-Z4 + estaciones HYROX específicas',
    format: 'intervals',
    target_block: 'TRANS',
    target_level: 2,
    estimated_duration_minutes: 70,
    description:
      'Bloque de transformación. Trabajo en umbral (Z3-Z4) con fartlek y bloque ' +
      'compound run + estaciones para entrenar la transición correr↔estación ' +
      'a intensidad de carrera.',
    warmup_notes:
      '12 min: 5 min trote Z1→Z2, drills (A-skip, B-skip, butt kicks, high knees ' +
      '× 20 m c/u), 4 × 80 m progresivos hasta pace de Z3. ' +
      '1 ronda activación específica: 10 wall balls ligeras + 10 burpees + 200 m row Z2.',
    coach_notes:
      `${DEMO_TAG}. Foco del bloque TRANS: introducir umbral. ` +
      'Pace objetivo del fartlek = pace race + 5-10 s/km. ' +
      'En las estaciones: NO buscar PR, buscar TÉCNICA bajo fatiga. ' +
      'Si en serie 4 de fartlek el pace cae más de 5 s/km respecto a serie 1 → cortar a 3 series. ' +
      'Decoupling objetivo <8%. HR pico no debe pasar de Z4 alto en fartlek.',
    segments: [
      {
        exercise_slug: 'run-fartlek',
        params: {
          rounds: 5,
          time_seconds: 4 * 60,
          rest_seconds: 2 * 60,
          hr_zone: 4,
          hr_target_bpm: 168,
          pace_target: 'Z4: 4:15-4:25 /km',
          cadence_target_spm: 184,
          rpe: 8,
        },
        rounds_label: '5 × (4 min Z4 / 2 min Z2 jog recuperación)',
        notes:
          'Fartlek 5 × 4 min @ Z4 (HR 165-172 bpm) / 2 min jog Z2 (HR <145 bpm). ' +
          'Pace Z4 objetivo: 4:15-4:25 /km. Cadencia mínima 182 spm en Z4. ' +
          'En recuperación: trote ACTIVO, no caminar. ' +
          'Variable clave: tiempo de retorno a Z2 (HRR60). Apuntar.',
      },
      {
        exercise_slug: 'ski-erg-race-pace-intervals',
        params: {
          distance_meters: 500,
          rounds: 3,
          rest_seconds: 60,
          stroke_rate_target_spm: 32,
          power_target_watts: 220,
          rpe: 8,
          effort_pct: 90,
        },
        rounds_label: '3 × 500 m SkiErg @ race pace',
        notes:
          'Compound run-station (training intervals, not the race station itself). ' +
          '3 rondas: 500 m SkiErg @ 90% effort. ' +
          'Stroke rate 30-34 spm. Potencia objetivo M: ~220 W / W: ~150 W ' +
          '(o split 1:55-2:00 /500 m M, 2:10-2:20 /500 m W). ' +
          '60 s descanso entre rondas.',
      },
      {
        exercise_slug: 'hyrox-burpee-broad-jump',
        params: {
          distance_meters: 30,
          rounds: 3,
          rest_seconds: 90,
          rpe: 8,
        },
        rounds_label: '3 × 30 m BBJ',
        notes:
          'Compound. 3 × 30 m burpee broad jumps. ' +
          'Salto mínimo 1 m por rep (M) / 0.8 m (W). Pecho al suelo cada rep. ' +
          'Cadencia objetivo: 1 rep cada 4-5 s sostenido. ' +
          '90 s descanso. SI ROMPE TÉCNICA → parar la serie.',
      },
      {
        exercise_slug: 'hyrox-wall-balls',
        params: {
          reps: 25,
          rounds: 3,
          weight_kg: 6,
          rest_seconds: 60,
          rpe: 8,
        },
        rounds_label: '3 × 25 wall balls',
        notes:
          'Compound. 3 × 25 wall balls. ' +
          'M: 6 kg @ 3.05 m. W: 4 kg @ 2.74 m. ' +
          'Sin breaks dentro de la serie. Hip crease debajo de rodilla, target tocado. ' +
          '60 s descanso. Punto técnico: usar piernas, NO empujar con brazos.',
      },
    ],
  },
  {
    name: 'REAL — Simulación HYROX media distancia (race pace)',
    format: 'hyrox_sim',
    target_block: 'REAL',
    target_level: 3,
    estimated_duration_minutes: 50,
    description:
      'Bloque de realización. Simulación HYROX a media distancia (4 estaciones, ' +
      '500 m run entre cada una) a pace de carrera. Objetivo: validar pacing ' +
      'estrategia y transiciones a 6-8 semanas del evento A.',
    warmup_notes:
      '15 min protocolo race-day: 5 min trote Z1, 5 min movilidad dinámica, ' +
      '5 min activación (3 × 200 m progresivos hasta pace race + 1 set técnico ' +
      'de cada estación a baja intensidad: 10 wall balls light, 100 m row Z2, 10 BBJ).',
    coach_notes:
      `${DEMO_TAG}. Esta es una sesión BENCHMARK. Cronometrar TODO. ` +
      'Variables a medir: split por run, tiempo en estación, transición run→station ' +
      '(target <5 s), HR al inicio y final de cada estación, HRR60 en transición. ' +
      'Objetivo de pace: race pace target del atleta + 0% (es decir, replicar el día). ' +
      'Si HR no llega a Z4 alto en runs → falta intensidad o falta tracking de HR. ' +
      'Post-sesión: revisar zone time distribution. Z3+Z4+Z5 debería ser >70%.',
    segments: [
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace M: ~4:30 /km · W: ~5:00 /km',
          cadence_target_spm: 184,
          rpe: 8,
          rounds_label: 'Run #1',
        },
        notes:
          'Run #1 — 500 m a race pace. Pace target individualizado por atleta ' +
          '(usar último benchmark de 5K como referencia: 5K pace + 8-12 s/km). ' +
          'Cadencia ≥182 spm. HR debe llegar a Z3 alto / Z4 bajo al final de los 500 m.',
      },
      {
        exercise_slug: 'hyrox-ski-erg',
        params: {
          distance_meters: 1000,
          stroke_rate_target_spm: 30,
          power_target_watts: 200,
          rpe: 9,
          effort_pct: 95,
        },
        notes:
          'Estación 1: SkiErg 1000 m a race pace. ' +
          'Split objetivo M: 4:00-4:20 (avg 2:00-2:10 /500 m). W: 4:40-5:00. ' +
          'Stroke rate 28-32 spm. NO sprint inicial — settle en split objetivo en primeros 200 m.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace + 5 s/km (recovery run)',
          cadence_target_spm: 182,
          rpe: 8,
          rounds_label: 'Run #2',
        },
        notes:
          'Run #2 — 500 m. Salida de SkiErg con pulso alto, foco en estabilizar ' +
          'cadencia rápido. HR pico no debe subir, debe estabilizar o bajar.',
      },
      {
        exercise_slug: 'hyrox-sled-push',
        params: {
          distance_meters: 50,
          weight_kg: 152,
          rpe: 9,
          effort_pct: 95,
        },
        notes:
          'Estación 2: Sled push 50 m. Peso M: +102 kg (152 kg total). W: +52 kg (102 kg total). ' +
          'Estrategia: 4 lengths de 12.5 m, micro-pausa al cambiar de length (max 3 s). ' +
          'Cuerpo bajo, pasos cortos. Tiempo objetivo M: 1:30-2:00. W: 1:45-2:30.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 4,
          pace_target: 'Race pace + 8-10 s/km (heavy legs)',
          rpe: 8,
          rounds_label: 'Run #3',
        },
        notes:
          'Run #3 — 500 m. Salida de sled, piernas pesadas. ' +
          'Aceptar pace +10 s/km los primeros 200 m, recuperar pace en últimos 300 m. ' +
          'Esto entrena el "sled-leg" — el atleta DEBE conocer esta sensación.',
      },
      {
        exercise_slug: 'hyrox-burpee-broad-jump',
        params: {
          distance_meters: 80,
          rpe: 9,
          effort_pct: 90,
        },
        notes:
          'Estación 3: BBJ 80 m. ~40 reps. Estrategia de pacing: cada 10 reps, ' +
          'micro-respiración 2 s arriba (no pausa real). ' +
          'Tiempo objetivo M: 3:30-4:30. W: 4:00-5:00. ' +
          'Salto mínimo 2 m M / 1.5 m W. Pecho al suelo. Dos pies despegue/aterrizaje.',
      },
      {
        exercise_slug: 'run-race-pace-intervals',
        params: {
          distance_meters: 500,
          hr_zone: 5,
          pace_target: 'Final push: race pace - 5 s/km',
          rpe: 9,
          rounds_label: 'Run #4 (final)',
        },
        notes:
          'Run #4 — final. 500 m. Pace ligeramente más rápido que race pace. ' +
          'HR debe llegar a Z5. Si queda gas — vaciar últimos 200 m. ' +
          'Esto simula el sprint final pre-última estación.',
      },
      {
        exercise_slug: 'hyrox-wall-balls',
        params: {
          reps: 50,
          weight_kg: 6,
          rpe: 9,
          effort_pct: 95,
        },
        notes:
          'Estación 4 (FINAL): 50 wall balls (mitad del race). ' +
          'M: 6 kg @ 3.05 m. W: 4 kg @ 2.74 m. ' +
          'Estrategia: 25-15-10 con 5 s respiración entre sets. ' +
          'Tiempo objetivo M: 2:00-2:30. W: 2:30-3:00. ' +
          'Vaciar el tanque. Esta es la última estación — no guardar nada.',
      },
    ],
  },
  {
    name: 'REAL — Sprint intervals Z5 + station tune-up (peaking sharpener)',
    format: 'intervals',
    target_block: 'REAL',
    target_level: 3,
    estimated_duration_minutes: 55,
    description:
      'Sesión de afilado dentro del bloque REAL. Volumen bajo, intensidad máxima. ' +
      'Sprints en Z5 para mantener VO2max + tune-up técnico de las estaciones más ' +
      'sensibles a la fatiga (BBJ, sled push, wall balls).',
    warmup_notes:
      '15 min muy progresivos: 6 min trote Z1→Z2, drills (A-skip, B-skip, ' +
      'high knees, butt kicks × 30 m), 5 × 100 m strides hasta velocidad de sprint, ' +
      '2 min descanso. Activación específica: 2 × (5 wall balls + 200 m row Z2).',
    coach_notes:
      `${DEMO_TAG}. Sesión de PEAKING. Intensidad alta, volumen bajo. ` +
      'Si el atleta no se siente fresco (HRV bajo, sueño <7h, RPE de calentamiento >5) ' +
      '→ reducir a 4 sprints o posponer. ' +
      'No hacer esta sesión a menos de 48h de la siguiente sesión clave. ' +
      'No hacer en los 7 días previos al evento A.',
    segments: [
      {
        exercise_slug: 'run-vo2max-intervals',
        params: {
          rounds: 6,
          distance_meters: 200,
          rest_seconds: 90,
          hr_zone: 5,
          pace_target: '95-100% sprint pace (M: 3:30 /km, W: 3:50 /km approx)',
          cadence_target_spm: 188,
          rpe: 9,
          effort_pct: 95,
        },
        rounds_label: '6 × 200 m sprint',
        notes:
          '6 × 200 m a 95-100% effort. Descanso completo 90 s. ' +
          'HR objetivo: Z5 (>175 bpm). Cadencia ≥186 spm. ' +
          'Pace objetivo individualizado: usar 5K time × 0.65 como reference. ' +
          'Apuntar tiempo de cada serie. Si serie 5 cae >2 s respecto a serie 1 → cortar.',
      },
      {
        exercise_slug: 'hyrox-burpee-broad-jump',
        params: {
          distance_meters: 20,
          rounds: 4,
          rest_seconds: 60,
          rpe: 8,
        },
        rounds_label: '4 × 20 m BBJ',
        notes:
          'Tune-up técnico BBJ. 4 × 20 m. Foco: PRECISIÓN y CADENCIA constante, ' +
          'no velocidad máxima. 60 s descanso. Apuntar tiempo y reps por serie ' +
          '(buscar consistencia ±0.5 s entre series).',
      },
      {
        exercise_slug: 'hyrox-sled-push',
        params: {
          distance_meters: 25,
          rounds: 3,
          weight_kg: 152,
          rest_seconds: 120,
          rpe: 9,
        },
        rounds_label: '3 × 25 m sled push',
        notes:
          'Tune-up sled push. 3 × 25 m a peso de carrera (M: 152 kg total, W: 102 kg total). ' +
          '120 s descanso. Foco: ARRANQUE explosivo y NO PARAR. ' +
          'Si el sled se para → el atleta lo arregla manteniendo cuerpo bajo. ' +
          'Apuntar tiempo de cada serie.',
      },
      {
        exercise_slug: 'hyrox-wall-balls',
        params: {
          reps: 30,
          rounds: 2,
          weight_kg: 6,
          rest_seconds: 90,
          rpe: 8,
        },
        rounds_label: '2 × 30 wall balls',
        notes:
          'Tune-up wall balls. 2 × 30 reps unbroken. ' +
          'M: 6 kg @ 3.05 m. W: 4 kg @ 2.74 m. ' +
          'Foco: CADENCIA constante (target ~30-35 reps/min) y target tocado limpio. ' +
          'Si rompe la unbroken → anotarlo, ajustar estrategia el día del race.',
      },
    ],
  },
  {
    name: 'Strength session — Lower body block (REAL phase)',
    format: 'strength_block',
    target_block: 'REAL',
    target_level: 3,
    estimated_duration_minutes: 65,
    description:
      'Sesión de fuerza autónoma del bloque REAL. Foco: mantener fuerza máxima ' +
      'tren inferior con cargas altas, volumen bajo. Estructura clásica strength ' +
      '(main lift heavy + accessories) sin glycolitic.',
    warmup_notes:
      '12 min: 5 min bike easy Z1, 3 min movilidad cadera/tobillo (90/90, ankle rocks, ' +
      'cossack squats × 8/lado), 2 × 5 air squats + 2 × 5 box jumps low. ' +
      'Build-up squat: empty bar × 8, 40% × 5, 60% × 3, 75% × 2 antes de empezar series de trabajo.',
    coach_notes:
      `${DEMO_TAG}. Sesión de fuerza máxima. ` +
      'En bloque REAL queremos MANTENER fuerza, no buscar PR. ' +
      'Cargas 80-87% 1RM en el main lift. Si RPE >9 en serie 1 → bajar a 80%. ' +
      'No mezclar con sesión cardio fuerte el mismo día (mín 6h separación). ' +
      'Si race en <10 días → reducir cargas a 70% y cortar volumen 30%.',
    segments: [
      {
        exercise_slug: 'barbell-squat',
        params: {
          reps: 3,
          rounds: 5,
          weight_pct_1rm: 85,
          rpe: 8,
          rest_seconds: 180,
          tempo: '2-1-X-0',
        },
        rounds_label: '5 × 3 back squat @ 85% 1RM',
        notes:
          'MAIN LIFT. 5 × 3 back squat @ 85% 1RM. Tempo 2-1-X-0 (2 s bajada, ' +
          '1 s pausa abajo, eXplosivo arriba, 0 s arriba). ' +
          '180 s descanso. RPE objetivo 8. Si RPE 9+ en serie 2 → bajar a 80%. ' +
          'Apuntar carga real usada y RPE de cada serie.',
      },
      {
        exercise_slug: 'romanian-deadlift',
        params: {
          reps: 6,
          rounds: 4,
          weight_pct_1rm: 70,
          rpe: 7,
          rest_seconds: 120,
          tempo: '3-0-1-0',
        },
        rounds_label: '4 × 6 RDL',
        notes:
          'Accessory #1 (posterior chain). 4 × 6 Romanian deadlift @ 70% 1RM deadlift. ' +
          'Tempo 3-0-1-0 (3 s bajada controlada, 1 s subida). ' +
          'Bajar hasta sentir hamstrings al límite, NO apoyar suelo. ' +
          '120 s descanso.',
      },
      {
        exercise_slug: 'bulgarian-split-squat',
        params: {
          reps: 8,
          rounds: 3,
          weight_kg: 24,
          rpe: 8,
          rest_seconds: 90,
        },
        rounds_label: '3 × 8/pierna BSS',
        notes:
          'Accessory #2 (unilateral). 3 × 8/pierna Bulgarian split squat con ' +
          '2 × DB 24 kg M / 12 kg W (o KB equivalente). ' +
          'Rodilla trasera al suelo, tronco vertical. 90 s descanso ENTRE PIERNAS, ' +
          'no entre series (es decir: 8 izq → 10 s → 8 der → 90 s → siguiente serie).',
      },
      {
        exercise_slug: 'standing-calf-raise',
        params: {
          reps: 12,
          rounds: 3,
          weight_kg: 20,
          rpe: 7,
          rest_seconds: 60,
          tempo: '2-2-2-0',
        },
        rounds_label: '3 × 12 calf raise',
        notes:
          'Accessory #3 (calf, prevention). 3 × 12 standing calf raise con DB. ' +
          'Tempo 2-2-2-0 (2 s subida, 2 s arriba contracción máxima, 2 s bajada). ' +
          '60 s descanso. Foco prevención lesión sled/lunge.',
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
          'Core finisher. 3 × 10 hanging leg raise estricto. ' +
          'Sin balanceo. Piernas rectas si posible (rodillas dobladas si no). ' +
          '60 s descanso. Si no llega a 10 reps estricto → 8 reps + 2 negativas lentas.',
      },
    ],
  },
];

/**
 * Map our human-readable exercise references to slugs that exist in the
 * exercise catalog. The free-exercise-db source uses specific names; some
 * we rename to match common gym vocabulary. If a slug is missing in the DB,
 * the script will fail loudly so the catalog can be expanded.
 *
 * Canonical slugs (HYROX stations + cardio variants like `run-z2-long`,
 * `ski-erg-race-pace-intervals`, etc.) bypass this map and resolve directly
 * via CANONICAL_DIRECT_SLUGS — they're the authoritative names.
 */
const EXERCISE_SLUG_RESOLUTIONS: Record<string, string[]> = {
  'barbell-squat': ['barbell-squat', 'barbell-full-squat'],
  'pull-ups': ['pullups'],
  'walking-lunge': ['dumbbell-lunges', 'barbell-walking-lunge'],
  'plank': ['plank'],
  'romanian-deadlift': ['romanian-deadlift'],
  'bulgarian-split-squat': ['split-squat-with-dumbbells', 'split-squats'],
  'standing-calf-raise': ['standing-dumbbell-calf-raise', 'standing-barbell-calf-raise'],
  'hanging-leg-raise': ['hanging-leg-raise'],
};

/**
 * Canonical slugs that resolve directly without indirection. These are the
 * 8 HYROX stations + the discipline-specific cardio variants seeded in
 * `seed_exercises.ts`. If you reference one of these in a template segment,
 * it must exist in the catalog with this exact slug.
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
  // Ski-erg variants
  'ski-erg-z2-long',
  'ski-erg-tempo',
  'ski-erg-threshold-intervals',
  'ski-erg-race-pace-intervals',
  'ski-erg-sprint-intervals',
  // Bike variants
  'bike-z2-endurance',
  'bike-tempo',
  'bike-threshold-intervals',
  'bike-vo2max-intervals',
]);

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
  // last-resort: prefix LIKE
  const fallback = await sql<{ slug: string }[]>`
    select slug from exercises where slug like ${ref + '%'} limit 1
  `;
  if (fallback.length > 0 && fallback[0]) return fallback[0].slug;
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
    process.stdout.write(`Created placeholder user ${PABLO_COACH.email} (id=${userId})\n`);
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

async function upsertTemplate(
  sql: ReturnType<typeof getSql>,
  coachId: string,
  spec: TemplateSpec,
): Promise<string> {
  const description =
    `${spec.description}\n\n` +
    `**Estimated duration:** ${spec.estimated_duration_minutes} min\n\n` +
    `**Warm-up:** ${spec.warmup_notes}\n\n` +
    `**Coach notes:** ${spec.coach_notes}`;

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
        target_level = ${spec.target_level}
      where id = ${templateId}::bigint
    `;
    return templateId;
  }
  const [created] = await sql<{ id: string }[]>`
    insert into templates (coach_id, name, description, format, target_block, target_level)
    values (
      ${coachId}::bigint, ${spec.name}, ${description},
      ${spec.format}, ${spec.target_block}, ${spec.target_level}
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

async function main(): Promise<void> {
  const sql = getSql();
  try {
    const coachId = await ensurePlaceholderCoach(sql);
    process.stdout.write(`\nUsing coach_id=${coachId}\n\n`);

    let totalSegments = 0;
    for (const spec of TEMPLATES) {
      const templateId = await upsertTemplate(sql, coachId, spec);
      const segCount = await replaceSegments(sql, templateId, spec);
      totalSegments += segCount;
      process.stdout.write(
        `  [${spec.target_block}] "${spec.name}" → template_id=${templateId}, segments=${segCount}\n`,
      );
    }

    const counts = await sql<{ target_block: string; count: string }[]>`
      select target_block::text as target_block, count(*)::text as count
      from templates
      where coach_id = ${coachId}::bigint
      group by target_block
      order by target_block
    `;
    process.stdout.write('\nTemplate counts by block:\n');
    for (const { target_block, count } of counts) {
      process.stdout.write(`  ${target_block.padEnd(8)} ${count}\n`);
    }
    process.stdout.write(`\nTotal segments inserted: ${totalSegments}\n`);
    process.stdout.write('Done.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
