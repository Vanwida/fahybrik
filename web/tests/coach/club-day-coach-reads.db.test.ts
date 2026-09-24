// Lo que el coach LEE del plan, del roster y del negocio va en el calendario de
// SU club, no en el de la sesión de Postgres (UTC) — DECISIONS 2026-09-23, «Qué
// día es en cada sitio». Lo que VIVE el atleta (su carrera, su test, su tarea) va
// en el suyo. DB real.
//
// El instante: lunes 1 de abril de 2030, 01:30 en Auckland (NZDT, UTC+13) =
// domingo 31 de marzo, 12:30 UTC (14:30 en Madrid). El club ya está en ABRIL y en
// la semana del lunes 1; UTC y Madrid siguen en marzo, en la del lunes 25. Todos
// los relojes se inyectan (`now`): el resultado no depende del día en que corra.

import { afterAll, expect, test } from 'vitest';
import { listPersonalPlansForAthlete } from '@/lib/dashboard/coach/personal-plans';
import { loadAthleteLifecycleDetail } from '@/lib/dashboard/coach/athlete-lifecycle-detail';
import { buildBusinessMetrics } from '@/lib/dashboard/coach/business-metrics';
import { fetchAthleteProfileShell } from '@/lib/dashboard/coach/athlete-profile-shell';
import { getOrderAlteredByAthlete } from '@/lib/dashboard/v2/order-altered';
import { listPrograms } from '@/lib/dashboard/programming/programs';
import { loadBatch } from '@/lib/coach/attention/recompute-batch';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeMicrocycle,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

const NOW = new Date('2030-03-31T12:30:00Z');

