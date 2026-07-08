// Passwordless athlete EMAIL-CODE login — lib layer (email-code.ts + the
// find-only email resolver). The module under test imports `sql` from '../db';
// we swap it for a scripted fake (see apple-linking.test.ts) so we can assert the
// exact queries — no live DB. Resend is mocked for the sender test.

import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

let handler: SqlHandler = () => [];
vi.mock('@/lib/db', () => ({
  get sql() {
    return createFakeSql((text, values) => handler(text, values));
  },
}));

// Resend is only touched by sendEmailLoginCode. A module-level mock lets that one
// test assert the send payload without a network call.
const sendMock = vi.fn(
  async (_opts: { from: string; to: string; subject: string; text: string; html: string }) => ({
    error: null as { message: string } | null,
  }),
);
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const {
  generateEmailLoginCode,
  createEmailLoginCode,
  consumeEmailLoginCode,
  sendEmailLoginCode,
} = await import('@/lib/auth/email-code');
const { findAthleteByEmail } = await import('@/lib/auth/users');

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

/** Mirrors the private hash in email-code.ts: sha256(email || ':' || code). */
function hash(email: string, code: string): string {
  return createHash('sha256').update(`${email.toLowerCase()}:${code}`).digest('hex');
}

afterEach(() => {
  handler = () => [];
  sendMock.mockClear();
  vi.unstubAllEnvs();
});

describe('generateEmailLoginCode', () => {
  it('is always a zero-padded 6-digit string', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateEmailLoginCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('createEmailLoginCode', () => {
  it('invalidates prior unspent codes for the email, then inserts a fresh one', async () => {
    const { handler: h, calls } = recordingHandler(() => []);
    handler = h;

    const res = await createEmailLoginCode('Athlete@Example.com', { requested_ip: '1.2.3.4' });

    const invalidate = calls.find(
      (c) => c.text.includes('update email_login_codes') && c.text.includes('set consumed_at'),
    );
    const insert = calls.find((c) => c.text.includes('insert into email_login_codes'));
    expect(invalidate).toBeDefined();
    // email is normalized to lowercase before it ever hits the DB.
    expect(invalidate?.values).toContain('athlete@example.com');
    expect(insert).toBeDefined();
    expect(insert?.values).toContain('athlete@example.com');
    expect(res.code_plaintext).toMatch(/^\d{6}$/);
    expect(res.expires_at.getTime()).toBeGreaterThan(Date.now());
    // The stored value is the hash, never the plaintext code.
    expect(insert?.values).toContain(hash('athlete@example.com', res.code_plaintext));
    expect(insert?.values).not.toContain(res.code_plaintext);
  });
});

describe('consumeEmailLoginCode', () => {
  it('no active code → invalid (indistinguishable from a non-member email)', async () => {
    handler = recordingHandler(() => []).handler; // select returns no row
    const res = await consumeEmailLoginCode('nobody@example.com', '000000');
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  it('wrong code → invalid, and increments attempts WITHOUT consuming', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.includes('from email_login_codes') && rec.text.includes('for update')) {
        return [{ id: '1', code_sha256: hash('a@b.com', '111111'), attempts: 0 }];
      }
      return [];
    });
    handler = h;

    const res = await consumeEmailLoginCode('a@b.com', '999999');
    expect(res).toEqual({ ok: false, reason: 'invalid' });
    const upd = calls.find(
      (c) => c.text.includes('update email_login_codes') && c.text.includes('set attempts'),
    );
    expect(upd).toBeDefined();
    expect(upd?.values).toContain(1); // attempts 0 → 1
    // NOT consumed on a wrong guess.
    expect(upd?.text.includes('consumed_at')).toBe(false);
  });

  it('correct code → ok and burns the code (single-use)', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.includes('from email_login_codes') && rec.text.includes('for update')) {
        return [{ id: '7', code_sha256: hash('a@b.com', '424242'), attempts: 0 }];
      }
      return [];
    });
    handler = h;

    const res = await consumeEmailLoginCode('A@B.com', '424242');
    expect(res).toEqual({ ok: true, email: 'a@b.com' });
    const consume = calls.find(
      (c) =>
        c.text.includes('update email_login_codes') &&
        c.text.includes('set consumed_at') &&
        c.text.includes('attempts'),
    );
    expect(consume).toBeDefined();
  });

  it('reused (already-consumed) code → invalid: consumed rows are excluded by the query', async () => {
    // The select filters `consumed_at is null`, so a spent code yields no row.
    handler = recordingHandler(() => []).handler;
    const res = await consumeEmailLoginCode('a@b.com', '424242');
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  it('over the attempt cap → too_many_attempts, and invalidates the code', async () => {
    const { handler: h, calls } = recordingHandler((rec) => {
      if (rec.text.includes('from email_login_codes') && rec.text.includes('for update')) {
        // attempts already at the cap (5) → next attempt (6) trips the guard.
        return [{ id: '3', code_sha256: hash('a@b.com', '111111'), attempts: 5 }];
      }
      return [];
    });
    handler = h;

    const res = await consumeEmailLoginCode('a@b.com', '111111'); // even the RIGHT code is refused
    expect(res).toEqual({ ok: false, reason: 'too_many_attempts' });
    const invalidate = calls.find(
      (c) => c.text.includes('update email_login_codes') && c.text.includes('set consumed_at'),
    );
    expect(invalidate).toBeDefined();
    expect(invalidate?.values).toContain(6);
  });
});

