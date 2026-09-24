// Una lesión que se da por resuelta sin fecha queda resuelta el día de HOY del
// ATLETA lesionado (DECISIONS «Qué día es en cada sitio», 2026-09-23): ni el día
// UTC ni el del club de quien la registra.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland (el atleta),
// 05:00 del 10 en Los Ángeles (su club), el 10 en UTC y en Madrid (el defecto).

import { afterAll, beforeAll, expect, it } from 'vitest';
import { createInjury, updateInjury } from '@/lib/injuries/injuries';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');

describeWithDb('lesión resuelta: el día es el del atleta (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = 'America/Los_Angeles' where id = ${fx.coachId}`;
  });

  afterAll(async () => {
    await sql`delete from injuries where athlete_id = ${fx.athleteId}`;
    await fx?.cleanup();
    await closeTestSql();
  });

  async function resolveNewInjury(recordedBy: 'athlete' | 'coach', resolved_date?: string) {
    const athleteId = BigInt(fx.athleteId);
    const created = await createInjury(athleteId, 'athlete', { zone: 'rodilla', severity: 'leve', onset_date: '2031-03-01' }, sql);
    return updateInjury(BigInt(created.id), athleteId, recordedBy, { status: 'resuelta', resolved_date }, sql, NOW);
  }

  it('en Auckland, el coach la resuelve el 11: el hoy del atleta', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    const byCoach = await resolveNewInjury('coach');
    expect(byCoach.status).toBe('resuelta');
    expect(byCoach.resolved_date).toBe('2031-03-11');

    const byAthlete = await resolveNewInjury('athlete');
    expect(byAthlete.resolved_date).toBe('2031-03-11');
  });

  it('una fecha dada manda; sin huso guardado, el defecto', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    expect((await resolveNewInjury('coach', '2031-03-05')).resolved_date).toBe('2031-03-05');

    await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    expect((await resolveNewInjury('coach')).resolved_date).toBe('2031-03-10');
  });
});
