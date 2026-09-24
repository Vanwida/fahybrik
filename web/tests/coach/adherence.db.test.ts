// La carga por lotes de la adherencia contra una base REAL
// (shared/domain/coach/adherence.ts → loadAdherenceBatch): una consulta, el día
// del atleta en su huso, y todo lo que decide si una sesión es debida — pausa,
// descanso por lesión, entreno libre y semana oculta.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { loadAdherenceBatch } from '@fahybrid/shared/domain/coach/adherence';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, makeTemplate, type Fixture } from '../utils/db-fixtures';

// Miércoles 23 sept 2026, 10:00 UTC (12:00 en Madrid).
const NOW = new Date('2026-09-23T10:00:00.000Z');

describeWithDb('loadAdherenceBatch — solo lo debido, en una consulta', () => {
  const sql = getTestSql();
  let fx: Fixture;

  async function session(
    day: string,
    status: string,
    extra: { origin?: 'coach' | 'self'; injury?: 'rest' | null } = {},
  ): Promise<number> {
    const tpl = fx.templateIds[0]!;
    const rows = await sql<Array<{ id: string }>>`
      insert into workout_assignments (
        athlete_id, scheduled_for, template_id, template_version, status, origin, injury_adaptation
      )
      values (
        ${fx.athleteId}, ${day}::date, ${tpl}, 1, ${status}::assignment_status,
        ${extra.origin ?? 'coach'}::workout_origin, ${extra.injury ?? null}
      )
      returning id::text
    `;
    return Number(rows[0]!.id);
  }

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await makeTemplate({ fx, name: 'Entreno' });

    // Semana en curso (21–27): lunes hecho, martes perdido, martes libre del
    // atleta, hoy pendiente, jueves futuro.
    await session('2026-09-21', 'completed');
    await session('2026-09-22', 'missed');
    await session('2026-09-22', 'scheduled', { origin: 'self' });
    await session('2026-09-23', 'scheduled');
    await session('2026-09-24', 'scheduled');
    // Semana anterior (14–20) OCULTA: lo no hecho no cuenta, lo hecho sí.
    await sql`
      insert into weekly_plans (athlete_id, week_start, status)
      values (${fx.athleteId}, '2026-09-14', 'draft')
    `;
    await session('2026-09-16', 'missed');
    const done = await session('2026-09-17', 'scheduled');
    await sql`
      insert into workout_executions (assignment_id, athlete_id, started_at, ended_at)
      values (${done}, ${fx.athleteId}, '2026-09-17T08:00:00Z', '2026-09-17T09:00:00Z')
    `;
    // Pausa el 19–20 y descanso por lesión el 12: no son debidos.
    await sql`
      insert into athlete_pauses (athlete_id, start_date, end_date, reason, requested_by)
      values (${fx.athleteId}, '2026-09-19', '2026-09-20', 'otro', 'coach')
    `;
    await session('2026-09-20', 'missed');
    await session('2026-09-12', 'missed', { injury: 'rest' });
    // Fuera de la ventana de 14 días (10–23): no cuenta.
    await session('2026-09-08', 'missed');
  });

  afterAll(async () => {
    await sql`delete from workout_executions where athlete_id = ${fx.athleteId}`;
    await sql`delete from athlete_pauses where athlete_id = ${fx.athleteId}`;
    await sql`delete from weekly_plans where athlete_id = ${fx.athleteId}`;
    await fx.cleanup();
    await closeTestSql();
  });

  it('14 d: due = lun hecho + mar perdido + jue 17 hecho (oculta) → 67 %', async () => {
    const map = await loadAdherenceBatch({
      client: sql,
      athlete_ids: [fx.athleteId],
      window_days: 14,
      now: NOW,
    });
    expect(map.get(String(fx.athleteId))).toMatchObject({
      pct: 67,
      due: 3,
      done: 2,
      missed: 1,
      last_missed_on: '2026-09-22',
      window_days: 14,
    });
  });

  it('por coach en vez de por ids: misma fórmula (7 d = 17–23: el 16 queda fuera)', async () => {
    const map = await loadAdherenceBatch({ client: sql, coach_id: fx.coachId, window_days: 7, now: NOW });
    expect(map.get(String(fx.athleteId))).toMatchObject({ pct: 67, due: 3, done: 2 });
  });

  it('el «hoy» es el del atleta: a las 23:30 de Los Ángeles aún es martes', async () => {
    await sql`update athletes set timezone = 'America/Los_Angeles' where id = ${fx.athleteId}`;
    try {
      // 23 sept 06:30 UTC = 22 sept 23:30 en Los Ángeles → hoy es el martes 22:
      // el perdido del martes aún no es debido (su día no ha acabado). Quedan
      // el 17 (hecho, semana oculta) y el lunes 21 (hecho).
      const map = await loadAdherenceBatch({
        client: sql,
        athlete_ids: [fx.athleteId],
        window_days: 7,
        now: new Date('2026-09-23T06:30:00Z'),
      });
      expect(map.get(String(fx.athleteId))).toMatchObject({ due: 2, done: 2, pct: 100 });
    } finally {
      await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    }
  });

  it('un atleta sin sesiones → pct null, nunca 0', async () => {
    const other = await makeCoachAndAthlete(sql);
    try {
      const map = await loadAdherenceBatch({
        client: sql,
        athlete_ids: [other.athleteId],
        window_days: 14,
        now: NOW,
      });
      expect(map.get(String(other.athleteId))).toMatchObject({ pct: null, due: 0, done: 0 });
    } finally {
      await other.cleanup();
    }
  });
});
