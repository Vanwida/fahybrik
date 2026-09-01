// El conector resuelve el coach desde el userId del token, no desde una cookie.
//
// QUÉ PROTEGE ESTO
// ----------------
// `getCoachSessionForClerkUser` es la ÚNICA puerta entre un token OAuth y los
// datos de un club. Si devolviera un `coach_id` de más, el asistente de un coach
// vería atletas de otro; si devolviera uno de menos, el conector estaría muerto.
// Y como comparte resolver con la sesión del panel, esta suite es también la red
// que avisa si alguien toca esa query pensando que solo afecta al navegador.
//
// Va contra una rama de Neon real porque lo que se prueba ES la query: qué gana
// entre `coach_members` y el enlace legacy `coaches.user_id`, y qué pasa cuando
// no hay ninguno de los dos. Un cliente falso solo probaría el mock.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { getCoachSessionForClerkUser } from '@/lib/auth/coach-session';

function uniqClerkId(tag: string): string {
  return `clerk-mcp-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

describeWithDb('MCP · coach desde el userId de Clerk (DB real)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const userIds: number[] = [];

  let clubOwned: Fixture;
  let clubJoined: Fixture;

  async function seedUser(tag: string, clerkUserId: string | null): Promise<number> {
    const rows = await sql<Array<{ id: string }>>`
      insert into users (email, role, clerk_user_id, full_name)
      values (
        ${`mcp-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`},
        'coach',
        ${clerkUserId},
        ${`Persona ${tag}`}
      )
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    userIds.push(id);
    return id;
  }

  beforeAll(async () => {
    // El runner apunta DATABASE_URL y TEST_DATABASE_URL a la misma rama; este
    // select despierta el endpoint antes de la primera insercción.
    await sql`select 1 as ok`;
    clubOwned = await makeCoachAndAthlete(sql);
    clubJoined = await makeCoachAndAthlete(sql);
    cleanups.push(clubOwned.cleanup, clubJoined.cleanup);
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await sql`delete from coach_members where user_id = any(${userIds}::bigint[])`;
      await sql`delete from user_roles where user_id = any(${userIds}::bigint[])`;
      await sql`delete from users where id = any(${userIds}::bigint[])`;
    }
    while (cleanups.length) await cleanups.pop()!();
    await closeTestSql();
  });

  test('con membresía en un club → ese coach_id', async () => {
    const clerkUserId = uniqClerkId('member');
    const userId = await seedUser('member', clerkUserId);
    await sql`
      insert into coach_members (coach_id, user_id, membership_role)
      values (${clubJoined.coachId}, ${userId}, 'coach')
    `;

    const session = await getCoachSessionForClerkUser(clerkUserId);

    expect(session).not.toBeNull();
    expect(session!.coach_id).toBe(BigInt(clubJoined.coachId));
    expect(session!.user_id).toBe(BigInt(userId));
    // `full_name` es la PERSONA (para atribuir "lo editó X"), no el club.
    expect(session!.full_name).toBe('Persona member');
    expect(session!.club_name).toBe('Test Coach');
  });

  test('sin membresía pero dueño de un club (enlace legacy) → su propio coach_id', async () => {
    // `makeCoachAndAthlete` crea `coaches.user_id` y NINGUNA fila en
    // coach_members: exactamente el coach cuya membresía no se ha backfilleado.
    // Tiene que seguir entrando, o la migración 0113 deja gente fuera.
    const clerkUserId = uniqClerkId('owner');
    await sql`
      update users set clerk_user_id = ${clerkUserId}
      where id = ${clubOwned.coachUserId}
    `;

    const session = await getCoachSessionForClerkUser(clerkUserId);

    expect(session).not.toBeNull();
    expect(session!.coach_id).toBe(BigInt(clubOwned.coachId));
  });

  test('la membresía gana al enlace legacy cuando discrepan', async () => {
    // La misma persona es dueña de un club Y miembro de otro. El resolver tiene
    // que elegir la membresía: es la fuente de autorización desde la 0113, y el
    // enlace 1:1 solo sobrevive como red para los no backfilleados.
    const clerkUserId = uniqClerkId('both');
    const userId = await seedUser('both', clerkUserId);
    const ownClub = await sql<Array<{ id: string }>>`
      insert into coaches (user_id, full_name) values (${userId}, 'Club propio')
      returning id::text as id
    `;
    const ownClubId = Number(ownClub[0]!.id);
    cleanups.push(async () => {
      await sql`delete from coaches where id = ${ownClubId}`;
    });
    await sql`
      insert into coach_members (coach_id, user_id, membership_role)
      values (${clubJoined.coachId}, ${userId}, 'coach')
    `;

    const session = await getCoachSessionForClerkUser(clerkUserId);

    expect(session!.coach_id).toBe(BigInt(clubJoined.coachId));
    expect(session!.coach_id).not.toBe(BigInt(ownClubId));
  });

  test('usuario real que no es coach de nadie → null', async () => {
    // Ni membresía ni club propio. Es el caso del atleta (o del lead) que conecta
    // el asistente con su cuenta: token válido, cero acceso.
    const clerkUserId = uniqClerkId('nobody');
    await seedUser('nobody', clerkUserId);

    await expect(getCoachSessionForClerkUser(clerkUserId)).resolves.toBeNull();
  });

  test('userId de Clerk desconocido → null', async () => {
    await expect(getCoachSessionForClerkUser(uniqClerkId('ghost'))).resolves.toBeNull();
  });

  test('membresía retirada → null (no sigue entrando por la puerta de ayer)', async () => {
    const clerkUserId = uniqClerkId('removed');
    const userId = await seedUser('removed', clerkUserId);
    await sql`
      insert into coach_members (coach_id, user_id, membership_role, removed_at)
      values (${clubJoined.coachId}, ${userId}, 'coach', now())
    `;

    await expect(getCoachSessionForClerkUser(clerkUserId)).resolves.toBeNull();
  });
});
