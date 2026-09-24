// «Una marca no puede tener fecha futura» se decide contra el día del ATLETA
// (DECISIONS «Qué día es en cada sitio», 2026-09-23), no contra el día UTC.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland, 13:00 del 10 en
// Madrid (el defecto). Quien corrió su 10K en Auckland lo registra con fecha del
// 11: es su hoy, y el día UTC (el 10) lo rechazaba como futuro.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { registerRaceMark } from '@/lib/athlete/marks';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');

describeWithDb('registrar una carrera: «futuro» es después de SU hoy (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
  });

  afterAll(async () => {
    // The coach's «marca nueva» notifications go with his user in cleanup.
    await sql`delete from athlete_benchmarks where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  const register = (date: string) =>
    registerRaceMark({ athlete_id: BigInt(fx.athleteId), slug: 'run_10k', value: 2700, date, now: NOW, client: sql });

  it('en Auckland, su hoy (el 11) se acepta y su mañana (el 12) no', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;

    const today = await register('2031-03-11');
    expect(today.ok).toBe(true);
    const stored = await sql<{ n: number }[]>`
      select count(*)::int as n from athlete_benchmarks where athlete_id = ${fx.athleteId} and exercise_slug = 'run_10k'
    `;
    expect(stored[0]!.n).toBe(1);

    expect(await register('2031-03-12')).toEqual({ ok: false, error: 'invalid_date' });
  });

  it('la carrera se guarda en SU día: leída en su calendario, es la fecha que dio', async () => {
    // Los Ángeles (UTC−7/−8): una fecha pelada guardada como medianoche UTC se lee
    // allí como el día anterior. Una marca del 5, en su calendario, es del 5.
    await sql`update athletes set timezone = 'America/Los_Angeles' where id = ${fx.athleteId}`;
    expect((await register('2031-03-05')).ok).toBe(true);
    const row = await sql<{ local_day: string }[]>`
      select to_char(recorded_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD') as local_day
      from athlete_benchmarks
      where athlete_id = ${fx.athleteId} and exercise_slug = 'run_10k'
      order by id desc limit 1
    `;
    expect(row[0]!.local_day).toBe('2031-03-05');
  });

  it('sin huso guardado, el defecto: el 11 todavía es futuro', async () => {
    await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    expect(await register('2031-03-11')).toEqual({ ok: false, error: 'invalid_date' });
    expect((await register('2031-03-10')).ok).toBe(true);
  });
});
