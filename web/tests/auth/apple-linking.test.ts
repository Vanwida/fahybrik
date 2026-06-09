// K2 — Apple Sign-In must NOT link a fresh apple_user_id onto a pre-existing
// account matched by email unless Apple asserts email_verified === true.
// Otherwise an unverified email collision could be used to take over an
// existing account.

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
const { findOrCreateAthleteForApple } = await import('@/lib/auth/users');

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

describe('findOrCreateAthleteForApple — email_verified gate (K2)', () => {
  it('does NOT link by email when email_verified is false; creates a fresh account', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('apple_user_id =')) {
        return []; // no account by apple_user_id
      }
      if (rec.text.includes('insert into users')) {
        return [{ id: '100', email: 'apple-abc@privaterelay.appleid.placeholder', apple_user_id: 'abc', role: 'athlete' }];
      }
      if (rec.text.includes('insert into athletes')) {
        return [{ id: '200', user_id: '100', full_name: 'Athlete', onboarded_at: null }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return []; // no athlete yet
      }
      return [];
    });
    handler = h;

    const result = await findOrCreateAthleteForApple({
      apple_user_id: 'abc',
      email: 'victim@example.com',
      email_verified: false,
    });

    // The vulnerable path is the SELECT-by-email followed by UPDATE …
    // set apple_user_id. Neither must run when email is unverified.
    const selectByEmail = calls.find(
      (c) => c.text.startsWith('select') && c.text.includes('where email ='),
    );
    const linkUpdate = calls.find(
      (c) => c.text.includes('update users') && c.text.includes('set apple_user_id'),
    );
    expect(selectByEmail).toBeUndefined();
    expect(linkUpdate).toBeUndefined();

    // A brand-new user row was created instead of a takeover.
    const insertUser = calls.find((c) => c.text.includes('insert into users'));
    expect(insertUser).toBeDefined();
    expect(result.user.id).toBe(BigInt(100));
  });

  it('DOES link by email when email_verified is true and an account exists', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('apple_user_id =')) {
        return []; // no account by apple_user_id
      }
      if (rec.text.startsWith('select') && rec.text.includes('where email =')) {
        return [{ id: '5', email: 'victim@example.com', apple_user_id: null, role: 'athlete' }];
      }
      if (rec.text.includes('update users') && rec.text.includes('set apple_user_id')) {
        return [{ id: '5', email: 'victim@example.com', apple_user_id: 'abc', role: 'athlete' }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return [{ id: '9', user_id: '5', full_name: 'Existing', onboarded_at: null }];
      }
      return [];
    });
    handler = h;

    const result = await findOrCreateAthleteForApple({
      apple_user_id: 'abc',
      email: 'victim@example.com',
      email_verified: true,
    });

    const linkUpdate = calls.find(
      (c) => c.text.includes('update users') && c.text.includes('set apple_user_id'),
    );
    expect(linkUpdate).toBeDefined();
    expect(result.user.id).toBe(BigInt(5));
  });
});
