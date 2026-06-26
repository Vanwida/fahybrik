/**
 * Real-DB integration tests for the block-detail hydration the week-studio uses
 * when inserting a library block (Biblioteca de Bloques, 0037/0038).
 *
 * `getBlockById` + `getBlockExerciseItems` back `GET /api/coach/blocks/[id]`,
 * which the studio fetches to fill `part.items` with the block's STRUCTURED
 * exercises so the Fase-3 panel can edit them per-athlete. The mapping
 * (`block_exercises` → `WeekDayPartItem`) MUST mirror exactly what the
 * materializer (`hydrateBlockParts`) produces for `template_segments` — both go
 * through the shared `blockExerciseToItem`. No SQL is mocked.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import {
  getBlockById,
  getBlockExerciseItems,
} from '@/lib/dashboard/coach/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeLibraryBlock,
  type Fixture,
} from '../utils/db-fixtures';

describeWithDb('GET /api/coach/blocks/[id] hydration (real DB)', () => {
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

  async function fixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    return fx;
  }

  test('maps block_exercises to WeekDayPartItem[] in position order with catalog ids + params', async () => {
    const fx = await fixture();
    const frontSquat = await makeExercise({ fx, name: 'Front Squat' });
    const hipThrust = await makeExercise({ fx, name: 'Hip Thrust' });

    const blockId = await makeLibraryBlock({
      fx,
      title: 'Front squat + Hip thrust',
      description: 'Front squat 5r al 65-80% + Hip thrust 5r',
      exercises: [
        {
          exercise_id: frontSquat,
          position: 0,
          block_position: 0,
          params_json: { sets: 5, reps: 10, load_pct: 65 },
          notes: 'Controla la bajada',
        },
        {
          exercise_id: hipThrust,
          position: 1,
          block_position: 1,
          params_json: { sets: 5, reps: 10 },
        },
      ],
    });

    const block = await getBlockById(fx.coachId, blockId, sql);
    expect(block).not.toBeNull();
    expect(block!.id).toBe(blockId);
    expect(block!.title).toBe('Front squat + Hip thrust');

    const items = await getBlockExerciseItems(blockId, sql);
    expect(items.map((i) => i.exercise_id)).toEqual([frontSquat, hipThrust]);
    expect(items.map((i) => i.exercise_name)).toEqual(['Front Squat', 'Hip Thrust']);
    // Stable uids (be-<blockId>-<position>) — same shape the materializer emits.
    expect(items.map((i) => i.uid)).toEqual([`be-${blockId}-0`, `be-${blockId}-1`]);
    expect(items[0]!.params_json).toMatchObject({ sets: 5, reps: 10, load_pct: 65 });
    expect(items[0]!.notes).toBe('Controla la bajada');
    expect(items[1]!.notes).toBeUndefined();
  });

  test('needs_review block (no block_exercises) yields empty items → panel degrades to verbatim', async () => {
    const fx = await fixture();
    const blockId = await makeLibraryBlock({
      fx,
      title: 'HYROX SIMULATION completo',
      description: 'HYROX SIMULATION completo',
      needsReview: true,
      exercises: [],
    });

    const block = await getBlockById(fx.coachId, blockId, sql);
    expect(block).not.toBeNull();
    const items = await getBlockExerciseItems(blockId, sql);
    expect(items).toHaveLength(0);
  });

  test('unknown block id returns null', async () => {
    const fx = await fixture(); // ensure DB connection is exercised
    const block = await getBlockById(fx.coachId, 999_999_999, sql);
    expect(block).toBeNull();
  });
});
