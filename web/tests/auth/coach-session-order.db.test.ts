// resolveCoachSession con `limit 1` DETERMINISTA (obra 0 multi-coach): un humano
// con membresía en DOS clubes resuelve SIEMPRE al de la membresía más antigua
// (cm.added_at asc), nunca al azar del plan de ejecución. La selección explícita
// de club llega con la puerta (obra 2).
//
// getCoachSession real contra DB real; solo se mockea Clerk (la frontera de
// auth). El módulo usa @/lib/db — el runner apunta DATABASE_URL y
// TEST_DATABASE_URL a la misma rama.

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), currentUser: vi.fn() }));

const { auth } = await import('@clerk/nextjs/server');
const { getCoachSession } = await import('@/lib/auth/coach-session');

describeWithDb('getCoachSession — membresía más antigua gana (DB real)', () => {
  const sql = getTestSql();
  const userIds: number[] = [];
  const coachIds: number[] = [];
  let memberUserId = 0;
  let oldClubId = 0;
  let newClubId = 0;
  const clerkId = `clerk-order-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  const uniqueEmail = (tag: string) =>
    `cso-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  async function seedUser(role: 'coach', clerk: string | null): Promise<number> {
    const rows = await sql<{ id: string }[]>`
      insert into users (email, role, clerk_user_id, full_name)
      values (${uniqueEmail(role)}, ${role}::user_role, ${clerk}, 'CSO User')
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    userIds.push(id);
    return id;
  }

  async function seedClub(name: string): Promise<number> {
    const ownerId = await seedUser('coach', null);
    const rows = await sql<{ id: string }[]>`
      insert into coaches (user_id, full_name) values (${ownerId}, ${name})
      returning id::text as id
    `;
    const id = Number(rows[0]!.id);
    coachIds.push(id);
    return id;
  }

  beforeAll(async () => {
    memberUserId = await seedUser('coach', clerkId);
    oldClubId = await seedClub('Club antiguo');
    newClubId = await seedClub('Club nuevo');
    // Dos membresías vivas: la del club "antiguo" es 10 días más vieja.
    await sql`
      insert into coach_members (coach_id, user_id, membership_role, added_at)
      values
        (${oldClubId}, ${memberUserId}, 'coach', now() - interval '10 days'),
        (${newClubId}, ${memberUserId}, 'coach', now() - interval '1 day')
    `;
    vi.mocked(auth).mockResolvedValue({ userId: clerkId, sessionId: 'sess-1' } as never);
  });

  afterAll(async () => {
    await sql`delete from coach_members where user_id = ${memberUserId}`;
    if (coachIds.length) await sql`delete from coaches where id in ${sql(coachIds)}`;
    await sql`delete from user_roles where user_id in ${sql(userIds)}`;
    if (userIds.length) await sql`delete from users where id in ${sql(userIds)}`;
    await closeTestSql();
  });

  test('con dos clubes, resuelve SIEMPRE la membresía más antigua', async () => {
    const s1 = await getCoachSession();
    expect(s1).not.toBeNull();
    expect(Number(s1!.coach_id)).toBe(oldClubId);
    expect(s1!.club_name).toBe('Club antiguo');

    // Determinismo: N lecturas, mismo club.
    for (let i = 0; i < 3; i += 1) {
      const s = await getCoachSession();
      expect(Number(s!.coach_id)).toBe(oldClubId);
    }
  });

  test('si la otra membresía pasa a ser la más antigua, el pick la sigue (es added_at, no suerte)', async () => {
    await sql`
      update coach_members set added_at = now() - interval '30 days'
      where coach_id = ${newClubId} and user_id = ${memberUserId}
    `;
    const s = await getCoachSession();
    expect(Number(s!.coach_id)).toBe(newClubId);
    expect(s!.club_name).toBe('Club nuevo');
  });
});
