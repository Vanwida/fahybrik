/**
 * UN SOLO ENTRENO — un libre del atleta y una sesión del coach son el mismo objeto
 * y se guardan igual (DECISIONS 2026-09-28). Contra base de datos REAL, por las
 * rutas que llama la app:
 *   · POST …/free/plan devuelve la asignación y los segmentos EN ORDEN, y ese plan se
 *     ejecuta por la sincronización del coach (sin rama propia, sin copias);
 *   · POST …/free con el `assignment_id` de un plan propio graba sobre él;
 *   · POST …/free sin plan previo enlaza cada tramo a su segmento en la misma
 *     transacción (inferido para la app de hoy, o por `item_index`);
 *   · un reenvío es el mismo entreno (llave `free_started_at`, 0274);
 *   · lo que no casa con un plan se guarda fuera del plan, nunca 4xx con trabajo;
 *   · la molestia (pain_area/pain_note) y los tramos descartados, como en el coach.
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import {
  makeCoachAndAthlete,
  makeExercise,
  makeFreeAthlete,
  type Fixture,
} from '../utils/db-fixtures';

let session: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({
  getAthleteSessionFromBearer: async () => session,
}));

const { POST: freePost } = await import('@/app/api/athlete/workouts/free/route');
const { POST: planPost } = await import('@/app/api/athlete/workouts/free/plan/route');
const { POST: syncPost } = await import('@/app/api/sync/workout-execution/route');

function asAthlete(fx: { athleteId: number; athleteUserId: number }) {
  session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const callFree = (body: unknown) => freePost(post('/api/athlete/workouts/free', body));
const callPlan = (body: unknown) => planPost(post('/api/athlete/workouts/free/plan', body));
const callSync = (body: unknown) => syncPost(post('/api/sync/workout-execution', body));

const strengthItem = (exerciseId: number, reps: number) => ({
  exercise_id: exerciseId,
  prescription: { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: reps } }] },
});
const runIntervals = {
  scheme: 'intervals',
  modality: 'run',
  rounds: 3,
  rest_s: 60,
  sets: [{ measure: { kind: 'distance', meters: 400 }, rest_s: 60 }],
};
const WINDOW = { started_at: '2026-09-27T07:00:00Z', ended_at: '2026-09-27T07:40:00Z' };

interface Tramo {
  position: number;
  template_segment_id: string | null;
  exercise_id: string | null;
  has_snapshot: boolean;
  context_source: string | null;
  modality: string | null;
}

describeWithDb('un solo entreno: libre ≡ coach (DB real)', () => {
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
    asAthlete(fx);
    return fx;
  }

  async function tramosOf(executionId: string | number): Promise<Tramo[]> {
    return sql<Tramo[]>`
      select position, template_segment_id::text as template_segment_id, exercise_id::text as exercise_id,
             prescription_snapshot is not null as has_snapshot, context_source, modality
      from segment_executions where execution_id = ${Number(executionId)}
      order by position, round_index
    `;
  }

  async function selfAssignments(athleteId: number) {
    return sql<Array<{ id: string; template_id: string; status: string; free_started_at: string | null }>>`
      select id::text as id, template_id::text as template_id, status::text as status,
             free_started_at::text as free_started_at
      from workout_assignments where athlete_id = ${athleteId} and origin = 'self' order by id
    `;
  }

  async function segmentIdsOf(templateId: string) {
    const rows = await sql<Array<{ id: string; exercise_id: string }>>`
      select id::text as id, exercise_id::text as exercise_id
      from template_segments where template_id = ${Number(templateId)} order by position, id
    `;
    return rows;
  }

  test('guardar sin arrancar devuelve los ids; ejecutarlo va por la sincronización del coach y no copia nada', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const bench = await makeExercise({ fx, name: 'Bench', modality: 'strength' });

    const planRes = await callPlan({
      title: 'Fuerza libre',
      modality: 'strength',
      items: [strengthItem(squat, 5), strengthItem(bench, 8)],
    });
    expect(planRes.status).toBe(200);
    const plan = (await planRes.json()) as { assignment_id: string; template_segment_ids: string[] };

    // Los ids, uno por ítem y EN SU ORDEN.
    const [asg] = await selfAssignments(fx.athleteId);
    const segs = await segmentIdsOf(asg!.template_id);
    expect(plan.template_segment_ids).toEqual(segs.map((s) => s.id));
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([squat, bench]);

    const syncRes = await callSync({
      assignment_id: Number(plan.assignment_id),
      ...WINDOW,
      perceived_exertion: 8,
      completeness: 'full',
      segments: plan.template_segment_ids.map((id, i) => ({
        template_segment_id: Number(id),
        position: i + 1,
        modality: 'strength',
        sets: [{ set_index: 1, reps_actual: 5, load_actual_kg: 100 }],
      })),
    });
    expect(syncRes.status).toBe(200);
    const saved = (await syncRes.json()) as { assignment_id: string; execution_id: string; off_plan: boolean };
    expect(saved.off_plan).toBe(false);
    expect(saved.assignment_id).toBe(plan.assignment_id);

    // Una asignación, completada; ni plantilla ni asignación nuevas.
    const after = await selfAssignments(fx.athleteId);
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe('completed');
    const tramos = await tramosOf(saved.execution_id);
    expect(tramos.map((t) => t.template_segment_id)).toEqual(plan.template_segment_ids);
    expect(tramos.map((t) => Number(t.exercise_id))).toEqual([squat, bench]);
    expect(tramos.every((t) => t.has_snapshot && t.context_source === 'block')).toBe(true);
  });

  test('…/free con el assignment_id de un plan propio graba sobre él: tramos enlazados, cinta = correr', async () => {
    const fx = await fixture();
    const planRes = await callPlan({ title: 'Series', modality: 'run', prescription: runIntervals });
    const plan = (await planRes.json()) as { assignment_id: string; template_segment_ids: string[] };
    expect(plan.template_segment_ids).toHaveLength(1);

    const res = await callFree({
      assignment_id: Number(plan.assignment_id),
      title: 'Series',
      modality: 'run',
      prescription: runIntervals,
      ...WINDOW,
      completeness: 'full',
      // La app de hoy: series sin id de segmento, medidas por la cinta, con «other».
      segments: [0, 1, 2].map((i) => ({
        position: i,
        modality: 'other',
        source: 'treadmill',
        distance_meters: 400,
        leg_index: i,
        leg_role: 'work',
        leg_phase: 'main',
      })),
    });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { assignment_id: string; execution_id: string; off_plan: boolean };
    expect(saved.assignment_id).toBe(plan.assignment_id);

    expect(await selfAssignments(fx.athleteId)).toHaveLength(1);
    const tramos = await tramosOf(saved.execution_id);
    expect(tramos).toHaveLength(3);
    expect(tramos.every((t) => t.template_segment_id === plan.template_segment_ids[0])).toBe(true);
    expect(tramos.every((t) => t.modality === 'run' && t.exercise_id != null)).toBe(true);
  });

  test('…/free sin plan previo: plantilla + asignación + ejecución, cada tramo a su segmento; respuesta del coach', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const bench = await makeExercise({ fx, name: 'Bench', modality: 'strength' });

    const res = await callFree({
      title: 'Fuerza',
      modality: 'strength',
      items: [strengthItem(squat, 5), strengthItem(bench, 8)],
      ...WINDOW,
      completeness: 'full',
      segments: [
        { position: 1, modality: 'strength', sets: [{ set_index: 1, reps_actual: 5, load_actual_kg: 120 }] },
        { position: 2, modality: 'strength', sets: [{ set_index: 1, reps_actual: 8, load_actual_kg: 80 }] },
        { position: 3 }, // sin modalidad: se cae él solo
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      saved: true,
      off_plan: false,
      segments_saved: 2,
      segments_dropped: 1,
      prs: [],
      origin: 'self',
    });

    const [asg] = await selfAssignments(fx.athleteId);
    expect(asg!.free_started_at).not.toBeNull();
    const segs = await segmentIdsOf(asg!.template_id);
    const tramos = await tramosOf(body.execution_id as string);
    expect(tramos.map((t) => t.template_segment_id)).toEqual(segs.map((s) => s.id));
    expect(tramos.map((t) => Number(t.exercise_id))).toEqual([squat, bench]);
    expect(tramos.every((t) => t.has_snapshot)).toBe(true);
  });

  test('item_index explícito: un EMOM alterno enlaza cada serie a su movimiento; funcional = other', async () => {
    const fx = await fixture();
    const burpee = await makeExercise({ fx, name: 'Burpee', modality: 'functional', category: 'plyometric' });
    const row = await makeExercise({ fx, name: 'Row', modality: 'row', category: 'cardio' });
    const emom = (id: number) => ({
      exercise_id: id,
      prescription: { scheme: 'emom', rounds: 4, work_s: 60, sets: [{ measure: { kind: 'reps', value: 10 } }] },
    });

    const res = await callFree({
      title: 'EMOM',
      modality: 'functional',
      items: [emom(burpee), emom(row)],
      ...WINDOW,
      segments: [0, 1, 2, 3].map((i) => ({
        position: i,
        item_index: i % 2,
        modality: i % 2 === 0 ? 'other' : 'row',
        leg_index: i,
        leg_role: 'work',
        leg_phase: 'main',
      })),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: string };
    const tramos = await tramosOf(body.execution_id);
    expect(tramos.map((t) => Number(t.exercise_id))).toEqual([burpee, row, burpee, row]);
    expect(tramos.map((t) => t.modality)).toEqual(['other', 'row', 'other', 'row']);
  });

  test('un reenvío del mismo libre graba sobre la misma asignación y funde lo que trae', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const body = {
      title: 'Fuerza',
      modality: 'strength',
      items: [strengthItem(squat, 5)],
      ...WINDOW,
      segments: [{ position: 1, modality: 'strength' }],
    };
    const first = (await (await callFree(body)).json()) as { assignment_id: string; execution_id: string };
    const second = (await (await callFree({ ...body, perceived_exertion: 8 })).json()) as {
      assignment_id: string;
      execution_id: string;
    };
    expect(second).toMatchObject({ assignment_id: first.assignment_id, execution_id: first.execution_id });
    expect(await selfAssignments(fx.athleteId)).toHaveLength(1);
    const exec = await sql<Array<{ perceived_exertion: number | null }>>`
      select perceived_exertion from workout_executions where id = ${Number(first.execution_id)}
    `;
    expect(exec[0]!.perceived_exertion).toBe(8);

    // Dos reenvíos A LA VEZ (la cola y el REINTENTAR): siguen siendo un entreno.
    const later = { ...body, started_at: '2026-09-27T19:00:00Z', ended_at: '2026-09-27T19:30:00Z' };
    const [a, b] = await Promise.all([callFree(later), callFree(later)]);
    const ids = [(await a.json()) as { assignment_id: string }, (await b.json()) as { assignment_id: string }];
    expect(ids[0]!.assignment_id).toBe(ids[1]!.assignment_id);
    expect(await selfAssignments(fx.athleteId)).toHaveLength(2);

    // OTRO entreno con el mismo inicio (un reloj que no reinició su hora): no pisa
    // los tramos del primero; se guarda fuera del plan.
    const other = await callFree({ ...body, title: 'Otro entreno' });
    expect(other.status).toBe(200);
    expect(await other.json()).toMatchObject({ off_plan: true });
    expect(await selfAssignments(fx.athleteId)).toHaveLength(2);
    expect(await tramosOf(first.execution_id)).toHaveLength(1);
  });

  test('un plan que no casa no pierde el entreno: se guarda fuera del plan; un título largo solo se recorta', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const work = { ...WINDOW, perceived_exertion: 7, segments: [{ position: 1, modality: 'strength' }] };

    // Más de 12 ejercicios: fuera del plan, 200.
    const tooMany = await callFree({
      title: 'Demasiados',
      modality: 'strength',
      items: Array.from({ length: 13 }, () => strengthItem(squat, 5)),
      ...work,
    });
    expect(tooMany.status).toBe(200);
    expect(await tooMany.json()).toMatchObject({ off_plan: true, assignment_id: null });

    // Un ejercicio que no existe: fuera del plan, 200 (otro inicio: otro entreno).
    const unknown = await callFree({
      title: 'Fantasma',
      modality: 'strength',
      items: [strengthItem(2147483000, 5)],
      ...work,
      started_at: '2026-09-27T09:00:00Z',
      ended_at: '2026-09-27T09:30:00Z',
    });
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ off_plan: true });

    const offPlan = await sql<Array<{ off_plan_reason: string; n: number }>>`
      select off_plan_reason, (select count(*)::int from segment_executions se where se.execution_id = we.id) as n
      from workout_executions we where athlete_id = ${fx.athleteId} and off_plan_reason is not null
    `;
    expect(offPlan).toHaveLength(2);
    expect(offPlan.every((r) => r.off_plan_reason === 'no_assignment' && r.n === 1)).toBe(true);

    // Un título de 120 caracteres: el plan se guarda, con el título recortado.
    const long = await callFree({
      title: 'x'.repeat(120),
      modality: 'strength',
      items: [strengthItem(squat, 5)],
      ...work,
      started_at: '2026-09-27T11:00:00Z',
      ended_at: '2026-09-27T11:30:00Z',
    });
    expect(await long.json()).toMatchObject({ off_plan: false });
    const tpl = await sql<Array<{ len: number }>>`
      select char_length(t.name)::int as len from workout_assignments wa join templates t on t.id = wa.template_id
      where wa.athlete_id = ${fx.athleteId} and wa.origin = 'self'
    `;
    expect(tpl.map((r) => r.len)).toEqual([80]);
  });

  test('sin plan que valga y sin trabajo que guardar → 422; sin sesión → 401', async () => {
    await fixture();
    const res = await callFree({ title: 'x', modality: 'strength', items: [] });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('items_required');

    session = null;
    expect((await callFree({ title: 'x', modality: 'strength' })).status).toBe(401);
  });

  test('la molestia (pain_area, pain_note) se guarda en el libre igual que en el coach', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const res = await callFree({
      title: 'Fuerza',
      modality: 'strength',
      items: [strengthItem(squat, 5)],
      ...WINDOW,
      pain_area: 'rodilla',
      pain_note: 'Molestia al bajar',
      perceived_difficulty: 'too_hard',
    });
    const body = (await res.json()) as { execution_id: string };
    const rows = await sql<Array<{ pain_area: string; pain_note: string; perceived_difficulty: string }>>`
      select pain_area, pain_note, perceived_difficulty from workout_executions where id = ${Number(body.execution_id)}
    `;
    expect(rows[0]).toEqual({ pain_area: 'rodilla', pain_note: 'Molestia al bajar', perceived_difficulty: 'too_hard' });
  });

  test('un atleta sin coach guarda su libre igual', async () => {
    const fx = await makeFreeAthlete(sql);
    cleanups.push(fx.cleanup);
    asAthlete(fx);
    const res = await callFree({
      title: 'Series',
      modality: 'run',
      prescription: runIntervals,
      ...WINDOW,
      segments: [{ position: 1, modality: 'run', distance_meters: 400 }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: string; off_plan: boolean };
    expect(body.off_plan).toBe(false);
    const tramos = await tramosOf(body.execution_id);
    expect(tramos[0]!.template_segment_id).not.toBeNull();
  });

  test('…/free/plan: editar devuelve los ids nuevos; un plan ya hecho no se edita (409)', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const bench = await makeExercise({ fx, name: 'Bench', modality: 'strength' });
    const created = (await (
      await callPlan({ title: 'A', modality: 'strength', items: [strengthItem(squat, 5)] })
    ).json()) as { assignment_id: string; template_segment_ids: string[] };

    const edited = (await (
      await callPlan({
        title: 'B',
        modality: 'strength',
        items: [strengthItem(bench, 5), strengthItem(squat, 3)],
        assignment_id: Number(created.assignment_id),
      })
    ).json()) as { assignment_id: string; template_segment_ids: string[] };
    expect(edited.assignment_id).toBe(created.assignment_id);
    const [asg] = await selfAssignments(fx.athleteId);
    const segs = await segmentIdsOf(asg!.template_id);
    expect(edited.template_segment_ids).toEqual(segs.map((s) => s.id));
    expect(segs.map((s) => Number(s.exercise_id))).toEqual([bench, squat]);

    await callSync({ assignment_id: Number(created.assignment_id), ...WINDOW });
    const locked = await callPlan({
      title: 'C',
      modality: 'strength',
      items: [strengthItem(squat, 5)],
      assignment_id: Number(created.assignment_id),
    });
    expect(locked.status).toBe(409);
  });
});
