// Coach allowlist: DB (status='approved') OR env (compat), self-serve approval.
//
// 0040 moved the allowlist to the DB so coaches can be added with no redeploy.
// 0041 added a status workflow: only an `approved` row passes the auth gate;
// the admin approves/rejects. The auth gate must accept an email that's
// status='approved' in the DB OR in the COACH_ALLOWLIST env var (compat), and
// must NOT fail open if the DB lookup throws.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

// The modules under test import `sql` from '../db' / '@/lib/db'. Swap it for a
// scripted fake so we can drive the allowlist lookup deterministically.
let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

// Imported AFTER the mock is registered.
const { isCoachAllowlisted } = await import('@/lib/auth/magic-link');
const { addApprovedCoach, listCoachRequests, requestCoachAccess, setCoachStatus } = await import(
  '@/lib/dashboard/admin/coaches'
);

afterEach(() => {
  vi.unstubAllEnvs();
  handler = () => [];
});

describe('isCoachAllowlisted (0040/0041 — DB approved OR env)', () => {
  it('passes when the email is in the COACH_ALLOWLIST env var (compat)', async () => {
    vi.stubEnv('COACH_ALLOWLIST', 'pablo@fabrik.training');
    // DB miss — env alone must suffice. (handler returns [] by default)
    await expect(isCoachAllowlisted('pablo@fabrik.training')).resolves.toBe(true);
  });

  it('passes when the email is an approved DB row (no env)', async () => {
    vi.stubEnv('COACH_ALLOWLIST', '');
    handler = (text, values) => {
      if (
        text.includes('from coach_allowlist') &&
        text.includes("status = 'approved'") &&
        values[0] === 'nuevo@coach.com'
      ) {
        return [{ ok: true }];
      }
      return [];
    };
    await expect(isCoachAllowlisted('nuevo@coach.com')).resolves.toBe(true);
  });

  it('rejects a pending/rejected email (query filters status=approved → no row)', async () => {
    vi.stubEnv('COACH_ALLOWLIST', '');
    // A pending row would NOT match the status='approved' filter, so the fake
    // returns []. The gate must reject.
    handler = () => [];
    await expect(isCoachAllowlisted('pendiente@coach.com')).resolves.toBe(false);
  });

  it('is case-insensitive (email normalised to lowercase before lookup)', async () => {
    vi.stubEnv('COACH_ALLOWLIST', '');
    const seen: unknown[] = [];
    handler = (text, values) => {
      if (text.includes('from coach_allowlist')) {
        seen.push(values[0]);
        return values[0] === 'nuevo@coach.com' ? [{ ok: true }] : [];
      }
      return [];
    };
    await expect(isCoachAllowlisted('Nuevo@Coach.com')).resolves.toBe(true);
    expect(seen).toContain('nuevo@coach.com');
  });

  it('rejects when the email is in neither env nor DB', async () => {
    vi.stubEnv('COACH_ALLOWLIST', 'pablo@fabrik.training');
    await expect(isCoachAllowlisted('intruso@evil.com')).resolves.toBe(false);
  });

  it('does NOT fail open when the DB lookup throws (env-only fallback)', async () => {
    vi.stubEnv('COACH_ALLOWLIST', 'pablo@fabrik.training');
    handler = () => {
      throw new Error('db down');
    };
    await expect(isCoachAllowlisted('pablo@fabrik.training')).resolves.toBe(true);
    await expect(isCoachAllowlisted('nuevo@coach.com')).resolves.toBe(false);
  });
});

describe('addApprovedCoach (admin adds directly, idempotent)', () => {
  it('returns created=true and inserts status approved when newly inserted', async () => {
    handler = (text, values) => {
      if (text.includes('insert into coach_allowlist')) {
        expect(text).toContain("'approved'");
        return [{ email: values[0] }];
      }
      return [];
    };
    const res = await addApprovedCoach({ email: 'Nuevo@Coach.com' });
    expect(res).toEqual({ email: 'nuevo@coach.com', created: true });
  });

  it('returns created=false when the email already existed (ON CONFLICT → 0 rows)', async () => {
    handler = () => [];
    const res = await addApprovedCoach({ email: 'pablo@fabrik.training' });
    expect(res).toEqual({ email: 'pablo@fabrik.training', created: false });
  });
});

describe('requestCoachAccess (self-serve pending request)', () => {
  it('inserts as pending and returns created=true when new', async () => {
    handler = (text, values) => {
      if (text.includes('insert into coach_allowlist')) {
        expect(text).toContain("'pending'");
        return [{ email: values[0] }];
      }
      return [];
    };
    const res = await requestCoachAccess({ email: 'wannabe@coach.com' });
    expect(res).toEqual({ email: 'wannabe@coach.com', created: true });
  });
});

describe('setCoachStatus (approve / reject)', () => {
  it('updated=true with the new status when the row exists', async () => {
    handler = (text, values) => {
      if (text.includes('update coach_allowlist')) {
        // values: [status, reviewed_by, email]
        return [{ email: values[2], status: values[0] }];
      }
      return [];
    };
    const res = await setCoachStatus({ email: 'Coach@X.com', status: 'approved' });
    expect(res).toEqual({ email: 'coach@x.com', status: 'approved', updated: true });
  });

  it('updated=false when the email is not on the allowlist', async () => {
    handler = () => [];
    const res = await setCoachStatus({ email: 'ghost@x.com', status: 'rejected' });
    expect(res.updated).toBe(false);
  });
});

describe('listCoachRequests', () => {
  it('maps rows to AllowlistedCoach with status + has_signed_in', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    handler = (text) => {
      if (text.includes('from coach_allowlist')) {
        return [
          {
            email: 'pablo@fabrik.training',
            status: 'approved',
            created_at: now,
            reviewed_at: now,
            has_signed_in: true,
          },
          {
            email: 'wannabe@coach.com',
            status: 'pending',
            created_at: now,
            reviewed_at: null,
            has_signed_in: false,
          },
        ];
      }
      return [];
    };
    const coaches = await listCoachRequests();
    expect(coaches).toHaveLength(2);
    expect(coaches[0]).toMatchObject({
      email: 'pablo@fabrik.training',
      status: 'approved',
      has_signed_in: true,
    });
    expect(coaches[1]).toMatchObject({
      email: 'wannabe@coach.com',
      status: 'pending',
      has_signed_in: false,
    });
  });
});
