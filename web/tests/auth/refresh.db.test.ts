/**
 * «Los atletas siguen dentro» (fase 1, auditoría E2/E3): con un token válido la app
 * pide otro que dura el plazo entero desde AHORA; el viejo sigue valiendo hasta su
 * fecha (revocarlo convertiría en 401 cualquier petición en vuelo: el bucle de
 * salidas). Un token revocado o de coach no renueva nada.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete } from '../utils/db-fixtures';

describeWithDb('POST /api/auth/refresh', () => {
  const sql = getTestSql();
  let POST: (req: Request) => Promise<Response>;
  let session: typeof import('@/lib/auth/session');
  let config: typeof import('@/lib/auth/config');

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    process.env.AUTH_SECRET ||= 'refresh-db-test-secret-override-in-ci';
    ({ POST } = await import('@/app/api/auth/refresh/route'));
    session = await import('@/lib/auth/session');
    config = await import('@/lib/auth/config');
  });

  afterAll(async () => {
    await closeTestSql();
  });

  const call = (token: string) =>
    POST(new Request('http://t/api/auth/refresh', { method: 'POST', headers: { authorization: `Bearer ${token}` } }));

  test('un token válido da otro que dura el plazo entero; el viejo sigue valiendo', async () => {
    const A = await makeCoachAndAthlete(sql);
    try {
      const old = await session.issueSession({
        user_id: BigInt(A.athleteUserId), audience: session.audiences.athlete, ttl_seconds: 3600,
      });
      const res = await call(old.token);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { session_token: string; expires_at: string };
      expect(body.session_token).not.toBe(old.token);

      const fresh = await session.verifySession(body.session_token, session.audiences.athlete);
      expect(fresh?.user_id).toBe(BigInt(A.athleteUserId));
      const ttlMs = config.AUTH_CONFIG.athleteSessionTtlSeconds * 1000;
      expect(Math.abs(new Date(body.expires_at).getTime() - (Date.now() + ttlMs))).toBeLessThan(60_000);

      // El viejo no se revoca: caduca en su fecha.
      expect(await session.verifySession(old.token, session.audiences.athlete)).not.toBeNull();
    } finally {
      await sql`delete from sessions where user_id = ${A.athleteUserId}`;
      await A.cleanup();
    }
  });

  test('un token revocado, uno de coach o ninguno: 401', async () => {
    const A = await makeCoachAndAthlete(sql);
    try {
      const revoked = await session.issueSession({
        user_id: BigInt(A.athleteUserId), audience: session.audiences.athlete, ttl_seconds: 3600,
      });
      await session.revokeSession(revoked.jti);
      expect((await call(revoked.token)).status).toBe(401);

      const coach = await session.issueSession({
        user_id: BigInt(A.coachUserId), audience: session.audiences.coach, ttl_seconds: 3600,
      });
      expect((await call(coach.token)).status).toBe(401);

      const none = await POST(new Request('http://t/api/auth/refresh', { method: 'POST' }));
      expect(none.status).toBe(401);
    } finally {
      await sql`delete from sessions where user_id in ${sql([A.athleteUserId, A.coachUserId])}`;
      await A.cleanup();
    }
  });
});
