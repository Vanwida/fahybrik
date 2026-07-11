/**
 * Real-DB tests for the effort CONTEXT stamped onto segment_executions
 * (migration 0120) by `ingestExecutionSegments`.
 *
 * The context is derived SERVER-SIDE, never trusted from the client:
 *   • a segment linked to a live template_segment → context_source='block',
 *     with context_format (canonicalized from the block format / prescription
 *     scheme), exercise_id and prescription_snapshot copied off the block;
 *   • an unlinked segment → context_source='session', context_format from the
 *     session's own format (the assignment's templates.format);
 *   • a re-sync recomputes format/source/prior_work but NEVER clobbers the
 *     immutable exercise_id / prescription_snapshot back to NULL;
 *   • prior_work_s sums earlier-segment durations, honest-or-NULL.
 *
 * Nothing is mocked (project rule). Each test seeds its own fixtures and tears
 * them down (executions + segments cascade from the assignment/template delete).
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { ingestExecutionSegments, type SegmentInput } from '@/lib/sync/ingest-execution-segments';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeAssignment, makeCoachAndAthlete, makeExercise, makeTemplate, type Fixture } from '../utils/db-fixtures';

const START = '2026-04-06T08:00:00.000Z';

async function makeExecution(fx: Fixture, assignmentId: number): Promise<number> {
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, source)
    values (${assignmentId}, ${fx.athleteId}, ${START}::timestamptz, ${START}::timestamptz, 'healthkit')
    returning id::text
  `;
  return Number(rows[0]!.id);
}

/** Insert a template_segment under a template; returns its id. */
async function makeTemplateSegment(params: {
  fx: Fixture;
  templateId: number;
  position: number;
  exerciseId: number;
  blockFormat?: string | null;
  prescriptionJson?: Record<string, unknown> | null;
}): Promise<number> {
  const { fx } = params;
  const rows = await fx.sql<Array<{ id: string }>>`
    insert into template_segments (template_id, position, exercise_id, block_format, prescription_json)
    values (
      ${params.templateId},
      ${params.position},
      ${params.exerciseId},
      ${params.blockFormat ?? null},
      ${params.prescriptionJson != null ? fx.sql.json(params.prescriptionJson as Parameters<typeof fx.sql.json>[0]) : null}
    )
    returning id::text
  `;
  return Number(rows[0]!.id);
}

type ContextRow = {
  position: number;
  context_format: string | null;
  context_source: string | null;
  exercise_id: string | null;
  prescription_snapshot: unknown;
  prior_work_s: number | null;
};

