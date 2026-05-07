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
 * Run: pnpm --filter @fahybrik/infra seed:exercises
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { exerciseCategory } from '@fahybrik/shared/schema';
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

    // HYROX stations take precedence on slug collision
    for (const station of HYROX_STATIONS) {
      seenSlugs.add(station.slug);
    }
    const allRows: ExerciseRow[] = [
      ...HYROX_STATIONS,
      ...transformed.filter((r) => !HYROX_STATIONS.some((s) => s.slug === r.slug)),
    ];

    process.stdout.write(
      `Source rows: ${sourceData.length}, filtered: ${filtered.length}, transformed: ${transformed.length}, total to upsert (incl. HYROX stations): ${allRows.length}\n`,
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
