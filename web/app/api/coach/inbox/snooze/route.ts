// POST /api/coach/inbox/snooze   — posponer / hecho / deshacer sobre UN atleta.
// DELETE /api/coach/inbox/snooze — quitar el override de una señal (compat.).
//
// Hoy (plan §4.3) trabaja por FILA = atleta:
//   { athlete_id, action: 'snooze', until: '1d' | '3d' | 'signal' }
//   { athlete_id, action: 'done' }
//   { action: 'undo', restore: [...] }          ← lo que devolvió la acción
// Sin `signal_kind` actúa sobre todas las señales accionables de la fila (menos
// las que resuelve un grupo); con `signal_kind`, solo sobre esa (p. ej. «hecho»
// en un hilo de Mensajes). La respuesta trae `undo` para el toast de deshacer.
//
// Compatibilidad con el cliente anterior: `action: 'snooze'` + `snooze_until`
// (instante exacto) y `action: 'dismiss'` (= hecho). Auth: sesión de coach, y
// cada atleta tiene que ser suyo.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { captureRouteError } from '@/lib/observability/capture';
import { SIGNAL_KINDS } from '@fahybrid/shared/domain/coach/signals';
import { invalidateAttention } from '@/lib/coach/attention/invalidate';
import {
  OverrideForbiddenError,
  SNOOZE_UNTIL,
  applyOverrides,
  overrideSnapshotSchema,
  restoreOverrides,
} from '@/lib/coach/attention/overrides';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const athleteId = z.string().regex(/^\d+$/, 'athlete_id must be a numeric id');

const snoozeBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('snooze'),
    athlete_id: athleteId,
    signal_kind: z.enum(SIGNAL_KINDS).optional(),
    until: z.enum(SNOOZE_UNTIL).optional(),
    snooze_until: z.string().datetime().optional(),
    coach_note: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.enum(['done', 'dismiss']),
    athlete_id: athleteId,
    signal_kind: z.enum(SIGNAL_KINDS).optional(),
    coach_note: z.string().max(2000).optional(),
  }),
  z.object({
    action: z.literal('undo'),
    restore: z.array(overrideSnapshotSchema).min(1).max(500),
  }),
]);

const clearBodySchema = z.object({
  athlete_id: athleteId,
  signal_kind: z.enum(SIGNAL_KINDS),
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

  const parsed = snoozeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'invalid payload', 400, parsed.error.flatten());
  }
  const data = parsed.data;
  if (data.action === 'snooze' && !data.until && !data.snooze_until) {
    return jsonError('bad_request', 'until is required when action is "snooze"', 400);
  }

  try {
    if (data.action === 'undo') {
      const res = await restoreOverrides({ coach_id: session.coach_id, restore: data.restore });
      return jsonOk(res);
    }
    const res = await applyOverrides({
      coach_id: session.coach_id,
      targets: [{ athlete_id: data.athlete_id, signal_kind: data.signal_kind }],
      action: data.action === 'snooze' ? 'snooze' : 'done',
      until: data.action === 'snooze' ? data.until : undefined,
      snooze_until: data.action === 'snooze' ? data.snooze_until : undefined,
      coach_note: data.coach_note ?? null,
    });
    return jsonOk(res);
  } catch (err) {
    if (err instanceof OverrideForbiddenError) {
      return jsonError('not_found', 'Atleta no encontrado', 404);
    }
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

  try {
    const deleted = await sql<Array<{ id: string }>>`
      delete from coach_alert_overrides o
      using athletes a
      where o.athlete_id = ${Number(parsed.data.athlete_id)}
        and o.signal_kind = ${parsed.data.signal_kind}
        and a.id = o.athlete_id
        and a.coach_id = ${session.coach_id}
      returning o.id::text
    `;
    invalidateAttention(session.coach_id);
    return jsonOk({ ok: true, cleared: deleted.length });
  } catch (err) {
    captureRouteError(err, { route: 'api/coach/inbox/snooze.DELETE' });
    return jsonError('internal', 'No se pudo limpiar la acción', 500);
  }
}
