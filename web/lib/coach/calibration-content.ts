import 'server-only';

// #34 — content materialization for a coach calibration test. A test's CONTENT
// is a `templates` row (+ `template_segments`): the workout the athlete runs, and
// the carrier of `meta_json.store_results` (which the ejecución→benchmark BRIDGE
// still reads) + `meta_json.calibration` (the slug link the seed/scheduler use).
//
// There is no coach-facing editor for a `templates` row today (the library "sesión"
// editor edits `blocks`, a different table), so we MATERIALIZE the content from the
// test's result contract — one segment per result, anchored on the exercise that
// matches the result's modality/benchmark — exactly as the infra seed does. Tests
// are therefore runnable + schedulable from the moment they are created; the four
// default tests come out with correct content.
//
// This module is the SINGLE web-side source for that materialization + the
// meta_json mirror; both create/edit (write-coach-test.ts) and restore-defaults
// (restore-default-tests.ts) go through it.

import type { TransactionClient } from '@/lib/db';
import {
  storeResultsSchema,
  type StoreResultSpec,
} from '@fahybrid/shared/schema/test-battery';
import {
  CALIBRATION_META_KEY,
  type CalibrationContentSegment,
} from '@fahybrid/shared/domain/coach/test-battery';
import { prescriptionToParams } from '@fahybrid/shared/domain/prescription';
import {
  BENCH_RUN_5K,
  BENCH_ROW_2K,
  BENCH_SKI_1K,
  BENCH_HYROX_HALF_SIM,
  BENCH_BACK_SQUAT_1RM,
  BENCH_DEADLIFT_1RM,
  BENCH_BENCH_PRESS_1RM,
  BENCH_OHP_1RM,
  BENCH_CLEAN_1RM,
  BENCH_SNATCH_1RM,
} from '@fahybrid/shared/domain/coach/benchmark-slugs';

// ── Benchmark slug → candidate EXERCISE-CATALOG slug(s) ──────────────────────
// Catalog slugs (`exercises.slug`), a DIFFERENT namespace from benchmark slugs.
// Candidates are tried in order; the first that exists on the target DB wins.
// Mirrors infra/scripts/seed_calibration_test_templates.ts, extended to the full
// six lifts + ski so any calibration target can anchor a segment.
const CATALOG_SLUG_BY_BENCHMARK: Readonly<Record<string, readonly string[]>> = {
  [BENCH_RUN_5K]: ['run'],
  [BENCH_ROW_2K]: ['row', 'row-z2-long'],
  [BENCH_SKI_1K]: ['ski', 'ski-erg', 'skierg'],
  [BENCH_HYROX_HALF_SIM]: ['run'],
  [BENCH_BACK_SQUAT_1RM]: ['back-squat'],
  [BENCH_DEADLIFT_1RM]: ['deadlift'],
  [BENCH_BENCH_PRESS_1RM]: ['bench-press'],
  [BENCH_OHP_1RM]: ['overhead-press', 'strict-press'],
  [BENCH_CLEAN_1RM]: ['power-clean', 'clean', 'hang-power-clean'],
  [BENCH_SNATCH_1RM]: ['snatch'],
};

// Fallback for a BASELINE result (custom, no benchmark mapping): anchor by the
// result's modality. A baseline with no modality gets no segment (honest — the
// template is created empty and the coach can build content later).
const CATALOG_SLUG_BY_MODALITY: Readonly<Record<string, readonly string[]>> = {
  run: ['run'],
  row: ['row', 'row-z2-long'],
  ski: ['ski', 'ski-erg', 'skierg'],
  bike: ['bike', 'bike-erg', 'assault-bike'],
  strength: ['back-squat'],
  hyrox: ['run'],
};

function candidateExerciseSlugs(spec: StoreResultSpec): readonly string[] {
  const byBench = CATALOG_SLUG_BY_BENCHMARK[spec.slug];
  if (byBench && byBench.length > 0) return byBench;
  const byMod = spec.modality ? CATALOG_SLUG_BY_MODALITY[spec.modality] : undefined;
  return byMod ?? [];
}

