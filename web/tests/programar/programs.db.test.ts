/**
 * Programar contra la base de verdad: la lista de programas (semanas, entrenos,
 * «usado por», grupos), el guardado por lotes de celdas de la rejilla (todo o
 * nada, esquema, ejercicios visibles, dueño), archivar, los pasos de progresar
 * y la biblioteca como tabla (estado, «usado en», archivar y etiquetar).
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Sql } from '@/lib/db';
import type { WeekDay } from '@fahybrid/shared/schema/program-templates';
import {
  listPrograms,
  loadProgramGrid,
  loadProgressionSteps,
  ProgramError,
  saveProgressionSteps,
  setProgramArchived,
  updateProgramMeta,
  writeCells,
} from '@/lib/dashboard/programming/programs';
import { addLibraryTags, libraryItemForCell, listLibrary, setLibraryArchived } from '@/lib/dashboard/programming/library';
import { createMonthTemplateWithEmptyWeeks } from '@/lib/dashboard/coach/program-months';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeExercise, type Fixture } from '../utils/db-fixtures';

const T = 60_000;

function strengthDay(dow: number, exerciseId: number, pct = 75): WeekDay {
  return {
    day_of_week: dow,
    sessions: [
      {
        kind: 'workout',
        template_id: null,
        focus: 'Fuerza',
        blocks: [
          {
            uid: `b-${dow}-${pct}`,
            format: 'sets',
            title: 'Sentadilla',
            items: [
              {
                uid: `i-${dow}-${pct}`,
                exercise_id: exerciseId,
                exercise_name: 'Sentadilla',
                prescription_json: {
                  scheme: 'sets',
                  modality: 'strength',
                  sets: Array.from({ length: 5 }, () => ({ measure: { kind: 'reps' as const, value: 5 }, target: { kind: 'percent_rm' as const, value: pct } })),
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

describeWithDb('programar · programas, celdas y biblioteca (real DB)', () => {
  const sql: Sql = getTestSql();
  let fx: Fixture;
  let other: Fixture;
  let exId: number;
  let programId: number;
  let weekIds: string[];

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
    exId = await makeExercise({ fx, name: 'Back Squat Programar' });
  }, T);


  afterAll(async () => {
    await sql`delete from blocks where coach_id in (${fx.coachId}, ${other.coachId})`;
    await fx.cleanup();
    await other.cleanup();
    await closeTestSql();
  }, T);

  async function newProgram(name: string, weeks = 4) {
    const r = await createMonthTemplateWithEmptyWeeks({ coach_id: fx.coachId, payload: { name, week_count: weeks }, client: sql });
    fx.monthTemplates.push({ monthId: Number(r.id), weekIds: r.weeks.map((w) => Number(w.id)) });
    return { id: Number(r.id), weekIds: r.weeks.map((w) => w.id) };
  }

  test('un programa nuevo sale en la lista sin nivel, con sus semanas y 0 entrenos', async () => {
    const p = await newProgram('Acumulación test');
    programId = p.id;
    weekIds = p.weekIds;
    const list = await listPrograms({ coach_id: fx.coachId, client: sql });
    const row = list.find((r) => r.id === String(programId))!;
    expect(row).toMatchObject({ name: 'Acumulación test', level: null, weeks: 4, sessions: 0, used_by: 0, archived: false, tags: [] });
    // otro coach no lo ve
    expect((await listPrograms({ coach_id: other.coachId, client: sql })).some((r) => r.id === String(programId))).toBe(false);
  }, T);

  test('guardar un lote de celdas escribe todas las semanas en una transacción', async () => {
    const out = await writeCells({
      coach_id: fx.coachId,
      program_id: programId,
      cells: weekIds.map((w, i) => ({ week_id: w, day_of_week: 1, day: strengthDay(1, exId, 75 + i * 2.5) })),
      client: sql,
    });
    expect(out.weeks).toHaveLength(4);
    const grid = await loadProgramGrid({ coach_id: fx.coachId, program_id: programId, client: sql });
    expect(grid!.weeks).toHaveLength(4);
    const target = (i: number) => grid!.weeks[i]!.days.find((d) => d.day_of_week === 1)!.sessions[0]!.blocks![0]!.items[0]!.prescription_json!.sets![0]!.target;
    expect(target(3)).toEqual({ kind: 'percent_rm', value: 82.5 });
    expect((await listPrograms({ coach_id: fx.coachId, client: sql })).find((r) => r.id === String(programId))!.sessions).toBe(4);
  }, T);

  test('todo o nada: una celda mala no deja escritas las buenas', async () => {
    await expect(
      writeCells({
        coach_id: fx.coachId,
        program_id: programId,
        cells: [
          { week_id: weekIds[0]!, day_of_week: 2, day: strengthDay(2, exId) },
          { week_id: weekIds[1]!, day_of_week: 3, day: strengthDay(4, exId) }, // columna equivocada
        ],
        client: sql,
      }),
    ).rejects.toBeInstanceOf(ProgramError);
    const grid = await loadProgramGrid({ coach_id: fx.coachId, program_id: programId, client: sql });
    expect(grid!.weeks[0]!.days.find((d) => d.day_of_week === 2)?.sessions.length ?? 0).toBe(0);
  }, T);

  test('un ejercicio que no es del catálogo del coach se rechaza; otro coach no puede escribir', async () => {
    const foreign = await makeExercise({ fx: other, name: 'Propio de otro', coachId: other.coachId });
    await expect(
      writeCells({ coach_id: fx.coachId, program_id: programId, cells: [{ week_id: weekIds[0]!, day_of_week: 5, day: strengthDay(5, foreign) }], client: sql }),
    ).rejects.toMatchObject({ code: 'invalid_exercise' });
    await expect(
      writeCells({ coach_id: other.coachId, program_id: programId, cells: [{ week_id: weekIds[0]!, day_of_week: 5, day: strengthDay(5, exId) }], client: sql }),
    ).rejects.toMatchObject({ code: 'not_found' });
  }, T);

  test('nombre, etiquetas y archivar', async () => {
    await updateProgramMeta({ coach_id: fx.coachId, program_id: programId, patch: { name: 'Build test', tags: ['HYROX', 'Base'] }, client: sql });
    await setProgramArchived({ coach_id: fx.coachId, program_id: programId, archived: true, client: sql });
    const row = (await listPrograms({ coach_id: fx.coachId, client: sql })).find((r) => r.id === String(programId))!;
    expect(row).toMatchObject({ name: 'Build test', tags: ['HYROX', 'Base'], archived: true });
    await setProgramArchived({ coach_id: fx.coachId, program_id: programId, archived: false, client: sql });
    await expect(updateProgramMeta({ coach_id: other.coachId, program_id: programId, patch: { name: 'x' }, client: sql })).rejects.toMatchObject({ code: 'not_found' });
  }, T);

  test('los pasos de progresar: defecto sin tocar, y por campo', async () => {
    expect(await loadProgressionSteps(fx.coachId, sql)).toEqual({ load_step_pct: 2.5, sets_step: 1, deload_volume_pct: 30 });
    const s = await saveProgressionSteps({ coach_id: fx.coachId, patch: { load_step_pct: 5 }, client: sql });
    expect(s).toEqual({ load_step_pct: 5, sets_step: 1, deload_volume_pct: 30 });
    expect((await saveProgressionSteps({ coach_id: fx.coachId, patch: { load_step_pct: null }, client: sql })).load_step_pct).toBe(2.5);
  }, T);

  test('biblioteca: un bloque tipado está listo, uno solo en prosa por revisar; se usa, se archiva, se etiqueta', async () => {
    const [typed] = await sql<Array<{ id: string }>>`
      insert into blocks (slug, title, description, methodology_group_id, coach_id)
      values (${`t-${Date.now()}`}, 'Sentadilla 5x5', '', 1, ${fx.coachId}) returning id::text`;
    await sql`insert into block_exercises (block_id, position, exercise_id, prescription_json)
      values (${Number(typed!.id)}, 0, ${exId}, ${sql.json({ scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 }, target: { kind: 'percent_rm', value: 75 } }] })})`;
    const [prose] = await sql<Array<{ id: string }>>`
      insert into blocks (slug, title, description, methodology_group_id, coach_id)
      values (${`p-${Date.now()}`}, 'WOD en prosa', 'AMRAP 20 min: 10 burpees, 15 wall balls', 6, ${fx.coachId}) returning id::text`;

    const insert = await libraryItemForCell({ coach_id: fx.coachId, kind: 'bloque', id: Number(typed!.id) });
    expect(insert!.parts).toHaveLength(1);
    expect(insert!.parts[0]!.source_block_id).toBe(Number(typed!.id));
    await writeCells({
      coach_id: fx.coachId,
      program_id: programId,
      cells: [{ week_id: weekIds[2]!, day_of_week: 3, day: { day_of_week: 3, sessions: [{ kind: 'workout', template_id: null, blocks: insert!.parts }] } }],
      client: sql,
    });

    let lib = await listLibrary({ coach_id: fx.coachId, client: sql });
    const t = lib.bloques.find((b) => b.id === typed!.id)!;
    const p = lib.bloques.find((b) => b.id === prose!.id)!;
    expect(t).toMatchObject({ status: 'listo', used_in: 1, prose_excerpt: null });
    expect(t.lines[0]).toBe('Back Squat Programar 5 @ 75% RM');
    expect(p).toMatchObject({ status: 'por_revisar', used_in: 0 });
    expect(p.prose_excerpt).toContain('AMRAP');
    // prosa no se inserta
    expect((await libraryItemForCell({ coach_id: fx.coachId, kind: 'bloque', id: Number(prose!.id) }))!.parts).toHaveLength(0);
    // otro coach no la ve
    expect(await libraryItemForCell({ coach_id: other.coachId, kind: 'bloque', id: Number(typed!.id) })).toBeNull();

    await addLibraryTags({ coach_id: fx.coachId, items: [{ kind: 'bloque', id: Number(typed!.id) }], add: ['Fuerza', 'N3'], client: sql });
    await setLibraryArchived({ coach_id: fx.coachId, items: [{ kind: 'bloque', id: Number(prose!.id) }], archived: true, client: sql });
    lib = await listLibrary({ coach_id: fx.coachId, client: sql });
    expect(lib.bloques.find((b) => b.id === typed!.id)!.tags).toEqual(['Fuerza', 'N3']);
    expect(lib.bloques.find((b) => b.id === prose!.id)!.archived).toBe(true);
    expect(await addLibraryTags({ coach_id: other.coachId, items: [{ kind: 'bloque', id: Number(typed!.id) }], add: ['x'], client: sql })).toBe(0);
  }, T);
});
