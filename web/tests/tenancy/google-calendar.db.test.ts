/**
 * Google Calendar por coach (hallazgo P0 nº3). Había UN token para toda la
 * plataforma: el siguiente coach que conectaba se quedaba las llamadas y
 * revisiones de todos los clubs en su calendario. Dos coaches reales en la BD de
 * pruebas; la red (Google) y la sesión se fingen.
 */
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

process.env.AUTH_SECRET ??= 'test-auth-secret-value';
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET ??= 'test-client-secret';

vi.mock('@/lib/auth/coach-session', () => ({ getCoachSession: vi.fn() }));
vi.mock('@/lib/coach/club-notify', () => ({ resolveClubNotifyEmail: vi.fn(async () => null) }));

const { getCoachSession } = await import('@/lib/auth/coach-session');
const { getGoogleConnection, saveGoogleConnection } = await import('@/lib/citas/google-tokens');
const { createMeeting } = await import('@/lib/citas/meeting');
const { createSignedState } = await import('@/lib/citas/google');
const { GET: callback } = await import('@/app/api/citas/google/callback/route');

type CoachSession = NonNullable<Awaited<ReturnType<typeof getCoachSession>>>;

/** Google fingido: token → access; calendar → evento. Registra qué refresh_token se usó. */
function fakeGoogle() {
  const used: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === 'https://oauth2.googleapis.com/token') {
        const body = new URLSearchParams(String(init?.body ?? ''));
        if (body.get('grant_type') === 'authorization_code') {
          return new Response(JSON.stringify({ refresh_token: 'RT-NEW', access_token: 'AT' }), { status: 200 });
        }
        used.push(body.get('refresh_token') ?? '');
        return new Response(JSON.stringify({ access_token: 'AT' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'evt', hangoutLink: 'https://meet.google.com/x' }), { status: 200 });
    }),
  );
  return used;
}

describeWithDb('tenancy — Google Calendar por coach', () => {
  const sql = getTestSql();
  let A: Fixture;
  let B: Fixture;

  beforeAll(async () => {
    A = await makeCoachAndAthlete(sql);
    B = await makeCoachAndAthlete(sql);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  afterAll(async () => {
    await sql`delete from coach_google_connections where coach_id in (${A.coachId}, ${B.coachId})`;
    await A.cleanup();
    await B.cleanup();
    await closeTestSql();
  });

  const meeting = (coach_id: number | null) =>
    createMeeting({
      appointmentId: '1',
      start: new Date('2026-10-05T09:00:00Z'),
      durationMinutes: 30,
      leadEmail: 'lead@test.local',
      leadName: 'Lead',
      modality: 'video',
      coach_id,
    });

  test('la cita de un coach usa SU conexión; sin conexión (o sin coach) no hay evento', async () => {
    await saveGoogleConnection(A.coachId, 'RT-A', sql);
    expect(await getGoogleConnection(A.coachId, sql)).toEqual({ refresh_token: 'RT-A', calendar_id: 'primary' });
    expect(await getGoogleConnection(B.coachId, sql)).toBeNull();

    const used = fakeGoogle();
    expect((await meeting(B.coachId)).meet_link).toBeNull();
    expect((await meeting(null)).meet_link).toBeNull();
    expect(used).toEqual([]); // ni el calendario de A ni ningún otro

    expect((await meeting(A.coachId)).meet_link).toBe('https://meet.google.com/x');
    expect(used).toEqual(['RT-A']);
  });

  test('el callback guarda la conexión SOLO para el coach que la empezó y está dentro', async () => {
    fakeGoogle();
    const stateA = createSignedState(BigInt(A.coachId));
    const cb = () => callback(new Request(`http://localhost/api/citas/google/callback?code=c&state=${encodeURIComponent(stateA)}`));

    // B, con el enlace de A: no se guarda nada ni para A ni para B.
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(B.coachId) } as unknown as CoachSession);
    const bad = await cb();
    expect(bad.status).toBe(400);
    expect(await getGoogleConnection(B.coachId, sql)).toBeNull();
    expect((await getGoogleConnection(A.coachId, sql))?.refresh_token).toBe('RT-A');

    // A, con su propio enlace: renueva SU conexión; la de B sigue sin existir.
    vi.mocked(getCoachSession).mockResolvedValue({ coach_id: BigInt(A.coachId) } as unknown as CoachSession);
    const ok = await cb();
    expect(ok.status).toBe(200);
    expect((await getGoogleConnection(A.coachId, sql))?.refresh_token).toBe('RT-NEW');
    expect(await getGoogleConnection(B.coachId, sql)).toBeNull();
  });
});
