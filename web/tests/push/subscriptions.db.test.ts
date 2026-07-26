// Suscripciones Web Push contra base de datos real.
//
// Lo que se prueba ES el SQL del upsert: que un endpoint es de UN navegador y
// no de una persona (re-suscribir reasigna al usuario actual), que re-suscribir
// resucita una suscripción marcada muerta, y que la baja está acotada al dueño.
// Un mock no ejercitaría el on-conflict ni el unique.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  deleteWebPushSubscription,
  upsertWebPushSubscription,
} from '@/lib/push/webpush';

describeWithDb('suscripciones Web Push (DB real)', () => {
  const sql = getTestSql();

  let coachA = BigInt(0);
  let coachB = BigInt(0);
  const endpoint = `https://push.test.local/reg/${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const uniqueEmail = (tag: string) =>
    `push-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  beforeAll(async () => {
    const a = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('a')}, 'coach'::user_role)
      returning id::text as id
    `;
    coachA = BigInt(a[0]!.id);
    const b = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail('b')}, 'coach'::user_role)
      returning id::text as id
    `;
    coachB = BigInt(b[0]!.id);
  });

  afterAll(async () => {
    await sql`delete from web_push_subscriptions where endpoint = ${endpoint}`;
    await sql`delete from users where id in (${coachA as unknown as number}, ${coachB as unknown as number})`;
    await closeTestSql();
  });

  it('el alta guarda la suscripción del navegador', async () => {
    await upsertWebPushSubscription({
      sql,
      user_id: coachA,
      subscription: { endpoint, p256dh: 'clave-p256', auth: 'secreto', user_agent: 'test-ua' },
    });
    const rows = await sql<{ user_id: string; p256dh: string }[]>`
      select user_id::text, p256dh from web_push_subscriptions where endpoint = ${endpoint}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(coachA.toString());
    expect(rows[0]!.p256dh).toBe('clave-p256');
  });

  it('re-suscribir desde otro usuario REASIGNA el navegador y limpia el fallo', async () => {
    // Simula una suscripción muerta (el push service la dio de baja)…
    await sql`
      update web_push_subscriptions
      set last_failure = 'http_410', failed_at = now()
      where endpoint = ${endpoint}
    `;
    // …y otro usuario activando avisos en ese MISMO navegador.
    await upsertWebPushSubscription({
      sql,
      user_id: coachB,
      subscription: { endpoint, p256dh: 'clave-nueva', auth: 'secreto-2', user_agent: 'test-ua' },
    });
    const rows = await sql<
      { user_id: string; p256dh: string; last_failure: string | null }[]
    >`
      select user_id::text, p256dh, last_failure
      from web_push_subscriptions where endpoint = ${endpoint}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(coachB.toString());
    expect(rows[0]!.p256dh).toBe('clave-nueva');
    expect(rows[0]!.last_failure).toBeNull();
  });

  it('la baja está acotada al dueño: otro usuario no borra tu suscripción', async () => {
    const removedByStranger = await deleteWebPushSubscription({
      sql,
      user_id: coachA, // ya no es el dueño (se reasignó a B)
      endpoint,
    });
    expect(removedByStranger).toBe(false);

    const removedByOwner = await deleteWebPushSubscription({ sql, user_id: coachB, endpoint });
    expect(removedByOwner).toBe(true);

    const rows = await sql`select 1 from web_push_subscriptions where endpoint = ${endpoint}`;
    expect(rows).toHaveLength(0);
  });
});
