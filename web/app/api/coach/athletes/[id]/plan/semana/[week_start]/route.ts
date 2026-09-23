// POST /api/coach/athletes/[id]/plan/semana/[week_start]
//   { op: 'copy', to_week_start }   copiar la semana a otra
//   { op: 'shift', days }           desplazar ±N días lo pendiente
//   { op: 'scale', pct }            reducir el volumen pct % (5–80)
//   { op: 'deload' }                descarga con el % del coach
// Solo toca entrenos del coach pendientes. Devuelve lo movido/creado para deshacer.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody, parseRouteId, parseWith } from '@/lib/coach/api-input';
import { coachActor } from '@/lib/audit/record-edit';
import { mondaySchema } from '@fahybrid/shared/schema/assign-many';
import { DELOAD_VOLUME_MAX, DELOAD_VOLUME_MIN } from '@fahybrid/shared/domain/coach/progression-steps';
import { applyWeekOp, WeekOpError } from '@/lib/dashboard/v2/ficha-week-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('copy'), to_week_start: mondaySchema }).strict(),
  z
    .object({
      op: z.literal('shift'),
      days: z
        .number()
        .int('Tiene que ser un número entero de días.')
        .min(-14, 'Como mucho 14 días hacia atrás.')
        .max(14, 'Como mucho 14 días hacia delante.')
        .refine((d) => d !== 0, 'Elige cuántos días desplazar.'),
    })
    .strict(),
  z
    .object({
      op: z.literal('scale'),
      pct: z
        .number()
        .min(DELOAD_VOLUME_MIN, `Como mínimo un ${DELOAD_VOLUME_MIN} %.`)
        .max(DELOAD_VOLUME_MAX, `Como mucho un ${DELOAD_VOLUME_MAX} %.`),
    })
    .strict(),
  z.object({ op: z.literal('deload') }).strict(),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string; week_start: string }> }) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const params = await ctx.params;
  const id = parseRouteId(params.id, 'atleta');
  if (!id.ok) return id.response;
  const week = parseWith(mondaySchema, params.week_start);
  if (!week.ok) return week.response;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await applyWeekOp({
      coach_id: auth.session.coach_id,
      athlete_id: id.data,
      week_start: week.data,
      op: body.data,
      actor: coachActor(auth.session),
    });
    return jsonOk({ result });
  } catch (err) {
    if (err instanceof WeekOpError) return jsonError(err.code, err.message, err.status);
    throw err;
  }
}
