/**
 * Frontera de tenant sobre las referencias a entrenos y bloques (hallazgo P0 nº1
 * de la revisión de aislamiento, sep-2026).
 *
 * Un `template_id` o `source_block_id` que llega de fuera —el body de «añadir
 * sesión», un slot del JSON de una semana, una propuesta— se seguía sin mirar de
 * quién era: el coach A podía clonar el entreno secreto del coach B en su propio
 * atleta y leerlo. Dos coaches reales en la BD de pruebas; cada test falla con el
 * código de antes y pasa con el de ahora.
 */
import { afterAll, describe, expect, test } from 'vitest';

import { createDaySession } from '@/lib/dashboard/coach/day-sessions';
import { cloneTemplateAsInstance } from '@/lib/dashboard/coach/template-instance';
import { upsertWeekTemplate, ProgramWeekError } from '@/lib/dashboard/coach/program-weeks';
import { hydrateBlockParts, instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { buildPublishPreview } from '@/lib/dashboard/coach/publish-preview';
import { collectWeekSlotRefs } from '@/lib/dashboard/coach/week-slot-refs';
import type { WeekDayPart } from '@fahybrid/shared/schema/program-templates';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeLibraryBlock,
  makeMicrocycle,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

describe('collectWeekSlotRefs (pura)', () => {
  test('recoge template_id, source_block_id y exercise_id de todas las sesiones', () => {
    const refs = collectWeekSlotRefs({
      days: [
        { day_of_week: 1, sessions: [{ kind: 'workout', template_id: 7 }] },
        {
          day_of_week: 2,
          sessions: [
            { kind: 'workout', template_id: null, blocks: [{ source_block_id: 9, items: [{ exercise_id: '11' }] }] },
          ],
        },
      ],
    });
    expect(refs).toEqual({ templateIds: [7], blockIds: [9], exerciseIds: [11] });
  });

  test('un JSON vacío o raro no revienta', () => {
    expect(collectWeekSlotRefs(null)).toEqual({ templateIds: [], blockIds: [], exerciseIds: [] });
    expect(collectWeekSlotRefs({ days: 'x' })).toEqual({ templateIds: [], blockIds: [], exerciseIds: [] });
  });
});

describeWithDb('tenancy — entrenos y bloques de otro coach', () => {
  const sql = getTestSql();
  afterAll(async () => {
    await closeTestSql();
  });

  async function two(): Promise<[Fixture, Fixture]> {
    return [await makeCoachAndAthlete(sql), await makeCoachAndAthlete(sql)];
  }

  test('cloneTemplateAsInstance no copia un entreno de otro coach', async () => {
    const [A, B] = await two();
    try {
      const secret = await makeTemplate({ fx: B, name: 'B-SECRET' });
      const out = await cloneTemplateAsInstance({ client: sql, source_template_id: secret, athlete_id: A.athleteId });
      expect(out).toBeNull();
      // …ni aunque el que llama diga ser B: el atleta destino es de A.
      const out2 = await cloneTemplateAsInstance({
        client: sql,
        source_template_id: secret,
        athlete_id: A.athleteId,
        coach_id: B.coachId,
      });
      expect(out2).toBeNull();
      const leaked = await sql`select 1 from templates where instance_athlete_id = ${A.athleteId}`;
      expect(leaked).toHaveLength(0);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('el clon propio se escribe a nombre del coach del atleta', async () => {
    const [A, B] = await two();
    try {
      const mine = await makeTemplate({ fx: A, name: 'A-OWN' });
      const out = await cloneTemplateAsInstance({
        client: sql,
        source_template_id: mine,
        athlete_id: A.athleteId,
        coach_id: A.coachId,
      });
      expect(out).not.toBeNull();
      const rows = await sql<Array<{ coach_id: string }>>`select coach_id::text from templates where id = ${out!.template_id}`;
      expect(Number(rows[0]!.coach_id)).toBe(A.coachId);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('«añadir sesión» con el template_id de otro coach → 400, nada creado', async () => {
    const [A, B] = await two();
    try {
      const secret = await makeTemplate({ fx: B, name: 'B-SECRET' });
      await makeMicrocycle({ sql, athleteId: A.athleteId, startIso: '2026-10-05', endIso: '2026-10-11' });
      // Control: con un entreno propio, la misma llamada funciona.
      const own = await makeTemplate({ fx: A, name: 'A-OWN' });
      const ok = await createDaySession({
        client: sql, coach_id: A.coachId, athlete_id: A.athleteId, iso_date: '2026-10-05', template_id: own,
      });
      expect(ok.template_id).toBeGreaterThan(0);
      await expect(
        createDaySession({ client: sql, coach_id: A.coachId, athlete_id: A.athleteId, iso_date: '2026-10-05', template_id: secret }),
      ).rejects.toMatchObject({ status: 400 });
      const leaked = await sql`select 1 from templates where name = 'B-SECRET' and instance_athlete_id = ${A.athleteId}`;
      expect(leaked).toHaveLength(0);
    } finally {
      await sql`delete from workout_assignments where athlete_id = ${A.athleteId}`;
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('guardar una semana que apunta a un entreno, bloque o ejercicio de otro coach → rechazado', async () => {
    const [A, B] = await two();
    try {
      const tplB = await makeTemplate({ fx: B, name: 'B-SECRET' });
      const blkB = await makeLibraryBlock({ fx: B, title: 'B-BLOCK', description: 'x' });
      const exB = await makeExercise({ fx: B, coachId: B.coachId });
      const tplA = await makeTemplate({ fx: A, name: 'A-OWN' });

      const week = (session: Record<string, unknown>) => ({
        name: 'Semana',
        slots_json: { days: [{ day_of_week: 1, sessions: [{ kind: 'workout', ...session }] }] },
      });
      const part = (extra: Record<string, unknown>) => ({ uid: 'p1', format: 'sets', title: 'Bloque', items: [], ...extra });

      for (const payload of [
        week({ template_id: tplB }),
        week({ template_id: null, blocks: [part({ source_block_id: blkB })] }),
        week({
          template_id: null,
          blocks: [part({ items: [{ uid: 'i1', exercise_id: exB, exercise_name: 'x' }] })],
        }),
      ]) {
        const err = await upsertWeekTemplate({ coach_id: A.coachId, payload, client: sql }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ProgramWeekError);
        expect((err as ProgramWeekError).code).toBe('invalid_reference');
      }

      // Lo propio se guarda.
      const id = await upsertWeekTemplate({ coach_id: A.coachId, payload: week({ template_id: tplA }), client: sql });
      expect(Number(id)).toBeGreaterThan(0);
      await sql`delete from program_week_templates where id = ${Number(id)}`;
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('hydrateBlockParts no trae los ejercicios de un bloque de otro coach', async () => {
    const [A, B] = await two();
    try {
      const ex = await makeExercise({ fx: B });
      const blkB = await makeLibraryBlock({
        fx: B,
        title: 'B-BLOCK',
        description: 'x',
        exercises: [{ exercise_id: ex, position: 0 }],
      });
      const parts = [{ uid: 'p', format: 'sets', title: 'x', items: [], source_block_id: blkB }] as unknown as WeekDayPart[];
      const forA = await hydrateBlockParts(sql, A.coachId, parts);
      expect(forA[0]!.items ?? []).toHaveLength(0);
      const forB = await hydrateBlockParts(sql, B.coachId, parts);
      expect(forB[0]!.items ?? []).toHaveLength(1);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });

  test('un JSON viejo que ya apunta a otro coach: la vista previa no lo enseña y asignar no lo copia', async () => {
    const [A, B] = await two();
    try {
      const secret = await makeTemplate({ fx: B, name: 'B-SECRET' });
      // Escrito directo en la BD, como estaría un dato anterior a la validación.
      const month = await makeMonthTemplate({ fx: A, weekCount: 1, workoutDays: [1], workoutTemplateId: secret });

      const preview = await buildPublishPreview({
        coach_id: A.coachId,
        athlete_id: A.athleteId,
        month_template_id: month.monthId,
        start_date: '2026-10-05',
        client: sql,
      });
      const sessions = preview.weeks.flatMap((w) => w.days.flatMap((d) => d.sessions));
      expect(sessions.map((s) => s.template_name)).not.toContain('B-SECRET');
      expect(preview.session_count).toBe(0);

      const res = await instantiateMonthFromTemplate({
        coach_id: A.coachId,
        athlete_id: A.athleteId,
        month_template_id: month.monthId,
        start_date: '2026-10-05',
        client: sql,
      });
      expect(res.assignment_count).toBe(0);
      const leaked = await sql`select 1 from templates where name = 'B-SECRET' and instance_athlete_id = ${A.athleteId}`;
      expect(leaked).toHaveLength(0);
    } finally {
      await A.cleanup();
      await B.cleanup();
    }
  });
});
