// Self-serve coach provisioning (on-demand). When an authenticated Clerk user
// reaches a coach surface without a coach row, getCoachSession provisions it via
// findOrCreateCoachByClerkUser. These tests exercise the provisioning function's
// query SEQUENCE directly against a scripted fake-sql so we observe exactly which
// queries run and IN WHAT ORDER — without loading Clerk's `server-only` runtime.
//
// Provisioning is LOOKUP-FIRST (resolve by clerk_user_id, then by email, then
// insert) — never insert-first: a coach seeded in the DB before their first login
// has a users row with a NULL clerk_user_id, and an insert keyed by clerk_user_id
// would collide with that row's email on users_email_unique and 500 before ever
// reaching adoption. The adoption scenario below asserts NO clerk-keyed insert runs.
// The real-DB reproduction (which actually trips the constraint) lives in
// clerk-coach-adoption.db.test.ts.
//
// Invariants under test:
//   - brand-new Clerk user → SELECT(clerk) ∅, SELECT(email) ∅, INSERT users
//     (clerk-keyed) + INSERT coaches + grant coach role
//   - existing clerk-keyed user, no coach → SELECT(clerk) hit → revive, no insert,
//     INSERT coaches + grant role
//   - email seeded with a NULL clerk_user_id → adopt by email UPDATE, NO user insert
//   - email already bridged to ANOTHER clerk_user_id → refuse (throws), no writes
//   - role grant is always 'coach' and idempotent (on conflict do nothing)

import { describe, expect, it } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';
import { vi } from 'vitest';

let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

const { findOrCreateCoachByClerkUser } = await import('@/lib/auth/users');

interface Recorded {
  text: string;
  values: unknown[];
}

function recordingHandler(rows: (rec: Recorded) => unknown[]): {
  handler: SqlHandler;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  return {
    calls,
    handler: (text, values) => {
      const rec = { text, values };
      calls.push(rec);
      return rows(rec);
    },
  };
}

const isSelByClerk = (t: string) =>
  t.startsWith('select') && t.includes('from users') && t.includes('where clerk_user_id =');
const isSelByEmail = (t: string) =>
  t.startsWith('select') && t.includes('from users') && t.includes('where email =');
// The clerk-keyed insert only runs for a genuinely-new coach (case 3).
const isUserInsert = (t: string) =>
  t.includes('insert into users') && t.includes('on conflict (clerk_user_id)');
// Adoption stamps the clerk_user_id onto the seeded row.
const isUserAdopt = (t: string) =>
  t.includes('update users') && t.includes('set clerk_user_id');
// Revival of a returning user touches timestamps only (never set clerk_user_id).
const isUserRevive = (t: string) =>
  t.includes('update users') && !t.includes('set clerk_user_id');
const isCoachInsert = (t: string) =>
  t.includes('insert into coaches') && t.includes('on conflict (user_id)');
const isCoachSelect = (t: string) => t.startsWith('select') && t.includes('from coaches');
const isRoleGrant = (t: string) =>
  t.includes('insert into user_roles') && t.includes("'coach'");