describeWithDb('segment_executions effort context (migration 0120, real DB)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function seed(sessionFormat: string): Promise<{ fx: Fixture; templateId: number; executionId: number; exerciseId: number }> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const templateId = await makeTemplate({ fx, name: 'ctx-session', format: sessionFormat });
    const exerciseId = await makeExercise({ fx });
    const assignmentId = await makeAssignment({ fx, templateId, scheduledForIso: '2026-04-06' });
    const executionId = await makeExecution(fx, assignmentId);
    return { fx, templateId, executionId, exerciseId };
  }

  async function readContext(executionId: number): Promise<ContextRow[]> {
    return sql<ContextRow[]>`
      select position, context_format, context_source, exercise_id::text as exercise_id,
             prescription_snapshot, prior_work_s
      from segment_executions
      where execution_id = ${executionId}
      order by position
    `;
  }

  test("linked segment stamps 'block' context: format + exercise + prescription from the block (simulation → hyrox_sim)", async () => {
    const { fx, templateId, executionId, exerciseId } = await seed('emom');
    const prescription = { scheme: 'hyrox_sim', sets: [{ set_index: 1, reps: 8 }] };
    const tsId = await makeTemplateSegment({
      fx,
      templateId,
      position: 0,
      exerciseId,
      // Legacy free-text label that must canonicalize to hyrox_sim.
      blockFormat: 'simulation',
      prescriptionJson: prescription,
    });

    const segments: SegmentInput[] = [{ position: 0, modality: 'row', template_segment_id: tsId, duration_seconds: 240 }];
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments, sessionFormat: 'emom' });

    const [row] = await readContext(executionId);
    expect(row!.context_source).toBe('block');
    expect(row!.context_format).toBe('hyrox_sim'); // canonical of 'simulation'
    expect(Number(row!.exercise_id)).toBe(exerciseId);
    expect(row!.prescription_snapshot).toEqual(prescription); // immutable snapshot round-trips
  });

  test("linked segment with NULL block_format falls back to the prescription scheme (circuit → rounds)", async () => {
    const { fx, templateId, executionId, exerciseId } = await seed('emom');
    const tsId = await makeTemplateSegment({
      fx,
      templateId,
      position: 0,
      exerciseId,
      blockFormat: null,
      prescriptionJson: { scheme: 'circuit' },
    });

    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength', template_segment_id: tsId }],
      sessionFormat: 'emom',
    });

    const [row] = await readContext(executionId);
    expect(row!.context_source).toBe('block');
    expect(row!.context_format).toBe('rounds'); // canonical of scheme 'circuit'
  });

  test("unlinked segment falls back to the SESSION format ('session'), no exercise/snapshot", async () => {
    const { executionId } = await seed('emom');
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'run', distance_meters: 1000 }], // no template_segment_id
      sessionFormat: 'emom',
    });

    const [row] = await readContext(executionId);
    expect(row!.context_source).toBe('session');
    expect(row!.context_format).toBe('emom');
    expect(row!.exercise_id).toBeNull();
    expect(row!.prescription_snapshot).toBeNull();
  });

  test('re-sync recomputes format/source but preserves the immutable exercise_id + prescription_snapshot', async () => {
    const { fx, templateId, executionId, exerciseId } = await seed('amrap');
    const prescription = { scheme: 'sets', sets: [{ set_index: 1, reps: 5, load_kg: 100 }] };
    const tsId = await makeTemplateSegment({
      fx,
      templateId,
      position: 0,
      exerciseId,
      blockFormat: 'strength_block',
      prescriptionJson: prescription,
    });

    // First sync: linked → block context with exercise + snapshot.
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength', template_segment_id: tsId }],
      sessionFormat: 'amrap',
    });

    // Re-sync the SAME position but WITHOUT the link (a later payload that lost it).
    await ingestExecutionSegments({
      sql,
      executionId,
      executionStartedAt: START,
      segments: [{ position: 0, modality: 'strength' }],
      sessionFormat: 'amrap',
    });

    const rows = await readContext(executionId);
    expect(rows).toHaveLength(1); // upsert, not a duplicate
    const row = rows[0]!;
    // Overwritten (server-derived) with the now-unlinked context...
    expect(row.context_source).toBe('session');
    expect(row.context_format).toBe('amrap');
    // ...but the immutable history is NEVER clobbered to NULL.
    expect(Number(row.exercise_id)).toBe(exerciseId);
    expect(row.prescription_snapshot).toEqual(prescription);
  });

  test('prior_work_s sums earlier-segment durations (0 for the first)', async () => {
    const { executionId } = await seed('for_time');
    const segments: SegmentInput[] = [
      { position: 0, modality: 'run', duration_seconds: 240 },
      { position: 1, modality: 'row', duration_seconds: 300 },
      { position: 2, modality: 'strength', duration_seconds: 120 },
    ];
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments, sessionFormat: 'for_time' });

    const rows = await readContext(executionId);
    expect(rows.map((r) => r.prior_work_s)).toEqual([0, 240, 540]);
  });

  test('prior_work_s is NULL when an earlier segment has no measurable duration (never a partial sum)', async () => {
    const { executionId } = await seed('for_time');
    const segments: SegmentInput[] = [
      { position: 0, modality: 'run' }, // no duration, no explicit timestamps
      { position: 1, modality: 'row', duration_seconds: 300 },
    ];
    await ingestExecutionSegments({ sql, executionId, executionStartedAt: START, segments, sessionFormat: 'for_time' });

    const rows = await readContext(executionId);
    expect(rows[0]!.prior_work_s).toBe(0); // first segment: zero prior work
    expect(rows[1]!.prior_work_s).toBeNull(); // prior lacks duration → honest NULL
  });
});
