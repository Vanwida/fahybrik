/**
 * Seed exercise catalog.
 *
 * Source: yuhonas/free-exercise-db (MIT) — 873 exercises with name, category,
 * primary/secondary muscles, equipment. We filter for HYROX/strength/conditioning
 * relevance and remap source categories to our `exercise_category` enum.
 *
 * The 8 official HYROX stations are inserted explicitly with canonical specs.
 *
 * Idempotent: upsert on slug. Safe to re-run.
 *
 * Run: pnpm --filter @fahybrid/infra seed:exercises
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema';
import { getSql } from './_db.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

const SOURCE_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const SOURCE_LICENSE = 'MIT';
const SOURCE_ATTRIBUTION = 'yuhonas/free-exercise-db';

type SourceExercise = {
  id?: string;
  name: string;
  force?: 'pull' | 'push' | 'static' | null;
  level?: 'beginner' | 'intermediate' | 'expert';
  mechanic?: 'compound' | 'isolation' | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
  images?: string[];
};

type ExerciseCategoryEnum = z.infer<typeof exerciseCategory>;

type DefaultMetrics = {
  reps?: boolean;
  time?: boolean;
  distance?: boolean;
  weight?: boolean;
  calories?: boolean;
  rpe?: boolean;
  hr?: boolean;
};

type ExerciseRow = {
  slug: string;
  name: string;
  category: ExerciseCategoryEnum;
  primary_muscle_groups: string[];
  equipment: string[];
  default_metrics_json: DefaultMetrics;
  hyrox_station_position: number | null;
  description: string | null;
  cues: string | null;
  video_url: string | null;
  source: string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const EQUIPMENT_NORMALIZATION: Record<string, string> = {
  'body only': 'bodyweight',
  'kettlebells': 'kettlebell',
  'dumbbell': 'dumbbell',
  'barbell': 'barbell',
  'cable': 'cable',
  'machine': 'machine',
  'bands': 'resistance_band',
  'medicine ball': 'medicine_ball',
  'exercise ball': 'stability_ball',
  'foam roll': 'foam_roller',
  'e-z curl bar': 'ez_curl_bar',
  'other': 'other',
};

function normalizeEquipment(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const key = raw.toLowerCase();
  return [EQUIPMENT_NORMALIZATION[key] ?? key];
}

function mapCategory(src: SourceExercise): ExerciseCategoryEnum | null {
  const c = (src.category ?? '').toLowerCase();
  const muscles = (src.primaryMuscles ?? []).map((m) => m.toLowerCase());
  const eq = (src.equipment ?? '').toLowerCase();
  const name = src.name.toLowerCase();

  if (c === 'cardio') return 'cardio';
  if (c === 'stretching') return 'mobility';
  if (c === 'plyometrics') return 'plyometric';

  // core override (abs / lower back as primary, bodyweight or light)
  const isCoreFocus =
    muscles.some((m) => ['abdominals', 'lower back'].includes(m)) &&
    (eq === 'body only' || eq === '' || eq === 'medicine ball' || eq === 'exercise ball');
  if (isCoreFocus && c === 'strength') return 'core';

  if (c === 'strength') {
    // bodyweight skill movements (pull-ups, dips, handstand variants, muscle-ups)
    if (
      eq === 'body only' &&
      /pull-up|chin-up|muscle-up|handstand|dip|pistol|l-sit|hanging|front lever|back lever|ring/.test(
        name,
      )
    ) {
      return 'skill';
    }
    return 'strength';
  }
  if (c === 'powerlifting') return 'strength';
  if (c === 'olympic weightlifting') return 'strength';
  if (c === 'strongman') return 'strength';
  return null;
}

function defaultMetricsFor(
  cat: ExerciseCategoryEnum,
  src: SourceExercise,
): DefaultMetrics {
  const eq = (src.equipment ?? '').toLowerCase();
  switch (cat) {
    case 'cardio':
      return { time: true, distance: true, calories: true };
    case 'strength':
      return { reps: true, weight: true };
    case 'plyometric':
      return { reps: true, time: true };
    case 'mobility':
      return { time: true };
    case 'skill':
      return { reps: true, time: true };
    case 'core':
      return eq === 'body only' || eq === ''
        ? { reps: true, time: true }
        : { reps: true, weight: true, time: true };
    case 'hyrox_station':
      return { reps: true, time: true, distance: true, weight: true };
    default:
      return {};
  }
}

function buildDescription(src: SourceExercise): string | null {
  const ins = src.instructions ?? [];
  if (ins.length === 0) return null;
  const text = ins.join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 4000 ? text.slice(0, 3997) + '...' : text;
}

function buildCues(src: SourceExercise): string | null {
  const tags: string[] = [];
  if (src.force) tags.push(`force: ${src.force}`);
  if (src.level) tags.push(`level: ${src.level}`);
  if (src.mechanic) tags.push(`mechanic: ${src.mechanic}`);
  if ((src.secondaryMuscles ?? []).length > 0) {
    tags.push(`secondary: ${(src.secondaryMuscles ?? []).join(', ')}`);
  }
  return tags.length > 0 ? tags.join(' | ') : null;
}

/**
 * The 8 official HYROX stations, in order. Specs reflect the standard
 * Open division (men's / women's loads where they differ are noted in cues).
 */
