import 'server-only';

// #34 — the WRITE layer for a coach's calibration battery. Create / edit / remove
// / reorder a coach_calibration_test and its children (coach_test_results,
// coach_test_schedule) + its CONTENT template, in one transaction each.
//
// Correctness spine (objective, enforced here — not left to the client):
//   1. A result is resolved to a normalized StoreResultSpec from the coach's
//      input: a CALIBRATION target comes straight from the fixed catalog
//      (slug/measure/unit/modality guaranteed coherent); a BASELINE result gets a
//      generated, per-test-unique slug and derives:'none'.
//   2. Every spec is re-checked with calibrationCoherenceError, so a malformed
//      client can never author a test that silently fails to calibrate.
//   3. coach_test_results is the source of truth; the template's
//      meta_json.store_results (which the bridge still reads) is mirrored from it
//      on every write, so the two never drift.

import type { Sql, TransactionClient } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

type AnySql = Sql | TransactionClient;
import {
  calibrationTargetByKey,
  specForCalibrationTarget,
  calibrationCoherenceError,
} from '@fahybrid/shared/domain/coach/test-battery';
import { storeResultsSchema, type StoreResultSpec } from '@fahybrid/shared/schema/test-battery';
import type {
  CoachTestCreate,
  CoachTestUpdate,
  CoachTestResultInput,
} from '@fahybrid/shared/schema/coach-tests';
import { materializeTestContent } from '@/lib/coach/calibration-content';
import { listCoachTests, type CoachCalibrationTest } from '@/lib/coach/coach-tests';

export class CoachTestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'CoachTestError';
  }
}

// Slugify a coach string into a stable, benchmark-safe key. Diacritics stripped,
// non-alphanumerics collapsed to '_'. Never empty.
function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
  return s || 'test';
}

/** Resolve one coach result input to a normalized StoreResultSpec. Calibration →
 *  from the catalog; baseline → generated slug + derives:'none'. */
function resolveResultSpec(input: CoachTestResultInput, testSlug: string): StoreResultSpec {
  const optional = input.optional === true ? { optional: true as const } : {};
  if (input.kind === 'calibration') {
    const target = calibrationTargetByKey(input.target);
    if (!target) {
      throw new CoachTestError('invalid_target', `Calibración desconocida: ${input.target}`, 422);
    }
    return { ...specForCalibrationTarget(target, input.label), ...optional };
  }
  return {
    slug: `${testSlug}_${slugify(input.label)}`.slice(0, 60),
    measure: input.measure,
    unit: input.unit,
    derives: 'none',
    label: input.label,
    ...optional,
  };
}

/** Resolve + validate all result inputs into coherent, unique specs. */
function resolveSpecs(results: CoachTestResultInput[], testSlug: string): StoreResultSpec[] {
  const specs = results.map((r) => resolveResultSpec(r, testSlug));
  // Shape-parse (the exact contract the bridge reads) + objective coherence.
  const parsed = storeResultsSchema.safeParse(specs);
  if (!parsed.success) {
    throw new CoachTestError('invalid_results', 'Resultados inválidos', 422);
  }
  for (const spec of parsed.data) {
    const err = calibrationCoherenceError(spec);
    if (err) throw new CoachTestError('incoherent_result', err, 422);
  }
  // Unique benchmark slug per test (mirrors the DB unique (test_id, slug)).
  const seen = new Set<string>();
  for (const spec of parsed.data) {
    if (seen.has(spec.slug)) {
      throw new CoachTestError(
        'duplicate_result',
        `Hay dos resultados que miden lo mismo ("${spec.label}"); quita uno.`,
        422,
      );
    }
    seen.add(spec.slug);
  }
  return parsed.data;
}

/** The test's primary modality (color dot / grouping): the first calibrating
 *  result's modality, else the first result carrying one, else null. */
function primaryModalityOf(specs: StoreResultSpec[]): string | null {
  const cal = specs.find((s) => s.derives !== 'none' && s.modality);
  if (cal?.modality) return cal.modality;
  return specs.find((s) => s.modality)?.modality ?? null;
}

