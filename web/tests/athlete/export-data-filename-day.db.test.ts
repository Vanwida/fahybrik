// La descarga de datos del atleta (RGPD) lleva en el nombre la fecha de SU día
// (DECISIONS «Qué día es en cada sitio», 2026-09-23), no la del día UTC.
//
// El instante: 10 mar 2031, 12:00 UTC → 01:00 del 11 en Auckland, 13:00 del 10 en
// Madrid (el defecto). La ruta no recibe un reloj: se fija el de Node.

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { getTestSql: testSql } = await import('../utils/test-db');
  return { sql: testSql() };
});
vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: vi.fn() }));
vi.mock('@/lib/security/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/rate-limit')>();
  return {
    ...actual,
    withRateLimit: vi.fn(async () => ({ allowed: true, remaining: 1, retryAfter: 0, windowStart: new Date(0) })),
  };
});

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

const NOW = new Date('2031-03-10T12:00:00Z');

describeWithDb('exportación de datos: el fichero lleva SU fecha (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    vi.mocked(getAthleteSessionFromBearer).mockResolvedValue({
      user_id: BigInt(fx.athleteUserId),
      athlete_id: BigInt(fx.athleteId),
      email: 'export@test.local',
      full_name: 'Test Athlete',
      jti: 'test-jti',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await fx?.cleanup();
    await closeTestSql();
  });

  async function downloadName(): Promise<string | null> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const { GET } = await import('@/app/api/athlete/export-data/route');
    const res = await GET(new Request('http://x/api/athlete/export-data', { headers: { authorization: 'Bearer t' } }));
    expect(res.status).toBe(200);
    return res.headers.get('content-disposition');
  }

  it('en Auckland, el 11', async () => {
    await sql`update athletes set timezone = 'Pacific/Auckland' where id = ${fx.athleteId}`;
    expect(await downloadName()).toBe(`attachment; filename="fahybrik-datos-${fx.athleteId}-2031-03-11.json"`);
  });

  it('sin huso guardado, el defecto: el 10', async () => {
    await sql`update athletes set timezone = null where id = ${fx.athleteId}`;
    expect(await downloadName()).toBe(`attachment; filename="fahybrik-datos-${fx.athleteId}-2031-03-10.json"`);
  });
});
