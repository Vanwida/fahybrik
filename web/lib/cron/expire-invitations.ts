// Expire partner invitations cron — pure logic, no auth, no HTTP.
//
// Runs daily. Transitions every `pending` partner_invitation whose
// expires_at has elapsed to `expired`, so stale Dobles invites can't be
// redeemed and the inviter's pending-invite UI clears.
//
// Schema reference: infra/migrations/0023_partner_invitations.sql
//   status check: 'pending' | 'accepted' | 'expired' | 'cancelled'
//
// Idempotent: only touches rows that are still 'pending' AND past
// expires_at, so re-running within the same day is a safe no-op.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export interface ExpireInvitationsResult {
  expired: number;
}

export async function runExpireInvitations(params: {
  client?: Sql;
  now?: Date;
}): Promise<ExpireInvitationsResult> {
  const client = params.client ?? defaultSql;
  const now = (params.now ?? new Date()).toISOString();

  const rows = await client<Array<{ id: string }>>`
    update partner_invitations
       set status = 'expired'
     where status = 'pending'
       and expires_at < ${now}::timestamptz
    returning id::text as id
  `;

  return { expired: rows.length };
}
