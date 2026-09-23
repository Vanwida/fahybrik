// El webhook de Clerk no toca el nombre del club. `coaches` es el CLUB y su
// nombre es del club (se edita en Ajustes); antes, cada cambio de perfil en Clerk
// lo sobrescribía con el nombre personal del dueño. DB real.

import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Webhook } from 'svix';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

vi.mock('@/lib/db', async () => {
  const { getTestSql: testSql } = await import('../utils/test-db');
  return { sql: testSql() };
});

const SECRET = `whsec_${Buffer.from('clerk-webhook-test-secret-32bytes!').toString('base64')}`;

function signed(payload: unknown): Request {
  const body = JSON.stringify(payload);
  const id = `msg_${Date.now()}`;
  const ts = new Date();
  const signature = new Webhook(SECRET).sign(id, ts, body);
  return new Request('http://x/api/webhooks/clerk', {
    method: 'POST',
    headers: {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(ts.getTime() / 1000)),
      'svix-signature': signature,
      'content-type': 'application/json',
    },
    body,
  });
}

describeWithDb('webhook de Clerk · el nombre del club es del club (DB real)', () => {
  const sql = getTestSql();
  let fx: Fixture;
  const clerkId = `user_club_${Date.now()}`;

  beforeAll(async () => {
    process.env.CLERK_WEBHOOK_SIGNING_SECRET = SECRET;
    fx = await makeCoachAndAthlete(sql);
    await sql`update users set clerk_user_id = ${clerkId} where id = ${fx.coachUserId}`;
    await sql`update coaches set full_name = 'Club Norte' where id = ${fx.coachId}`;
  });

  afterAll(async () => {
    await fx.cleanup();
    await closeTestSql();
  });

  it('un user.updated con el nombre del dueño no cambia coaches.full_name', async () => {
    const email = (await sql<Array<{ email: string }>>`select email from users where id = ${fx.coachUserId}`)[0]!.email;
    const { POST } = await import('@/app/api/webhooks/clerk/route');
    const res = await POST(
      signed({
        type: 'user.updated',
        data: {
          id: clerkId,
          first_name: 'Persona',
          last_name: 'Dueña',
          primary_email_address_id: 'e1',
          email_addresses: [{ id: 'e1', email_address: email }],
        },
      }),
    );
    expect(res.status).toBe(200);
    const club = await sql<Array<{ full_name: string | null }>>`select full_name from coaches where id = ${fx.coachId}`;
    expect(club[0]!.full_name).toBe('Club Norte');
  });
});