/** Resolve each spec to a real `exercises.id` on the DB (by candidate slug order).
 *  Specs with no resolvable exercise are simply absent from the map (→ no segment). */
async function resolveExerciseIds(
  tx: TransactionClient,
  specs: StoreResultSpec[],
): Promise<Map<string, number>> {
  const candidates = new Set<string>();
  for (const spec of specs) {
    for (const slug of candidateExerciseSlugs(spec)) candidates.add(slug);
  }
  const bySpecSlug = new Map<string, number>();
  if (candidates.size === 0) return bySpecSlug;

  // Benchmark anchors are BASE-catalog identities (HYROX stations, lift slugs)
  // by definition, never a coach's own exercise — `coach_id is null` states
  // that intent explicitly rather than relying on slugs happening to be
  // globally unique.
  const rows = await tx<Array<{ id: string; slug: string }>>`
    select id::text as id, slug from exercises
    where slug = any(${[...candidates]}) and coach_id is null
  `;
  const idByCatalogSlug = new Map<string, number>(rows.map((r) => [r.slug, Number(r.id)]));

  for (const spec of specs) {
    const hit = candidateExerciseSlugs(spec).find((s) => idByCatalogSlug.has(s));
    if (hit) bySpecSlug.set(spec.slug, idByCatalogSlug.get(hit)!);
  }
  return bySpecSlug;
}

/** The `meta_json` a calibration template carries: the store_results contract the
 *  bridge reads + the calibration slug link. Kept as the ONE place that shape is
 *  built, so the mirror never drifts from the DB. */
export function calibrationMetaJson(
  testSlug: string,
  specs: StoreResultSpec[],
): Record<string, unknown> {
  return {
    store_results: specs,
    [CALIBRATION_META_KEY]: testSlug,
  };
}

/** Overwrite a template's `template_segments` with one segment per result spec
 *  (resolvable ones), anchored on the matching catalog exercise. Used on create
 *  and on edit (results changed). Deletes any prior segments first. */
