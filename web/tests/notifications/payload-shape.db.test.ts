// El payload de un aviso se guarda como OBJETO jsonb, no como una cadena.
//
// EL FALLO QUE ESTO CIERRA
// ------------------------
// `dispatchNotification` insertaba con `${JSON.stringify(payload)}::jsonb`.
// postgres.js tipa el parámetro como jsonb por culpa del cast y lo vuelve a
// serializar, así que la columna acababa guardando un jsonb de tipo *string*
// ("{\"kind\":…}"). Consecuencia: `payload_json->>'clave'` devolvía NULL
// SIEMPRE, y con ello quedaban muertos los dos anti-spam que dependen de él
// (lib/notifications/triggers.ts y lib/citas/reviews.ts, que reenviaban el mismo
// aviso una y otra vez) y la bandeja del dashboard leía un payload vacío.
//
// Va contra una rama de Neon real porque lo que se prueba ES cómo aterriza el
// valor en la columna: un cliente falso no reproduce la serialización.

import { afterAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { dispatchNotification } from '@/lib/notifications/dispatch';

describeWithDb('payload de un aviso (DB real)', () => {
  const sql = getTestSql();
  const userIds: number[] = [];

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from notifications where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    await closeTestSql();
  });

  it('se guarda como objeto, así que se puede consultar por clave', async () => {
    const user = await sql<{ id: string }[]>`
      insert into users (email, role)
      values (${`payload-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`}, 'athlete'::user_role)
      returning id::text as id
    `;
    const user_id = Number(user[0]!.id);
    userIds.push(user_id);

    const { id } = await dispatchNotification({
      sql,
      user_id: BigInt(user_id),
      type: 'coach_communication',
      payload: { communication_id: '4242', kind: 'protocol' },
    });

    const rows = await sql<{ shape: string; extracted: string | null }[]>`
      select jsonb_typeof(payload_json) as shape,
             payload_json->>'communication_id' as extracted
      from notifications where id = ${id}::bigint
    `;
    expect(rows[0]!.shape).toBe('object');
    expect(rows[0]!.extracted).toBe('4242');
  });
});
