/**
 * Real-DB test for the coach TEAM model (migration 0113 + lib/auth): three people
 * operate the SAME club, and the allowlist is the closed login door (#39).
 *
 * Covers the two new building blocks:
 *   - approvedCoachTarget(email): only an `status='approved'` row with a non-null
 *     coach_id returns a club; everything else (unknown / rejected / null club)
 *     returns null — the door.
 *   - provisionCoachMember(identity, coachId): joins the EXISTING club via
 *     coach_members WITHOUT minting a new coaches row, fills users.full_name for
 *     attribution, grants the coach role, and is idempotent.
 *
 * Runs against a real Neon branch (no SQL mocked) so the FK/PK/CHECK constraints
 * of coach_members are live. Skipped explicitly when TEST_DATABASE_URL is unset.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { provisionCoachMember } from '@/lib/auth/users';
import { approvedCoachTarget } from '@/lib/auth/allowlist';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('coach team membership + allowlist door (real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];
  let clubCoachId = BigInt(0);
  // The club fixture lives for the whole suite — kept OUT of the per-test purge
  // (afterEach) so tests 2..n still have a club to join; cleaned in afterAll.
  const clubOwnerEmail = `team-owner-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

  function uniqueEmail(tag: string): string {
    // Lowercase: emails are case-insensitive identities and are stored lowercase
    // by provisioning, so the value we track must already be the stored form.
    const e = `team-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`.toLowerCase();
    emails.push(e);
    return e;
  }

  beforeAll(async () => {
    // A pre-existing club to join: one coaches row owned by a throwaway user.
    const owner = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${clubOwnerEmail}, 'coach')
      returning id::text as id
    `;
    const coach = await sql<Array<{ id: string }>>`
      insert into coaches (user_id, full_name) values (${BigInt(owner[0]!.id)}, 'Test Club')
      returning id::text as id
    `;
    clubCoachId = BigInt(coach[0]!.id);
  });

  afterEach(async () => {
    // FK-safe purge of everything these tests touch, by the test emails.
    if (emails.length === 0) return;
    const ids = (
      await sql<Array<{ id: string }>>`select id::text as id from users where email in ${sql(emails)}`
    ).map((r) => BigInt(r.id));
    if (ids.length > 0) {
      await sql`delete from coach_members where user_id in ${sql(ids)}`;
      await sql`delete from user_roles where user_id in ${sql(ids)}`;
      await sql`delete from coaches where user_id in ${sql(ids)}`;
    }
    await sql`delete from coach_allowlist where email in ${sql(emails)}`;
    await sql`delete from users where email in ${sql(emails)}`;
    emails.length = 0;
  });

  afterAll(async () => {
    // Tear down the club fixture (kept out of afterEach). FK-safe order.
    if (clubCoachId > BigInt(0)) {
      await sql`delete from coach_members where coach_id = ${clubCoachId}`;
    }
    const ownerIds = (
      await sql<Array<{ id: string }>>`select id::text as id from users where email = ${clubOwnerEmail}`
    ).map((r) => BigInt(r.id));
    if (ownerIds.length > 0) {
      await sql`delete from user_roles where user_id in ${sql(ownerIds)}`;
      await sql`delete from coaches where user_id in ${sql(ownerIds)}`;
      await sql`delete from users where id in ${sql(ownerIds)}`;
    }
    await closeTestSql();
  });

  test('approvedCoachTarget: approved row → club; unknown/rejected/null-club → null', async () => {
    const approved = uniqueEmail('approved');
    const rejected = uniqueEmail('rejected');
    const nullClub = uniqueEmail('nullclub');

    await sql`
      insert into coach_allowlist (email, status, coach_id) values
        (${approved}, 'approved', ${clubCoachId}),
        (${rejected}, 'rejected', ${clubCoachId}),
        (${nullClub}, 'approved', null)
    `;

    expect(await approvedCoachTarget(approved)).toEqual({ coach_id: clubCoachId });
    expect(await approvedCoachTarget(approved.toUpperCase())).toEqual({ coach_id: clubCoachId });
    expect(await approvedCoachTarget(rejected)).toBeNull();
    expect(await approvedCoachTarget(nullClub)).toBeNull();
    expect(await approvedCoachTarget('nobody-here@test.local')).toBeNull();
  });

  test('provisionCoachMember: joins the EXISTING club, mints NO coach, names the person, grants role', async () => {
    const email = uniqueEmail('member');
    const clerkId = `user_clerk_member_${Date.now()}`;

    await provisionCoachMember(
      { clerk_user_id: clerkId, email: email.toUpperCase(), first_name: 'Alex', last_name: 'Solé' },
      clubCoachId,
    );

    // A users row exists, bridged + named (email lowercased).
    const users = await sql<Array<{ id: string; full_name: string | null; clerk_user_id: string | null }>>`
      select id::text as id, full_name, clerk_user_id from users where email = ${email}
    `;
    expect(users).toHaveLength(1);
    expect(users[0]!.clerk_user_id).toBe(clerkId);
    expect(users[0]!.full_name).toBe('Alex Solé');
    const memberUserId = BigInt(users[0]!.id);

    // Member of the club — and NO coaches row was minted (count unchanged, and
    // this user owns no coach).
    const membership = await sql<Array<{ coach_id: string; role: string }>>`
      select coach_id::text as coach_id, membership_role as role
      from coach_members where user_id = ${memberUserId}
    `;
    expect(membership).toHaveLength(1);
    expect(BigInt(membership[0]!.coach_id)).toBe(clubCoachId);
    expect(membership[0]!.role).toBe('coach');

    // The member owns NO coaches row — it joined the existing club, nothing minted.
    const owned = await sql<Array<{ id: string }>>`
      select id::text as id from coaches where user_id = ${memberUserId}
    `;
    expect(owned).toHaveLength(0);

    // Coach role granted.
    const roles = await sql<Array<{ role: string }>>`
      select role from user_roles where user_id = ${memberUserId} and role = 'coach'
    `;
    expect(roles).toHaveLength(1);
  });

  test('provisionCoachMember is idempotent (same member, single membership row)', async () => {
    const email = uniqueEmail('idem');
    const clerkId = `user_clerk_idem_${Date.now()}`;
    const identity = { clerk_user_id: clerkId, email, first_name: 'Pablo' };

    await provisionCoachMember(identity, clubCoachId);
    await provisionCoachMember(identity, clubCoachId);

    const memberUserId = BigInt(
      (await sql<Array<{ id: string }>>`select id::text as id from users where email = ${email}`)[0]!.id,
    );
    const membership = await sql<Array<{ coach_id: string }>>`
      select coach_id::text as coach_id from coach_members where user_id = ${memberUserId}
    `;
    expect(membership).toHaveLength(1);

    const usersRows = await sql<Array<{ id: string }>>`select id::text as id from users where email = ${email}`;
    expect(usersRows).toHaveLength(1);
  });

  test('two different people on the SAME club → one club, two members', async () => {
    const emailA = uniqueEmail('personA');
    const emailB = uniqueEmail('personB');

    await provisionCoachMember(
      { clerk_user_id: `clerk_a_${Date.now()}`, email: emailA, first_name: 'Gerard' },
      clubCoachId,
    );
    await provisionCoachMember(
      { clerk_user_id: `clerk_b_${Date.now()}`, email: emailB, first_name: 'Pablo' },
      clubCoachId,
    );

    const members = await sql<Array<{ user_id: string }>>`
      select cm.user_id::text as user_id
      from coach_members cm
      join users u on u.id = cm.user_id
      where cm.coach_id = ${clubCoachId} and u.email in ${sql([emailA, emailB])}
    `;
    expect(members).toHaveLength(2);
  });
});
