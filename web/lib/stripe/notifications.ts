// Billing notifications (payment failure).
//
// The `notification_type` enum (migration 0001/0018/0027) has no dedicated
// 'payment_failed' member. Rather than extend the enum (a migration), we follow
// the same pattern as lib/partner/cascade.ts: insert a generic 'system'
// notification with a `kind` discriminator in payload_json. iOS reads `kind`
// to render the right copy and deep-link.
//
// On a failed invoice we notify BOTH:
//   * the athlete (so they can update their payment method via the portal), and
//   * their coach (so Pablo knows an athlete is at risk of losing access).

import type { Sql } from '@/lib/db';

const PAYMENT_FAILED_KIND = 'payment_failed' as const;

export async function notifyPaymentFailed(args: {
  client: Sql;
  user_id: bigint;
}): Promise<void> {
  const { client, user_id } = args;

  // Resolve the athlete row + their coach's user_id from the paying user.
  const rows = await client<
    { athlete_id: string | null; coach_user_id: string | null }[]
  >`
    select a.id::text as athlete_id, c.user_id::text as coach_user_id
    from users u
    left join athletes a on a.user_id = u.id
    left join coaches c on c.id = a.coach_id
    where u.id = ${user_id}
    limit 1
  `;
  const row = rows[0];

  const payload = JSON.stringify({
    kind: PAYMENT_FAILED_KIND,
    athlete_user_id: user_id.toString(),
  });

  // Athlete notification.
  await client`
    insert into notifications (user_id, type, payload_json)
    values (${user_id}, 'system', ${payload}::jsonb)
  `;

  // Coach notification (best-effort — only if the athlete has a coach linked).
  if (row?.coach_user_id) {
    const coachPayload = JSON.stringify({
      kind: PAYMENT_FAILED_KIND,
      athlete_user_id: user_id.toString(),
      athlete_id: row.athlete_id,
    });
    await client`
      insert into notifications (user_id, type, payload_json)
      values (${BigInt(row.coach_user_id)}, 'system', ${coachPayload}::jsonb)
    `;
  }
}