const HYROX_STATIONS: ExerciseRow[] = [
  {
    slug: 'hyrox-ski-erg',
    name: 'HYROX SkiErg',
    category: 'hyrox_station',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, calories: true },
    hyrox_station_position: 1,
    description: 'Station 1 of 8. 1000 m on the Concept2 SkiErg.',
    cues:
      'Open distance: 1000 m. Drive from hips, full extension, finish past hips. PM5 distance mode.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-sled-push',
    name: 'HYROX Sled Push',
    category: 'hyrox_station',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'core'],
    equipment: ['sled'],
    default_metrics_json: { time: true, distance: true, weight: true },
    hyrox_station_position: 2,
    description:
      'Station 2 of 8. Push a weighted sled 50 m (4 × 12.5 m lengths).',
    cues:
      "Open men: +152 kg total (sled 50 kg + 102 kg added). Open women: +102 kg total. Low body angle, short choppy steps, never let the sled stop.",
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-sled-pull',
    name: 'HYROX Sled Pull',
    category: 'hyrox_station',
    primary_muscle_groups: ['lats', 'biceps', 'core', 'glutes'],
    equipment: ['sled', 'rope'],
    default_metrics_json: { time: true, distance: true, weight: true },
    hyrox_station_position: 3,
    description:
      'Station 3 of 8. Pull a weighted sled 50 m (4 × 12.5 m lengths) hand-over-hand on rope, run to reset between lengths.',
    cues:
      'Open men: +103 kg total (sled 50 kg + 53 kg added). Open women: +78 kg total. Hand-over-hand pull, athletic stance, big pulls > small pulls.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-burpee-broad-jump',
    name: 'HYROX Burpee Broad Jump',
    category: 'hyrox_station',
    primary_muscle_groups: ['full_body'],
    equipment: ['bodyweight'],
    default_metrics_json: { reps: true, time: true, distance: true },
    hyrox_station_position: 4,
    description:
      'Station 4 of 8. 80 m of burpee broad jumps. Chest to floor each rep, two-foot takeoff and landing.',
    cues:
      'Approx 40 reps depending on jump distance. Pace control critical — minute-after-minute consistency beats early heroics. Two-footed takeoff and landing are judged.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-rowing',
    name: 'HYROX Rowing',
    category: 'hyrox_station',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, calories: true },
    hyrox_station_position: 5,
    description: 'Station 5 of 8. 1000 m on the Concept2 RowErg.',
    cues:
      'Open distance: 1000 m. Damper 4-6, target 24-28 spm steady. Legs-back-arms drive, arms-back-legs recovery. PM5 distance mode.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-farmer-carry',
    name: 'HYROX Farmers Carry',
    category: 'hyrox_station',
    primary_muscle_groups: ['forearms', 'traps', 'core', 'glutes'],
    equipment: ['kettlebell'],
    default_metrics_json: { time: true, distance: true, weight: true },
    hyrox_station_position: 6,
    description:
      'Station 6 of 8. 200 m carrying two kettlebells. No rest, no setting down (penalty if dropped outside designated zone).',
    cues:
      'Open men: 2 × 24 kg KB. Open women: 2 × 16 kg KB. Tall posture, ribs down, fast turnover. Crush the handles, breathe rhythmically.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-sandbag-lunges',
    name: 'HYROX Sandbag Lunges',
    category: 'hyrox_station',
    primary_muscle_groups: ['quads', 'glutes', 'core', 'traps'],
    equipment: ['sandbag'],
    default_metrics_json: { time: true, distance: true, weight: true, reps: true },
    hyrox_station_position: 7,
    description:
      'Station 7 of 8. 100 m of walking lunges with sandbag on back/shoulders. Trail knee must touch the floor each rep.',
    cues:
      'Open men: 20 kg sandbag. Open women: 10 kg sandbag. Trail knee must kiss the floor (judged). Sandbag stays on back/shoulders. Approx 80-100 lunge reps.',
    video_url: null,
    source: 'hyrox_official',
  },
  {
    slug: 'hyrox-wall-balls',
    name: 'HYROX Wall Balls',
    category: 'hyrox_station',
    primary_muscle_groups: ['quads', 'glutes', 'shoulders', 'core'],
    equipment: ['wall_ball'],
    default_metrics_json: { reps: true, time: true, weight: true },
    hyrox_station_position: 8,
    description:
      'Station 8 of 8. 100 reps (men) or 75 reps (women) of wall balls. Hip crease below knee at the bottom, ball must hit the target at the top.',
    cues:
      'Open men: 6 kg ball, 10 ft (3.05 m) target, 100 reps. Open women: 4 kg ball, 9 ft (2.74 m) target, 75 reps. Break early, break often. Last station — empty the tank.',
    video_url: null,
    source: 'hyrox_official',
  },
];

/**
 * Cardio variants as first-class catalog rows.
 *
 * Élite hybrid athletes don't log "running" generically — every session has
 * a discipline-specific intent (Z2 long, tempo, threshold, VO2max, race-pace,
 * strides, fartlek, hill repeats, recovery jog). Each variant is its own
 * row so templates can reference it directly and the builder UI can render
 * the right form fields (defaults below).
 *
 * default_metrics_json declares which numeric metric flags apply per
 * `defaultMetricsSchema` (reps/time/distance/weight/calories/rpe/hr).
 * Discipline-specific prescription details (zone target, cadence ranges,
 * stroke-rate, drag factor, suggested duration, recovery ratio) live in
 * `cues` so they're discoverable in the builder without inventing schema
 * fields that won't generalize.
 */
