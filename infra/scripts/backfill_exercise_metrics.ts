/**
 * Backfill `exercises.default_metrics_json` with category-aware flags
 * so the coach studio editor renders the right parameter pickers per
 * category (running vs erg vs strength vs hyrox vs mobility).
 *
 * Idempotent: re-runs produce the same result. Pure data migration —
 * no schema changes. Run against Neon:
 *
 *   pnpm --filter @fahybrid/infra backfill:metrics
 *
 * Reference mapping (locked by Alex):
 *
 *   running    → hr_zone, duration_seconds, distance_km, pace_sec_per_km,
 *                cadence_spm, rpe
 *   erg (rowing / ski_erg / bike)
 *              → hr_zone, duration_seconds, distance_meters, calories,
 *                calories_per_min, cadence_spm, rpe
 *   strength   → sets, reps, load_kg, load_pct, rpe, rest_seconds
 *   hyrox_station
 *              → reps, duration_seconds, load_kg, rest_seconds, rpe
 *   mobility / skill / core / plyometric
 *              → duration_seconds, reps, rpe
 *
 * No watts. cal/min is the intensity field for ergs.
 */
import type { Sql } from 'postgres';
import { getSql } from './_db.js';

type Category =
  | 'cardio'
  | 'strength'
  | 'skill'
  | 'hyrox_station'
  | 'mobility'
  | 'plyometric'
  | 'core';

type MetricFlags = Record<string, boolean>;

interface ExerciseRow {
  id: string;
  slug: string;
  name: string;
  category: Category;
  equipment: string[] | null;
}

// All known metric keys the studio panel may render. Setting `false`
// explicitly (instead of omitting) makes the document self-describing
// and makes the legacy fallback in the panel predictable.
const ALL_KEYS = [
  'sets',
  'reps',
  'load_kg',
  'load_pct',
  'rpe',
  'rest_seconds',
  'duration_seconds',
  'distance_km',
  'distance_meters',
  'hr_zone',
  'pace_sec_per_km',
  'cadence_spm',
  'calories',
  'calories_per_min',
] as const;

function fill(enabled: Record<string, boolean>): MetricFlags {
  const out: MetricFlags = {};
  for (const k of ALL_KEYS) out[k] = enabled[k] === true;
  return out;
}

function isRunningRow(row: ExerciseRow): boolean {
  const eq = (row.equipment ?? []).map((e) => e.toLowerCase());
  if (eq.includes('running') || eq.includes('treadmill')) return true;
  const slug = row.slug.toLowerCase();
  if (slug.startsWith('run-') || slug === 'run') return true;
  const name = row.name.toLowerCase();
  if (/\brun(ning)?\b/.test(name)) return true;
  return false;
}

function isErgRow(row: ExerciseRow): boolean {
  const eq = (row.equipment ?? []).map((e) => e.toLowerCase());
  if (eq.includes('rower') || eq.includes('ski_erg') || eq.includes('bike')) return true;
  const slug = row.slug.toLowerCase();
  return (
    slug.startsWith('row-') ||
    slug.startsWith('row_') ||
    slug.startsWith('ski-erg') ||
    slug.startsWith('ski_erg') ||
    slug.startsWith('bike-')
  );
}

