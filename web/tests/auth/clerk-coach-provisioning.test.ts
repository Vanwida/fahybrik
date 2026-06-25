// Self-serve coach provisioning (on-demand). When an authenticated Clerk user
// reaches a coach surface without a coach row, getCoachSession provisions it via
// findOrCreateCoachByClerkUser. These tests exercise the provisioning function's
// four cases directly against a scripted fake-sql so we observe exactly which
// queries run — without loading Clerk's `server-only` runtime.
//
// Invariants under test:
//   - brand-new Clerk user → INSERT users (clerk-keyed) + INSERT coaches + grant coach role
//   - existing clerk-keyed user, no coach → no user insert, INSERT coaches + grant role
//   - email already exists (no clerk_user_id) → ADOPT by email (no dup insert)
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

const isUserUpsert = (t: string) =>
  t.includes('insert into users') && t.includes('on conflict (clerk_user_id)');
const isUserAdopt = (t: string) =>
  t.includes('update users') && t.includes('set clerk_user_id');
const isCoachInsert = (t: string) =>
  t.includes('insert into coaches') && t.includes('on conflict (user_id)');
const isCoachSelect = (t: string) =>
  t.startsWith('select') && t.includes('from coaches');
const isRoleGrant = (t: string) =>
  t.includes('insert into user_roles') && t.includes("'coach'");

describe('findOrCreateCoachByClerkUser — on-demand self-serve provisioning', () => {
  it('brand-new Clerk user: inserts users + coaches and grants the coach role', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isUserUpsert(rec.text)) {
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

    // email is lowercased before the upsert.
    const upsert = calls.find((c) => isUserUpsert(c.text));
    expect(upsert).toBeDefined();
    expect(upsert?.values).toContain('new@coach.com');
    expect(upsert?.values).toContain('user_clerk_new');

    // No adoption fallback needed (the clerk-keyed upsert returned a row).
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

  it('existing clerk-keyed user without a coach row: no user insert, creates coach', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isUserUpsert(rec.text)) {
        // The DO UPDATE branch returns the pre-existing row (revived).
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

    expect(calls.find((c) => isUserAdopt(c.text))).toBeUndefined();
    expect(calls.find((c) => isCoachInsert(c.text))).toBeDefined();
    expect(result.user.id).toBe(BigInt(11));
    expect(result.coach.id).toBe(BigInt(3));
  });

  it('email already exists with no clerk_user_id: adopts it (no duplicate user)', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      // clerk-keyed upsert finds nothing (the existing row has a null
      // clerk_user_id, so the partial-unique conflict target does not match).
      if (isUserUpsert(rec.text)) return [];
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
    // Re-selected the existing coach rather than inserting a duplicate.
    expect(calls.find((c) => isCoachSelect(c.text))).toBeDefined();
    expect(result.user.id).toBe(BigInt(99));
    expect(result.coach.id).toBe(BigInt(50));
  });

  it('grants the coach role idempotently (on conflict do nothing)', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isUserUpsert(rec.text)) {
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

  it('falls back to the "Coach" placeholder when no name parts are present', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (isUserUpsert(rec.text)) {
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
