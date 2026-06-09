import { createHash } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import {
  assertInviterCanInvite,
  createInvitation,
  loadPartner,
  redeemInvitation,
  type InviterInfo,
} from '@/lib/partner/invitations';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const NOW = Date.now();
const FUTURE = new Date(NOW + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(NOW - 60_000);

const baseInviter: InviterInfo = {
  user_id: BigInt(1),
  email: 'inviter@example.com',
  full_name: 'Inviter',
  has_partner: false,
  plan_type: 'dobles',
};

describe('assertInviterCanInvite', () => {
  test('passes when plan_type is dobles and no partner', () => {
    expect(assertInviterCanInvite(baseInviter, 'partner@example.com')).toBeNull();
  });

  test('passes when plan_type is null (beta pre-Stripe)', () => {
    expect(assertInviterCanInvite({ ...baseInviter, plan_type: null }, 'p@example.com')).toBeNull();
  });

  test('rejects when plan_type is individual', () => {
    const err = assertInviterCanInvite({ ...baseInviter, plan_type: 'individual' }, 'p@example.com');
    expect(err?.code).toBe('inviter_not_dobles');
  });

  test('rejects when inviter already has a partner', () => {
    const err = assertInviterCanInvite({ ...baseInviter, has_partner: true }, 'p@example.com');
    expect(err?.code).toBe('inviter_already_paired');
  });

  test('rejects when inviting oneself', () => {
    const err = assertInviterCanInvite(baseInviter, 'INVITER@example.com');
    expect(err?.code).toBe('invitee_is_self');
  });

  test('rejects empty/whitespace email', () => {
    const err = assertInviterCanInvite(baseInviter, '   ');
    expect(err?.code).toBe('invitee_email_invalid');
  });
});

describe('createInvitation', () => {
  test('resend rotates the stored hash and returns a fresh plaintext token', async () => {
    const existing = {
      id: '42',
      inviter_user_id: '1',
      invitee_email: 'p@example.com',
      status: 'pending' as const,
      expires_at: FUTURE,
      accepted_at: null,
      accepted_user_id: null,
      created_at: new Date(NOW - 10_000),
    };

    let insertCalled = false;
    let rotatedHash: string | null = null;
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('select') && sqlText.includes('from partner_invitations')) {
        return [existing];
      }
      // M12: resend re-hashes a fresh token onto the existing row.
      if (sqlText.includes('update partner_invitations') && sqlText.includes('token_sha256')) {
        rotatedHash = values[0] as string;
        return [];
      }
      if (sqlText.includes('insert into partner_invitations')) {
        insertCalled = true;
        return [];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const result = await createInvitation(BigInt(1), 'p@example.com', {
      client: fake,
      generateToken: () => 'fresh-resend-token',
    });
    expect(result.resend).toBe(true);
    // The plaintext is the freshly-issued token, never the (hashed) stored one.
    expect(result.invitation.token).toBe('fresh-resend-token');
    // The DB only ever sees the hash.
    expect(rotatedHash).toBe(sha256('fresh-resend-token'));
    expect(insertCalled).toBe(false);
  });

  test('inserts the token HASH (never plaintext) and returns the plaintext', async () => {
    let insertedHash: string | null = null;
    const newRow = {
      id: '99',
      inviter_user_id: '1',
      invitee_email: 'p@example.com',
      status: 'pending' as const,
      expires_at: FUTURE,
      accepted_at: null,
      accepted_user_id: null,
      created_at: new Date(NOW),
    };
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('select') && sqlText.includes('from partner_invitations')) {
        return [];
      }
      if (sqlText.includes('insert into partner_invitations')) {
        // values: [inviter_user_id, email, token_sha256]
        insertedHash = values[2] as string;
        return [newRow];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const result = await createInvitation(BigInt(1), 'p@example.com', {
      client: fake,
      generateToken: () => 'fixed-token-abc',
    });
    expect(result.resend).toBe(false);
    // Stored value is the hash, NOT the plaintext.
    expect(insertedHash).toBe(sha256('fixed-token-abc'));
    expect(insertedHash).not.toBe('fixed-token-abc');
    // Caller gets the plaintext back for the email/deeplink.
    expect(result.invitation.token).toBe('fixed-token-abc');
    expect(result.invitation.id).toBe(BigInt(99));
  });
});

describe('redeemInvitation', () => {
  function inviteRow(overrides: Partial<{ status: string; expires_at: Date }>) {
    return {
      id: '7',
      inviter_user_id: '1',
      invitee_email: 'p@example.com',
      status: overrides.status ?? 'pending',
      expires_at: overrides.expires_at ?? FUTURE,
      accepted_at: null,
      accepted_user_id: null,
      created_at: new Date(NOW),
    };
  }

  test('fails with token_invalid when missing', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from partner_invitations')) return [];
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('missing', BigInt(2), { client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_invalid');
  });

  test('looks the invitation up by token HASH, not plaintext (M12)', async () => {
    let lookupBoundValue: unknown = null;
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('from partner_invitations') && sqlText.includes('token_sha256')) {
        lookupBoundValue = values[0];
        return []; // token_invalid path — we only care about the bound value
      }
      return [];
    };
    const fake = createFakeSql(handler);
    await redeemInvitation('plaintext-token', BigInt(2), { client: fake });
    expect(lookupBoundValue).toBe(sha256('plaintext-token'));
    expect(lookupBoundValue).not.toBe('plaintext-token');
  });

  test('fails with token_expired when expires_at in past', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from partner_invitations')) {
        return [inviteRow({ expires_at: PAST })];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_expired');
  });

  test('fails with token_already_used when status accepted', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from partner_invitations')) {
        return [inviteRow({ status: 'accepted' })];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_already_used');
  });

  test('fails when accepted user already paired', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from partner_invitations')) {
        return [inviteRow({})];
      }
      if (sqlText.includes('from users') && sqlText.includes('partner_id')) {
        // inviter clean, accepted user already has partner
        return [
          { id: '1', partner_id: null },
          { id: '2', partner_id: '3' },
        ];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('accepted_user_already_paired');
  });

  test('on success links partner_id (both sides) AND mirrors subscriptions.partner_user_id (both directions)', async () => {
    const calls: { text: string; values: unknown[] }[] = [];
    const handler: SqlHandler = (sqlText, values) => {
      calls.push({ text: sqlText, values });
      if (sqlText.includes('from partner_invitations') && sqlText.includes('for update')) {
        return [inviteRow({})];
      }
      if (sqlText.includes('from users') && sqlText.includes('partner_id')) {
        // Both users currently unpaired.
        return [
          { id: '1', partner_id: null },
          { id: '2', partner_id: null },
        ];
      }
      if (sqlText.includes('update partner_invitations')) {
        return [{ ...inviteRow({ status: 'accepted' }), accepted_user_id: '2' }];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.result.inviter_user_id).toBe(BigInt(1));
    expect(res.result.accepted_user_id).toBe(BigInt(2));

    // users.partner_id linked both ways: inviter(1)→2 and accepted(2)→1.
    const userLinks = calls.filter(
      (c) => c.text.startsWith('update users set partner_id'),
    );
    expect(userLinks.length).toBe(2);

    // subscriptions.partner_user_id mirrored both directions: 1's Dobles sub →2
    // and 2's Dobles sub →1. Without this the cancellation cascade can't fire.
    const subLinks = calls.filter(
      (c) => c.text.startsWith('update subscriptions') && c.text.includes('partner_user_id'),
    );
    expect(subLinks.length).toBe(2);
    expect(subLinks[0]!.values).toEqual(expect.arrayContaining([BigInt(2), BigInt(1)]));
    expect(subLinks[1]!.values).toEqual(expect.arrayContaining([BigInt(1), BigInt(2)]));
    for (const u of subLinks) {
      expect(u.text).toContain("plan_type = 'dobles'");
    }
  });
});

describe('loadPartner', () => {
  test('returns null when DB has no partner row', async () => {
    const handler: SqlHandler = () => [];
    const fake = createFakeSql(handler);
    const partner = await loadPartner(BigInt(42), fake);
    expect(partner).toBeNull();
  });

  test('maps DB row to PartnerSummary when present', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from users u') && sqlText.includes('partner')) {
        return [
          {
            partner_user_id: '99',
            partner_email: 'p@example.com',
            partner_full_name: 'P Athlete',
            partner_athlete_id: '7',
            partner_onboarded_at: null,
            partner_plan_type: 'dobles',
          },
        ];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const partner = await loadPartner(BigInt(42), fake);
    expect(partner).not.toBeNull();
    expect(partner?.user_id).toBe(BigInt(99));
    expect(partner?.modality).toBe('dobles');
    expect(partner?.email).toBe('p@example.com');
  });
});
