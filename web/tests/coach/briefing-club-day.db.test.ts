// El briefing abre el día del COACH: la fecha, el saludo y la cuenta atrás van en
// el calendario de su club (su huso), no en el del servidor (UTC en producción).
// DECISIONS 2026-09-23, «Qué día es en cada sitio».
//
// El instante: lunes 1 de abril de 2030, 01:30 en Auckland (NZDT, UTC+13) =
// domingo 31 de marzo, 12:30 UTC. Las dos puertas del briefing (el panel y el
// conector MCP) se prueban con el reloj fijado en ese instante.

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import type { CoachSession } from '@/lib/auth/coach-session';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { call, connectAs, payload, seedCoachLogin } from '../utils/mcp-client';

// Solo la sesión del panel es de mentira (la frontera de auth); la del conector
// se resuelve de verdad contra la base.
vi.mock('@/lib/auth/coach-session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/coach-session')>()),
  getCoachSession: vi.fn(),
}));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { buildBriefing } = await import('@/lib/coach/briefing');
const briefingRoute = await import('@/app/api/coach/briefing/route');

const NOW = new Date('2030-03-31T12:30:00Z');

test('la fecha, el saludo y la cuenta atrás son los del club', () => {
  const b = buildBriefing({
    coach_first_name: 'Ana Pérez',
    cohort: [],
    now: NOW,
    tz: 'Pacific/Auckland',
    next_a_event: { name: 'HYROX Auckland', iso_date: '2030-04-08', athlete_count: 3 },
  });
  expect(b.iso_date).toBe('2030-04-01');
  expect(b.date_label).toBe('lunes, 1 abril 2030');
  // La 01:30 de su lunes, no las 12:30 del domingo de UTC.
  expect(b.time_of_day).toBe('morning');
  expect(b.greeting).toBe('BUENOS DÍAS, ANA');
  // Del 1 al 8 de abril del club: 7 días (desde el 31 de UTC serían 8).
  expect(b.lines.find((l) => l.id === 'event')?.primary).toBe('HYROX Auckland en 7d');
});

test('un club en Madrid: las 22:30 de su domingo son noche, aunque en UTC sean las 20:30', () => {
  const b = buildBriefing({
    coach_first_name: 'Pablo',
    cohort: [],
    now: new Date('2030-03-31T20:30:00Z'),
    tz: 'Europe/Madrid',
  });
  expect(b.iso_date).toBe('2030-03-31');
  expect(b.time_of_day).toBe('night');
});

test('un huso que no es IANA cae al defecto del producto (Madrid), no a UTC', () => {
  // 22:30 UTC del domingo = 00:30 del lunes en Madrid.
  const b = buildBriefing({
    coach_first_name: 'Pablo',
    cohort: [],
    now: new Date('2030-03-31T22:30:00Z'),
    tz: 'Marte/Olympus',
  });
  expect(b.iso_date).toBe('2030-04-01');
  expect(b.time_of_day).toBe('morning');
});

describeWithDb('el briefing del club por el panel y por el conector (DB real)', () => {
  const sql = getTestSql();
  const userIds: number[] = [];
  let fx: Fixture | null = null;
  let clerkId = '';

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    await sql`update coaches set timezone = 'Pacific/Auckland' where id = ${fx.coachId}`;
    clerkId = await seedCoachLogin({ sql, coachId: fx.coachId, tag: 'briefing-nz', userIds });
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (userIds.length > 0) {
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await fx?.cleanup();
    await closeTestSql();
  });

  test('GET /api/coach/briefing fecha el día con el huso del club', async () => {
    const club = fx!;
    vi.mocked(getCoachSession).mockResolvedValue({
      coach_id: BigInt(club.coachId),
      user_id: BigInt(club.coachUserId),
      full_name: 'Ana',
      club_name: 'Club Auckland',
      email: 'c@test.local',
    } as unknown as CoachSession);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const res = await briefingRoute.GET();
      const body = (await res.json()) as { briefing: { iso_date: string; greeting: string } };
      expect(body.briefing.iso_date).toBe('2030-04-01');
      expect(body.briefing.greeting).toBe('BUENOS DÍAS, ANA');
    } finally {
      vi.useRealTimers();
    }
  });

  test('get_briefing del conector fecha el día con el huso del club', async () => {
    const { client, close } = await connectAs(clerkId);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    try {
      const body = payload(await call(client, 'get_briefing'));
      const briefing = body.briefing as { iso_date: string; time_of_day: string };
      expect(briefing.iso_date).toBe('2030-04-01');
      expect(briefing.time_of_day).toBe('morning');
    } finally {
      vi.useRealTimers();
      await close();
    }
  });
});
