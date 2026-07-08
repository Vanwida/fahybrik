import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { getActiveDoublesPairForAthlete } from '@/lib/dashboard/coach/doubles-pairs';

// =============================================================================
// EJE ÚNICO — the single pairing axis, canonical rule (read this once).
//
// There are TWO relationships between two athletes, and they are NOT the same:
//
//   1. users.partner_id  (migration 0021, partner_invitations)
//      = the ACCOUNT / BILLING relationship. Athlete-initiated: one athlete
//        invites another; on redeem both users.partner_id point at each other,
//        and the shared Dobles subscription is tracked via
//        subscriptions.partner_user_id. This is who PAYS together — an account
//        fact, independent of any coach or training plan.
//
//   2. doubles_pairs  (migration 0065)
//      = the DERIVED TRAINING instrument. Coach-scoped: it links two of a
//        coach's athletes onto the SAME (level, days) plan cell so their weeks
//        are coordinated. This is who TRAINS together.
//
// THE RULE: every athlete TRAINING surface (plan, session, simulation,
// analytics, joint-log) MUST resolve the partner through doubles_pairs — i.e.
// through THIS resolver — never through users.partner_id. The billing link is
// the account relationship; the training pair is the instrument the training
// surfaces read. To keep the two axes from drifting apart, the training pair is
// AUTO-CREATED on partner redeem (best-effort) when both athletes share the same
// coach — see app/api/athlete/partner/redeem/route.ts.
//
// This file is THE canonical site for this rule. If you need to know which
// relationship a surface should use, the answer is: TRAINING → doubles_pairs
// (here); BILLING/account → users.partner_id (lib/partner/invitations.ts).
// =============================================================================

export interface DoublesTrainingPartner {
  /** The active doubles_pairs row id linking the two athletes. */
  pair_id: number;
  /** The PARTNER athlete's id (the other side of the pair). */
  partner_athlete_id: bigint;
  /** The user account behind the partner athlete. */
  partner_user_id: bigint;
  /** The partner athlete's full name (null only if unset on the athlete row). */
  partner_full_name: string | null;
  /**
   * #13: the partner is EN PAUSA (athletes.lifecycle_status='pausado'). Plan /
   * analytics / session surfaces STILL resolve them (the pair stands) but can tag
   * "en pausa". A partner de BAJA does NOT resolve at all — loadDoublesTrainingPartner
   * returns null, exactly as for a soft-deleted account.
   */
  partner_paused: boolean;
}

/**
 * The athlete's TRAINING partner, resolved via doubles_pairs (the derived
 * training instrument), NOT via users.partner_id (the billing link). Returns
 * null when the athlete is not in an active pair — callers keep their
 * honest-empty (404 no_partner) semantics on null and never fabricate a partner.
 */
export async function loadDoublesTrainingPartner(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<DoublesTrainingPartner | null> {
  const pair = await getActiveDoublesPairForAthlete(athlete_id, client);
  if (!pair) return null;

  // Join athletes → users to attach the partner's user id + display name. The
  // partner_id from getActiveDoublesPairForAthlete is the PARTNER athlete id.
  const rows = await client<
    {
      partner_athlete_id: string;
      partner_user_id: string;
      partner_full_name: string | null;
      partner_lifecycle_status: string;
    }[]
  >`
    select
      a.id::text               as partner_athlete_id,
      u.id::text               as partner_user_id,
      a.full_name              as partner_full_name,
      a.lifecycle_status::text as partner_lifecycle_status
    from athletes a
    join users u on u.id = a.user_id and u.deleted_at is null
    where a.id = ${pair.partner_id}
      and a.lifecycle_status <> 'baja'
    limit 1
  `;
  const row = rows[0];
  // Pair points at an athlete whose user was deleted OR who is de BAJA — treat as
  // no partner rather than surfacing a half-resolved / departed side (#13). A PAUSED
  // partner still resolves here (the pair stands) and is tagged partner_paused.
  if (!row) return null;

  return {
    pair_id: pair.pair_id,
    partner_athlete_id: BigInt(row.partner_athlete_id),
    partner_user_id: BigInt(row.partner_user_id),
    partner_full_name: row.partner_full_name,
    partner_paused: row.partner_lifecycle_status === 'pausado',
  };
}
