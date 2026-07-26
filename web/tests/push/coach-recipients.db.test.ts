// A quién llega "un aviso para el coach", contra base de datos real.
//
// EL FALLO QUE ESTO CIERRA: la cuenta de coach es un workspace con miembros
// (cada persona entra con SU usuario), pero los avisos iban a coaches.user_id —
// el usuario legacy del club, con el que ya nadie inicia sesión. Ni push ni
// bandeja llegaban a nadie. El reparto correcto es a TODOS los miembros
// activos, con el legacy como respaldo para coaches sin miembros.

import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { coachRecipientUserIds } from '@/lib/notifications/dispatch';

describeWithDb('destinatarios de avisos del coach (DB real)', () => {
  const sql = getTestSql();

  let legacyUserId = 0;
  let memberA = 0;
  let memberB = 0;
  let removedMember = 0;
  let coachId = BigInt(0);

  const uniqueEmail = (tag: string) =>
    `recip-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  const insertUser = async (tag: string): Promise<number> => {
    const rows = await sql<{ id: string }[]>`
      insert into users (email, role) values (${uniqueEmail(tag)}, 'coach'::user_role)
      returning id::text as id
    `;
    return Number(rows[0]!.id);
  };

  beforeAll(async () => {
    legacyUserId = await insertUser('legacy');
    memberA = await insertUser('a');
    memberB = await insertUser('b');
    removedMember = await insertUser('gone');
    const coach = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${legacyUserId}, 'Club de prueba')
      returning id::text as id
    `;
    coachId = BigInt(coach[0]!.id);
  });

  afterAll(async () => {
    await sql`delete from coach_members where coach_id = ${coachId as unknown as number}`;
    await sql`delete from coaches where id = ${coachId as unknown as number}`;
    await sql`delete from users where id in (${legacyUserId}, ${memberA}, ${memberB}, ${removedMember})`;
    await closeTestSql();
  });

  it('sin miembros: respaldo al usuario legacy del club', async () => {
    const ids = await coachRecipientUserIds(sql, coachId);
    expect(ids.map(String)).toEqual([String(legacyUserId)]);
  });

  it('con miembros: TODOS los activos y NUNCA el legacy ni los dados de baja', async () => {
    await sql`
      insert into coach_members (coach_id, user_id, membership_role)
      values (${coachId as unknown as number}, ${memberA}, 'coach'),
             (${coachId as unknown as number}, ${memberB}, 'coach'),
             (${coachId as unknown as number}, ${removedMember}, 'coach')
    `;
    await sql`
      update coach_members set removed_at = now()
      where coach_id = ${coachId as unknown as number} and user_id = ${removedMember}
    `;
    const ids = (await coachRecipientUserIds(sql, coachId)).map(String).sort();
    expect(ids).toEqual([String(memberA), String(memberB)].sort());
  });
});