describeWithDb('el día del club en lo que lee el coach (DB real, club en Auckland)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];
  const extras: Array<{ athleteId: number; userId: number }> = [];

  afterAll(async () => {
    for (const x of extras) {
      await sql`delete from subscriptions where user_id = ${x.userId}`;
      await sql`delete from athletes where id = ${x.athleteId}`;
      await sql`delete from users where id = ${x.userId}`;
    }
    while (fixtures.length) {
      const fx = fixtures.pop()!;
      await sql`delete from subscriptions where user_id = ${fx.athleteUserId}`;
      await fx.cleanup();
    }
    await closeTestSql();
  });

  async function club(timezone: string | null = 'Pacific/Auckland'): Promise<Fixture> {
    const fx = await makeCoachAndAthlete(sql);
    fixtures.push(fx);
    await sql`update coaches set timezone = ${timezone} where id = ${fx.coachId}`;
    return fx;
  }

  /** Otro atleta del mismo club, con su propio huso. */
  async function otherAthlete(fx: Fixture, timezone: string): Promise<{ athleteId: number; userId: number }> {
    const u = await sql<Array<{ id: string }>>`
      insert into users (email, role)
      values (${`club-day-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete')
      returning id::text
    `;
    const userId = Number(u[0]!.id);
    const a = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name, timezone)
      values (${userId}, ${fx.coachId}, 'Atleta en Madrid', ${timezone})
      returning id::text
    `;
    const x = { athleteId: Number(a[0]!.id), userId };
    extras.push(x);
    return x;
  }

  /** Un programa del coach; `personalOf` = el plan personal de ese atleta (0164). */
  async function program(fx: Fixture, name: string, personalOf: number | null = null): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, athlete_id)
      values (${fx.coachId}, ${name}, ${personalOf})
      returning id::text
    `;
    const id = Number(rows[0]!.id);
    fx.monthTemplates.push({ monthId: id, weekIds: [] });
    return id;
  }

  /** El recibo: ese programa, en esas fechas, para ese atleta. */
  async function receipt(athleteId: number, monthId: number, start: string, end: string): Promise<void> {
    await sql`
      insert into athlete_month_assignments (athlete_id, month_template_id, start_date, end_date)
      values (${athleteId}, ${monthId}, ${start}::date, ${end}::date)
    `;
  }

  async function subscription(
    userId: number,
    s: { status: 'active' | 'canceled'; created: string; updated?: string; periodEnd?: string },
  ): Promise<void> {
    await sql`
      insert into subscriptions (user_id, plan_type, status, source, current_period_end, created_at, updated_at)
      values (
        ${userId}, 'individual', ${s.status}::subscription_status, 'stripe',
        ${s.periodEnd ?? null}::timestamptz, ${s.created}::timestamptz, ${s.updated ?? s.created}::timestamptz
      )
    `;
  }

  async function targetRace(athleteId: number, name: string, day: string): Promise<void> {
    await sql`
      insert into races (athlete_id, name, event_type, format, division, gender_category, priority, race_date, status)
      values (${athleteId}, ${name}, 'hyrox', 'singles', 'open', 'men', 'target', ${day}::date, 'registered')
    `;
  }

  // ── 1 · personal-plans ─────────────────────────────────────────────────────
  test('planes personales: «en curso» es el del 1 de abril del club, no el 31 de marzo de UTC', async () => {
    const fx = await club();
    const marzo = await program(fx, 'Personal marzo', fx.athleteId);
    const abril = await program(fx, 'Personal abril', fx.athleteId);
    await receipt(fx.athleteId, marzo, '2030-03-04', '2030-03-31');
    await receipt(fx.athleteId, abril, '2030-04-01', '2030-04-28');

    const plans = await listPersonalPlansForAthlete({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      now: NOW,
      client: sql,
    });
    expect(plans.filter((p) => p.is_current).map((p) => p.name)).toEqual(['Personal abril']);
  });

  // ── 2 · athlete-lifecycle-detail ──────────────────────────────────────────
  test('pausa abierta: el presupuesto cuenta hasta el día del club', async () => {
    const fx = await club();
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${fx.athleteId}`;
    await sql`
      insert into athlete_pauses (athlete_id, start_date, end_date, reason, requested_by)
      values (${fx.athleteId}, '2030-03-20', null, 'lesion', 'coach')
    `;

    const detail = await loadAthleteLifecycleDetail({ athlete_id: fx.athleteId, now: NOW, client: sql });
    expect(detail.paused_since).toBe('2030-03-20');
    // Del 20 de marzo al 1 de abril del club, los dos incluidos: 13 de los 28 días.
    expect(detail.pause_days_available).toBe(28 - 13);
  });

  // ── 3 · business-metrics ──────────────────────────────────────────────────
  test('negocio: el mes empieza a medianoche del día 1 del club y las renovaciones cuentan desde su hoy', async () => {
    const fx = await club();
    const user = fx.athleteUserId;
    // A · 31-mar 23:30 en Auckland: el mes PASADO del club (en UTC sería este).
    await subscription(user, { status: 'active', created: '2030-03-31T10:30:00Z', periodEnd: '2030-03-31T10:30:00Z' });
    // B · 1-abr 00:30 en Auckland: este mes.
    await subscription(user, { status: 'active', created: '2030-03-31T11:30:00Z', periodEnd: '2030-04-15T00:00:00Z' });
    // C · baja el 1-abr 00:30 en Auckland: este mes. D · el 31-mar 23:30: el pasado.
    await subscription(user, { status: 'canceled', created: '2030-01-15T00:00:00Z', updated: '2030-03-31T11:30:00Z' });
    await subscription(user, { status: 'canceled', created: '2030-01-15T00:00:00Z', updated: '2030-03-31T10:30:00Z' });

    const m = await buildBusinessMetrics({ coach_id: fx.coachId, now: NOW, client: sql });
    expect(m.new_this_month).toBe(1);
    expect(m.canceled_this_month).toBe(1);
    // Activas al empezar el mes del club: A (aún activa) y C (se dio de baja dentro).
    expect(m.active_at_month_start).toBe(2);
    expect(m.churn_pct).toBe(50);
    // A terminó su periodo ayer (31-mar 23:30 del club): no es una renovación próxima.
    expect(m.renewals_next_30d).toBe(1);
    expect(m.active_count).toBe(2);
    expect(m.mrr_eur).toBe(140);
    expect(m.is_empty).toBe(false);
  });

  test('negocio (plataforma): cada suscripción cuenta el mes de SU club; el total es la suma de los clubes', async () => {
    const before = await buildBusinessMetrics({ now: NOW, client: sql });
    const nz = await club();
    // Un huso que Postgres no conoce cae al defecto (Madrid) sin tumbar la consulta.
    const madrid = await club('Marte/Olympus');
    // Auckland: dos del marzo del club y una de su abril.
    await subscription(nz.athleteUserId, { status: 'active', created: '2030-03-31T10:30:00Z' });
    await subscription(nz.athleteUserId, { status: 'active', created: '2030-03-20T00:00:00Z' });
    await subscription(nz.athleteUserId, { status: 'active', created: '2030-03-31T11:30:00Z' });
    // Madrid: 1-mar 00:30 hora de Madrid (28-feb en UTC) = este mes para ese club.
    await subscription(madrid.athleteUserId, { status: 'active', created: '2030-02-28T23:30:00Z' });

    const nzOnly = await buildBusinessMetrics({ coach_id: nz.coachId, now: NOW, client: sql });
    const madridOnly = await buildBusinessMetrics({ coach_id: madrid.coachId, now: NOW, client: sql });
    const after = await buildBusinessMetrics({ now: NOW, client: sql });
    expect(nzOnly.new_this_month).toBe(1);
    expect(madridOnly.new_this_month).toBe(1);
    // Con un solo huso para todos saldría 3 (UTC), 1 (Auckland) o 4 (Madrid).
    expect(after.new_this_month - before.new_this_month).toBe(2);
  });

  // ── 4 · athlete-profile-shell ─────────────────────────────────────────────
  test('cabecera de la ficha: el programa en curso y su semana van con el día del club', async () => {
    const fx = await club();
    const bloque = await program(fx, 'Bloque largo');
    await receipt(fx.athleteId, bloque, '2030-03-18', '2030-04-14');
    const shell = await fetchAthleteProfileShell({ coach_id: fx.coachId, athlete_id: fx.athleteId, now: NOW, client: sql });
    expect(shell?.block_type).toBe('Bloque largo');
    // 1-abr es la tercera semana desde el lunes 18 (el 31-mar de UTC sería la segunda).
    expect(shell?.block_week).toBe(3);

    const fx2 = await club();
    const marzo = await program(fx2, 'Bloque marzo');
    const abril = await program(fx2, 'Bloque abril');
    await receipt(fx2.athleteId, marzo, '2030-03-04', '2030-03-31');
    await receipt(fx2.athleteId, abril, '2030-04-01', '2030-04-28');
    const shell2 = await fetchAthleteProfileShell({ coach_id: fx2.coachId, athlete_id: fx2.athleteId, now: NOW, client: sql });
    expect(shell2?.block_type).toBe('Bloque abril');
    expect(shell2?.block_week).toBe(1);
  });

  // ── 5 · order-altered ─────────────────────────────────────────────────────
  test('orden alterado: la semana en curso es la del día del club', async () => {
    const fx = await club();
    const tpl = await makeTemplate({ fx, name: 'Sesión' });
    const done = async (assignmentId: number, endedAt: string) => {
      await sql`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
        values (${assignmentId}, ${fx.athleteId}, ${endedAt}::timestamptz - interval '30 minutes', ${endedAt}::timestamptz)
      `;
    };
    // La semana del 25 de marzo (la de UTC): hecha en orden.
    const utcWeek = await makeMicrocycle({ sql, athleteId: fx.athleteId, startIso: '2030-03-25', endIso: '2030-03-31' });
    const u1 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2030-03-25', microcycleId: utcWeek.microcycleId, status: 'completed' });
    const u2 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2030-03-26', microcycleId: utcWeek.microcycleId, status: 'completed' });
    await done(u1, '2030-03-25T08:00:00Z');
    await done(u2, '2030-03-26T08:00:00Z');
    // La semana del 1 de abril (la del club): la sesión 1 se terminó DESPUÉS que la 2.
    const clubWeek = await makeMicrocycle({ sql, athleteId: fx.athleteId, startIso: '2030-04-01', endIso: '2030-04-07', weekNumber: 2 });
    const c1 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2030-04-01', microcycleId: clubWeek.microcycleId, status: 'completed' });
    const c2 = await makeAssignment({ fx, templateId: tpl, scheduledForIso: '2030-04-02', microcycleId: clubWeek.microcycleId, status: 'completed' });
    await done(c2, '2030-03-31T11:10:00Z');
    await done(c1, '2030-03-31T11:20:00Z');

    const altered = await getOrderAlteredByAthlete([fx.athleteId], sql, { now: NOW });
    expect(altered.get(fx.athleteId)).toBe(true);
  });

  // ── 6 · programs ──────────────────────────────────────────────────────────
  test('programas: «en curso o por empezar» se cuenta con el día del club', async () => {
    const fx = await club();
    const acabado = await program(fx, 'Acabó el domingo');
    const vigente = await program(fx, 'Empieza hoy');
    await receipt(fx.athleteId, acabado, '2030-03-04', '2030-03-31');
    await receipt(fx.athleteId, vigente, '2030-04-01', '2030-04-28');

    const rows = await listPrograms({ coach_id: fx.coachId, now: NOW, client: sql });
    const usedBy = Object.fromEntries(rows.map((r) => [r.name, r.used_by]));
    expect(usedBy).toEqual({ 'Acabó el domingo': 0, 'Empieza hoy': 1 });
  });

  // ── 8 · recompute-batch ───────────────────────────────────────────────────
  test('señales: el plan y los cobros van con el día del club; carreras, tests y tareas con el del atleta', async () => {
    const fx = await club();
    // A vive en Auckland (su día = el del club, 1-abr); B en Madrid (su día = 31-mar).
    const A = { athleteId: fx.athleteId, userId: fx.athleteUserId };
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${A.athleteId}`;
    const B = await otherAthlete(fx, 'Europe/Madrid');

    // Plan (CLUB): el recibo en curso el 1-abr es el de abril, también para B.
    const marzo = await program(fx, 'Bloque marzo');
    const abril = await program(fx, 'Bloque abril');
    await receipt(B.athleteId, marzo, '2030-03-04', '2030-03-31');
    await receipt(B.athleteId, abril, '2030-04-01', '2030-04-28');

    // Cobros (CLUB): el día en que acaba el periodo y los días que faltan, en Auckland.
    await subscription(A.userId, { status: 'active', created: '2030-01-01T00:00:00Z', periodEnd: '2030-04-15T12:30:00Z' });
    await subscription(B.userId, { status: 'active', created: '2030-01-01T00:00:00Z', periodEnd: '2030-04-15T11:00:00Z' });
    await sql`update subscriptions set cancel_at_period_end = true where user_id in (${A.userId}, ${B.userId})`;

    // Carreras (ATLETA): el 31-mar ya pasó para A y es hoy para B.
    await targetRace(A.athleteId, 'Pasada', '2030-03-31');
    await targetRace(A.athleteId, 'Futura', '2030-06-01');
    await targetRace(B.athleteId, 'Hoy', '2030-03-31');

    // Tests (ATLETA): el día del último test, en el huso de cada uno.
    await sql`
      insert into athlete_benchmarks (athlete_id, exercise_slug, value, unit, recorded_at, source)
      values (${A.athleteId}, 'run_5k', 1200, 'seconds', '2030-03-31T10:00:00Z', 'coach_test'),
             (${B.athleteId}, 'run_5k', 1200, 'seconds', '2030-03-30T23:30:00Z', 'coach_test')
    `;

    // Una tarea que vence el 31-mar y un protocolo colgado de su carrera (ATLETA).
    const comms = await sql<Array<{ id: string; kind: string }>>`
      insert into coach_communications (coach_id, kind, title, due_date, anchor_kind, status, published_at)
      values (${fx.coachId}, 'task', 'Subir el test', '2030-03-31', 'general', 'published', ${NOW}),
             (${fx.coachId}, 'protocol', 'Día de carrera', null, 'race', 'published', ${NOW})
      returning id::text, kind
    `;
    for (const c of comms) {
      await sql`
        insert into coach_communication_recipients (communication_id, athlete_id)
        values (${Number(c.id)}, ${A.athleteId}), (${Number(c.id)}, ${B.athleteId})
      `;
    }
    const taskId = comms.find((c) => c.kind === 'task')!.id;

    const rows = await loadBatch(sql, fx.coachId, NOW, null);
    const a = rows.find((r) => r.athlete_id === String(A.athleteId))!;
    const b = rows.find((r) => r.athlete_id === String(B.athleteId))!;

    // CLUB — el microciclo en curso de B es el de abril aunque en Madrid sea 31.
    expect(b.current_microciclo_name).toBe('Bloque abril');
    expect(b.current_microcycle_end_iso).toBe('2030-04-28');
    // CLUB — A: acaba el 16-abr 00:30 en Auckland (15 días); B: el 15 a las 23:00 (14).
    expect([a.billing_period_end_iso, a.billing_days_to_period_end]).toEqual(['2030-04-16', 15]);
    expect([b.billing_period_end_iso, b.billing_days_to_period_end]).toEqual(['2030-04-15', 14]);

    // ATLETA — la carrera objetivo por venir.
    expect(a.a_event_iso).toBe('2030-06-01');
    expect(b.a_event_iso).toBe('2030-03-31');
    // ATLETA — días desde el último test: A lo hizo ayer (31, 23:00 suyo); B hoy (31, 00:30 suyo).
    expect(a.days_since_last_test).toBe(1);
    expect(b.days_since_last_test).toBe(0);
    // ATLETA — la tarea del 31 ya venció para A y todavía no para B.
    expect(a.comm_task_id).toBe(taskId);
    expect(b.comm_task_id).toBeNull();
    // ATLETA — el protocolo cuelga de SU próxima carrera.
    expect(a.comm_protocol_event_iso).toBe('2030-06-01');
    expect(b.comm_protocol_event_iso).toBe('2030-03-31');
  });
});
