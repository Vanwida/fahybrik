/**
 * Las rutas nuevas contra una base REAL (rama Neon desechable; se salta sin
 * TEST_DATABASE_URL): el detalle de sesión para el atleta (su sesión 200, la
 * ajena 404, un id roto 400) y para su coach (su atleta 200, el de otro club
 * 404), y el readiness de hoy con las bandas del coach servidas por la API (P14).
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql, settleCleanup } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

let atletaSesion: { athlete_id: bigint; user_id: bigint; full_name: string } | null = null;
let coachSesion: { coach_id: number } | null = null;
vi.mock('@/lib/auth/athlete-session', () => ({ getAthleteSessionFromBearer: async () => atletaSesion }));
vi.mock('@/lib/auth/require-coach', () => ({
  requireCoach: async () =>
    coachSesion ? { ok: true, session: coachSesion } : { ok: false, response: new Response(null, { status: 401 }) },
}));

const rutaAtleta = await import('@/app/api/athlete/analytics/sesion/[executionId]/route');
const rutaCoach = await import('@/app/api/coach/athletes/[id]/analytics/sesion/[executionId]/route');
const rutaReadiness = await import('@/app/api/athlete/readiness/today/route');

const pedir = (url: string) => new Request(`http://localhost${url}`, { headers: { authorization: 'Bearer test' } });

describeWithDb('rutas del detalle de sesión y del readiness (base real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  let otro: Fixture;
  let suya: number;
  let ajena: number;

  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    otro = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'Europe/Madrid' where id in (${fx.athleteId}, ${otro.athleteId})`;
    await sql`insert into coach_signal_thresholds (coach_id, readiness_ok_min, readiness_caution_min, readiness_max_age_days) values (${fx.coachId}, 75, 50, 3)`;
    const nueva = async (athleteId: number) => {
      const [r] = await sql<Array<{ id: string }>>`
        insert into workout_executions (athlete_id, started_at, ended_at, total_duration_seconds, perceived_exertion, source)
        values (${athleteId}, now() - interval '2 hours', now() - interval '1 hour', 3600, 6, 'manual')
        returning id::text as id
      `;
      return Number(r!.id);
    };
    suya = await nueva(fx.athleteId);
    ajena = await nueva(otro.athleteId);
    // Un check-in de hoy: el readiness tiene con qué calcularse.
    await sql`insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score) values (${fx.athleteId}, (now() at time zone 'Europe/Madrid')::date, now(), 60)`;
  }, 120_000);

  afterAll(async () => {
    await settleCleanup(async () => {
      for (const a of [fx.athleteId, otro.athleteId]) {
        await sql`delete from workout_executions where athlete_id = ${a}`;
        await sql`delete from athlete_daily_readiness_snapshots where athlete_id = ${a}`;
      }
      await sql`delete from coach_signal_thresholds where coach_id = ${fx.coachId}`;
      await fx.cleanup();
      await otro.cleanup();
    });
    await closeTestSql();
  }, 120_000);

  test('el atleta: su sesión, 200; la ajena, 404; un id roto, 400', async () => {
    atletaSesion = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'A' };
    const ok = await rutaAtleta.GET(pedir(`/api/athlete/analytics/sesion/${suya}`), { params: Promise.resolve({ executionId: String(suya) }) });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { execution_id: string; rpe: number; pendientes: string[] };
    expect(body).toMatchObject({ execution_id: String(suya), rpe: 6, pendientes: ['cumplimiento'] });
    const noSuya = await rutaAtleta.GET(pedir(`/api/athlete/analytics/sesion/${ajena}`), { params: Promise.resolve({ executionId: String(ajena) }) });
    expect(noSuya.status).toBe(404);
    const rota = await rutaAtleta.GET(pedir('/api/athlete/analytics/sesion/abc'), { params: Promise.resolve({ executionId: 'abc' }) });
    expect(rota.status).toBe(400);
  });

  test('el coach: su atleta, 200 y lo mismo que el atleta; el de otro club, 404', async () => {
    coachSesion = { coach_id: fx.coachId };
    const ok = await rutaCoach.GET(pedir(`/api/coach/athletes/${fx.athleteId}/analytics/sesion/${suya}`), {
      params: Promise.resolve({ id: String(fx.athleteId), executionId: String(suya) }),
    });
    expect(ok.status).toBe(200);
    atletaSesion = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'A' };
    const comoAtleta = await rutaAtleta.GET(pedir(`/api/athlete/analytics/sesion/${suya}`), { params: Promise.resolve({ executionId: String(suya) }) });
    expect(await ok.json()).toEqual(await comoAtleta.json());
    const otroClub = await rutaCoach.GET(pedir(`/api/coach/athletes/${otro.athleteId}/analytics/sesion/${ajena}`), {
      params: Promise.resolve({ id: String(otro.athleteId), executionId: String(ajena) }),
    });
    expect(otroClub.status).toBe(404);
  });

  test('el readiness de hoy lleva las bandas de SU coach y la banda ya decidida (P14)', async () => {
    atletaSesion = { athlete_id: BigInt(fx.athleteId), user_id: BigInt(fx.athleteUserId), full_name: 'A' };
    const res = await rutaReadiness.GET(pedir('/api/athlete/readiness/today'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readiness: { score: number } | null; bands: Record<string, number>; band: string | null };
    expect(body.bands).toEqual({ ok_min: 75, caution_min: 50, max_age_days: 3 });
    expect(body.readiness).not.toBeNull();
    const score = body.readiness!.score;
    expect(body.band).toBe(score >= 75 ? 'ok' : score >= 50 ? 'caution' : 'low');
  });
});
