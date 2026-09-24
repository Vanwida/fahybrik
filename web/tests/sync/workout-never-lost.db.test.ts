/**
 * UN ENTRENO HECHO NO SE PIERDE — POST /api/sync/workout-execution y el log de
 * Dobles, contra base de datos REAL (auditoría de la app del atleta, E1 / D-04).
 *
 * Antes, cualquier 4xx al guardar perdía el entreno: la app lo trata como veneno
 * (REINTENTAR para siempre en el móvil, «Sesión completada» en el reloj sin nada en
 * el servidor, la cola lo tira). Aquí se fija el contrato nuevo, caso a caso:
 *   · la sesión que el coach QUITÓ mientras entrenaba → 2xx, ejecución suya fuera
 *     del plan (`off_plan_reason = 'assignment_gone'`, con el id que reclamaba);
 *   · la sesión SUSTITUIDA (borrada + una nueva el mismo día) → fuera del plan, y la
 *     nueva queda intacta (no se le atribuye un trabajo que no es suyo);
 *   · el id de la sesión de OTRO atleta → fuera del plan, del que envía; la sesión y
 *     la plantilla del otro, sin tocar;
 *   · un campo opcional con el tipo equivocado → cuesta ese campo, no la sesión;
 *   · la sesión MOVIDA de día → se guarda sobre ella, como siempre;
 *   · un reenvío del mismo entreno fuera del plan → la misma fila;
 *   · «Marcar como hecha» (sin trabajo) sobre una sesión que ya no está → 404;
 *   · Dobles sin pareja → se guarda, sin enlazar a nadie;
 *   · el coach lo ve: la señal «Hecho fuera del plan» en Hoy.
 */

import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
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

const { POST: soloPost } = await import('@/app/api/sync/workout-execution/route');
const { POST: doblesPost } = await import('@/app/api/athlete/dobles/session/[id]/log/route');
const { recomputeAthlete } = await import('@/lib/coach/attention/recompute');

const TODAY = new Date().toISOString().slice(0, 10);

function asAthlete(fx: Fixture) {
  session = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'Test' };
}

