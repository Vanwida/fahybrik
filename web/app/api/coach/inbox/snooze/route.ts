// POST /api/coach/inbox/snooze   — snooze or dismiss one attention signal.
// DELETE /api/coach/inbox/snooze — clear (un-snooze / un-dismiss) one signal.
//
// Snooze/dismiss persist a coach_alert_overrides row (UNIQUE(athlete_id,
// signal_kind), upserted). The queue read (queue.ts::isSuppressed) honours them,
// with intelligent resurfacing when the signal worsens. Auth: coach session.

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

const snoozeBodySchema = z
  .object({
    athlete_id: z.string().regex(/^\d+$/, 'athlete_id must be a numeric id'),
    signal_kind: signalKindEnum,
    action: z.enum(['snooze', 'dismiss']),
    snooze_until: z.string().datetime().optional(),
    coach_note: z.string().max(2000).optional(),
  })
  .refine((b) => b.action !== 'snooze' || b.snooze_until != null, {
    message: 'snooze_until is required when action is "snooze"',
    path: ['snooze_until'],
  });

const clearBodySchema = z.object({
  athlete_id: z.string().regex(/^\d+$/),
  signal_kind: signalKindEnum,
});

async function athleteBelongsToCoach(
  athlete_id: number,
  coach_id: bigint,
): Promise<boolean> {
  const rows = await sql<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  return rows.length > 0;
}

export async function POST(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = snoozeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const athleteId = Number(parsed.data.athlete_id);
  if (!(await athleteBelongsToCoach(athleteId, session.coach_id))) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  try {
    // Capture the item's current value so resurface logic has a baseline.
    const itemRows = await sql<Array<{ value_numeric: number | null }>>`
      select value_numeric
      from coach_attention_items
      where athlete_id = ${athleteId} and signal_kind = ${parsed.data.signal_kind}
      limit 1
    `;
    const baseline = itemRows[0]?.value_numeric ?? null;

    if (parsed.data.action === 'snooze') {
      await sql`
        insert into coach_alert_overrides (
          coach_id, athlete_id, signal_kind,
          snoozed_until, dismissed_at, resurface_on_new_signal,
          baseline_value_at_override, coach_note, created_at
        )
        values (
          ${session.coach_id}, ${athleteId}, ${parsed.data.signal_kind},
          ${parsed.data.snooze_until!}::timestamptz, null, true,
          ${baseline}, ${parsed.data.coach_note ?? null}, now()
        )
        on conflict (athlete_id, signal_kind) do update set
          snoozed_until = excluded.snoozed_until,
          dismissed_at = null,
          baseline_value_at_override = excluded.baseline_value_at_override,
          coach_note = excluded.coach_note
      `;
    } else {
      await sql`
        insert into coach_alert_overrides (
          coach_id, athlete_id, signal_kind,
          snoozed_until, dismissed_at, resurface_on_new_signal,
          baseline_value_at_override, coach_note, created_at
        )
        values (
          ${session.coach_id}, ${athleteId}, ${parsed.data.signal_kind},
          null, now(), true,
          ${baseline}, ${parsed.data.coach_note ?? null}, now()
        )
        on conflict (athlete_id, signal_kind) do update set
          dismissed_at = now(),
          snoozed_until = null,
          baseline_value_at_override = excluded.baseline_value_at_override,
          coach_note = excluded.coach_note
      `;
    }

    updateTag(attentionTag(session.coach_id));
    return jsonOk({ ok: true });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/inbox/snooze.POST' });
    return jsonError('internal', 'No se pudo guardar la acción', 500);
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = clearBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  const athleteId = Number(parsed.data.athlete_id);
  if (!(await athleteBelongsToCoach(athleteId, session.coach_id))) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  try {
    await sql`
      delete from coach_alert_overrides
      where athlete_id = ${athleteId}
        and signal_kind = ${parsed.data.signal_kind}
        and coach_id = ${session.coach_id}
    `;
    updateTag(attentionTag(session.coach_id));
    return jsonOk({ ok: true });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/inbox/snooze.DELETE' });
    return jsonError('internal', 'No se pudo limpiar la acción', 500);
  }
}
