// POST /api/coach/inbox/bulk — posponer / hecho / deshacer sobre VARIOS atletas
// (o señales) en una transacción (plan §4.3, selección múltiple de Hoy).
//
//   { athlete_ids: [...], action: 'snooze', until: '1d' | '3d' | 'signal' }
//   { athlete_ids: [...], action: 'done' }
//   { items: [{ athlete_id, signal_kind? }], action: ... }   ← por señal
//   { action: 'undo', restore: [...] }                        ← lo que devolvió
//
// Un atleta sin `signal_kind` = su fila entera (sus señales accionables, menos
// las que resuelve un grupo). Compatibilidad: `action: 'resolve'` (= hecho) y
// `snooze_until` (instante exacto). Si algún atleta no es del coach, 403 y no se
// escribe nada.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import {
  OverrideForbiddenError,
  SNOOZE_UNTIL,
  applyOverrides,
  overrideSnapshotSchema,
  overrideTargetSchema,
  restoreOverrides,
} from '@/lib/coach/attention/overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const athleteId = z.string().regex(/^\d+$/);

const targetsShape = {
  items: z.array(overrideTargetSchema).min(1).max(500).optional(),
  athlete_ids: z.array(athleteId).min(1).max(500).optional(),
};

const bulkBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('snooze'),
    ...targetsShape,
    until: z.enum(SNOOZE_UNTIL).optional(),
    snooze_until: z.string().datetime().optional(),
  }),
  z.object({
    action: z.enum(['done', 'resolve']),
    ...targetsShape,
  }),
  z.object({
    action: z.literal('undo'),
    restore: z.array(overrideSnapshotSchema).min(1).max(5000),
  }),
]);

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
  const data = parsed.data;

  try {
    if (data.action === 'undo') {
      return jsonOk(await restoreOverrides({ coach_id: session.coach_id, restore: data.restore }));
    }

    const targets = [
      ...(data.items ?? []),
      ...(data.athlete_ids ?? []).map((id) => ({ athlete_id: id })),
    ];
    if (targets.length === 0) {
      return jsonError('bad_request', 'items or athlete_ids is required', 400);
    }
    if (data.action === 'snooze' && !data.until && !data.snooze_until) {
      return jsonError('bad_request', 'until is required when action is "snooze"', 400);
    }

    const res = await applyOverrides({
      coach_id: session.coach_id,
      targets,
      action: data.action === 'snooze' ? 'snooze' : 'done',
      until: data.action === 'snooze' ? data.until : undefined,
      snooze_until: data.action === 'snooze' ? data.snooze_until : undefined,
    });
    return jsonOk(res);
  } catch (err) {
    if (err instanceof OverrideForbiddenError) {
      return jsonError('forbidden', 'Uno o más atletas no pertenecen al coach', 403);
    }
    captureRouteError(err, { route: 'api/coach/inbox/bulk.POST' });
    return jsonError('internal', 'No se pudo aplicar la acción en bloque', 500);
  }
}