function soloRequest(body: unknown): Request {
  return new Request('http://localhost/api/sync/workout-execution', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function doblesRequest(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/athlete/dobles/session/${id}/log`, {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ];
}

/** Lo que manda el móvil al terminar una sesión en vivo: horas, duración, RPE y tramos. */
function livePayload(assignmentId: unknown, extra: Record<string, unknown> = {}) {
  return {
    assignment_id: assignmentId,
    started_at: '2026-09-24T07:00:00Z',
    ended_at: '2026-09-24T07:48:00Z',
    total_duration_seconds: 2880,
    perceived_exertion: 8,
    completeness: 'full',
    segments: [
      { position: 0, modality: 'run', duration_seconds: 600, distance_meters: 2000, source: 'gps' },
      {
        position: 1,
        modality: 'strength',
        duration_seconds: 900,
        weight_used_kg: 100,
        reps_completed: 15,
        sets: [
          { set_index: 1, reps_actual: 5, load_actual_kg: 100 },
          { set_index: 2, reps_actual: 5, load_actual_kg: 100 },
        ],
      },
    ],
    ...extra,
  };
}

interface ExecRow {
  id: string;
  assignment_id: string | null;
  off_plan_reason: string | null;
  claimed_assignment_id: string | null;
  perceived_exertion: number | null;
  total_duration_seconds: number | null;
}

describeWithDb('un entreno hecho no se pierde (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  afterEach(async () => {
    session = null;
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

  const executionsOf = (athleteId: number) => sql<ExecRow[]>`
    select id::text, assignment_id::text, off_plan_reason, claimed_assignment_id::text,
           perceived_exertion, total_duration_seconds
    from workout_executions where athlete_id = ${athleteId} order by id
  `;

  test('la sesión que el coach quitó mientras entrenaba: 2xx y se guarda fuera del plan', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Series' });
    const gone = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    await sql`delete from workout_assignments where id = ${gone}`; // el «Quitar» del coach
    asAthlete(fx);

    const res = await soloPost(soloRequest(livePayload(String(gone))));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.off_plan).toBe(true);
    expect(body.assignment_id).toBeNull();
    expect(Number(body.execution_id)).toBeGreaterThan(0);
    expect(body.segments_saved).toBe(2);

    const rows = await executionsOf(fx.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.assignment_id).toBeNull();
    expect(rows[0]!.off_plan_reason).toBe('assignment_gone');
    expect(rows[0]!.claimed_assignment_id).toBe(String(gone));
    expect(rows[0]!.perceived_exertion).toBe(8);
    const sets = await sql<Array<{ n: number }>>`
      select count(*)::int as n from set_executions se
      join segment_executions sx on sx.id = se.segment_execution_id
      where sx.execution_id = ${Number(body.execution_id)}
    `;
    expect(sets[0]!.n).toBe(2); // las series y sus cargas, guardadas
  });

  test('la sesión sustituida: fuera del plan, y la nueva del mismo día queda intacta', async () => {
    const fx = await fixture();
    const tplOld = await makeTemplate({ fx, name: 'Fuerza A' });
    const tplNew = await makeTemplate({ fx, name: 'Fuerza B' });
    const old = await makeAssignment({ fx, templateId: tplOld, scheduledForIso: TODAY });
    // «Sustituir»: se borra la pendiente y nace otra ese día.
    await sql`delete from workout_assignments where id = ${old}`;
    const replacement = await makeAssignment({ fx, templateId: tplNew, scheduledForIso: TODAY });
    asAthlete(fx);

    const res = await soloPost(soloRequest(livePayload(old)));
    expect(res.status).toBe(200);
    expect((await res.json()).off_plan).toBe(true);

    const rows = await executionsOf(fx.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.off_plan_reason).toBe('assignment_gone');
    const [status] = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${replacement}
    `;
    expect(status!.status).toBe('scheduled'); // lo nuevo no se da por hecho con un trabajo ajeno
  });

  test('el id de la sesión de otro atleta: se guarda como del que envía y no toca la del otro', async () => {
    const owner = await fixture();
    const intruder = await fixture();
    // La sesión del otro, con una plantilla personal suya (instancia) y un tramo.
    const exercise = await makeExercise({ fx: owner });
    const instance = await sql<Array<{ id: string }>>`
      insert into templates (coach_id, name, format, version, instance_athlete_id)
      values (${owner.coachId}, 'Personal del otro', 'circuit'::template_format, 1, ${owner.athleteId})
      returning id::text
    `;
    const instanceId = Number(instance[0]!.id);
    const seg = await sql<Array<{ id: string }>>`
      insert into template_segments (template_id, position, exercise_id, params_json, prescription_json)
      values (${instanceId}, 0, ${exercise}, '{}'::jsonb, ${sql.json({ modality: 'strength', sets: [] })})
      returning id::text
    `;
    const foreignSegmentId = Number(seg[0]!.id);
    const theirs = await makeAssignment({ fx: owner, templateId: instanceId, scheduledForIso: TODAY });
    asAthlete(intruder);

    const res = await soloPost(
      soloRequest(
        livePayload(theirs, {
          segments: [{ position: 0, modality: 'strength', duration_seconds: 300, template_segment_id: foreignSegmentId }],
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.off_plan).toBe(true);

    // Nada en el otro atleta.
    expect(await executionsOf(owner.athleteId)).toHaveLength(0);
    const [st] = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${theirs}
    `;
    expect(st!.status).toBe('scheduled');

    // Del que envía, sin id reclamado (nunca el del otro) y sin enlace a su plantilla.
    const mine = await executionsOf(intruder.athleteId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.off_plan_reason).toBe('not_own_assignment');
    expect(mine[0]!.claimed_assignment_id).toBeNull();
    const links = await sql<Array<{ template_segment_id: string | null; prescription_snapshot: unknown }>>`
      select template_segment_id::text as template_segment_id, prescription_snapshot
      from segment_executions where execution_id = ${Number(body.execution_id)}
    `;
    expect(links).toHaveLength(1);
    expect(links[0]!.template_segment_id).toBeNull();
    expect(links[0]!.prescription_snapshot).toBeNull();
  });

  test('un campo opcional con el tipo equivocado cuesta ese campo, no la sesión', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Carrera' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    asAthlete(fx);

    const res = await soloPost(
      soloRequest(
        livePayload(asg, {
          perceived_exertion: 'alto', // tipo equivocado
          notes: 42, // tipo equivocado
          segments: [
            { position: 0, modality: 'run', duration_seconds: 'seiscientos', distance_meters: 2000 },
            { position: -1, modality: 'run', duration_seconds: 60 }, // sin identidad: se cae solo
          ],
        }),
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.off_plan).toBe(false);
    expect(body.assignment_id).toBe(String(asg));
    expect(body.segments_saved).toBe(1);

    const rows = await executionsOf(fx.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.assignment_id).toBe(String(asg));
    expect(rows[0]!.perceived_exertion).toBeNull();
    expect(rows[0]!.total_duration_seconds).toBe(2880);
    const [status] = await sql<Array<{ status: string }>>`
      select status::text as status from workout_assignments where id = ${asg}
    `;
    expect(status!.status).toBe('completed');
  });

  test('la sesión movida de día se guarda sobre ella, como siempre', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Remo' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    await sql`update workout_assignments set scheduled_for = scheduled_for + 2 where id = ${asg}`;
    asAthlete(fx);

    const res = await soloPost(soloRequest(livePayload(asg)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.off_plan).toBe(false);
    expect(body.assignment_id).toBe(String(asg));
  });

  test('reenviar el mismo entreno fuera del plan actualiza la misma fila', async () => {
    const fx = await fixture();
    asAthlete(fx);
    const first = await soloPost(soloRequest(livePayload('999999999', { perceived_exertion: 7 })));
    const second = await soloPost(soloRequest(livePayload('999999999', { perceived_exertion: 9 })));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const a = await first.json();
    const b = await second.json();
    expect(b.execution_id).toBe(a.execution_id);
    const rows = await executionsOf(fx.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.perceived_exertion).toBe(9);
    const segs = await sql<Array<{ n: number }>>`
      select count(*)::int as n from segment_executions where execution_id = ${Number(a.execution_id)}
    `;
    expect(segs[0]!.n).toBe(2); // los tramos tampoco se duplican
  });

  test('«Marcar como hecha» (sin trabajo) sobre una sesión que ya no está sigue siendo 404', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Fuerza' });
    const gone = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    await sql`delete from workout_assignments where id = ${gone}`;
    asAthlete(fx);

    const res = await soloPost(soloRequest({ assignment_id: String(gone), source: 'manual' }));
    expect(res.status).toBe(404);
    expect(await executionsOf(fx.athleteId)).toHaveLength(0);
  });

  test('un cuerpo que no es un objeto JSON sigue siendo 400', async () => {
    const fx = await fixture();
    asAthlete(fx);
    expect((await soloPost(soloRequest([1, 2, 3]))).status).toBe(400);
    session = null;
    expect((await soloPost(soloRequest(livePayload(1)))).status).toBe(401);
  });

  test('Dobles sin pareja: se guarda el trabajo propio, sin enlazar a nadie', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Dobles' });
    const asg = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    asAthlete(fx);

    const res = await doblesPost(...doblesRequest(String(asg), livePayload(asg)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.saved).toBe(true);
    expect(body.joint).toBe(false);
    expect(body.partner_athlete_id).toBeNull();
    const rows = await executionsOf(fx.athleteId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.assignment_id).toBe(String(asg));
  });

  test('Dobles sobre una sesión quitada: fuera del plan, 2xx', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Dobles' });
    const gone = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    await sql`delete from workout_assignments where id = ${gone}`;
    asAthlete(fx);

    const res = await doblesPost(...doblesRequest(String(gone), livePayload(gone)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.off_plan).toBe(true);
    expect(body.joint).toBe(false);
  });

  test('el coach lo ve: «Hecho fuera del plan» en su Hoy', async () => {
    const fx = await fixture();
    const tpl = await makeTemplate({ fx, name: 'Series' });
    const gone = await makeAssignment({ fx, templateId: tpl, scheduledForIso: TODAY });
    await sql`delete from workout_assignments where id = ${gone}`;
    asAthlete(fx);
    const now = new Date();
    const payload = livePayload(gone, {
      started_at: new Date(now.getTime() - 60 * 60_000).toISOString(),
      ended_at: new Date(now.getTime() - 12 * 60_000).toISOString(),
    });
    expect((await soloPost(soloRequest(payload))).status).toBe(200);

    await recomputeAthlete({ athlete_id: fx.athleteId, client: sql });
    const items = await sql<Array<{ severity: string; label: string; detail: string }>>`
      select severity, label, detail from coach_attention_items
      where athlete_id = ${fx.athleteId} and signal_kind = 'workout_off_plan'
    `;
    expect(items).toHaveLength(1);
    expect(items[0]!.severity).toBe('warning');
    expect(items[0]!.label).toBe('Hecho fuera del plan');
    expect(items[0]!.detail).toBe('Hecho sobre un entreno que ya no estaba en su plan · 48 min');
  });
});

// Puro (sin base): la línea que lee el coach.
test('la línea del coach dice «ya no estaba» solo cuando la sesión existió', async () => {
  const { offPlanDetail } = await import('@/lib/coach/attention/recompute');
  expect(offPlanDetail('assignment_gone', 2880)).toBe('Hecho sobre un entreno que ya no estaba en su plan · 48 min');
  expect(offPlanDetail('not_own_assignment', null)).toBe('Hecho sobre un entreno que no estaba en su plan');
  expect(offPlanDetail('no_assignment', 20)).toBe('Hecho sobre un entreno que no estaba en su plan');
  expect(offPlanDetail(null, 600)).toBeNull();
});
