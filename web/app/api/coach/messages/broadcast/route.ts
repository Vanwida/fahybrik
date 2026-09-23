// POST /api/coach/messages/broadcast — UN mensaje del coach a varios atletas,
// elegidos a mano y/o por grupo, cada uno en SU hilo 1:1 (nunca un chat de
// grupo: para el atleta es un mensaje normal de su coach).
//
//   { athlete_ids?: string[], group_ids?: string[], body }   (al menos uno de los dos)
//   → { recipients, sent, failed, failed_ids }
//
// Por atleta: getOrCreateThread (idempotente) → sendMessage, el MISMO envío que
// una respuesta 1:1 (llega en vivo y con push). Cada envío es independiente
// (allSettled): un fallo no para el resto y la respuesta dice quién no lo
// recibió. Todo atleta y grupo se valida contra el coach ANTES de escribir nada.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { CHAT_BODY_MAX } from '@/lib/chat/schema';
import { getOrCreateThread, sendMessage } from '@/lib/chat/service';
import { BroadcastForbiddenError, resolveBroadcastRecipients } from '@/lib/chat/broadcast';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tope de destinatarios por envío, ya resueltos los grupos. */
const MAX_RECIPIENTS = 500;
/** Envíos a la vez (cada uno abre hilo, inserta, avisa y publica en vivo). */
const SEND_CONCURRENCY = 10;

const id = z.string().regex(/^\d{1,18}$/);
const broadcastBodySchema = z
  .object({
    athlete_ids: z.array(id).max(MAX_RECIPIENTS).default([]),
    group_ids: z.array(id).max(100).default([]),
    body: z.string().trim().min(1, 'Mensaje vacío').max(CHAT_BODY_MAX),
  })
  .refine((b) => b.athlete_ids.length + b.group_ids.length > 0, {
    message: 'Elige al menos un atleta o un grupo',
    path: ['athlete_ids'],
  });

export interface BroadcastResult {
  /** A cuántos atletas iba (grupos resueltos, sin repetidos). */
  recipients: number;
  sent: number;
  failed: number;
  /** Los atletas a los que no llegó, para nombrarlos. */
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
    const first = parsed.error.issues[0]?.message;
    return jsonError('bad_request', first ?? 'Envío no válido', 400, parsed.error.flatten());
  }
  const { athlete_ids, group_ids, body } = parsed.data;

  try {
    let recipients: number[];
    try {
      recipients = await resolveBroadcastRecipients({ coach_id: session.coach_id, athlete_ids, group_ids });
    } catch (err) {
      if (err instanceof BroadcastForbiddenError) return jsonError('forbidden', err.message, 403);
      throw err;
    }
    if (recipients.length === 0) {
      return jsonError('bad_request', 'Esos grupos no tienen atletas activos', 400);
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return jsonError('bad_request', `Como mucho ${MAX_RECIPIENTS} atletas por envío`, 400);
    }

    const failedIds: string[] = [];
    let sent = 0;
    for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
      const chunk = recipients.slice(i, i + SEND_CONCURRENCY);
      const outcomes = await Promise.allSettled(
        chunk.map(async (athleteId) => {
          const { thread_id } = await getOrCreateThread({ coach_id: session.coach_id, athlete_id: athleteId });
          await sendMessage({
            thread_id,
            sender_user_id: session.user_id,
            sender_role: 'coach',
            input: { body },
          });
        }),
      );
      outcomes.forEach((o, k) => {
        if (o.status === 'fulfilled') sent += 1;
        else failedIds.push(String(chunk[k]));
      });
    }

    return jsonOk<BroadcastResult>({
      recipients: recipients.length,
      sent,
      failed: failedIds.length,
      failed_ids: failedIds,
    });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/messages/broadcast.POST' });
    return jsonError('internal', 'No se ha podido enviar el mensaje', 500);
  }
}
