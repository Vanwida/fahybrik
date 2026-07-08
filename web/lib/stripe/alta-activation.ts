import 'server-only';

// Post-payment activation for the athlete alta (#15).
//
// PAYMENT ACTIVATES ACCESS: only when Stripe confirms the athlete paid does the
// pending subscription go active AND the ACCESS email (claim / download link)
// get sent. This module is the exactly-once heart of that step, driven by the
// checkout.session.completed webhook.
//
// Idempotency (Stripe retries every delivery):
//   * Activation is idempotent — upsertSubscription converges on the same row
//     values no matter how many times it runs.
//   * The ACCESS email is sent EXACTLY once via the claim-before-send stamp on
//     subscriptions.access_email_sent_at (claimAccessEmailStamp). A duplicate
//     webhook loses the claim and sends nothing.
//
// Why the token is minted HERE (not carried from alta): the plaintext invite
// token is never persisted (only its SHA-256 hash), so the alta can't hand it to
// a later webhook. We mint a FRESH invitation at send time — createAthleteInvitation
// rotates (revokes the alta's pending invite, issues a new token), so there is
// still exactly one live claim link, and only the winner of the stamp ever sends.

import type Stripe from 'stripe';
import type { Sql } from '@/lib/db';
import {
  upsertSubscription,
  findAltaSubscriptionByCheckoutSession,
  claimAccessEmailStamp,
  clearAccessEmailStamp,
} from './subscriptions';
import { getStripeOrThrow } from './client';
import { createAthleteInvitation, buildAthleteInviteUrl } from '@/lib/athlete/invitations';
import { sendAltaEmail } from '@/lib/leads/alta-email';

export type AltaActivationResult =
  | { matched: false }
  | {
      matched: true;
      access_email_sent: boolean;
      reason?: 'already_sent' | 'already_linked' | 'send_failed' | 'mint_failed' | 'no_coach';
    };

/**
 * Activate an athlete-alta subscription on checkout.session.completed and send
 * the access (claim) email exactly once. Returns { matched:false } when the
 * session does not belong to an alta subscription — the caller then falls back
 * to the legacy tiered-checkout handling.
 */
export async function activateAltaOnCheckout(args: {
  client: Sql;
  session: Stripe.Checkout.Session;
}): Promise<AltaActivationResult> {
  const { client, session } = args;

  const stripeSubId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;
  if (!stripeSubId) return { matched: false };

  // Map the Checkout session id → our pending alta subscription (never by
  // customer id — Checkout created the customer from the email).
  const pending = await findAltaSubscriptionByCheckoutSession(client, session.id);
  if (!pending) return { matched: false };

  // (a) Activate: attach the Stripe subscription + customer, set status/period.
  // Idempotent — upsertSubscription updates the pending row in place.
  const { stripe } = getStripeOrThrow();
  const sub = await stripe.subscriptions.retrieve(stripeSubId);
  await upsertSubscription({ client, user_id: pending.user_id, subscription: sub });

  // (b) Exactly-once claim on the access-email stamp. Losing the claim means a
  // prior (or concurrent) delivery already sent it — do nothing.
  const claimed = await claimAccessEmailStamp(client, pending.id);
  if (!claimed) return { matched: true, access_email_sent: false, reason: 'already_sent' };

  // Resolve the athlete + coach + the lead the alta came from (to stamp the new
  // invite so redeem still converts the lead).
  const rows = await client<
    { athlete_id: string; coach_id: string | null; email: string; full_name: string }[]
  >`
    select a.id::text as athlete_id, a.coach_id::text as coach_id,
           u.email as email, a.full_name as full_name
    from athletes a
    join users u on u.id = a.user_id and u.deleted_at is null
    where a.user_id = ${pending.user_id}
    limit 1
  `;
  const athlete = rows[0];
  if (!athlete || athlete.coach_id == null) {
    // No claimable athlete/coach — release the stamp so a retry can try again.
    await clearAccessEmailStamp(client, pending.id);
    return { matched: true, access_email_sent: false, reason: 'no_coach' };
  }

  const leadRows = await client<{ lead_id: string | null }[]>`
    select lead_id::text as lead_id
    from athlete_invitations
    where athlete_id = ${BigInt(athlete.athlete_id)} and status = 'pending'
    order by created_at desc
    limit 1
  `;
  const leadId = leadRows[0]?.lead_id ? BigInt(leadRows[0].lead_id) : null;

  // Mint a fresh claim invitation (rotates the alta's pending invite).
  const inv = await createAthleteInvitation({
    athlete_id: BigInt(athlete.athlete_id),
    coach_id: BigInt(athlete.coach_id),
    lead_id: leadId,
    client,
  });
  if (!inv.ok) {
    if (inv.error.code === 'athlete_already_linked') {
      // Already claimed → nothing to send. Keep the stamp (treated as done).
      return { matched: true, access_email_sent: false, reason: 'already_linked' };
    }
    await clearAccessEmailStamp(client, pending.id);
    return { matched: true, access_email_sent: false, reason: 'mint_failed' };
  }

  const send = await sendAltaEmail({
    to: athlete.email,
    name: athlete.full_name,
    inviteUrl: buildAthleteInviteUrl(inv.result.token),
  });
  if (!send.sent) {
    // Only a genuine transient send failure releases the stamp for a Stripe
    // retry; a config gap (no Resend key in this env) keeps the stamp so we
    // don't storm retries — the coach can resend once email is configured.
    if (send.skipped_reason === 'resend_send_failed') {
      await clearAccessEmailStamp(client, pending.id);
      return { matched: true, access_email_sent: false, reason: 'send_failed' };
    }
    return { matched: true, access_email_sent: false, reason: 'send_failed' };
  }

  return { matched: true, access_email_sent: true };
}
