/**
 * Real-DB integration tests for editing a library block's master fields
 * (Biblioteca de Bloques, 0037). `updateBlock` backs `PATCH /api/coach/blocks/[id]`,
 * which lets the coach edit the GLOBAL master library (title / description /
 * methodology_group_id / atr_block_hint). Mutating affects every future
 * materialization. The structured `block_exercises` are NOT touched here.
 *
 * Also covers the Zod contract (`blockUpdateSchema`) the route validates against.
 * No SQL is mocked.
 */
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { getBlockById, updateBlock } from '@/lib/dashboard/coach/blocks';
import { blockUpdateSchema } from '@fahybrid/shared/schema/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeLibraryBlock, type Fixture } from '../utils/db-fixtures';

describeWithDb('PATCH /api/coach/blocks/[id] update (real DB)', () => {
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

  test('updates title / description / group / atr and returns the new block', async () => {
    const fx = await fixture();
    const blockId = await makeLibraryBlock({
      fx,
      title: 'Original',
      description: 'Prescripción original',
      exercises: [],
    });

    const updated = await updateBlock(
      blockId,
      {
        title: 'Editado',
        description: 'Nueva prescripción',
        methodology_group_id: 3,
        atr_block_hint: 'TRANS',
      },
      sql,
    );

    expect(updated).not.toBeNull();
    expect(updated!.title).toBe('Editado');
    expect(updated!.description).toBe('Nueva prescripción');
    expect(updated!.methodology_group_id).toBe(3);
    expect(updated!.atr_block_hint).toBe('TRANS');

    // Persisted.
    const reread = await getBlockById(blockId, sql);
    expect(reread!.title).toBe('Editado');
    expect(reread!.methodology_group_id).toBe(3);
    expect(reread!.atr_block_hint).toBe('TRANS');
  });

  test('partial patch leaves untouched fields intact', async () => {
    const fx = await fixture();
    const blockId = await makeLibraryBlock({
      fx,
      title: 'Solo título cambia',
      description: 'Esta descripción no debe cambiar',
      exercises: [],
    });

    const updated = await updateBlock(blockId, { title: 'Nuevo título' }, sql);
    expect(updated!.title).toBe('Nuevo título');
    expect(updated!.description).toBe('Esta descripción no debe cambiar');
  });

  test('can clear atr_block_hint by setting it to null', async () => {
    const fx = await fixture();
    const blockId = await makeLibraryBlock({
      fx,
      title: 'Con fase',
      description: 'X',
      exercises: [],
    });
    await updateBlock(blockId, { atr_block_hint: 'ACC' }, sql);
    const cleared = await updateBlock(blockId, { atr_block_hint: null }, sql);
    expect(cleared!.atr_block_hint).toBeNull();
  });

  test('unknown block id returns null', async () => {
    await fixture();
    const result = await updateBlock(999_999_999, { title: 'X' }, sql);
    expect(result).toBeNull();
  });

  test('does not touch the structured block_exercises', async () => {
    const fx = await fixture();
    const { makeExercise } = await import('../utils/db-fixtures');
    const ex = await makeExercise({ fx, name: 'Front Squat' });
    const blockId = await makeLibraryBlock({
      fx,
      title: 'Con desglose',
      description: 'X',
      exercises: [{ exercise_id: ex, position: 0, params_json: { sets: 5, reps: 10 } }],
    });

    await updateBlock(blockId, { title: 'Renombrado' }, sql);

    const rows = await sql<Array<{ n: number }>>`
      select count(*)::int as n from block_exercises where block_id = ${blockId}
    `;
    expect(rows[0]!.n).toBe(1);
  });

  // ── Zod contract (what the route validates before hitting the DB) ──

  test('rejects an empty patch (no fields)', () => {
    expect(blockUpdateSchema.safeParse({}).success).toBe(false);
  });

  test('rejects an empty title', () => {
    expect(blockUpdateSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  test('rejects an out-of-range methodology group', () => {
    expect(blockUpdateSchema.safeParse({ methodology_group_id: 0 }).success).toBe(false);
    expect(blockUpdateSchema.safeParse({ methodology_group_id: 11 }).success).toBe(false);
  });

  test('accepts atr_block_hint: null and trims title', () => {
    const parsed = blockUpdateSchema.safeParse({ title: '  Hola  ', atr_block_hint: null });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe('Hola');
      expect(parsed.data.atr_block_hint).toBeNull();
    }
  });
});