describe('findAthleteByEmail (find-only, LOGIN NEVER CREATES)', () => {
  it('resolves the user + athlete for a member email', async () => {
    handler = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('from users')) {
        return [{ id: '132', email: 'fabregas.scd@gmail.com', apple_user_id: null, role: 'athlete' }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return [{ id: '63', user_id: '132', full_name: 'Gerard', onboarded_at: null }];
      }
      return [];
    }).handler;

    const res = await findAthleteByEmail('Fabregas.SCD@gmail.com');
    expect(res?.user.id).toBe(BigInt(132));
    expect(res?.athlete.id).toBe(BigInt(63));
  });

  it('unknown email → null, and NEVER inserts a user (no ghost account)', async () => {
    const { handler: h, calls } = recordingHandler(() => []);
    handler = h;
    const res = await findAthleteByEmail('nobody@example.com');
    expect(res).toBeNull();
    expect(calls.find((c) => c.text.includes('insert into users'))).toBeUndefined();
    expect(calls.find((c) => c.text.includes('insert into athletes'))).toBeUndefined();
  });

  it('a coach account (no athlete row) → null', async () => {
    handler = recordingHandler((rec) => {
      if (rec.text.startsWith('select') && rec.text.includes('from users')) {
        return [{ id: '9', email: 'coach@example.com', apple_user_id: null, role: 'coach' }];
      }
      if (rec.text.startsWith('select') && rec.text.includes('from athletes')) {
        return [];
      }
      return [];
    }).handler;
    const res = await findAthleteByEmail('coach@example.com');
    expect(res).toBeNull();
  });
});

describe('sendEmailLoginCode', () => {
  it('sends via Resend with the code in the subject + body when configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    const res = await sendEmailLoginCode({
      to: 'a@b.com',
      code: '424242',
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    expect(res.sent).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0] as { to: string; subject: string; text: string; html: string };
    expect(arg.to).toBe('a@b.com');
    expect(arg.subject).toContain('424242');
    expect(arg.text).toContain('424242');
    expect(arg.html).toContain('424242');
  });

  it('is a no-op (sent:false) when RESEND_API_KEY is unset — never throws', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const res = await sendEmailLoginCode({
      to: 'a@b.com',
      code: '424242',
      expires_at: new Date(Date.now() + 10 * 60 * 1000),
    });
    expect(res).toEqual({ sent: false, skipped_reason: 'resend_not_configured' });
    expect(sendMock).not.toHaveBeenCalled();
  });
});
