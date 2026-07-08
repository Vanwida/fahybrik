/**
 * seed_calibration_test_templates.ts — create the 4 WEEK-1 CALIBRATION TEST
 * templates (#34) for a coach, from the canonical battery.
 *
 * The battery is `FABRIK_WEEK1_BATTERY` in
 * `@fahybrid/shared/domain/coach/test-battery` — the SINGLE source of truth for
 * the four tests that fix an athlete's REAL point of departure in their first
 * week: 5K control, 2K remo, batería 1RM, HYROX half-sim. This script only
 * MATERIALIZES that battery into `templates` (+ `template_segments`) rows for one
 * coach; it never re-defines the protocols.
 *
 * What each protocol becomes — ONE `templates` row:
 *   • name        = protocol.label
 *   • format      = protocol.format ('test' | 'strength_block' | 'hyrox_sim').
 *                   All three are valid `template_format` enum members ('test' was
 *                   added by migration 0062), so the value inserts directly.
 *   • is_draft    = false (a real, publishable library template)
 *   • coach_notes = protocol.protocol (the session brief the coach reads)
 *   • meta_json   = { store_results: <protocol.store_results>, calibration: <slug> }
 *                   — store_results (non-empty array) is what makes the athlete
 *                     week endpoint derive `is_test = true` (week-plan.ts) and what
 *                     tells the ejecución→benchmark bridge which benchmark(s) the
 *                     test produces; `calibration` = the protocol slug, so
 *                     scheduling finds THIS template without a hardcoded id.
 *
 * …plus one `template_segments` row PER store_results entry (the 1RM battery →
 * 3 segments: sentadilla, peso muerto, press banca; the rest → 1 segment each).
 * `template_segments.exercise_id` is NOT NULL (0001_init), so every segment must
 * point at a REAL row in the `exercises` catalog. Exercise ids are DB-specific
 * (`bigint generated always as identity`), so they are RESOLVED BY SLUG at run
 * time against the target DB — never hardcoded.
 *
 * IDEMPOTENT: a protocol is skipped if a template already exists for
 * (coach_id, meta_json->>'calibration' = protocol.slug). Each protocol's writes
 * (template + its segments) run inside one transaction, so a re-run converges and
 * never leaves a template without segments. Re-running is a no-op.
 *
 * USAGE (writes to whatever DATABASE_URL points at — run it yourself per DB):
 *   DATABASE_URL=... npx tsx infra/scripts/seed_calibration_test_templates.ts <coachId>
 *
 * Or import { seedCalibrationTemplates } and pass an existing client.
 */
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';
import {
  FABRIK_WEEK1_BATTERY,
  CALIBRATION_META_KEY,
} from '@fahybrid/shared/domain/coach/test-battery';

import { getSql } from './_db.ts';

type Sql = ReturnType<typeof getSql>;

// ── Benchmark slug → candidate EXERCISE-CATALOG slug(s) ──────────────────────
// Maps each store_results benchmark slug to the catalog exercise a segment should
// anchor to. Candidates are tried in order; the first that exists on the target DB
// wins (a fallback list keeps the seed robust to minor catalog differences). These
// are catalog slugs (`exercises.slug`), a DIFFERENT namespace from the benchmark
// slugs above. HYROX half-sim has no single "hyrox" movement — a half-sim is runs
// interleaved with stations — so it anchors on `run` (the through-line); the full
// protocol lives in `coach_notes`.
const EXERCISE_SLUG_BY_BENCHMARK: Readonly<Record<string, readonly string[]>> = {
  [BENCH_RUN_5K]: ['run'],
  [BENCH_ROW_2K]: ['row', 'row-z2-long'],
  [BENCH_BACK_SQUAT_1RM]: ['back-squat'],
  [BENCH_DEADLIFT_1RM]: ['deadlift'],
  [BENCH_BENCH_PRESS_1RM]: ['bench-press'],
  [BENCH_HYROX_HALF_SIM]: ['run'],
};

/**
 * Resolve every benchmark slug the battery references to a real `exercises.id`
 * on the target DB (by slug, honoring the fallback order). Runs ONE query for all
 * candidate slugs, then maps benchmark → id. Fails loud if a benchmark has no
 * mapping or none of its candidate exercises exist (never inserts a fake id).
 */
async function resolveExerciseIds(sql: Sql): Promise<Map<string, number>> {
  // Every benchmark slug the battery actually uses.
  const usedBenchmarks = new Set<string>();
  for (const p of FABRIK_WEEK1_BATTERY) {
    for (const spec of p.store_results) usedBenchmarks.add(spec.slug);
  }

  // Every candidate catalog slug across those benchmarks (deduped) → one query.
  const candidateSlugs = new Set<string>();
  for (const bench of usedBenchmarks) {
    const candidates = EXERCISE_SLUG_BY_BENCHMARK[bench];
    if (!candidates || candidates.length === 0) {
      throw new Error(
        `no exercise mapping for benchmark "${bench}" — add it to EXERCISE_SLUG_BY_BENCHMARK`,
      );
    }
    for (const slug of candidates) candidateSlugs.add(slug);
  }

  const rows = await sql<Array<{ id: string; slug: string }>>`
    select id::text as id, slug
    from exercises
    where slug = any(${[...candidateSlugs]})
  `;
  const idBySlug = new Map<string, number>(rows.map((r) => [r.slug, Number(r.id)]));

  const idByBenchmark = new Map<string, number>();
  for (const bench of usedBenchmarks) {
    const candidates = EXERCISE_SLUG_BY_BENCHMARK[bench]!;
    const hit = candidates.find((slug) => idBySlug.has(slug));
    if (!hit) {
      throw new Error(
        `no exercise found for benchmark "${bench}" — tried slugs [${candidates.join(', ')}] ` +
          `on this DB. Seed the exercise catalog first (seed_exercises).`,
      );
    }
    idByBenchmark.set(bench, idBySlug.get(hit)!);
  }
  return idByBenchmark;
}

