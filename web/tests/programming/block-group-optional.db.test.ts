// El grupo de metodología de un bloque es OPCIONAL (0240): un bloque nuevo sin
// grupo queda sin clasificar — nunca en el grupo 1 por defecto — y un reemplazo
// que no dice nada del grupo no se lo cambia.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';
import { createBlock, getBlockById, updateBlockFull } from '@/lib/dashboard/coach/blocks';
import { blockWriteSchema } from '@fahybrid/shared/schema/blocks';

const exercises = (exercise_id: number) => [
  {
    exercise_id,
    block_position: 0,
    prescription_json: { scheme: 'sets' as const, modality: 'strength' as const, sets: [{ measure: { kind: 'reps' as const, value: 5 } }] },
  },
];

describeWithDb('bloque sin grupo de metodología (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let ex = 0;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    ex = await makeExercise({ fx });
  });
  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  test('el esquema acepta un bloque sin grupo', () => {
    expect(blockWriteSchema.safeParse({ title: 'Sin grupo', exercises: exercises(ex) }).success).toBe(true);
  });

  test('crear sin grupo → null; reemplazar sin decir grupo lo conserva; null explícito lo quita', async () => {
    const id = await createBlock(fx.coachId, { title: 'Sin grupo', exercises: exercises(ex) }, sql);
    fx.blockIds.push(id);
    expect((await getBlockById(fx.coachId, id, sql))?.methodology_group_id).toBeNull();

    await updateBlockFull(fx.coachId, id, { title: 'Con grupo', methodology_group_id: 4, exercises: exercises(ex) }, sql);
    await updateBlockFull(fx.coachId, id, { title: 'Otra vez', exercises: exercises(ex) }, sql);
    expect((await getBlockById(fx.coachId, id, sql))?.methodology_group_id).toBe(4);

    await updateBlockFull(fx.coachId, id, { title: 'Otra vez', methodology_group_id: null, exercises: exercises(ex) }, sql);
    expect((await getBlockById(fx.coachId, id, sql))?.methodology_group_id).toBeNull();
  });

  test('un grupo que no existe es un 400 claro', async () => {
    await expect(
      createBlock(fx.coachId, { title: 'Grupo fantasma', methodology_group_id: 999, exercises: exercises(ex) }, sql),
    ).rejects.toMatchObject({ code: 'invalid_group', status: 400 });
  });
});