function metricsForRow(row: ExerciseRow): MetricFlags {
  switch (row.category) {
    case 'cardio': {
      if (isRunningRow(row)) {
        return fill({
          hr_zone: true,
          duration_seconds: true,
          distance_km: true,
          pace_sec_per_km: true,
          cadence_spm: true,
          rpe: true,
        });
      }
      if (isErgRow(row)) {
        return fill({
          hr_zone: true,
          duration_seconds: true,
          distance_meters: true,
          calories: true,
          calories_per_min: true,
          cadence_spm: true,
          rpe: true,
        });
      }
      // Unknown cardio (mixed-modality tests, sims) → expose the union of
      // common fields so coach can pick what fits. Conservative default.
      return fill({
        hr_zone: true,
        duration_seconds: true,
        distance_km: true,
        distance_meters: true,
        rpe: true,
      });
    }
    case 'strength':
      return fill({
        sets: true,
        reps: true,
        load_kg: true,
        load_pct: true,
        rpe: true,
        rest_seconds: true,
      });
    case 'hyrox_station':
      return fill({
        reps: true,
        duration_seconds: true,
        load_kg: true,
        rest_seconds: true,
        rpe: true,
      });
    case 'mobility':
    case 'skill':
    case 'core':
    case 'plyometric':
      return fill({
        duration_seconds: true,
        reps: true,
        rpe: true,
      });
    default:
      return fill({});
  }
}

function flagsEqual(a: MetricFlags, b: MetricFlags): boolean {
  for (const k of ALL_KEYS) {
    if ((a[k] === true) !== (b[k] === true)) return false;
  }
  return true;
}

async function main(): Promise<void> {
  const sql: Sql = getSql();
  try {
    const rows = await sql<ExerciseRow[]>`
      select
        id::text as id,
        slug,
        name,
        category::text as category,
        equipment
      from exercises
      order by category, slug
    `;

    process.stdout.write(`Found ${rows.length} exercises. Computing target metrics…\n`);

    // Pre-fetch current default_metrics_json to skip no-op updates (idempotent).
    const current = await sql<{ id: string; default_metrics_json: MetricFlags | null }[]>`
      select id::text as id, default_metrics_json from exercises
    `;
    const byId = new Map<string, MetricFlags>();
    for (const c of current) byId.set(c.id, c.default_metrics_json ?? {});

    let updated = 0;
    let skipped = 0;
    const sample: { slug: string; metrics: MetricFlags }[] = [];

    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await sql.begin(async (tx) => {
        for (const row of batch) {
          const target = metricsForRow(row);
          const existing = byId.get(row.id) ?? {};
          // Normalize existing into a comparable shape with explicit booleans.
          const normalizedExisting: MetricFlags = {};
          for (const k of ALL_KEYS) {
            normalizedExisting[k] = existing[k] === true;
          }
          if (flagsEqual(normalizedExisting, target)) {
            skipped += 1;
            continue;
          }
          await tx`
            update exercises
            set default_metrics_json = ${tx.json(target)},
                updated_at = now()
            where id = ${row.id}::bigint
          `;
          updated += 1;
          if (sample.length < 8) sample.push({ slug: row.slug, metrics: target });
        }
      });
      process.stdout.write(`  processed ${Math.min(i + BATCH, rows.length)}/${rows.length}\n`);
    }

    process.stdout.write(`\nUpdated: ${updated}. Skipped (already correct): ${skipped}.\n`);

    if (sample.length > 0) {
      process.stdout.write('\nSample of updated rows:\n');
      for (const s of sample) {
        const keys = Object.entries(s.metrics)
          .filter(([, v]) => v === true)
          .map(([k]) => k)
          .join(', ');
        process.stdout.write(`  ${s.slug.padEnd(40)} → ${keys}\n`);
      }
    }

    // Verification queries Alex asked for.
    const verify = await sql<{ slug: string; category: string; default_metrics_json: MetricFlags }[]>`
      select slug, category::text as category, default_metrics_json
      from exercises
      where slug in ('run-z2-long', 'row-z2-long', 'ski-erg-z2-long', 'bike-z2-endurance')
      order by slug
    `;
    process.stdout.write('\nVerification:\n');
    for (const v of verify) {
      const enabled = Object.entries(v.default_metrics_json ?? {})
        .filter(([, val]) => val === true)
        .map(([k]) => k)
        .join(', ');
      process.stdout.write(`  ${v.slug.padEnd(20)} [${v.category}] → ${enabled}\n`);
    }
    process.stdout.write('\nDone.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  process.stderr.write(
    `Backfill failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
