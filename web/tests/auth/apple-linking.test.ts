// Apple Sign-In LOGIN is find-only (#35): it NEVER creates an account — a bare
// sign-in with no membership returns null → the route answers 404 no_account and
// the app routes the person to the funnel. It links a fresh apple_user_id onto a
// pre-existing account matched by email ONLY when Apple asserts email_verified
// (K2 — an unverified email collision could otherwise take over an account).

import { describe, expect, it, vi } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

// The module under test imports `sql` from '../db'. We swap it for a scripted
// fake so we can observe exactly which queries run.
let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

// Imported AFTER the mock is registered.
const { findAthleteForApple } = await import('@/lib/auth/users');

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

describe('findAthleteForApple — find-only + email_verified gate (K2)', () => {
  it('does NOT link by email when unverified, and NEVER creates → returns null', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('apple_user_id =')) {
        return []; // no account by apple_user_id
      }
      return [];
    });
    handler = h;

    const result = await findAthleteForApple({
      apple_user_id: 'abc',
      email: 'victim@example.com',
      email_verified: false,
    });

    // Unverified email: the takeover path (SELECT-by-email → UPDATE set
    // apple_user_id) must not run, and login must NOT create an account.
    const selectByEmail = calls.find(
      (c) => c.text.startsWith('select') && c.text.includes('where email ='),
    );
    const linkUpdate = calls.find(
      (c) => c.text.includes('update users') && c.text.includes('set apple_user_id'),
    );
    const insertUser = calls.find((c) => c.text.includes('insert into users'));
    expect(selectByEmail).toBeUndefined();
    expect(linkUpdate).toBeUndefined();
    expect(insertUser).toBeUndefined(); // find-only — no ghost account
    expect(result).toBeNull();
  });

  it('DOES link by email when verified and a pre-provisioned account exists', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('apple_user_id =')) {
        return []; // no account by apple_user_id
      }
      if (rec.text.startsWith('select') && rec.text.includes('where email =')) {
        return [{ id: '5', email: 'athlete@example.com', apple_user_id: null, role: 'athlete' }];
      }
      if (rec.text.includes('update users') && rec.text.includes('set apple_user_id')) {
        return [{ id: '5', email: 'athlete@example.com', apple_user_id: 'abc', role: 'athlete' }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return [{ id: '9', user_id: '5', full_name: 'Existing', onboarded_at: null }];
      }
      return [];
    });
    handler = h;

    const result = await findAthleteForApple({
      apple_user_id: 'abc',
      email: 'athlete@example.com',
      email_verified: true,
    });

    const linkUpdate = calls.find(
      (c) => c.text.includes('update users') && c.text.includes('set apple_user_id'),
    );
    expect(linkUpdate).toBeDefined();
    expect(result?.user.id).toBe(BigInt(5));
    expect(result?.athlete.id).toBe(BigInt(9));
  });

  it('returns null (no_account) when nothing matches — organic download', async () => {
    const { handler: h } = recordingHandler(() => []); // every lookup empty
    handler = h;
    const result = await findAthleteForApple({
      apple_user_id: 'unknown',
      email: 'nobody@example.com',
      email_verified: true,
    });
    expect(result).toBeNull();
  });

  it('returns null when the matched account has no athlete row (e.g. a coach)', async () => {
    const { handler: h } = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('apple_user_id =')) {
        return [{ id: '7', email: 'coach@example.com', apple_user_id: 'abc', role: 'coach' }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return []; // no athlete row for this user
      }
      return [];
    });
    handler = h;
    const result = await findAthleteForApple({
      apple_user_id: 'abc',
      email: 'coach@example.com',
      email_verified: true,
    });
    expect(result).toBeNull();
  });
});
