// Una baja libera la plaza en la cola de SU coach, no en la de todos. Antes
// `bajaAthlete` llamaba al barrido sin coach (el del cron) y cada baja movía la
// lista de espera de todos los clubes con cupo.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { bajaAthlete } from '@/lib/coach/athlete-lifecycle';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';

describeWithDb('baja → lista de espera de su coach (DB real)', () => {
  const sql = getTestSql();
  let A: Fixture;
  let B: Fixture;
  const leads: Record<'a' | 'b', number> = { a: 0, b: 0 };
  const tag = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

  beforeAll(async () => {
    A = await makeCoachAndAthlete(sql);
    B = await makeCoachAndAthlete(sql);
    // A: lleno (1 de 1, con suscripción). B: ya tenía un hueco libre.
    await sql`insert into subscriptions (user_id, plan_type, status) values (${A.athleteUserId}, 'individual', 'active')`;
    await sql`update coaches set max_athletes = 1 where id = any(${[A.coachId, B.coachId]}::bigint[])`;
    for (const [key, coach] of [['a', A.coachId], ['b', B.coachId]] as const) {
      const r = await sql<{ id: string }[]>`
        insert into leads (email, nombre, status, source, coach_id, objetivo, submitted_at, waitlisted_at)
        values (${`wl-${key}-${tag}@test.local`}, ${`Lead ${key}`}, 'nuevo'::lead_status, 'onboarding_web',
                ${coach}, 'primer_hyrox', now(), now() - interval '1 day')
        returning id::text as id`;
      leads[key] = Number(r[0]!.id);
    }
  });

  afterAll(async () => {
    await sql`delete from leads where id = any(${[leads.a, leads.b]}::bigint[])`;
    await sql`delete from subscriptions where user_id = ${A.athleteUserId}`;
    await sql`update coaches set max_athletes = null where id = any(${[A.coachId, B.coachId]}::bigint[])`;
    await A.cleanup();
    await B.cleanup();
    await closeTestSql();
  });

  test('la baja de un atleta de A libera al primero de la cola de A y deja la de B quieta', async () => {
    await bajaAthlete({ athlete_id: BigInt(A.athleteId), reason: 'otro' });
    const rows = await sql<{ id: string; released: boolean }[]>`
      select id::text as id, waitlist_released_at is not null as released
      from leads where id = any(${[leads.a, leads.b]}::bigint[])
    `;
    const released = new Map(rows.map((r) => [Number(r.id), r.released]));
    expect(released.get(leads.a)).toBe(true);
    expect(released.get(leads.b)).toBe(false);
  });
});