async function writeContentSegments(
  tx: TransactionClient,
  templateId: number,
  testName: string,
  specs: StoreResultSpec[],
): Promise<void> {
  await tx`delete from template_segments where template_id = ${templateId}`;
  const exerciseIdBySlug = await resolveExerciseIds(tx, specs);

  let position = 0;
  for (const spec of specs) {
    const exerciseId = exerciseIdBySlug.get(spec.slug);
    if (exerciseId == null) continue; // no anchor exercise → no segment (honest)
    // A test has no prescribed dose (it's a max effort) → prescription_json NULL;
    // params_json documents what the segment records; the brief lives in block_title.
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
        ${templateId}, ${position}, ${exerciseId}::bigint, ${tx.json(paramsJson)},
        ${spec.label}, 0, ${null}, ${testName}, ${null}
      )
    `;
    position += 1;
  }
}

/** Write a test's session from a structured CONTENT blueprint (#61 guided tramos):
 *  one template_segment per blueprint segment, each anchored on its exercise and
 *  carrying the real `prescription_json` (the RunStructure for a run, a legacy erg
 *  prescription for a row) + a scalar `params_json` summary for legacy readers.
 *  Deletes any prior segments first. Used ONLY for the default protocols that ship a
 *  `content`; coach-authored tests keep the generic per-result path. */
async function writeCalibrationContentSegments(
  tx: TransactionClient,
  templateId: number,
  content: readonly CalibrationContentSegment[],
): Promise<void> {
  await tx`delete from template_segments where template_id = ${templateId}`;

  // Resolve every candidate exercise slug once (catalog slugs, tried in order).
  const candidates = new Set<string>();
  for (const seg of content) for (const s of seg.exercise) candidates.add(s);
  // Same base-identity resolution as `resolveExerciseIds` above: a calibration
  // blueprint's exercise slugs are always BASE catalog, never a coach's own.
  const rows =
    candidates.size > 0
      ? await tx<Array<{ id: string; slug: string }>>`
          select id::text as id, slug from exercises
          where slug = any(${[...candidates]}) and coach_id is null
        `
      : [];
  const idByCatalogSlug = new Map<string, number>(rows.map((r) => [r.slug, Number(r.id)]));

  let position = 0;
  for (const seg of content) {
    const hit = seg.exercise.find((s) => idByCatalogSlug.has(s));
    if (hit == null) continue; // no anchor exercise on this DB → skip (honest)
    const exerciseId = idByCatalogSlug.get(hit)!;
    // Scalar summary for legacy readers; assignment-detail prefers prescription_json.
    const paramsJson = prescriptionToParams(seg.prescription) as Parameters<typeof tx.json>[0];
    const prescriptionJson = seg.prescription as unknown as Parameters<typeof tx.json>[0];
    await tx`
      insert into template_segments (
        template_id, position, exercise_id, params_json, notes,
        block_position, block_format, block_title, prescription_json
      )
      values (
        ${templateId}, ${position}, ${exerciseId}::bigint, ${tx.json(paramsJson)},
        ${seg.title}, ${seg.block_position}, ${null}, ${seg.title}, ${tx.json(prescriptionJson)}
      )
    `;
    position += 1;
  }
}

/**
 * Ensure a test's CONTENT template exists and matches the given contract, INSIDE a
 * transaction. If `existingTemplateId` is passed and still valid, it is reused
 * (meta_json + segments overwritten); otherwise a fresh library template is
 * created. Returns the template id. `format` is a `template_format` enum value.
 */
export async function materializeTestContent(
  tx: TransactionClient,
  params: {
    coach_id: number;
    name: string;
    format: string;
    protocol: string | null;
    testSlug: string;
    specs: StoreResultSpec[];
    existingTemplateId?: number | null;
    /** Structured session blueprint (#61). When present, its segments are written
     *  instead of the generic one-per-result; else the generic path runs. */
    content?: readonly CalibrationContentSegment[];
  },
): Promise<number> {
  // Defensive: the specs are the exact shape the bridge parses. Parsing here
  // catches any drift before it reaches meta_json.
  const specs = storeResultsSchema.parse(params.specs);
  // Cast to the postgres json() parameter type (the codebase pattern for a jsonb
  // insert of a plain object — see instantiate-program.ts).
  const meta = calibrationMetaJson(params.testSlug, specs) as Parameters<typeof tx.json>[0];

  let templateId = params.existingTemplateId ?? null;

  if (templateId != null) {
    // Reuse — but only if the row still exists and is a LIBRARY template owned by
    // this coach (never an athlete instance). Otherwise fall through to create.
    const rows = await tx<Array<{ id: string }>>`
      select id::text as id from templates
      where id = ${templateId}::bigint and coach_id = ${params.coach_id}::bigint
        and instance_athlete_id is null and archived_at is null
      limit 1
    `;
    if (rows.length === 0) templateId = null;
  }

  if (templateId == null) {
    const rows = await tx<Array<{ id: string }>>`
      insert into templates (coach_id, name, format, is_draft, coach_notes, meta_json)
      values (
        ${params.coach_id}::bigint, ${params.name}, ${params.format}::template_format,
        false, ${params.protocol}, ${tx.json(meta)}
      )
      returning id::text as id
    `;
    templateId = Number(rows[0]!.id);
  } else {
    await tx`
      update templates
      set name = ${params.name}, format = ${params.format}::template_format,
          coach_notes = ${params.protocol}, meta_json = ${tx.json(meta)},
          updated_at = now()
      where id = ${templateId}::bigint
    `;
  }

  // Structured session (default resistance tests) vs generic one-per-result (half-sim,
  // 1RM, coach-authored). The store_results contract (meta_json) is identical either way.
  if (params.content && params.content.length > 0) {
    await writeCalibrationContentSegments(tx, templateId, params.content);
  } else {
    await writeContentSegments(tx, templateId, params.name, specs);
  }
  return templateId;
}