async function nextSortOrder(client: AnySql, coach_id: number): Promise<number> {
  const rows = await client<{ next: number }[]>`
    select coalesce(max(sort_order), -1) + 1 as next
    from coach_calibration_tests
    where coach_id = ${coach_id} and archived_at is null
  `;
  return rows[0]?.next ?? 0;
}

async function uniqueTestSlug(
  client: AnySql,
  coach_id: number,
  name: string,
): Promise<string> {
  const base = slugify(name);
  const rows = await client<{ slug: string }[]>`
    select slug from coach_calibration_tests where coach_id = ${coach_id}
  `;
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}_${i}`.slice(0, 60);
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`.slice(0, 60);
}

// Fetch one of the coach's tests (post-commit) for the response, or null.
async function getOne(
  coach_id: number,
  test_id: string,
  client: Sql,
): Promise<CoachCalibrationTest | null> {
  const all = await listCoachTests(coach_id, {}, client);
  return all.find((t) => t.id === test_id) ?? null;
}

async function insertResults(
  tx: AnySql,
  testId: number,
  specs: StoreResultSpec[],
): Promise<void> {
  for (let i = 0; i < specs.length; i += 1) {
    const s = specs[i]!;
    await tx`
      insert into coach_test_results (test_id, slug, label, measure, unit, derives, modality, optional, sort_order)
      values (${testId}, ${s.slug}, ${s.label}, ${s.measure}, ${s.unit}, ${s.derives}, ${s.modality ?? null}, ${s.optional ?? false}, ${i})
    `;
  }
}

async function insertSchedule(
  tx: AnySql,
  testId: number,
  schedule: CoachTestCreate['schedule'],
): Promise<void> {
  for (const occ of schedule) {
    await tx`
      insert into coach_test_schedule (test_id, week_offset, day_of_week, enabled)
      values (${testId}, ${occ.week_offset}, ${occ.day_of_week}, ${occ.enabled})
      on conflict (test_id, week_offset, day_of_week) do update set enabled = excluded.enabled
    `;
  }
}

/** Create a new calibration test (identity + results + schedule + content). */
export async function createCoachTest(
  coach_id: number | bigint,
  input: CoachTestCreate,
  client: Sql = defaultSql,
): Promise<CoachCalibrationTest> {
  const cid = Number(coach_id);
  const slug = await uniqueTestSlug(client, cid, input.name);
  const specs = resolveSpecs(input.results, slug);
  const primary_modality = primaryModalityOf(specs);
  const protocol = input.protocol?.trim() || null;

  let newId = '';
  await client.begin(async (tx) => {
    const sort_order = await nextSortOrder(tx, cid);
    const templateId = await materializeTestContent(tx, {
      coach_id: cid,
      name: input.name,
      format: input.format,
      protocol,
      testSlug: slug,
      specs,
    });
    const rows = await tx<{ id: string }[]>`
      insert into coach_calibration_tests
        (coach_id, slug, name, protocol, format, primary_modality, template_id, enabled, sort_order)
      values (
        ${cid}, ${slug}, ${input.name}, ${protocol}, ${input.format}::template_format,
        ${primary_modality}, ${templateId}, ${input.enabled}, ${sort_order}
      )
      returning id::text as id
    `;
    newId = rows[0]!.id;
    await insertResults(tx, Number(newId), specs);
    await insertSchedule(tx, Number(newId), input.schedule);
  });

  const created = await getOne(cid, newId, client);
  if (!created) throw new CoachTestError('not_found', 'Test no encontrado tras crearlo', 500);
  return created;
}

/** Edit a calibration test. Ownership-scoped. Results/schedule, when present, are
 *  full replacements; the content template is reused (segments + meta_json
 *  overwritten) when results change. */