export interface SeedCalibrationResult {
  created: number;
  skipped: number;
  /** Per protocol: what happened + the template id (existing or new). */
  details: Array<{ slug: string; label: string; template_id: number; action: 'created' | 'skipped' }>;
}

/**
 * Idempotently create the 4 week-1 calibration test templates for `coachId` on the
 * given client. Returns a per-protocol summary. Does NOT close the client (the
 * caller owns its lifecycle).
 */
export async function seedCalibrationTemplates(
  coachId: number,
  sql: Sql,
): Promise<SeedCalibrationResult> {
  if (!Number.isInteger(coachId) || coachId <= 0) {
    throw new Error(`invalid coachId: ${coachId} (expected a positive integer)`);
  }

  const coachRows = await sql<Array<{ id: string }>>`
    select id::text as id from coaches where id = ${coachId}::bigint limit 1
  `;
  if (coachRows.length === 0) {
    throw new Error(`coach ${coachId} not found on this DB — refusing to seed`);
  }

  const exerciseIdByBenchmark = await resolveExerciseIds(sql);

  const result: SeedCalibrationResult = { created: 0, skipped: 0, details: [] };

  for (const protocol of FABRIK_WEEK1_BATTERY) {
    // template + segments as ONE atomic unit so a re-run never sees a half-created
    // template (row present, segments missing).
    const outcome = await sql.begin(async (tx) => {
      const existing = await tx<Array<{ id: string }>>`
        select id::text as id
        from templates
        where coach_id = ${coachId}::bigint
          and meta_json ->> ${CALIBRATION_META_KEY} = ${protocol.slug}
        limit 1
      `;
      if (existing.length > 0) {
        return { action: 'skipped' as const, template_id: Number(existing[0]!.id) };
      }

      const metaJson = {
        store_results: protocol.store_results,
        [CALIBRATION_META_KEY]: protocol.slug,
      };

      const inserted = await tx<Array<{ id: string }>>`
        insert into templates (coach_id, name, format, is_draft, coach_notes, meta_json)
        values (
          ${coachId}::bigint,
          ${protocol.label},
          ${protocol.format}::template_format,
          false,
          ${protocol.protocol},
          ${tx.json(metaJson)}
        )
        returning id::text as id
      `;
      const templateId = Number(inserted[0]!.id);

      // One segment per store_results entry: the 1RM battery yields 3 (squat /
      // deadlift / bench), each pointing at its mapped lift; the others yield 1.
      // A test has no prescribed dose (it's a max effort) → prescription_json NULL;
      // params_json documents what each segment records; the brief lives in
      // coach_notes + block_title.
      for (let position = 0; position < protocol.store_results.length; position++) {
        const spec = protocol.store_results[position]!;
        const exerciseId = exerciseIdByBenchmark.get(spec.slug);
        if (exerciseId == null) {
          throw new Error(
            `unresolved exercise for "${spec.slug}" in protocol "${protocol.slug}" (internal invariant)`,
          );
        }
        const paramsJson = {
          test_slug: spec.slug,
          measure: spec.measure,
          unit: spec.unit,
          label: spec.label,
        };
        await tx`
          insert into template_segments (
            template_id, position, exercise_id, params_json, notes,
            block_position, block_format, block_title, prescription_json
          )
          values (
            ${templateId},
            ${position},
            ${exerciseId}::bigint,
            ${tx.json(paramsJson)},
            ${spec.label},
            0,
            ${null},
            ${protocol.label},
            ${null}
          )
        `;
      }

      return { action: 'created' as const, template_id: templateId };
    });

    if (outcome.action === 'created') result.created++;
    else result.skipped++;
    result.details.push({
      slug: protocol.slug,
      label: protocol.label,
      template_id: outcome.template_id,
      action: outcome.action,
    });
  }

  return result;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const raw = process.argv[2];
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(
      'Usage: tsx infra/scripts/seed_calibration_test_templates.ts <coachId>  (positive integer)',
    );
  }
  const coachId = Number(raw);
  const sql = getSql();
  try {
    const res = await seedCalibrationTemplates(coachId, sql);
    for (const d of res.details) {
      process.stdout.write(
        `  ${d.action === 'created' ? '＋' : '·'} ${d.slug} → template ${d.template_id} «${d.label}» (${d.action})\n`,
      );
    }
    process.stdout.write(
      `[seed:calibration] coach ${coachId}: created ${res.created}, skipped ${res.skipped} ` +
        `(of ${FABRIK_WEEK1_BATTERY.length}).\n`,
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

await main();
