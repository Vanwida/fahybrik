import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  evaluateAtrTransitionReadiness,
  type AtrTransitionReadiness,
} from './atr-transition-detector';

// Idempotency window: don't re-notify the coach about the same from→to
// transition for the same athlete inside this window. 14 days mirrors what
// the spec asks for.
const IDEMPOTENCY_WINDOW_DAYS = 14;

export type AtrTransitionCheckOutcome = {
  athlete_id: string;
  evaluation: AtrTransitionReadiness;
  notification_inserted: boolean;
  notification_id?: string;
  /** True when a matching notification already existed inside the idempotency window. */
  duplicate_suppressed?: boolean;
};

export async function checkAndNotifyAtrTransition(params: {
  athlete_id: number | bigint;
  on_date?: Date;
  client?: Sql;
}): Promise<AtrTransitionCheckOutcome> {
  const client = params.client ?? defaultSql;

  const evaluation = await evaluateAtrTransitionReadiness({
    athlete_id: params.athlete_id,
    on_date: params.on_date,
    client,
  });

  if (!evaluation.ready) {
    return {
      athlete_id: String(params.athlete_id),
      evaluation,
      notification_inserted: false,
    };
  }

  // Resolve the coach user_id + athlete display name for the payload.
  const ownerRows = await client<
    Array<{ user_id: string; athlete_name: string }>
  >`
    select c.user_id::text as user_id, a.full_name as athlete_name
    from athletes a
    join coaches c on c.id = a.coach_id
    where a.id = ${params.athlete_id as number}
    limit 1
  `;
  const owner = ownerRows[0];
  if (!owner) {
    return {
      athlete_id: String(params.athlete_id),
      evaluation,
      notification_inserted: false,
    };
  }

  // Idempotency check: any existing unread / recent notif for SAME athlete +
  // SAME from→to inside the window suppresses a duplicate insert.
  const existing = await client<Array<{ id: string }>>`
    select id::text
    from notifications
    where user_id = ${Number(owner.user_id)}
      and type = 'atr_transition_suggested'
      and payload_json ->> 'athlete_id' = ${String(params.athlete_id)}
      and payload_json ->> 'from' = ${evaluation.from}
      and payload_json ->> 'to' = ${evaluation.to}
      and created_at >= now() - (${IDEMPOTENCY_WINDOW_DAYS} || ' days')::interval
    limit 1
  `;
  if (existing.length > 0) {
    return {
      athlete_id: String(params.athlete_id),
      evaluation,
      notification_inserted: false,
      duplicate_suppressed: true,
    };
  }

  const payload = {
    athlete_id: String(params.athlete_id),
    athlete_name: owner.athlete_name,
    from: evaluation.from,
    to: evaluation.to,
    rationale: evaluation.rationale,
    deep_link: `/es/atletas/${params.athlete_id}`,
  };

  const inserted = await client<Array<{ id: string }>>`
    insert into notifications (user_id, type, payload_json)
    values (
      ${Number(owner.user_id)},
      'atr_transition_suggested'::notification_type,
      ${JSON.stringify(payload)}::jsonb
    )
    returning id::text
  `;

  return {
    athlete_id: String(params.athlete_id),
    evaluation,
    notification_inserted: true,
    notification_id: inserted[0]!.id, // INSERT ... RETURNING yields exactly one row
  };
}

export async function checkAndNotifyAtrTransitionsForCoach(params: {
  coach_id: number | bigint;
  client?: Sql;
}): Promise<{
  checked: number;
  suggested: number;
  suppressed: number;
  outcomes: AtrTransitionCheckOutcome[];
}> {
  const client = params.client ?? defaultSql;

  // Only athletes with an active or planned macrocycle — others can't transition.
  const rows = await client<Array<{ athlete_id: string }>>`
    select distinct a.id::text as athlete_id
    from athletes a
    join atr_macrocycles m on m.athlete_id = a.id
    where a.coach_id = ${params.coach_id}
      and m.status in ('planned', 'active')
    order by a.id::text
  `;

  const outcomes: AtrTransitionCheckOutcome[] = [];
  let suggested = 0;
  let suppressed = 0;
  for (const r of rows) {
    const outcome = await checkAndNotifyAtrTransition({
      athlete_id: Number(r.athlete_id),
      client,
    });
    if (outcome.notification_inserted) suggested += 1;
    if (outcome.duplicate_suppressed) suppressed += 1;
    outcomes.push(outcome);
  }

  return { checked: rows.length, suggested, suppressed, outcomes };
}
