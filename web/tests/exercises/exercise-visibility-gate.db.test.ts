// Gate de visibilidad de exercise_id en las ESCRITURAS de contenido del coach
// (obra 0 multi-coach, patrón del confirm de importación): un exercise_id que no
// existe o es PROPIO de otro coach se rechaza con la MISMA respuesta (sin
// revelar cuál), antes de escribir nada. Y el rango de nivel de un bloque solo
// admite athlete_levels del propio coach.
//
// DB real (Neon branch): lo que se prueba ES el SQL del gate + el rollback de la
// transacción. Se salta con aviso cuando no hay TEST_DATABASE_URL.

import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  createTemplate,
  updateTemplate,
  TemplateError,
} from '@/lib/dashboard/coach/templates';
import {
  createBlock,
  updateBlock,
  updateBlockFull,
  BlockError,
} from '@/lib/dashboard/coach/blocks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const PRESCRIPTION = {
  scheme: 'sets' as const,
  modality: 'strength' as const,
  sets: [{ measure: { kind: 'reps' as const, value: 5 } }],
};

const segment = (exercise_id: number, position = 0) => ({
  exercise_id,
  position,
  block_position: 0,
});

const blockExercise = (exercise_id: number) => ({
  exercise_id,
  block_position: 0,
  prescription_json: PRESCRIPTION,
});

describeWithDb('gate de visibilidad de ejercicios + nivel del coach (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const levelIds: number[] = [];
  let clubA: Fixture;
  let clubB: Fixture;
  let baseEx = 0; // catálogo BASE: visible para todos
  let propioA = 0; // PROPIO del club A
  let propioB = 0; // PROPIO del club B — invisible para A

  beforeAll(async () => {
    clubA = await makeCoachAndAthlete(sql);
    clubB = await makeCoachAndAthlete(sql);
    cleanups.push(clubA.cleanup, clubB.cleanup);
    baseEx = await makeExercise({ fx: clubA });
    propioA = await makeExercise({ fx: clubA, coachId: clubA.coachId });
    propioB = await makeExercise({ fx: clubB, coachId: clubB.coachId });
  });

  afterAll(async () => {
    if (levelIds.length) await sql`delete from athlete_levels where id in ${sql(levelIds)}`;
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('createTemplate: base + PROPIO propio pasan; el PROPIO de otro coach → 404 y CERO filas', async () => {
    // Caso propio, byte a byte.
    const okId = await createTemplate({
      coach_id: clubA.coachId,
      payload: {
        name: 'Fuerza A',
        format: 'sets',
        segments: [segment(baseEx, 0), segment(propioA, 1)],
      },
      client: sql,
    });
    clubA.templateIds.push(Number(okId));
    const segs = await sql<{ exercise_id: string }[]>`
      select exercise_id::text as exercise_id from template_segments
      where template_id = ${Number(okId)} order by position
    `;
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([baseEx, propioA]);

    // Cross-club: el tx entero revierte — ni template ni segmentos.
    await expect(
      createTemplate({
        coach_id: clubA.coachId,
        payload: { name: 'Robo', format: 'sets', segments: [segment(propioB)] },
        client: sql,
      }),
    ).rejects.toMatchObject({ code: 'invalid_exercise', status: 404 });
    const ghost = await sql<{ n: number }[]>`
      select count(*)::int as n from templates
      where coach_id = ${clubA.coachId} and name = 'Robo'
    `;
    expect(ghost[0]!.n).toBe(0);

    // updateTemplate con un ejercicio ajeno: los segmentos existentes quedan intactos.
    await expect(
      updateTemplate({
        coach_id: clubA.coachId,
        template_id: Number(okId),
        payload: { segments: [segment(propioB)] },
        client: sql,
      }),
    ).rejects.toBeInstanceOf(TemplateError);
    const stillThere = await sql<{ n: number }[]>`
      select count(*)::int as n from template_segments where template_id = ${Number(okId)}
    `;
    expect(stillThere[0]!.n).toBe(2);
  });

  test('createBlock/updateBlockFull: el PROPIO de otro coach → 404 y el bloque queda intacto', async () => {
    const blockId = await createBlock(
      clubA.coachId,
      {
        title: 'Bloque A',
        methodology_group_id: 1,
        exercises: [blockExercise(baseEx)],
      },
      sql,
    );
    clubA.blockIds.push(blockId);

    await expect(
      createBlock(
        clubA.coachId,
        {
          title: 'Bloque robado',
          methodology_group_id: 1,
          exercises: [blockExercise(propioB)],
        },
        sql,
      ),
    ).rejects.toMatchObject({ code: 'invalid_exercise', status: 404 });
    const ghost = await sql<{ n: number }[]>`
      select count(*)::int as n from blocks
      where coach_id = ${clubA.coachId} and title = 'Bloque robado'
    `;
    expect(ghost[0]!.n).toBe(0);

    // Full replace con ejercicio ajeno: rollback — los block_exercises y el
    // título del bloque quedan como estaban.
    await expect(
      updateBlockFull(
        clubA.coachId,
        blockId,
        {
          title: 'Bloque A pisado',
          methodology_group_id: 1,
          exercises: [blockExercise(propioB)],
        },
        sql,
      ),
    ).rejects.toBeInstanceOf(BlockError);
    const after = await sql<{ title: string; n: number }[]>`
      select b.title, (select count(*)::int from block_exercises be where be.block_id = b.id) as n
      from blocks b where b.id = ${blockId}
    `;
    expect(after[0]!.title).toBe('Bloque A');
    expect(after[0]!.n).toBe(1);
  });

  test('updateBlock: el rango de nivel solo admite athlete_levels del propio coach', async () => {
    const blockId = await createBlock(
      clubA.coachId,
      { title: 'Bloque niveles', methodology_group_id: 1, exercises: [blockExercise(baseEx)] },
      sql,
    );
    clubA.blockIds.push(blockId);

    const levelRows = await sql<{ id: string }[]>`
      insert into athlete_levels (coach_id, name, label, sort_order)
      values (${clubA.coachId}, 'nivel-a', 'Nivel A', 0), (${clubB.coachId}, 'nivel-b', 'Nivel B', 0)
      returning id::text as id
    `;
    const [levelA, levelB] = levelRows.map((r) => Number(r.id));
    levelIds.push(levelA!, levelB!);

    // Nivel de otro club → 400 y el bloque no cambia.
    await expect(
      updateBlock(clubA.coachId, blockId, { min_level_id: levelB }, sql),
    ).rejects.toMatchObject({ code: 'invalid_level', status: 400 });
    const untouched = await sql<{ min_level_id: string | null }[]>`
      select min_level_id::text as min_level_id from blocks where id = ${blockId}
    `;
    expect(untouched[0]!.min_level_id).toBeNull();

    // Nivel propio → funciona igual que siempre.
    const updated = await updateBlock(clubA.coachId, blockId, { min_level_id: levelA }, sql);
    expect(updated).not.toBeNull();
    const applied = await sql<{ min_level_id: string | null }[]>`
      select min_level_id::text as min_level_id from blocks where id = ${blockId}
    `;
    expect(Number(applied[0]!.min_level_id)).toBe(levelA);
  });
});
