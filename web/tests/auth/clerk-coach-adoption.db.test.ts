/**
 * Real-DB reproduction of the coach-adoption bug (the "DB first, Clerk after"
 * alta path). A coach can be seeded in `users` BEFORE their first login — the
 * webhook / allowlist / manual insert leaves a row with a NULL clerk_user_id.
 *
 * The bug: findOrCreateCoachByClerkUser used to INSERT keyed by clerk_user_id
 * first; that new row's email collided with the seeded row on users_email_unique
 * (a constraint the `on conflict (clerk_user_id)` target does NOT cover), so the
 * statement threw `duplicate key ... users_email_unique` and the coach got a 500
 * on their very first login — before adoption ever ran. The fake-sql unit test
 * missed it because a scripted array can't trip a real UNIQUE constraint.
 *
 * These tests run against a real Neon branch (no SQL mocked) so the constraint is
 * live. They assert the LOOKUP-FIRST fix: a seeded row is ADOPTED without an
 * exception and without a duplicate, and an email already bridged to a different
 * clerk id is REFUSED rather than hijacked.
 */

import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { findOrCreateCoachByClerkUser } from '@/lib/auth/users';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';

describeWithDb('findOrCreateCoachByClerkUser — DB-seeded coach adoption (real DB)', () => {
  const sql = getTestSql();
  const emails: string[] = [];

  function uniqueEmail(tag: string): string {
    const e = `coach-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;
    emails.push(e);
    return e;
  }

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });

  afterEach(async () => {
    // Purge every row these tests could have touched, FK-safe. user_roles + coaches
    // reference users(id); delete children first, then the users by their test email.
    if (emails.length === 0) return;
    const userIds = await sql<Array<{ id: string }>>`
      select id::text as id from users where email in ${sql(emails)}
    `;
    const ids = userIds.map((r) => BigInt(r.id));
    if (ids.length > 0) {
      await sql`delete from user_roles where user_id in ${sql(ids)}`;
      await sql`delete from coaches where user_id in ${sql(ids)}`;
    }
    await sql`delete from users where email in ${sql(emails)}`;
    emails.length = 0;
  });

  afterAll(async () => {
    await closeTestSql();
  });

  test('adopts a DB-seeded coach (email present, clerk_user_id NULL) with NO exception and NO duplicate', async () => {
    const email = uniqueEmail('seeded');
    // Seed the coach the "DB first" way: a users row with a NULL clerk_user_id.
    const seeded = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${email}, 'coach')
      returning id::text as id
    `;
    const seededId = BigInt(seeded[0]!.id);

    const clerkId = `user_clerk_${Date.now()}`;
    // First login. Pass the email mixed-case to also prove it is lowercased.
    const result = await findOrCreateCoachByClerkUser({
      clerk_user_id: clerkId,
      email: email.toUpperCase(),
    });

    // Adopted the SAME row — not a new one.
    expect(result.user.id).toBe(seededId);

    // Exactly one users row for this email, now bridged to the clerk id.
    const rows = await sql<Array<{ id: string; clerk_user_id: string | null }>>`
      select id::text as id, clerk_user_id from users where email = ${email}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clerk_user_id).toBe(clerkId);

    // Coach row + coach role now exist for that user.
    const coaches = await sql<Array<{ id: string }>>`
      select id::text as id from coaches where user_id = ${seededId}
    `;
    expect(coaches).toHaveLength(1);
    expect(result.coach.user_id).toBe(seededId);

    const roles = await sql<Array<{ role: string }>>`
      select role from user_roles where user_id = ${seededId} and role = 'coach'
    `;
    expect(roles).toHaveLength(1);
  });

  test('re-invoking after adoption is idempotent (no duplicate user, same coach)', async () => {
    const email = uniqueEmail('idem');
    const seeded = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${email}, 'coach')
      returning id::text as id
    `;
    const seededId = BigInt(seeded[0]!.id);
    const clerkId = `user_clerk_${Date.now()}_idem`;

    const first = await findOrCreateCoachByClerkUser({ clerk_user_id: clerkId, email });
    const second = await findOrCreateCoachByClerkUser({ clerk_user_id: clerkId, email });

    expect(first.user.id).toBe(seededId);
    expect(second.user.id).toBe(seededId);
    expect(second.coach.id).toBe(first.coach.id);

    const rows = await sql<Array<{ id: string }>>`
      select id::text as id from users where email = ${email}
    `;
    expect(rows).toHaveLength(1);
  });

  test('refuses when the email is already bridged to a DIFFERENT clerk_user_id (no hijack)', async () => {
    const email = uniqueEmail('taken');
    const ownerClerkId = `user_clerk_owner_${Date.now()}`;
    await sql`
      insert into users (email, role, clerk_user_id) values (${email}, 'coach', ${ownerClerkId})
    `;

    await expect(
      findOrCreateCoachByClerkUser({
        clerk_user_id: `user_clerk_intruder_${Date.now()}`,
        email,
      }),
    ).rejects.toThrow('coach_email_linked_to_other_clerk_user');

    // The owner's bridge key is untouched and no duplicate was created.
    const rows = await sql<Array<{ clerk_user_id: string | null }>>`
      select clerk_user_id from users where email = ${email}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.clerk_user_id).toBe(ownerClerkId);
  });
});
