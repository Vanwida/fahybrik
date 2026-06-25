// POST /api/coach/inbox/bulk — apply one override action to N attention signals
// in a single transaction (SPEC §9 "acciones en bloque").
//
//   action 'resolve' = dismiss (resurface_on_new_signal=true)
//   action 'snooze'  = snooze every item until snooze_until
//
// Every item is validated to belong to the calling coach before any write.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import { updateTag } from 'next/cache';
import { attentionTag } from '@/lib/coach/attention/queue';
import { SIGNAL_KINDS } from '@fahybrid/shared/domain/coach/signals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const signalKindEnum = z.enum(SIGNAL_KINDS);

const bulkBodySchema = z
  .object({
    items: z
      .array(
        z.object({
          athlete_id: z.string().regex(/^\d+$/),
          signal_kind: signalKindEnum,
        }),
      )
      .min(1)
      .max(100),
    action: z.enum(['resolve', 'snooze']),
    snooze_until: z.string().datetime().optional(),
  })
  .refine((b) => b.action !== 'snooze' || b.snooze_until != null, {
    message: 'snooze_until is required when action is "snooze"',
    path: ['snooze_until'],
  });

export async function POST(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = bulkBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const athleteIds = [...new Set(parsed.data.items.map((i) => Number(i.athlete_id)))];

  try {
    // Validate every referenced athlete belongs to the coach.
    const owned = await sql<Array<{ id: string }>>`
      select id::text
      from athletes
      where coach_id = ${session.coach_id}
        and id = any(${athleteIds}::bigint[])
    `;
    const ownedSet = new Set(owned.map((r) => r.id));
    if (athleteIds.some((id) => !ownedSet.has(String(id)))) {
      return jsonError('forbidden', 'Uno o más atletas no pertenecen al coach', 403);
    }

    const snoozeUntil = parsed.data.action === 'snooze' ? parsed.data.snooze_until! : null;

    const applied = await sql.begin(async (tx) => {
      let count = 0;
      for (const item of parsed.data.items) {
        const athleteId = Number(item.athlete_id);
        const itemRows = await tx<Array<{ value_numeric: number | null }>>`
          select value_numeric
          from coach_attention_items
          where athlete_id = ${athleteId} and signal_kind = ${item.signal_kind}
          limit 1
        `;
        const baseline = itemRows[0]?.value_numeric ?? null;

        if (parsed.data.action === 'snooze') {
          await tx`
            insert into coach_alert_overrides (
              coach_id, athlete_id, signal_kind,
              snoozed_until, dismissed_at, resurface_on_new_signal,
              baseline_value_at_override, created_at
            )
            values (
              ${session.coach_id}, ${athleteId}, ${item.signal_kind},
              ${snoozeUntil}::timestamptz, null, true, ${baseline}, now()
            )
            on conflict (athlete_id, signal_kind) do update set
              snoozed_until = excluded.snoozed_until,
              dismissed_at = null,
              baseline_value_at_override = excluded.baseline_value_at_override
          `;
        } else {
          await tx`
            insert into coach_alert_overrides (
              coach_id, athlete_id, signal_kind,
              snoozed_until, dismissed_at, resurface_on_new_signal,
              baseline_value_at_override, created_at
            )
            values (
              ${session.coach_id}, ${athleteId}, ${item.signal_kind},
              null, now(), true, ${baseline}, now()
            )
            on conflict (athlete_id, signal_kind) do update set
              dismissed_at = now(),
              snoozed_until = null,
              baseline_value_at_override = excluded.baseline_value_at_override
          `;
        }
        count += 1;
      }
      return count;
    });

    updateTag(attentionTag(session.coach_id));
    return jsonOk({ applied });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/inbox/bulk.POST' });
    return jsonError('internal', 'No se pudo aplicar la acción en bloque', 500);
  }
}