export async function updateCoachTest(
  coach_id: number | bigint,
  test_id: number | bigint,
  input: CoachTestUpdate,
  client: Sql = defaultSql,
): Promise<CoachCalibrationTest | null> {
  const cid = Number(coach_id);
  const tid = Number(test_id);

  const owned = await client<
    {
      slug: string;
      name: string;
      format: string;
      protocol: string | null;
      template_id: string | null;
      enabled: boolean;
      primary_modality: string | null;
    }[]
  >`
    select slug, name, format::text as format, protocol, template_id::text as template_id,
           enabled, primary_modality
    from coach_calibration_tests
    where id = ${tid} and coach_id = ${cid} and archived_at is null
    limit 1
  `;
  const current = owned[0];
  if (!current) return null;

  const name = input.name ?? current.name;
  const format = input.format ?? current.format;
  const protocol =
    input.protocol !== undefined ? (input.protocol?.trim() || null) : current.protocol;
  const enabled = input.enabled ?? current.enabled;

  const specs = input.results ? resolveSpecs(input.results, current.slug) : null;
  // primary_modality is re-derived only when the results change; otherwise kept.
  const primary_modality = specs ? primaryModalityOf(specs) : current.primary_modality;

  await client.begin(async (tx) => {
    // Identity fields — always fully set (defaults kept from `current`).
    await tx`
      update coach_calibration_tests set
        name = ${name},
        format = ${format}::template_format,
        protocol = ${protocol},
        enabled = ${enabled},
        primary_modality = ${primary_modality},
        updated_at = now()
      where id = ${tid} and coach_id = ${cid}
    `;

    // Content template: keep name/format/protocol in sync; rebuild segments +
    // meta_json only when results changed.
    let templateId = current.template_id ? Number(current.template_id) : null;
    if (specs) {
      templateId = await materializeTestContent(tx, {
        coach_id: cid,
        name,
        format,
        protocol,
        testSlug: current.slug,
        specs,
        existingTemplateId: templateId,
      });
      await tx`
        update coach_calibration_tests set template_id = ${templateId}
        where id = ${tid} and coach_id = ${cid}
      `;
      // Replace the normalized result rows (source of truth).
      await tx`delete from coach_test_results where test_id = ${tid}`;
      await insertResults(tx, tid, specs);
    } else if (templateId != null) {
      // Results unchanged but name/format/protocol may have; keep the template's
      // display fields aligned (meta_json contract is unchanged).
      await tx`
        update templates set name = ${name}, format = ${format}::template_format,
          coach_notes = ${protocol}, updated_at = now()
        where id = ${templateId}::bigint and coach_id = ${cid}::bigint
          and instance_athlete_id is null
      `;
    }

    if (input.schedule) {
      await tx`delete from coach_test_schedule where test_id = ${tid}`;
      await insertSchedule(tx, tid, input.schedule);
    }
  });

  return getOne(cid, String(tid), client);
}

/** Remove a test from the battery (soft: archived, so the FK from any already-
 *  scheduled assignment + its captured results survive). Returns false if not
 *  owned. */
export async function deleteCoachTest(
  coach_id: number | bigint,
  test_id: number | bigint,
  client: Sql = defaultSql,
): Promise<boolean> {
  const rows = await client<{ id: string }[]>`
    update coach_calibration_tests set archived_at = now(), enabled = false, updated_at = now()
    where id = ${Number(test_id)} and coach_id = ${Number(coach_id)} and archived_at is null
    returning id::text as id
  `;
  return rows.length > 0;
}

/** Reorder the coach's (non-archived) tests. `ordered_ids` is the full ordered
 *  list; sort_order becomes the array index. Ids not owned are ignored. */
export async function reorderCoachTests(
  coach_id: number | bigint,
  ordered_ids: Array<string | number>,
  client: Sql = defaultSql,
): Promise<void> {
  const cid = Number(coach_id);
  await client.begin(async (tx) => {
    for (let i = 0; i < ordered_ids.length; i += 1) {
      const id = Number(ordered_ids[i]);
      if (!Number.isFinite(id)) continue;
      await tx`
        update coach_calibration_tests set sort_order = ${i}, updated_at = now()
        where id = ${id} and coach_id = ${cid} and archived_at is null
      `;
    }
  });
}
