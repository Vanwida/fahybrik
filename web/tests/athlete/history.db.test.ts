/**
 * ATHLETE HISTORY BY MONTH (#historial) — real-DB integration for
 * `buildAthleteHistoryMonth` (lib/athlete/history.ts). No SQL mocked (Neon branch).
 *
 * Covers:
 *   • a planned week: completed sessions plot on the day they were DONE (box-local),
 *     ordered by started_at; scheduled rest days appear (is_rest, no sessions); a day
 *     scheduled-but-not-completed is excluded; with_partner + has_route flags are real;
 *   • an empty month (no plan, no work) → days [] (never a fabricated rest grid);
 *   • a session whose started_at is NULL falls back to created_at for its day.
 *
 * WRITE, do NOT run (TCP egress is blocked; Alex runs the suite against a branch).
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';

// Cold Neon branch endpoints exceed the 5s default on the first txn.
const DB_TEST_TIMEOUT_MS = 30_000;

import { buildAthleteHistoryMonth } from '@/lib/athlete/history';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, makeAssignment, type Fixture } from '../utils/db-fixtures';

describeWithDb('athlete history by month (real DB)', () => {
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

  /** A second athlete under the same coach — used as the Dobles partner link. */
  async function makePartner(fx: Fixture): Promise<number> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await sql<{ id: string }[]>`
      insert into users (email, role) values (${'hist-partner-' + suffix + '@test.local'}, 'athlete')
      returning id::text
    `;
    const userId = Number(user[0]!.id);
    const ath = await sql<{ id: string }[]>`
      insert into athletes (user_id, coach_id, full_name)
      values (${userId}, ${fx.coachId}, 'Partner Ath')
      returning id::text
    `;
    const athleteId = Number(ath[0]!.id);
    cleanups.push(async () => {
      await sql`delete from athletes where id = ${athleteId}`;
      await sql`delete from users where id = ${userId}`;
    });
    return athleteId;
  }

  /** Insert one execution for an assignment (1:1). Controls date + flags. */
  async function insertExecution(params: {
    assignmentId: number;
    athleteId: number;
    startedAt: string | null;
    createdAt?: string;
    durationS?: number | null;
    scoreTimeS?: number | null;
    rpe?: number | null;
    partnerAthleteId?: number | null;
    polyline?: string | null;
  }): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into workout_executions (
        assignment_id, athlete_id, started_at, ended_at,
        total_duration_seconds, perceived_exertion, score_time_s,
        partner_athlete_id, created_at
      )
      values (
        ${params.assignmentId},
        ${params.athleteId},
        ${params.startedAt}::timestamptz,
        ${params.startedAt}::timestamptz,
        ${params.durationS ?? null},
        ${params.rpe ?? null},
        ${params.scoreTimeS ?? null},
        ${params.partnerAthleteId ?? null},
        ${params.createdAt ?? new Date().toISOString()}::timestamptz
      )
      returning id::text
    `;
    const executionId = Number(rows[0]!.id);
    if (params.polyline) {
      await sql`
        insert into workout_routes (execution_id, polyline, point_count)
        values (${executionId}, ${params.polyline}, 2)
      `;
    }
    return executionId;
  }

  test(
    'planned week: sessions plot by done-day + rest days + partner/route flags',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const partnerId = await makePartner(fx);
      const templateId = await makeTemplate({ fx, name: 'Fuerza tren inferior' });

      // Week Mon 2026-05-04 … Sun 2026-05-10. Assignments Mon/Tue(×2)/Thu/Fri.
      const monRest = '2026-05-04';
      const tue = '2026-05-05';
      const wed = '2026-05-06'; // rest (no assignment)
      const thu = '2026-05-07';
      const fri = '2026-05-08';
      const sat = '2026-05-09'; // rest
      const sun = '2026-05-10'; // rest

      // Scheduled but never completed → excluded from the month (no sessions, not rest).
      await makeAssignment({ fx, templateId, scheduledForIso: monRest, status: 'scheduled' });
      await makeAssignment({ fx, templateId, scheduledForIso: fri, status: 'scheduled' });

      // Two completed sessions on Tuesday (am + pm) on their own assignments.
      const tueAm = await makeAssignment({ fx, templateId, scheduledForIso: tue, status: 'completed' });
      const tuePm = await makeAssignment({ fx, templateId, scheduledForIso: tue, status: 'completed' });
      const thuDone = await makeAssignment({ fx, templateId, scheduledForIso: thu, status: 'completed' });

      // 07:00Z = 09:00 CEST and 15:00Z = 17:00 CEST → both fall on 2026-05-05 local,
      // and the am session sorts before the pm one (order by started_at asc).
      await insertExecution({
        assignmentId: tueAm,
        athleteId: fx.athleteId,
        startedAt: '2026-05-05T07:00:00Z',
        durationS: 3600,
        scoreTimeS: null,
        rpe: 7,
        partnerAthleteId: partnerId,
        polyline: '_p~iF~ps|U',
      });
      await insertExecution({
        assignmentId: tuePm,
        athleteId: fx.athleteId,
        startedAt: '2026-05-05T15:00:00Z',
        durationS: 1800,
        scoreTimeS: 900,
        rpe: null,
      });
      await insertExecution({
        assignmentId: thuDone,
        athleteId: fx.athleteId,
        startedAt: '2026-05-07T08:00:00Z',
        durationS: 2400,
      });

      const res = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
      expect(res.month).toBe('2026-05');

      const byDate = new Map(res.days.map((d) => [d.date, d]));
      // Exactly the content days: Tue + Thu (sessions) and Wed/Sat/Sun (rest).
      expect(res.days.map((d) => d.date)).toEqual([tue, wed, thu, sat, sun]);

      const tueDay = byDate.get(tue)!;
      expect(tueDay.is_rest).toBe(false);
      expect(tueDay.sessions).toHaveLength(2);
      // Ordered by started_at: am first (partner + route), pm second (scored).
      const [am, pm] = tueDay.sessions;
      expect(am!.assignment_id).toBe(String(tueAm));
      expect(am!.title).toBe('Fuerza tren inferior');
      expect(am!.total_duration_seconds).toBe(3600);
      expect(am!.rpe).toBe(7);
      expect(am!.with_partner).toBe(true);
      expect(am!.has_route).toBe(true);
      expect(pm!.assignment_id).toBe(String(tuePm));
      expect(pm!.score_time_s).toBe(900);
      expect(pm!.with_partner).toBe(false);
      expect(pm!.has_route).toBe(false);

      const thuDay = byDate.get(thu)!;
      expect(thuDay.is_rest).toBe(false);
      expect(thuDay.sessions).toHaveLength(1);
      expect(thuDay.sessions[0]!.assignment_id).toBe(String(thuDone));

      for (const restIso of [wed, sat, sun]) {
        const rd = byDate.get(restIso)!;
        expect(rd.is_rest).toBe(true);
        expect(rd.sessions).toEqual([]);
      }
      // Scheduled-but-not-done days are neither rest nor sessions → omitted.
      expect(byDate.has(monRest)).toBe(false);
      expect(byDate.has(fri)).toBe(false);
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'empty month → days []',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const res = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
      expect(res).toEqual({ month: '2026-05', days: [] });
    },
    DB_TEST_TIMEOUT_MS,
  );

  test(
    'session with null started_at falls back to created_at for its day',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(fx.cleanup);
      const templateId = await makeTemplate({ fx, name: 'Carrera continua' });
      // 2026-05-20 is a Wednesday. 09:00Z = 11:00 CEST → local day 2026-05-20.
      const sched = '2026-05-20';
      const assignmentId = await makeAssignment({
        fx,
        templateId,
        scheduledForIso: sched,
        status: 'completed',
      });
      await insertExecution({
        assignmentId,
        athleteId: fx.athleteId,
        startedAt: null,
        createdAt: '2026-05-20T09:00:00Z',
      });

      const res = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
      const day = res.days.find((d) => d.date === sched);
      expect(day).toBeDefined();
      expect(day!.is_rest).toBe(false);
      expect(day!.sessions).toHaveLength(1);
      expect(day!.sessions[0]!.assignment_id).toBe(String(assignmentId));
    },
    DB_TEST_TIMEOUT_MS,
  );

  // Lo hecho sin asignación (importación de Salud, «fuera del plan») cuenta en carga
  // y en zonas; en el historial solo salía lo que tenía asignación (INNER JOIN).
  // Y el descanso lo decide el plan del COACH: un libre no convierte días en «descanso».
  test(
    'libres, importaciones y fuera del plan: filas completas; el descanso es solo del coach',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(async () => {
        await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      });
      cleanups.push(fx.cleanup);
      const templateId = await makeTemplate({ fx, name: 'Series 6×800' });

      // Semana del coach lun 11 → dom 17 de mayo de 2026: solo el lunes.
      const mon = await makeAssignment({ fx, templateId, scheduledForIso: '2026-05-11', status: 'completed' });
      const monEx = await insertExecution({ assignmentId: mon, athleteId: fx.athleteId, startedAt: '2026-05-11T08:00:00Z', durationS: 3000 });
      await sql`
        insert into segment_executions (execution_id, position, modality, started_at, ended_at, distance_meters)
        values (${monEx}, 0, 'run', '2026-05-11T08:00:00Z', '2026-05-11T08:40:00Z', 8000),
               (${monEx}, 1, 'strength', '2026-05-11T08:40:00Z', '2026-05-11T08:50:00Z', null)
      `;
      await sql`update workout_executions set total_distance_m = 8000 where id = ${monEx}`;

      // Miércoles: un libre hecho. Martes: un libre montado y NO hecho (no es plan).
      const libre = await sql<{ id: string }[]>`
        insert into workout_assignments (athlete_id, scheduled_for, template_id, template_version, status, origin)
        values (${fx.athleteId}, '2026-05-13', ${templateId}, 1, 'completed', 'self'),
               (${fx.athleteId}, '2026-05-12', ${templateId}, 1, 'scheduled', 'self')
        returning id::text
      `;
      await insertExecution({ assignmentId: Number(libre[0]!.id), athleteId: fx.athleteId, startedAt: '2026-05-13T08:00:00Z', durationS: 1800 });

      // Jueves: remo importado de Salud, sin asignación. Viernes: un AMRAP guardado
      // fuera del plan porque el coach quitó la sesión mientras entrenaba.
      const imp = await sql<{ id: string }[]>`
        insert into workout_executions (assignment_id, athlete_id, started_at, ended_at, total_duration_seconds, total_distance_m, source, recorded_via)
        values (null, ${fx.athleteId}, '2026-05-14T07:00:00Z', '2026-05-14T07:30:00Z', 1800, 6000, 'healthkit', 'imported')
        returning id::text
      `;
      await sql`
        insert into segment_executions (execution_id, position, modality, started_at, ended_at, distance_meters)
        values (${imp[0]!.id}, 0, 'row', '2026-05-14T07:00:00Z', '2026-05-14T07:30:00Z', 6000)
      `;
      const off = await sql<{ id: string }[]>`
        insert into workout_executions (assignment_id, athlete_id, started_at, total_duration_seconds, score_rounds, score_reps, source, recorded_via, off_plan_reason, claimed_assignment_id)
        values (null, ${fx.athleteId}, '2026-05-15T17:00:00Z', 1200, 7, 12, 'manual', 'live', 'assignment_gone', 999999)
        returning id::text
      `;

      // Sin opt-in: la respuesta de siempre (la app instalada no decodifica un
      // assignment_id nulo), con los campos nuevos.
      const legacy = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
      const legacyDays = new Map(legacy.days.map((d) => [d.date, d]));
      expect(legacy.days.flatMap((d) => d.sessions).every((s) => s.assignment_id != null)).toBe(true);
      expect(legacyDays.get('2026-05-11')!.sessions[0]).toMatchObject({
        execution_id: String(monEx),
        modality: 'run',
        distance_m: 8000,
        origin: 'coach',
      });
      expect(legacyDays.get('2026-05-13')!.sessions[0]).toMatchObject({ origin: 'self' });
      // El martes del libre sin hacer es descanso: el plan del coach no puso nada.
      expect(legacyDays.get('2026-05-12')).toMatchObject({ is_rest: true, sessions: [] });

      // Con opt-in: la importación y el fuera del plan, con su ejecución y sin asignación.
      const full = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql, { include_unplanned: true });
      const fullDays = new Map(full.days.map((d) => [d.date, d]));
      expect(fullDays.get('2026-05-14')!.sessions[0]).toMatchObject({
        execution_id: imp[0]!.id,
        assignment_id: null,
        title: 'Remo',
        modality: 'row',
        distance_m: 6000,
        recorded_via: 'imported',
        origin: null,
        off_plan_reason: null,
      });
      expect(fullDays.get('2026-05-15')!.sessions[0]).toMatchObject({
        execution_id: off[0]!.id,
        assignment_id: null,
        title: 'Entreno',
        modality: null,
        score_rounds: 7,
        score_reps: 12,
        off_plan_reason: 'assignment_gone',
      });
      // Un día con trabajo nunca es descanso; el sábado y el domingo siguen siéndolo.
      expect(fullDays.get('2026-05-14')!.is_rest).toBe(false);
      expect(fullDays.get('2026-05-16')!.is_rest).toBe(true);
    },
    DB_TEST_TIMEOUT_MS,
  );

  // El tonelaje de la fila: la MISMA regla que el detalle (volume.ts), sumada por
  // tramo. Serie saltada no suma; un tramo sin series cuenta su línea; carrera → null.
  test(
    'volume_kg: Σ reps × kg de las series hechas; null sin carga',
    async () => {
      const fx = await makeCoachAndAthlete(sql);
      cleanups.push(async () => {
        await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
      });
      cleanups.push(fx.cleanup);
      const templateId = await makeTemplate({ fx, name: 'Fuerza' });
      const gym = await makeAssignment({ fx, templateId, scheduledForIso: '2026-05-11', status: 'completed' });
      const run = await makeAssignment({ fx, templateId, scheduledForIso: '2026-05-12', status: 'completed' });
      const gymEx = await insertExecution({ assignmentId: gym, athleteId: fx.athleteId, startedAt: '2026-05-11T08:00:00Z' });
      const runEx = await insertExecution({ assignmentId: run, athleteId: fx.athleteId, startedAt: '2026-05-12T08:00:00Z' });
      const segs = await sql<{ id: string; position: number }[]>`
        insert into segment_executions (execution_id, position, modality, reps_completed, weight_used_kg)
        values (${gymEx}, 0, 'strength', null, 115), (${gymEx}, 1, 'strength', 10, 20)
        returning id::text, position
      `;
      const squat = segs.find((s) => s.position === 0)!.id;
      await sql`
        insert into set_executions (segment_execution_id, set_index, reps_actual, load_actual_kg, status)
        values (${squat}, 1, 5, 100, 'done'), (${squat}, 2, 5, 110, 'scaled'), (${squat}, 3, 3, 115, 'skipped')
      `;
      await sql`
        insert into segment_executions (execution_id, position, modality, distance_meters)
        values (${runEx}, 0, 'run', 5000)
      `;

      const res = await buildAthleteHistoryMonth(fx.athleteId, '2026-05', sql);
      const byDate = new Map(res.days.map((d) => [d.date, d]));
      // 5×100 + 5×110 (la saltada no) + la línea 10×20.
      expect(byDate.get('2026-05-11')!.sessions[0]!.volume_kg).toBe(1250);
      expect(byDate.get('2026-05-12')!.sessions[0]!.volume_kg).toBeNull();
    },
    DB_TEST_TIMEOUT_MS,
  );
});
