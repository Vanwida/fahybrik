/**
 * El camino de guardado del coach tras «un solo entreno» (DECISIONS 2026-09-28),
 * contra base de datos REAL, por POST /api/sync/workout-execution:
 *   · la copia plana de Apple Salud del mismo entreno se sustituye por
 *     `source_workout_ref` y por solape — también en una sesión del coach; lo que
 *     no se solapa se queda, y un «Marcar como hecha» sin horas no borra nada;
 *   · un tramo solo se enlaza a un segmento de la plantilla de SU asignación;
 *   · la modalidad del tramo la da su ejercicio (0053).
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeExercise,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { POST: syncPost } = await import('@/app/api/sync/workout-execution/route');

const callSync = (body: unknown) =>
  syncPost(
    new Request('http://localhost/api/sync/workout-execution', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const TODAY = new Date().toISOString().slice(0, 10);

describeWithDb('guardado del coach: Salud, plantilla propia y modalidad (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    session = null;
    while (cleanups.length) await settleCleanup(cleanups.pop()!);
  });
  afterAll(async () => {
    await closeTestSql();
  });

  async function fixture(): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
    return fx;
  }

  /** Una importación plana de Apple Salud, como la archiva la ingesta de Salud. */
  async function healthImport(fx: Fixture, ref: string, start: string, end: string): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_executions (athlete_id, started_at, ended_at, source, source_workout_ref, recorded_via)
      values (${fx.athleteId}, ${start}::timestamptz, ${end}::timestamptz, 'healthkit', ${ref}, 'imported')
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  }

  async function segment(templateId: number, exerciseId: number, position: number): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into template_segments (
        template_id, position, exercise_id, params_json, block_position, block_format, prescription_json
      )
      values (${templateId}, ${position}, ${exerciseId}, '{}'::jsonb, 1, 'steady',
              ${sql.json({ scheme: 'steady', modality: 'row' })})
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  }

  async function exists(id: number): Promise<boolean> {
    const rows = await sql`select 1 from workout_executions where id = ${id}`;
    return rows.length > 0;
  }

  test('la copia plana de Salud del mismo entreno se sustituye (ref y solape); la de otro rato se queda', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Rodaje', format: 'steady' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });

    const sameRef = await healthImport(fx, 'HK-SAME', '2026-09-27T07:00:05Z', '2026-09-27T07:47:55Z');
    const overlapping = await healthImport(fx, 'HK-OTHER', '2026-09-27T07:10:00Z', '2026-09-27T07:10:01Z');
    const later = await healthImport(fx, 'HK-LATER', '2026-09-27T18:00:00Z', '2026-09-27T18:30:00Z');

    const res = await callSync({
      assignment_id: asg,
      started_at: '2026-09-27T07:00:00Z',
      ended_at: '2026-09-27T07:48:00Z',
      source_workout_ref: 'HK-SAME',
      perceived_exertion: 6,
    });
    expect(res.status).toBe(200);
    expect(await exists(sameRef)).toBe(false);
    expect(await exists(overlapping)).toBe(false);
    expect(await exists(later)).toBe(true);
  });

  test('«Marcar como hecha» sin horas no borra una importación por solape', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Rodaje', format: 'steady' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    const now = Date.now();
    const imported = await healthImport(
      fx,
      'HK-NOW',
      new Date(now - 30 * 60_000).toISOString(),
      new Date(now + 30 * 60_000).toISOString(),
    );
    const res = await callSync({ assignment_id: asg, source: 'manual' });
    expect(res.status).toBe(200);
    expect(await exists(imported)).toBe(true);
  });

  test('un tramo solo cuelga de un segmento de la plantilla de SU asignación; el ejercicio da la modalidad', async () => {
    const fx = await fixture();
    const ski = await makeExercise({ fx, name: 'SkiErg', modality: 'ski', category: 'cardio' });
    const mine = await makeTemplate({ fx, name: 'Mía', format: 'steady' });
    const other = await makeTemplate({ fx, name: 'Otra', format: 'steady' });
    const mySeg = await segment(mine, ski, 1);
    const foreignSeg = await segment(other, ski, 1);
    const asg = await makeAssignment({ fx, templateId: mine, scheduledForIso: TODAY });

    const res = await callSync({
      assignment_id: asg,
      started_at: '2026-09-27T07:00:00Z',
      ended_at: '2026-09-27T07:20:00Z',
      segments: [
        // El aparato llamó «row» a un SkiErg: manda el ejercicio.
        { position: 0, modality: 'row', template_segment_id: mySeg, duration_seconds: 600 },
        // Un segmento de otra plantilla (aunque sea del mismo coach): no se enlaza.
        { position: 1, modality: 'row', template_segment_id: foreignSeg, duration_seconds: 600 },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: string };
    const tramos = await sql<
      Array<{ position: number; template_segment_id: string | null; exercise_id: string | null; modality: string }>
    >`
      select position, template_segment_id::text as template_segment_id, exercise_id::text as exercise_id, modality
      from segment_executions where execution_id = ${Number(body.execution_id)} order by position
    `;
    expect(tramos).toEqual([
      { position: 0, template_segment_id: String(mySeg), exercise_id: String(ski), modality: 'ski' },
      { position: 1, template_segment_id: null, exercise_id: null, modality: 'row' },
    ]);
  });
});
