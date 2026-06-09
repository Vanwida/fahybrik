// A2 — partner redeem race condition. redeemInvitation must lock the
// invitation row (SELECT ... FOR UPDATE) inside the transaction so two
// concurrent redeems of the same token can't both pass the status check.
//
// We can't exercise real row locking against the fake sql, so we assert the
// load query carries `for update` and that a successful redeem links both
// sides + flips status to accepted. A unique partial index on users(partner_id)
// (migration 0026) is the DB-level backstop, verified separately by the apply
// script.

import { describe, expect, test } from 'vitest';
import { redeemInvitation } from '@/lib/partner/invitations';
import { createFakeSql, type SqlHandler } from '../utils/fake-sql';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

function liveInvite() {
  return {
    id: '7',
    inviter_user_id: '1',
    invitee_email: 'p@example.com',
    token: 'tok',
    status: 'pending' as const,
    expires_at: FUTURE,
    accepted_at: null,
    accepted_user_id: null,
    created_at: new Date(),
  };
}

describe('redeemInvitation (A2 lock)', () => {
  test('locks the invitation row with FOR UPDATE', async () => {
    let lockedSelectSeen = false;
    const handler: SqlHandler = (sqlText) => {
      if (
        sqlText.includes('from partner_invitations') &&
        sqlText.includes('where token_sha256 =') &&
        sqlText.includes('for update')
      ) {
        lockedSelectSeen = true;
        return [liveInvite()];
      }
      if (sqlText.includes('from partner_invitations')) {
        // non-locked select should not be the primary load path
        return [liveInvite()];
      }
      if (sqlText.includes('from users') && sqlText.includes('partner_id')) {
        return [
          { id: '1', partner_id: null },
          { id: '2', partner_id: null },
        ];
      }
      if (sqlText.includes('update partner_invitations')) {
        return [{ ...liveInvite(), status: 'accepted', accepted_user_id: '2' }];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(lockedSelectSeen).toBe(true);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.inviter_user_id).toBe(BigInt(1));
      expect(res.result.accepted_user_id).toBe(BigInt(2));
      expect(res.result.invitation.status).toBe('accepted');
    }
  });

  test('links both sides exactly once on success', async () => {
    const userUpdates: Array<{ partnerId: unknown; targetId: unknown }> = [];
    const handler: SqlHandler = (sqlText, values) => {
      if (sqlText.includes('from partner_invitations') && sqlText.includes('for update')) {
        return [liveInvite()];
      }
      if (sqlText.includes('from users') && sqlText.includes('partner_id') && sqlText.includes('where id in')) {
        return [
          { id: '1', partner_id: null },
          { id: '2', partner_id: null },
        ];
      }
      if (sqlText.includes('update users set partner_id')) {
        // values: [partner_id, target_id]
        userUpdates.push({ partnerId: values[0], targetId: values[1] });
        return [];
      }
      if (sqlText.includes('update partner_invitations')) {
        return [{ ...liveInvite(), status: 'accepted', accepted_user_id: '2' }];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(true);
    // Two updates: inviter→accepted and accepted→inviter (bidirectional link).
    expect(userUpdates.length).toBe(2);
  });

  test('rejects when the (locked) row is already accepted', async () => {
    const handler: SqlHandler = (sqlText) => {
      if (sqlText.includes('from partner_invitations') && sqlText.includes('for update')) {
        return [{ ...liveInvite(), status: 'accepted' }];
      }
      return [];
    };
    const fake = createFakeSql(handler);
    const res = await redeemInvitation('tok', BigInt(2), { client: fake });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('token_already_used');
  });
});
