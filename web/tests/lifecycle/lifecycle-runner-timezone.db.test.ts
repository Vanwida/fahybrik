/**
 * El barrido diario de pausas y bajas va coach a coach, con el «hoy» de CADA club
 * (su huso). Real DB; como el resto de tests/lifecycle, el runner usa `@/lib/db`
 * (DATABASE_URL) y las semillas el cliente de pruebas: los dos apuntan a la misma
 * base.
 *
 * A las 23:30 del martes 22 en Ciudad de México ya es miércoles 23 en Madrid: una
 * vuelta planeada para el 23 todavía no toca; una para el 22, sí.
 */

import { afterAll, expect, test } from 'vitest';
import { runDueLifecycleTransitions } from '@/lib/cron/lifecycle-runner';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2026-09-23T05:30:00Z');

describeWithDb('barrido de pausas en el huso del coach (DB real)', () => {
  const sql = getTestSql();
  const fixtures: Fixture[] = [];

  afterAll(async () => {
    for (const fx of fixtures) await sql`delete from athlete_pauses where athlete_id = ${fx.athleteId}`;
    while (fixtures.length) await fixtures.pop()!.cleanup();
    await closeTestSql();
  });

  async function pausedUntil(fx: Fixture, endIso: string): Promise<void> {
    await sql`update athletes set lifecycle_status = 'pausado' where id = ${fx.athleteId}`;
    await sql`
      insert into athlete_pauses (athlete_id, start_date, end_date, reason, requested_by)
      values (${fx.athleteId}, '2026-09-01'::date, ${endIso}::date, 'lesion', 'coach')
    `;
  }

  async function status(fx: Fixture): Promise<string> {
    const [r] = await sql<Array<{ s: string }>>`select lifecycle_status::text as s from athletes where id = ${fx.athleteId}`;
    return r!.s;
  }

  test('vuelve el 23: en México aún es el 22 → sigue en pausa; en Madrid ya toca', async () => {
    const mx = await makeCoachAndAthlete(sql);
    const md = await makeCoachAndAthlete(sql);
    fixtures.push(mx, md);
    await sql`update coaches set timezone = 'America/Mexico_City' where id = ${mx.coachId}`;
    await pausedUntil(mx, '2026-09-23');
    await pausedUntil(md, '2026-09-23');

    const r1 = await runDueLifecycleTransitions({ now: NOW, coach_id: mx.coachId });
    expect(r1.days[String(mx.coachId)]).toBe('2026-09-22');
    expect(await status(mx)).toBe('pausado');

    const r2 = await runDueLifecycleTransitions({ now: NOW, coach_id: md.coachId });
    expect(r2.days[String(md.coachId)]).toBe('2026-09-23');
    expect(r2.resumed).toBe(1);
    expect(await status(md)).toBe('activo');
  });
});
