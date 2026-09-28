/**
 * Lo que el servidor tenía que hacer para el motor del iPhone por formato
 * (docs/pr/ios-motor-libre.md, «Lo que el servidor tiene que hacer»), contra base
 * de datos REAL y por las rutas que llama la app:
 *   · POST …/free/plan devuelve `segments: [{ id, position, block_position }]` en el
 *     orden de la plantilla, además de `template_segment_ids`;
 *   · la modalidad declarada del libre se guarda en `templates.meta_json.modality`
 *     (crear y editar) y el detalle la sirve como `workout.modality`;
 *   · `round_index` (base 0 en el cable) se guarda + 1 (0155: el 0 es «no se
 *     repite»), por la sincronización del coach y por POST …/free;
 *   · una ruta de estaciones llega como una fila por estación, sin la fila agregada
 *     del bloque: el detalle enlaza cada estación a su línea, el cumplimiento de
 *     carrera juzga cada carrera contra su banda y el historial suma las estaciones.
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

const { POST: planPost } = await import('@/app/api/athlete/workouts/free/plan/route');
const { POST: freePost } = await import('@/app/api/athlete/workouts/free/route');
const { POST: syncPost } = await import('@/app/api/sync/workout-execution/route');
const { GET: detailGet } = await import('@/app/api/athlete/assignments/[id]/detail/route');
const { GET: historyGet } = await import('@/app/api/athlete/history/route');

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
const get = (path: string) =>
  new Request(`http://localhost${path}`, { headers: { authorization: 'Bearer test' } });
const callPlan = (body: unknown) => planPost(post('/api/athlete/workouts/free/plan', body));
const callFree = (body: unknown) => freePost(post('/api/athlete/workouts/free', body));
const callSync = (body: unknown) => syncPost(post('/api/sync/workout-execution', body));
const callDetail = (id: string | number) =>
  detailGet(get(`/api/athlete/assignments/${id}/detail`), { params: Promise.resolve({ id: String(id) }) });

const TODAY = new Date().toISOString().slice(0, 10);
const strengthItem = (exerciseId: number, reps: number) => ({
  exercise_id: exerciseId,
  prescription: { scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: reps } }] },
});

interface DetailBody {
  workout: { modality: string | null; blocks: Array<{ items: Array<{ uid: string }> }> } | null;
  clock_prescription?: unknown;
  execution: {
    segments: Array<{ item_uid: string | null; round_index: number; leg_index: number | null; position: number }>;
  } | null;
  run_compliance: { tramos: Array<{ item_uid: string; position: number | null; verdict: string }> };
}

describeWithDb('contrato del motor iOS por formato (DB real)', () => {
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

  async function templateMeta(assignmentId: string): Promise<Record<string, unknown>> {
    const [row] = await sql<Array<{ meta: Record<string, unknown> }>>`
      select t.meta_json as meta
      from workout_assignments wa join templates t on t.id = wa.template_id
      where wa.id = ${Number(assignmentId)}
    `;
    return row!.meta;
  }

  test('/free/plan devuelve los segmentos en orden con su posición y bloque, y guarda y sirve la modalidad', async () => {
    const fx = await fixture();
    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const bench = await makeExercise({ fx, name: 'Bench', modality: 'strength' });

    const res = await callPlan({
      title: 'Fuerza libre',
      modality: 'strength',
      items: [strengthItem(squat, 5), strengthItem(bench, 8)],
    });
    expect(res.status).toBe(200);
    const plan = (await res.json()) as {
      assignment_id: string;
      template_segment_ids: string[];
      segments: Array<{ id: string; position: number; block_position: number }>;
    };
    const rows = await sql<Array<{ id: string; position: number; block_position: number }>>`
      select ts.id::text as id, ts.position, ts.block_position
      from workout_assignments wa join template_segments ts on ts.template_id = wa.template_id
      where wa.id = ${Number(plan.assignment_id)}
      order by ts.position, ts.id
    `;
    expect(plan.segments).toEqual(rows.map((r) => ({ id: r.id, position: r.position, block_position: r.block_position })));
    expect(plan.segments.map((s) => s.id)).toEqual(plan.template_segment_ids);
    expect(plan.segments).toHaveLength(2);

    expect(await templateMeta(plan.assignment_id)).toMatchObject({ origin: 'self', modality: 'strength' });
    const detail = (await (await callDetail(plan.assignment_id)).json()) as DetailBody;
    expect(detail.workout?.modality).toBe('strength');

    // Editar reescribe la plantilla y la modalidad va con ella.
    const run = await makeExercise({ fx, name: 'Run', modality: 'run', category: 'cardio' });
    const edit = await callPlan({
      title: 'Ahora funcional',
      modality: 'functional',
      assignment_id: Number(plan.assignment_id),
      items: [
        {
          exercise_id: run,
          prescription: { scheme: 'for_time', sets: [{ measure: { kind: 'distance', meters: 1000 } }] },
        },
      ],
    });
    expect(edit.status).toBe(200);
    expect(await templateMeta(plan.assignment_id)).toMatchObject({ origin: 'self', modality: 'functional' });
    const edited = (await (await callDetail(plan.assignment_id)).json()) as DetailBody;
    expect(edited.workout?.modality).toBe('functional');
  });

  test('un cronómetro guarda su modalidad junto a la prescripción; una sesión del coach sirve modality null', async () => {
    const fx = await fixture();
    const clock = await callPlan({
      title: 'EMOM pelado',
      modality: 'functional',
      prescription: { scheme: 'emom', modality: 'functional', sets: [], rounds: 10, work_s: 60 },
    });
    expect(clock.status).toBe(200);
    const plan = (await clock.json()) as { assignment_id: string; segments: unknown[] };
    expect(plan.segments).toEqual([]);
    const meta = await templateMeta(plan.assignment_id);
    expect(meta).toMatchObject({ origin: 'self', modality: 'functional' });
    expect(meta.prescription).toBeTruthy();

    const squat = await makeExercise({ fx, name: 'Squat', modality: 'strength' });
    const tpl = await makeTemplate({ fx, name: 'Del coach', format: 'strength_block' });
    await sql`
      insert into template_segments (template_id, position, exercise_id, params_json, block_position, block_format, prescription_json)
      values (${tpl}, 1, ${squat}, '{}'::jsonb, 1, 'strength_block',
              ${sql.json({ scheme: 'sets', modality: 'strength', sets: [{ measure: { kind: 'reps', value: 5 } }] })})
    `;
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    const detail = (await (await callDetail(asg)).json()) as DetailBody;
    expect(detail.workout?.modality).toBeNull();
  });

  test('una ruta de estaciones: una fila por estación, su ronda + 1, y los lectores suman las estaciones', async () => {
    const fx = await fixture();
    const ski = await makeExercise({ fx, name: 'SkiErg', modality: 'ski', category: 'cardio' });
    const run = await makeExercise({ fx, name: 'Carrera', modality: 'run', category: 'cardio' });
    const wall = await makeExercise({ fx, name: 'Wall balls', modality: 'functional', category: 'hyrox_station' });
    const tpl = await makeTemplate({ fx, name: 'Mini HYROX', format: 'hyrox_sim' });

    async function station(position: number, exerciseId: number, prescription: object): Promise<string> {
      const [row] = await sql<Array<{ id: string }>>`
        insert into template_segments (template_id, position, exercise_id, params_json, block_position, block_format, prescription_json)
        values (${tpl}, ${position}, ${exerciseId}, '{}'::jsonb, 1, 'hyrox_sim', ${sql.json(prescription as never)})
        returning id::text as id
      `;
      return row!.id;
    }
    const skiSeg = await station(1, ski, { scheme: 'steady', modality: 'ski', sets: [{ measure: { kind: 'distance', meters: 1000 } }] });
    const runSeg = await station(2, run, {
      scheme: 'steady',
      modality: 'run',
      sets: [{ measure: { kind: 'distance', meters: 1000 } }],
      target: { kind: 'pace', unit: 'per_km', min_s: 265, max_s: 275 },
    });
    const wallSeg = await station(3, wall, { scheme: 'for_time', sets: [{ measure: { kind: 'reps', value: 20 } }] });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });

    // Dos rondas × tres estaciones, como las graba el motor: cada estación su lap,
    // con su `template_segment_id`, `leg_index` plano en la ruta y su ronda (base 0).
    const t0 = Date.parse('2026-09-27T07:00:00Z');
    const plan = [
      { seg: skiSeg, modality: 'ski', s: 240, m: 1000 },
      { seg: runSeg, modality: 'run', s: 270, m: 1000 },
      { seg: wallSeg, modality: 'other', s: 150, m: null },
      { seg: skiSeg, modality: 'ski', s: 240, m: 1000 },
      { seg: runSeg, modality: 'run', s: 300, m: 1000 },
      { seg: wallSeg, modality: 'other', s: 150, m: null },
    ];
    let clock = t0;
    const segments = plan.map((p, i) => {
      const started = new Date(clock).toISOString();
      clock += p.s * 1000;
      return {
        position: i,
        template_segment_id: Number(p.seg),
        modality: p.modality,
        started_at: started,
        ended_at: new Date(clock).toISOString(),
        duration_seconds: p.s,
        ...(p.m != null ? { distance_meters: p.m } : {}),
        ...(p.modality === 'run' ? { avg_pace_s_per_km: p.s } : {}),
        leg_index: i,
        leg_role: 'work',
        leg_phase: 'main',
        round_index: Math.floor(i / 3),
      };
    });
    const res = await callSync({
      assignment_id: asg,
      started_at: new Date(t0).toISOString(),
      ended_at: new Date(clock).toISOString(),
      score_time_s: (clock - t0) / 1000,
      completeness: 'full',
      segments,
    });
    expect(res.status).toBe(200);
    const saved = (await res.json()) as { execution_id: string; segments_saved: number };
    expect(saved.segments_saved).toBe(6);

    const stored = await sql<Array<{ template_segment_id: string; round_index: number; leg_index: number }>>`
      select template_segment_id::text as template_segment_id, round_index, leg_index
      from segment_executions where execution_id = ${Number(saved.execution_id)}
      order by position, round_index
    `;
    expect(stored.map((r) => r.round_index)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(stored.map((r) => r.template_segment_id)).toEqual([skiSeg, runSeg, wallSeg, skiSeg, runSeg, wallSeg]);

    // Detalle: cada estación cuelga de SU línea; la carrera se juzga contra su banda
    // ronda a ronda (antes, `leg_index` 1 y 4 contra una línea de un tramo = sin dato).
    const detail = (await (await callDetail(asg)).json()) as DetailBody;
    const segs = detail.execution!.segments;
    expect(segs.map((s) => s.item_uid)).toEqual(
      [skiSeg, runSeg, wallSeg, skiSeg, runSeg, wallSeg].map((id) => `segment-${id}`),
    );
    expect(segs.map((s) => s.round_index)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(detail.run_compliance.tramos.map((t) => [t.item_uid, t.verdict])).toEqual([
      [`segment-${runSeg}`, 'dentro'],
      [`segment-${runSeg}`, 'fuera_lento'],
    ]);

    // Historial: lo que MÁS se hizo sale de sumar las estaciones (carrera 570 s >
    // ski 480 s > funcional 300 s), no de una fila agregada que ya no existe.
    const month = new Date(t0).toISOString().slice(0, 7);
    const history = (await (await historyGet(get(`/api/athlete/history?month=${month}`))).json()) as {
      days: Array<{ sessions: Array<{ execution_id: string; modality: string | null; score_time_s: number | null }> }>;
    };
    const row = history.days.flatMap((d) => d.sessions).find((s) => s.execution_id === saved.execution_id);
    expect(row).toMatchObject({ modality: 'run', score_time_s: 1350 });
  });

  test('POST /free guarda la ronda igual (+ 1) y enlaza cada estación por item_index', async () => {
    const fx = await fixture();
    const run = await makeExercise({ fx, name: 'Carrera', modality: 'run', category: 'cardio' });
    const wall = await makeExercise({ fx, name: 'Wall balls', modality: 'functional', category: 'hyrox_station' });
    const item = (id: number, measure: object) => ({
      exercise_id: id,
      prescription: { scheme: 'for_time', rounds: 2, sets: [{ measure }] },
    });
    const res = await callFree({
      title: 'Ruta libre',
      modality: 'functional',
      items: [item(run, { kind: 'distance', meters: 500 }), item(wall, { kind: 'reps', value: 15 })],
      started_at: '2026-09-27T09:00:00Z',
      ended_at: '2026-09-27T09:10:00Z',
      segments: [0, 1, 2, 3].map((i) => ({
        position: i,
        item_index: i % 2,
        modality: i % 2 === 0 ? 'run' : 'other',
        leg_index: i,
        leg_role: 'work',
        leg_phase: 'main',
        round_index: Math.floor(i / 2),
      })),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { execution_id: string; assignment_id: string };
    const stored = await sql<Array<{ exercise_id: string; round_index: number }>>`
      select exercise_id::text as exercise_id, round_index
      from segment_executions where execution_id = ${Number(body.execution_id)}
      order by position, round_index
    `;
    expect(stored.map((r) => Number(r.exercise_id))).toEqual([run, wall, run, wall]);
    expect(stored.map((r) => r.round_index)).toEqual([1, 1, 2, 2]);
    expect(await templateMeta(body.assignment_id)).toMatchObject({ origin: 'self', modality: 'functional' });
  });

  test('un reenvío con ronda de un tramo guardado sin ella lo funde: una fila por tramo, no dos', async () => {
    const fx = await fixture();
    const run = await makeExercise({ fx, name: 'Carrera', modality: 'run', category: 'cardio' });
    const tpl = await makeTemplate({ fx, name: 'EMOM corriendo', format: 'emom' });
    const [seg] = await sql<Array<{ id: string }>>`
      insert into template_segments (template_id, position, exercise_id, params_json, block_position, block_format, prescription_json)
      values (${tpl}, 1, ${run}, '{}'::jsonb, 1, 'emom',
              ${sql.json({ scheme: 'emom', modality: 'run', rounds: 2, work_s: 60, sets: [{ measure: { kind: 'distance', meters: 200 } }] })})
      returning id::text as id
    `;
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    const minute = (i: number, withRound: boolean) => ({
      position: i,
      template_segment_id: Number(seg!.id),
      modality: 'run',
      started_at: `2026-09-27T08:0${i}:00Z`,
      ended_at: `2026-09-27T08:0${i}:45Z`,
      distance_meters: 200,
      leg_index: i,
      leg_role: 'work',
      leg_phase: 'main',
      ...(withRound ? { round_index: i } : {}),
    });
    const body = (withRound: boolean) => ({
      assignment_id: asg,
      started_at: '2026-09-27T08:00:00Z',
      ended_at: '2026-09-27T08:02:00Z',
      completeness: 'full',
      segments: [minute(0, withRound), minute(1, withRound)],
    });

    expect((await callSync(body(false))).status).toBe(200);
    const res = await callSync(body(true));
    expect(res.status).toBe(200);
    const { execution_id } = (await res.json()) as { execution_id: string };
    const stored = await sql<Array<{ position: number; round_index: number }>>`
      select position, round_index from segment_executions
      where execution_id = ${Number(execution_id)} order by position, round_index
    `;
    expect(stored).toEqual([
      { position: 0, round_index: 1 },
      { position: 1, round_index: 2 },
    ]);
  });
});