const CARDIO_VARIANTS: ExerciseRow[] = [
  {
    slug: 'run-z2-long',
    name: 'Run — Z2 long (aerobic base)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Continuous aerobic base run, 60-120 min at HR Z2 (~70% HRmax / sub-LT1). ' +
      'Builds mitochondrial density and aerobic ceiling. Cadence target 174-180 spm.',
    cues:
      'Zone: Z2 (~70% HRmax). Duration: 60-120 min. Cadence: 174-180 spm. ' +
      'Pace ceiling — slow down if HR drifts above Z2. Decoupling target <5%. ' +
      'Conversational effort: full sentences possible.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-tempo',
    name: 'Run — Tempo (sustained Z3 sub-LT)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Continuous tempo run 25-50 min at HR Z3 (sub-lactate-threshold). ' +
      'Pushes LT1→LT2 ceiling. Cadence target 178-184 spm.',
    cues:
      'Zone: Z3 sub-LT (~80-85% HRmax). Duration: 25-50 min continuous. ' +
      'Cadence: 178-184 spm. Pace: ~10-15 s/km slower than 5K race pace. ' +
      'Comfortably hard — short phrases only.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-recovery-jog',
    name: 'Run — Recovery jog (Z1 active)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Active-recovery shake-out, 20-40 min at HR Z1 (<70% HRmax). ' +
      'Conversational effort, no time pressure. For day after hard sessions.',
    cues:
      'Zone: Z1 (<70% HRmax). Duration: 20-40 min. ' +
      'Cadence: relaxed, 168-176 spm. Pace: walk-jog if HR creeps to Z2. ' +
      'Goal: blood flow, not fitness gain. Stop if it feels hard.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-threshold-intervals',
    name: 'Run — Threshold intervals (Z4 cruise reps)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Threshold intervals, typically 4-8 × 1000 m at HR Z4 (~90% LT) ' +
      'with short jog recovery (~50% rep duration). Improves lactate clearance.',
    cues:
      'Zone: Z4 (~88-92% HRmax / ~90% LT pace). Reps: 4-8 × 1000 m (or 3-5 × 1.5 km). ' +
      'Recovery: jog 90 s-2 min Z2, ratio ~1:0.4. Cadence: 180-184 spm. ' +
      'Pace: ~5K time + 5-10 s/km. Last rep should match first ±2 s.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-vo2max-intervals',
    name: 'Run — VO2max intervals (Z5)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'VO2max intervals, typically 5-8 × 3 min at HR Z5 (>92% HRmax) with ' +
      'full 1:1 jog recovery. Develops maximal aerobic power.',
    cues:
      'Zone: Z5 (>92% HRmax). Reps: 5-8 × 3 min (or 6-10 × 2 min). ' +
      'Recovery: 1:1 ratio jog Z2 (3 min jog after each 3 min rep). ' +
      'Pace: ~3K race pace. Cadence: 184+ spm. ' +
      'If pace drops >3 s/km from rep 1 to rep 4 → cut volume.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-race-pace-intervals',
    name: 'Run — HYROX race-pace intervals (400 m reps)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Race-pace specificity for HYROX 1 km splits. Typically 6-12 × 400 m at ' +
      'target HYROX 1 km pace, with 60-90 s recovery. Trains race-day rhythm.',
    cues:
      'Zone: Z4 high (HYROX 1 km split target pace). Reps: 6-12 × 400 m. ' +
      'Recovery: 60-90 s walk-jog (incomplete on purpose, simulates station fatigue). ' +
      'Cadence: 182-186 spm. ' +
      'Goal pace = athlete\'s target 1 km HYROX split (e.g. 4:30 /km M / 5:00 /km W).',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-strides',
    name: 'Run — Strides (neuromuscular)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true },
    hyrox_station_position: null,
    description:
      'Short fast accelerations, typically 4-8 × 100 m at ~95% effort, full ' +
      'walk recovery. Neuromuscular activation, not aerobic. Use as primer or ' +
      'cooldown finisher on easy days.',
    cues:
      'Reps: 4-8 × 100 m at ~95% sprint effort (NOT max). ' +
      'Recovery: walk back full (60-90 s). ' +
      'Cadence: 188+ spm. Form: tall posture, knee drive, relaxed shoulders. ' +
      'No HR target — too short to matter. Prime mover, not a workout.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-fartlek',
    name: 'Run — Fartlek (varied pace play)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Unstructured-to-structured pace play. Typical structure: 1 min hard / ' +
      '2 min easy × 10, or pyramid (1-2-3-2-1 min hard with equal easy). ' +
      'Trains pace-change resilience and lactate buffering.',
    cues:
      'Hard portions: Z3-Z4 (NOT max). Easy portions: Z2 jog (do not walk). ' +
      'Total session: 30-50 min including warm-up. ' +
      'Cadence: 180+ spm in hard, 174+ spm in easy. ' +
      'Variable: time-to-Z2 between hard surges (HRR60). Track it.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'run-hill-repeats',
    name: 'Run — Hill repeats',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Hill repeats, typically 6-12 reps up a 4-8% gradient hill at Z4-Z5 ' +
      'effort. Walk-jog down for recovery. Builds power, run economy, and ' +
      'tendon stiffness with lower impact than flat sprints.',
    cues:
      'Reps: 6-12 × 30-60 s up a 4-8% hill at Z4-Z5 effort. ' +
      'Recovery: walk-jog down (full ratio ~1:2). ' +
      'Form: short stride, drive knees, lean slightly into hill from ankles. ' +
      'If pace drops >10% across reps → cut volume. ' +
      'Stops at first sign of form breakdown.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  // ---------- Rowing variants (Concept2 RowErg) ----------
  {
    slug: 'row-z2-long',
    name: 'Row — Z2 long (aerobic base)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Continuous Z2 row, 30-60 min at HR Z2 / ~70% HRmax. Low stroke rate, ' +
      'long power application. Builds aerobic base with low impact.',
    cues:
      'Zone: Z2 (~70% HRmax). Duration: 30-60 min. ' +
      'Stroke rate: 18-22 spm. Damper: 4-6 (drag factor 110-130). ' +
      'Split: ~10-15 s/500m slower than 2K PR pace. Power smooth, not jerky.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'row-tempo',
    name: 'Row — Tempo (Z3 continuous)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Tempo row 20-40 min continuous at HR Z3 sub-LT. Cruise pace just below ' +
      'threshold.',
    cues:
      'Zone: Z3 (~80-85% HRmax). Duration: 20-40 min. ' +
      'Stroke rate: 22-26 spm. Damper: 5-6 (drag 120-135). ' +
      'Split: ~5 s/500m slower than 5K pace.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'row-threshold-intervals',
    name: 'Row — Threshold intervals (Z4)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Threshold rowing intervals, typically 4-6 × 1000 m at Z4 with 90 s rest, ' +
      'or 3 × 2000 m with 3 min rest. Lactate buffering.',
    cues:
      'Zone: Z4 (~90% HRmax). Reps: 4-6 × 1000 m or 3 × 2000 m. ' +
      'Stroke rate: 26-30 spm. Damper: 5-7 (drag 125-140). ' +
      'Split: ~2K PR + 2-3 s/500m. Last rep ≥ first rep pace (or cut session).',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'row-race-pace-intervals',
    name: 'Row — HYROX race-pace intervals',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'HYROX 1 km row-station specificity. Typically 4-6 × 500 m at HYROX ' +
      'race-pace 500m split, with 60 s rest. Simulates fatigued race-day pacing.',
    cues:
      'Reps: 4-6 × 500 m at target HYROX 1 km split. ' +
      'Recovery: 60 s rest (incomplete on purpose). ' +
      'Stroke rate: 28-32 spm. Damper: 5-7. ' +
      'Target split M: 1:55-2:05 /500m. W: 2:10-2:20 /500m.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'row-sprint-intervals',
    name: 'Row — Sprint intervals (Z5)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal short sprints, typically 8-10 × 250 m at >95% effort with full ' +
      'recovery 1:2-1:3. Develops peak power, neuromuscular drive.',
    cues:
      'Reps: 8-10 × 250 m or 6-8 × 30 s at >95% effort. ' +
      'Recovery: 1:2-1:3 ratio (e.g. 250m @ 45 s → 90-135 s rest). ' +
      'Stroke rate: 32-36 spm peak. Damper: 6-8. ' +
      'Split: 2K PR pace - 5 s/500m. ' +
      'Cut session at first rep that drops >3 s from session best.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  // ---------- Ski-erg variants (Concept2 SkiErg) ----------
  {
    slug: 'ski-erg-z2-long',
    name: 'SkiErg — Z2 long (aerobic base)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Continuous Z2 SkiErg, 20-40 min at ~70% HRmax. Posterior-chain-dominant ' +
      'aerobic work. Useful as run-substitute on impact-recovery days.',
    cues:
      'Zone: Z2 (~70% HRmax). Duration: 20-40 min. ' +
      'Stroke rate: 26-30 spm. Damper: 4-6 (drag 105-125). ' +
      'Split: ~15 s/500m slower than HYROX race split. Long smooth pulls.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'ski-erg-tempo',
    name: 'SkiErg — Tempo (Z3 continuous)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Tempo SkiErg 12-25 min continuous at HR Z3 sub-LT. Builds station-' +
      'specific aerobic capacity for HYROX station 1.',
    cues:
      'Zone: Z3 (~80-85% HRmax). Duration: 12-25 min. ' +
      'Stroke rate: 28-32 spm. Damper: 5-7. ' +
      'Split: ~5 s/500m slower than 1K race split.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'ski-erg-threshold-intervals',
    name: 'SkiErg — Threshold intervals (Z4)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Threshold SkiErg intervals, typically 4-6 × 500 m at Z4 with 60-90 s rest. ' +
      'Develops upper-body lactate clearance.',
    cues:
      'Zone: Z4 (~90% HRmax). Reps: 4-6 × 500 m or 3 × 1000 m. ' +
      'Stroke rate: 30-34 spm. Damper: 6-8. ' +
      'Split: HYROX 1K race split + 2-3 s/500m. ' +
      'Power target M: ~220 W avg / W: ~150 W avg (calibrate per athlete).',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'ski-erg-race-pace-intervals',
    name: 'SkiErg — HYROX race-pace intervals',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'HYROX station 1 specificity. Typically 4-6 × 250 m at race-pace 500m ' +
      'split, with 45-60 s rest. Trains opener-station pacing.',
    cues:
      'Reps: 4-6 × 250 m at HYROX 1K race split. ' +
      'Recovery: 45-60 s. Stroke rate: 30-34 spm. Damper: 6-8. ' +
      'Power target M: ~220 W / W: ~150 W. ' +
      'Goal: replicate the "open hot but settle" feel of station 1.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'ski-erg-sprint-intervals',
    name: 'SkiErg — Sprint intervals (Z5)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal SkiErg sprints, typically 8-10 × 30 s at >95% effort with ' +
      'full recovery. Peak power and stroke-rate ceiling.',
    cues:
      'Reps: 8-10 × 30 s or 6-8 × 100 m all-out. ' +
      'Recovery: 1:3 ratio (30 s sprint → 90 s rest). ' +
      'Stroke rate: 36-40 spm peak. Damper: 7-10. ' +
      'Cut session when peak watts fall >10% from session best.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  // ---------- Bike variants (Assault / road / indoor) ----------
  {
    slug: 'bike-z2-endurance',
    name: 'Bike — Z2 endurance',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['bike'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Continuous Z2 bike, 60-180 min at ~70% HRmax. High aerobic volume ' +
      'with minimal impact — useful for run-recovery / injury periods.',
    cues:
      'Zone: Z2 (~70% HRmax). Duration: 60-180 min. ' +
      'Cadence: 85-95 rpm. Power (if available): ~65-75% FTP. ' +
      'Decoupling target <5%. Conversational effort.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'bike-tempo',
    name: 'Bike — Tempo / sweet-spot',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['bike'],
    default_metrics_json: { time: true, distance: true, hr: true, calories: true },
    hyrox_station_position: null,
    description:
      'Sweet-spot / tempo bike 30-60 min at HR Z3 / ~85-95% FTP. Cost-effective ' +
      'aerobic gain for time-pressured weeks.',
    cues:
      'Zone: Z3 (~80-87% HRmax). Duration: 30-60 min (continuous or 2-3 × 15-20 min). ' +
      'Cadence: 85-95 rpm. Power: 85-95% FTP.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'bike-threshold-intervals',
    name: 'Bike — Threshold intervals (Z4)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['bike'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Threshold bike intervals, typically 3-5 × 8-12 min at Z4 / ~95-105% FTP ' +
      'with 4-6 min rest. Builds FTP without running impact.',
    cues:
      'Zone: Z4 (~88-92% HRmax). Reps: 3-5 × 8-12 min @ 95-105% FTP. ' +
      'Recovery: 4-6 min easy spin Z2. Cadence: 90-100 rpm. ' +
      'Last rep ≥ first rep avg power (or cut session).',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'bike-vo2max-intervals',
    name: 'Bike — VO2max intervals (Z5)',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['bike'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'VO2max bike intervals, typically 5-6 × 3-5 min at Z5 / ~110-120% FTP ' +
      'with 1:1 rest. Develops maximal aerobic power without running load.',
    cues:
      'Zone: Z5 (>92% HRmax). Reps: 5-6 × 3-5 min @ 110-120% FTP. ' +
      'Recovery: 1:1 ratio easy spin. Cadence: 95-105 rpm. ' +
      'If avg power drops >5% across reps → cut volume.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  // ---------- Erg-recovery fillers (gap-fill for run-recovery-jog parity) ----------
  {
    slug: 'row-recovery',
    name: 'Row — Recovery (Z1 active)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Active-recovery row, 15-30 min at HR Z1 (<70% HRmax). Conversational ' +
      'effort. Useful as run-recovery substitute on impact-recovery days.',
    cues:
      'Zone: Z1 (<70% HRmax). Duration: 15-30 min. ' +
      'Stroke rate: 18-20 spm. Damper: 3-5 (drag 100-115). ' +
      'Split: ~20 s/500m slower than 2K PR. Goal: blood flow, not fitness.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'ski-erg-recovery',
    name: 'SkiErg — Recovery (Z1 active)',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Active-recovery SkiErg, 10-20 min at HR Z1 (<70% HRmax). Easy upper-body ' +
      'flush. Common after heavy lower-body strength sessions.',
    cues:
      'Zone: Z1 (<70% HRmax). Duration: 10-20 min. ' +
      'Stroke rate: 22-26 spm. Damper: 3-5. ' +
      'Split: ~20 s/500m slower than 1K race split. Long smooth pulls.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
];

/**
 * Test protocols as catalog rows.
 *
 * Tests are first-class exercises so the template builder can prescribe
 * them and analytics roll up "test-5k-tt result" as a stand-alone trend.
 * Categories chosen by dominant modality. The HYROX sims are kept in
 * `cardio` (not `hyrox_station`) because the schema constraint reserves
 * `hyrox_station` for the 8 official stations with a position 1-8.
 */
const TESTS_AND_PROTOCOLS: ExerciseRow[] = [
  {
    slug: 'test-5k-tt',
    name: 'Test — 5K time trial',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal 5 km running time trial. Used to calibrate threshold pace and ' +
      'race-pace targets. Run on track or flat course, GPS confirmed.',
    cues:
      'Distance: 5000 m. Effort: maximal — pace as evenly as possible. ' +
      'Re-test every 6-8 weeks during ACC/TRANS, every 4-6 weeks in REAL. ' +
      'Output: 5K time → derive Z3/Z4/Z5 paces + LT estimate. ' +
      'Cadencia ≥184 spm last km.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-2k-row-tt',
    name: 'Test — 2K row time trial',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'glutes', 'quads', 'core', 'hamstrings'],
    equipment: ['rower'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal 2000 m row time trial on Concept2 RowErg. Gold-standard ' +
      'rowing benchmark. Calibrates row training splits.',
    cues:
      'Distance: 2000 m. Damper: 5-7 (drag 130-140). ' +
      'Pacing strategy: open ~5 s under target split, settle 4 s over for ' +
      '1500 m, sprint last 500 m. Stroke rate 28→32 spm peak. ' +
      'Re-test every 8-12 weeks. Output: 2K split → derive all row paces.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-1k-ski-tt',
    name: 'Test — 1K SkiErg time trial',
    category: 'cardio',
    primary_muscle_groups: ['lats', 'core', 'triceps', 'glutes'],
    equipment: ['ski_erg'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal 1000 m SkiErg time trial. Direct calibration for HYROX ' +
      'station 1 race-pace target.',
    cues:
      'Distance: 1000 m. Damper: 6-8. ' +
      'Pacing: open ~3 s under target split, settle for 600 m, push last 200 m. ' +
      'Stroke rate 30-34 spm. ' +
      'Output: 1K split = baseline for HYROX station 1 race-pace target.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-1rm-back-squat',
    name: 'Test — 1RM back squat',
    category: 'strength',
    primary_muscle_groups: ['quads', 'glutes', 'hamstrings', 'core'],
    equipment: ['barbell'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'True 1-rep max back squat protocol. Build-up: empty bar × 5, 40% × 5, ' +
      '60% × 3, 75% × 2, 85% × 1, 92-95% × 1, 100% × 1, +5kg × 1 if RPE <10.',
    cues:
      'Build-up rests: 2-3 min light, 3-4 min after 75%, 4-5 min after 85%. ' +
      'Spotter required at 85%+. Belt allowed from 85%+. ' +
      'Test only when fresh (TSB ≥+5, no hard session prior 48h). ' +
      'Re-test every 8-12 weeks. Output: 1RM kg → all squat % loads derive from this.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-1rm-deadlift',
    name: 'Test — 1RM deadlift',
    category: 'strength',
    primary_muscle_groups: ['hamstrings', 'glutes', 'lower back', 'lats', 'forearms'],
    equipment: ['barbell'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'True 1-rep max conventional deadlift protocol. Build-up same as ' +
      'back squat (5×40, 3×60, 2×75, 1×85, 1×92, 1×100, +5kg if RPE <10).',
    cues:
      'Hip-hinge prep mandatory (Romanian deadlift × 5 with empty bar). ' +
      'Belt allowed from 80%+. Hook grip or mixed grip from 90%+. ' +
      'Re-test every 8-12 weeks. ' +
      'Output: 1RM kg → all hinge % loads derive from this.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-3min-all-out',
    name: 'Test — 3-minute all-out',
    category: 'cardio',
    primary_muscle_groups: ['quads', 'glutes', 'calves', 'hamstrings'],
    equipment: ['running'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Maximal 3-minute all-out effort (running, bike, or row — choose primary ' +
      'modality). Estimates VO2max and critical power / critical pace.',
    cues:
      'Modality: running (default), bike, or row. Maximal effort throughout — ' +
      'do NOT pace, sprint to failure. ' +
      'Last 30 s output ≈ critical power / critical speed. ' +
      'Total distance + last 30 s output → estimate VO2max + W\' / D\'. ' +
      'Re-test every 6-8 weeks. Recovery 48h before next hard session.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-hyrox-half-sim',
    name: 'Test — HYROX half-distance simulation',
    category: 'cardio',
    primary_muscle_groups: ['full_body'],
    equipment: ['running', 'sled', 'rower', 'ski_erg', 'wall_ball', 'kettlebell', 'sandbag'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Half-distance HYROX simulation: 4 stations + 4 runs, all distances ' +
      'halved (run 500 m between stations, station volume halved). ' +
      'Benchmark used 6-8 weeks pre-event A.',
    cues:
      'Format: 4 × (500 m run + station). Stations: SkiErg 500m, Sled push 25m, ' +
      'BBJ 40m, Wall balls 50/35 (M/W). ' +
      'Effort: race pace. Re-test every 4-6 weeks during REAL. ' +
      'Output: total time + per-segment splits + transition times → readiness signal.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'test-hyrox-full-sim',
    name: 'Test — HYROX full-distance simulation',
    category: 'cardio',
    primary_muscle_groups: ['full_body'],
    equipment: ['running', 'sled', 'rower', 'ski_erg', 'wall_ball', 'kettlebell', 'sandbag'],
    default_metrics_json: { time: true, distance: true, hr: true },
    hyrox_station_position: null,
    description:
      'Full-distance HYROX race simulation. 8 × (1 km run + station). ' +
      'Used 3-4 weeks pre-event A as final readiness check. Hard cutoff: only ' +
      'do this once in REAL block.',
    cues:
      'Format: 8 × (1 km run + race-distance station). Same gear, same loads ' +
      'as race day. ' +
      'Race-day attire/nutrition/warm-up dress rehearsal. ' +
      'Output: predicted race time + station execution profile → final taper plan.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
];

/**
 * Strength accessory variants beyond the source dataset's compounds.
 * These are the named accessories the team-lead called out as missing,
 * cross-referenced against what's already in the catalog from
 * yuhonas/free-exercise-db.
 */
const STRENGTH_ACCESSORIES: ExerciseRow[] = [
  {
    slug: 'single-leg-rdl',
    name: 'Single-leg Romanian deadlift',
    category: 'strength',
    primary_muscle_groups: ['hamstrings', 'glutes', 'lower back', 'core'],
    equipment: ['dumbbell', 'kettlebell'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Unilateral Romanian deadlift with DB or KB. Hip-dominant single-leg ' +
      'pattern, posterior chain + balance. Common HYROX accessory for sled ' +
      'pull / sandbag lunge support.',
    cues:
      'Reps: 6-10/leg. Tempo 3-0-1-0 (slow eccentric). ' +
      'Hip hinge, knee soft, free leg back as counterbalance. ' +
      'No torso rotation — shoulders square. ' +
      'Loads typically 20-40% lower than bilateral RDL per hand.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'pendlay-row',
    name: 'Pendlay row',
    category: 'strength',
    primary_muscle_groups: ['lats', 'middle back', 'lower back', 'biceps'],
    equipment: ['barbell'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Strict barbell row from dead-stop on the floor each rep. Horizontal ' +
      'pulling antagonist to bench/OHP. Builds posterior strength for sled ' +
      'pull and rowing.',
    cues:
      'Reps: 4-6 per set typical. Bar starts on floor each rep (dead-stop). ' +
      'Torso parallel to floor, no body english. ' +
      'Pull to lower sternum / upper abs, NOT hips. ' +
      'Cargas tipo: 50-70% bench press 1RM as starting reference.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'weighted-pullup',
    name: 'Weighted pull-up',
    category: 'strength',
    primary_muscle_groups: ['lats', 'biceps', 'middle back', 'core'],
    equipment: ['bodyweight', 'dip_belt', 'plate'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Pull-up with added load via dip belt + plate or weight vest. ' +
      'Vertical pulling strength, rope-pull / sled-pull carryover. Test ' +
      'metric for upper-body relative strength.',
    cues:
      'Reps: 3-6 per set. Full range — chin over bar, dead hang at bottom. ' +
      'No kipping. Tempo 2-1-1-0. ' +
      'Loads: bodyweight + 0% to +30% for élite. ' +
      'Failed reps don\'t count. Stop set on first failed rep.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'weighted-dip',
    name: 'Weighted dip',
    category: 'strength',
    primary_muscle_groups: ['triceps', 'chest', 'shoulders'],
    equipment: ['bodyweight', 'dip_belt', 'plate'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Parallel-bar dip with added load. Vertical pressing strength, SkiErg ' +
      'finish carryover. Test metric for upper-body pressing relative strength.',
    cues:
      'Reps: 5-8 per set. Full range — shoulders below elbows at bottom. ' +
      'Tempo 2-0-1-0. Loads: bodyweight + 0% to +30% for élite. ' +
      'Avoid if shoulder impingement history → swap for ring dips or close-grip bench.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'sled-drag-backwards',
    name: 'Sled drag (backwards)',
    category: 'strength',
    primary_muscle_groups: ['quads', 'glutes', 'calves'],
    equipment: ['sled'],
    default_metrics_json: { time: true, distance: true, weight: true },
    hyrox_station_position: null,
    description:
      'Backwards sled drag with horizontal pull (TRX, harness, or rope). ' +
      'Knee-friendly quad development. Common ACC-block accessory for sled-' +
      'push prep and quad mass.',
    cues:
      'Distance: 4-6 × 20-40 m. Loads: 50-70% sled push race weight. ' +
      'Lean back into the pull, knees track over toes, short choppy steps. ' +
      'Goal: quad pump + tendon load, NOT cardio. Walk back recovery.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'atlas-stone-shoulder',
    name: 'Atlas stone shoulder',
    category: 'strength',
    primary_muscle_groups: ['glutes', 'hamstrings', 'lower back', 'biceps', 'core'],
    equipment: ['atlas_stone'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Atlas stone lift to shoulder. Maximal-effort posterior-chain + ' +
      'odd-object lifting. Sandbag-clean carryover, full-body integration.',
    cues:
      'Reps: 3-5 per set with reset between reps. ' +
      'Tacky on hands (or chalk). Stone between feet, hips down, lap → shoulder. ' +
      'Loads: 60-100 kg M / 40-80 kg W typical. ' +
      'High injury potential — only program when athlete has the lift in their movement library.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'sandbag-clean',
    name: 'Sandbag clean',
    category: 'strength',
    primary_muscle_groups: ['glutes', 'hamstrings', 'lower back', 'core', 'shoulders'],
    equipment: ['sandbag'],
    default_metrics_json: { reps: true, weight: true, rpe: true },
    hyrox_station_position: null,
    description:
      'Floor-to-shoulder sandbag clean. Simulates HYROX sandbag-lunge setup ' +
      'and odd-object handling. Lower-body-driven hinge-pull.',
    cues:
      'Reps: 5-8 per set. Loads: 20-40 kg M / 15-25 kg W. ' +
      'Hip-hinge to grip bag, lift with legs, transition through hip pop, catch on shoulder. ' +
      'Alternate shoulders set-by-set. ' +
      'Common ACC accessory before introducing race-distance sandbag lunges.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
];

/**
 * Mobility / prehab structured blocks. Stored as `mobility` exercises so the
 * template builder can prescribe them as full sessions (not just stretches).
 */
const MOBILITY_PREHAB: ExerciseRow[] = [
  {
    slug: 'mobility-hip-flow-15min',
    name: 'Mobility — Hip flow 15 min',
    category: 'mobility',
    primary_muscle_groups: ['hip_flexors', 'glutes', 'hamstrings', 'adductors'],
    equipment: ['bodyweight', 'foam_roller'],
    default_metrics_json: { time: true },
    hyrox_station_position: null,
    description:
      '15-min hip-focused mobility flow. Standard sequence: 90/90 hip switches × 2 min, ' +
      'world\'s greatest stretch × 8/side, cossack squats × 10/side, ' +
      'pigeon hold × 90 s/side, frog stretch × 90 s, deep squat hold × 2 min, ' +
      'banded hip distractions × 60 s/side, supine figure-4 × 60 s/side.',
    cues:
      'Duration: 15 min continuous, no rest. ' +
      'Progression: end-range hold + breathwork (4-7-8 pattern). ' +
      'Daily-frequency safe. Pre-strength session: do half (active). ' +
      'Post-session or rest day: full version.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'prehab-shoulder-banded-15min',
    name: 'Prehab — Banded shoulder 15 min',
    category: 'mobility',
    primary_muscle_groups: ['shoulders', 'rotator_cuff', 'middle back'],
    equipment: ['resistance_band'],
    default_metrics_json: { reps: true, time: true },
    hyrox_station_position: null,
    description:
      '15-min banded shoulder prehab block. Sequence: band pull-aparts × 20, ' +
      'face pulls × 20, external rotation × 12/side, Y-T-W raises × 8 each, ' +
      'overhead band wall slides × 12, scap push-ups × 15. 2 rounds.',
    cues:
      'Duration: ~15 min for 2 rounds. Light band — focus on tempo (2-1-2-1) ' +
      'and end-range, NOT load. ' +
      'Programmable as standalone OR pre-warmup before any pressing/pulling session. ' +
      'Critical for athletes doing high-volume SkiErg + pull-up work.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
  {
    slug: 'foam-roll-lower-15min',
    name: 'Foam roll — Lower body 15 min',
    category: 'mobility',
    primary_muscle_groups: ['quads', 'glutes', 'hamstrings', 'calves', 'it_band'],
    equipment: ['foam_roller'],
    default_metrics_json: { time: true },
    hyrox_station_position: null,
    description:
      '15-min lower-body myofascial release. Sequence: glutes × 90 s/side, ' +
      'IT band × 90 s/side, quads × 90 s/side, hamstrings × 60 s/side, ' +
      'calves × 60 s/side, adductors × 60 s/side, plantar fascia ball × 60 s/side.',
    cues:
      'Duration: 15 min total. Slow rolls (1 inch / sec). Pause on tender spots ' +
      '20-30 s with breath. ' +
      'Best after Z2 long sessions and the day after heavy lower strength. ' +
      'Daily-frequency safe.',
    video_url: null,
    source: 'fahybrik_canonical',
  },
];

function isHyroxOrConditioningRelevant(src: SourceExercise): boolean {
  const c = (src.category ?? '').toLowerCase();
  const eq = (src.equipment ?? '').toLowerCase();
  // Exclude single-joint cable/machine isolation noise that has no place in
  // a HYROX/hybrid catalog. Keep barbell, dumbbell, kettlebell, bodyweight,
  // medicine ball; keep stretching/cardio/plyometrics across the board.
  if (['cardio', 'stretching', 'plyometrics', 'powerlifting', 'olympic weightlifting', 'strongman'].includes(c)) {
    return true;
  }
  if (c === 'strength') {
    if (['barbell', 'dumbbell', 'kettlebells', 'body only', 'medicine ball', 'exercise ball', 'bands'].includes(eq)) {
      return true;
    }
    // Drop pure machine/cable isolation strength
    return false;
  }
  return false;
}

function transform(src: SourceExercise): ExerciseRow | null {
  const cat = mapCategory(src);
  if (cat === null) return null;
  const slug = slugify(src.name);
  if (!slug) return null;
  return {
    slug,
    name: src.name,
    category: cat,
    primary_muscle_groups: (src.primaryMuscles ?? []).map((m) => m.toLowerCase()),
    equipment: normalizeEquipment(src.equipment),
    default_metrics_json: defaultMetricsFor(cat, src),
    hyrox_station_position: null,
    description: buildDescription(src),
    cues: buildCues(src),
    video_url: null,
    source: SOURCE_ATTRIBUTION,
  };
}

async function loadSourceDataset(): Promise<SourceExercise[]> {
  const cachePath = '/tmp/fahybrik-seed/exercises.json';
  if (existsSync(cachePath)) {
    return JSON.parse(readFileSync(cachePath, 'utf8')) as SourceExercise[];
  }
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch dataset: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as SourceExercise[];
}

async function main(): Promise<void> {
  void REPO_ROOT;
  const sql = getSql();
  try {
    const sourceData = await loadSourceDataset();
    const filtered = sourceData.filter(isHyroxOrConditioningRelevant);
    const transformed: ExerciseRow[] = [];
    const seenSlugs = new Set<string>();
    for (const src of filtered) {
      const row = transform(src);
      if (!row) continue;
      if (seenSlugs.has(row.slug)) continue;
      seenSlugs.add(row.slug);
      transformed.push(row);
    }

    // Canonical rows (HYROX stations + cardio variants + tests + accessory
    // strength + mobility prehab) take precedence on slug collision. The
    // source-derived `running-treadmill` and `trail-running-walking` rows
    // are dropped from re-seeding because they collide semantically with
    // the discipline-specific run variants — élite athletes never log
    // generic "running". If pre-existing rows already exist in the DB from
    // earlier seeds and are referenced by template segments, they're left
    // in place; the template seed is responsible for re-pointing segments
    // to canonical slugs on its own re-run.
    const DROP_FROM_SOURCE = new Set(['running-treadmill', 'trail-running-walking']);
    const canonicalRows: ExerciseRow[] = [
      ...HYROX_STATIONS,
      ...CARDIO_VARIANTS,
      ...TESTS_AND_PROTOCOLS,
      ...STRENGTH_ACCESSORIES,
      ...MOBILITY_PREHAB,
    ];
    const canonicalSlugs = new Set<string>(canonicalRows.map((r) => r.slug));
    const allRows: ExerciseRow[] = [
      ...canonicalRows,
      ...transformed.filter(
        (r) => !canonicalSlugs.has(r.slug) && !DROP_FROM_SOURCE.has(r.slug),
      ),
    ];

    process.stdout.write(
      `Source rows: ${sourceData.length}, filtered: ${filtered.length}, transformed: ${transformed.length}, ` +
        `canonical (HYROX+cardio+tests+accessory+mobility): ${canonicalRows.length}, ` +
        `total to upsert: ${allRows.length}\n`,
    );

    let upserted = 0;
    const BATCH = 50;
    for (let i = 0; i < allRows.length; i += BATCH) {
      const batch = allRows.slice(i, i + BATCH);
      await sql.begin(async (tx) => {
        for (const row of batch) {
          await tx`
            insert into exercises (
              slug, name, category, primary_muscle_groups, equipment,
              default_metrics_json, hyrox_station_position,
              description, cues, video_url, source
            ) values (
              ${row.slug}, ${row.name}, ${row.category},
              ${row.primary_muscle_groups},
              ${row.equipment},
              ${sql.json(row.default_metrics_json)},
              ${row.hyrox_station_position},
              ${row.description},
              ${row.cues},
              ${row.video_url},
              ${row.source}
            )
            on conflict (slug) do update set
              name = excluded.name,
              category = excluded.category,
              primary_muscle_groups = excluded.primary_muscle_groups,
              equipment = excluded.equipment,
              default_metrics_json = excluded.default_metrics_json,
              hyrox_station_position = excluded.hyrox_station_position,
              description = excluded.description,
              cues = excluded.cues,
              video_url = excluded.video_url,
              source = excluded.source,
              updated_at = now()
          `;
          upserted += 1;
        }
      });
      process.stdout.write(`  upserted ${upserted}/${allRows.length}\n`);
    }

    const counts = await sql<{ category: ExerciseCategoryEnum; count: string }[]>`
      select category, count(*)::text as count
      from exercises
      group by category
      order by category
    `;
    process.stdout.write('\nCategory counts in DB:\n');
    for (const { category, count } of counts) {
      process.stdout.write(`  ${category.padEnd(16)} ${count}\n`);
    }
    process.stdout.write(`\nSource license: ${SOURCE_LICENSE} (${SOURCE_ATTRIBUTION})\n`);
    process.stdout.write('Done.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