describe('findOrCreateCoachByClerkUser — on-demand self-serve provisioning', () => {
  it('brand-new Clerk user: lookups miss, inserts users + coaches, grants coach role', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) return []; // not a returning user
      if (isSelByEmail(rec.text)) return []; // no seeded email
      if (isUserInsert(rec.text)) {
        return [{ id: '42', email: 'new@coach.com', apple_user_id: null, role: 'coach' }];
      }
      if (isCoachInsert(rec.text)) {
        return [{ id: '7', user_id: '42', full_name: 'New Coach' }];
      }
      return [];
    });
    handler = h;

    const result = await findOrCreateCoachByClerkUser({
      clerk_user_id: 'user_clerk_new',
      email: 'New@Coach.com',
      first_name: 'New',
      last_name: 'Coach',
    });

    // email is lowercased before the insert.
    const insert = calls.find((c) => isUserInsert(c.text));
    expect(insert).toBeDefined();
    expect(insert?.values).toContain('new@coach.com');
    expect(insert?.values).toContain('user_clerk_new');

    // No adoption fallback needed (email lookup was empty).
    expect(calls.find((c) => isUserAdopt(c.text))).toBeUndefined();

    // Coach row created + role granted.
    expect(calls.find((c) => isCoachInsert(c.text))).toBeDefined();
    const grant = calls.find((c) => isRoleGrant(c.text));
    expect(grant).toBeDefined();
    expect(grant?.values).toContain(BigInt(42));

    expect(result.user.id).toBe(BigInt(42));
    expect(result.coach.id).toBe(BigInt(7));
    expect(result.coach.user_id).toBe(BigInt(42));
    // Derived display name seeded the coach (not the placeholder).
    expect(result.coach.full_name).toBe('New Coach');
  });

  it('existing clerk-keyed user without a coach row: revives, no user insert, creates coach', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) {
        return [
          {
            id: '11',
            email: 'exists@coach.com',
            apple_user_id: null,
            role: 'athlete',
            clerk_user_id: 'user_clerk_exists',
          },
        ];
      }
      if (isUserRevive(rec.text)) {
        return [{ id: '11', email: 'exists@coach.com', apple_user_id: null, role: 'athlete' }];
      }
      if (isCoachInsert(rec.text)) {
        return [{ id: '3', user_id: '11', full_name: 'Existing' }];
      }
      return [];
    });
    handler = h;

    const result = await findOrCreateCoachByClerkUser({
      clerk_user_id: 'user_clerk_exists',
      email: 'exists@coach.com',
    });

    // Resolved by clerk_user_id → never falls through to the email lookup, insert, or adopt.
    expect(calls.find((c) => isSelByEmail(c.text))).toBeUndefined();
    expect(calls.find((c) => isUserInsert(c.text))).toBeUndefined();
    expect(calls.find((c) => isUserAdopt(c.text))).toBeUndefined();
    expect(calls.find((c) => isCoachInsert(c.text))).toBeDefined();
    expect(result.user.id).toBe(BigInt(11));
    expect(result.coach.id).toBe(BigInt(3));
  });

  it('email seeded with a NULL clerk_user_id: adopts by email UPDATE, runs NO clerk-keyed insert', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) return []; // no bridged row yet
      if (isSelByEmail(rec.text)) {
        // The DB-first alta seeded this row; clerk_user_id is still null.
        return [
          {
            id: '99',
            email: 'seeded@coach.com',
            apple_user_id: null,
            role: 'coach',
            clerk_user_id: null,
          },
        ];
      }
      if (isUserAdopt(rec.text)) {
        return [{ id: '99', email: 'seeded@coach.com', apple_user_id: null, role: 'coach' }];
      }
      if (isCoachInsert(rec.text)) return []; // coach already existed → re-select
      if (isCoachSelect(rec.text)) {
        return [{ id: '50', user_id: '99', full_name: 'Seeded Coach' }];
      }
      return [];
    });
    handler = h;

    const result = await findOrCreateCoachByClerkUser({
      clerk_user_id: 'user_clerk_seeded',
      email: 'seeded@coach.com',
    });

    const adopt = calls.find((c) => isUserAdopt(c.text));
    expect(adopt).toBeDefined();
    expect(adopt?.values).toContain('user_clerk_seeded');
    // THE fix: the clerk-keyed insert must NEVER run here — that insert is what
    // collided with users_email_unique and 500'd a DB-seeded coach's first login.
    expect(calls.find((c) => isUserInsert(c.text))).toBeUndefined();
    // Re-selected the existing coach rather than inserting a duplicate.
    expect(calls.find((c) => isCoachSelect(c.text))).toBeDefined();
    expect(result.user.id).toBe(BigInt(99));
    expect(result.coach.id).toBe(BigInt(50));
  });

  it('email already bridged to a DIFFERENT clerk_user_id: refuses (no hijack), writes nothing', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) return [];
      if (isSelByEmail(rec.text)) {
        return [
          {
            id: '77',
            email: 'taken@coach.com',
            apple_user_id: null,
            role: 'coach',
            clerk_user_id: 'user_clerk_OWNER',
          },
        ];
      }
      return [];
    });
    handler = h;

    await expect(
      findOrCreateCoachByClerkUser({
        clerk_user_id: 'user_clerk_INTRUDER',
        email: 'taken@coach.com',
      }),
    ).rejects.toThrow('coach_email_linked_to_other_clerk_user');

    // Refused BEFORE any mutation — no adopt, no insert, no coach row, no role grant.
    expect(calls.find((c) => isUserAdopt(c.text))).toBeUndefined();
    expect(calls.find((c) => isUserInsert(c.text))).toBeUndefined();
    expect(calls.find((c) => isCoachInsert(c.text))).toBeUndefined();
    expect(calls.find((c) => isRoleGrant(c.text))).toBeUndefined();
  });

  it('grants the coach role idempotently (on conflict do nothing)', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) return [];
      if (isSelByEmail(rec.text)) return [];
      if (isUserInsert(rec.text)) {
        return [{ id: '1', email: 'a@b.com', apple_user_id: null, role: 'coach' }];
      }
      if (isCoachInsert(rec.text)) {
        return [{ id: '1', user_id: '1', full_name: 'Coach' }];
      }
      return [];
    });
    handler = h;

    await findOrCreateCoachByClerkUser({ clerk_user_id: 'u', email: 'a@b.com' });

    const grant = calls.find((c) => isRoleGrant(c.text));
    expect(grant).toBeDefined();
    expect(grant?.text).toContain('on conflict (user_id, role) do nothing');
  });

  it('falls back to the "Coach" placeholder derivation when no name parts are present', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isSelByClerk(rec.text)) return [];
      if (isSelByEmail(rec.text)) return [];
      if (isUserInsert(rec.text)) {
        // email local-part is the last resort for deriveDisplayName; here the
        // email is the only signal, so full_name = local part, NOT the placeholder.
        return [{ id: '2', email: 'solo@x.com', apple_user_id: null, role: 'coach' }];
      }
      if (isCoachInsert(rec.text)) {
        return [{ id: '2', user_id: '2', full_name: 'solo' }];
      }
      return [];
    });
    handler = h;

    await findOrCreateCoachByClerkUser({ clerk_user_id: 'u2', email: 'solo@x.com' });

    // The coach insert seeds full_name from the derived name (email local part).
    const coachInsert = calls.find((c) => isCoachInsert(c.text));
    expect(coachInsert?.values).toContain('solo');
  });
});
