// POST /api/coach/messages/broadcast — fan ONE coach message out to N athletes'
// threads in a single request (the /hoy "Mensaje al grupo" cohort op). This is a
// SCALE lever: one gesture touches every selected athlete, each in their OWN
// 1:1 thread (never a group chat — the athlete experience stays personal).
//
// Per athlete: getOrCreateThread (idempotent) → sendCoachMessage (its own tx +
// best-effort notification). Each send is independent (Promise.allSettled) so one
// failure never blocks the rest; the response reports per-athlete outcome so the
// client can toast "Enviado a N" and surface the few that failed.
//
// Every athlete is validated to belong to the calling coach before any write.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import { COACH_MESSAGE_BODY_MAX } from '@/lib/dashboard/chat/schema';
import { getOrCreateThread, sendCoachMessage } from '@/lib/dashboard/chat/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Max cohort size per broadcast — mirrors the inbox/bulk cap (SPEC §9). */
const MAX_RECIPIENTS = 100;

const broadcastBodySchema = z.object({
  athlete_ids: z
    .array(z.string().regex(/^\d+$/))
    .min(1)
    .max(MAX_RECIPIENTS),
  body: z.string().trim().min(1, 'Mensaje vacío').max(COACH_MESSAGE_BODY_MAX),
});

export interface BroadcastResult {
  sent: number;
  failed: number;
  /** athlete_ids whose send failed (so the client can name them). */
  failed_ids: string[];
}

export async function POST(req: Request): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'invalid JSON', 400);
  }

  const parsed = broadcastBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }

  // De-dupe the recipient set (selecting the same athlete twice = one message).
  const athleteIds = [...new Set(parsed.data.athlete_ids.map((id) => Number(id)))];
  const body = parsed.data.body;

  try {
    // Ownership gate: every athlete must belong to the coach before any write.
    const owned = await sql<Array<{ id: string }>>`
      select id::text
      from athletes
      where coach_id = ${session.coach_id}
        and id = any(${athleteIds}::bigint[])
    `;
    const ownedSet = new Set(owned.map((r) => Number(r.id)));
    if (athleteIds.some((id) => !ownedSet.has(id))) {
      return jsonError('forbidden', 'Uno o más atletas no pertenecen al coach', 403);
    }

    // Independent per-athlete sends: one failure never blocks the cohort.
    const outcomes = await Promise.allSettled(
      athleteIds.map(async (athleteId) => {
        const { thread_id } = await getOrCreateThread({
          coach_id: session.coach_id,
          athlete_id: athleteId,
        });
        await sendCoachMessage({
          thread_id,
          coach_user_id: session.user_id,
          body,
        });
        return athleteId;
      }),
    );

    const failedIds: string[] = [];
    let sent = 0;
    outcomes.forEach((o, idx) => {
      if (o.status === 'fulfilled') sent += 1;
      else failedIds.push(String(athleteIds[idx]));
    });

    const result: BroadcastResult = {
      sent,
      failed: failedIds.length,
      failed_ids: failedIds,
    };
    return jsonOk(result);
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/messages/broadcast.POST' });
    return jsonError('internal', 'No se pudo enviar el mensaje al grupo', 500);
  }
}
