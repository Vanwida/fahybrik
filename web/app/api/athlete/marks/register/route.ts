// The third door (#Marcas): races run OUTSIDE the app.
//
//   GET  /api/athlete/marks/register?slug=run_10k → synced activities whose distance
//        matches the race ("usar esta actividad") — the watch already measured it.
//   POST /api/athlete/marks/register              → save the mark (from a candidate
//        or typed), dated the day it happened.

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import {
  loadRegisterCandidates,
  registerRaceMark,
  registrableMarks,
  type MarkWriteError,
} from '@/lib/athlete/marks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const slug = new URL(req.url).searchParams.get('slug') ?? '';
  if (!registrableMarks().some((m) => m.slug === slug)) {
    return jsonError('unknown_mark', 'Esa distancia no se registra', 404);
  }

  try {
    return jsonOk({ candidates: await loadRegisterCandidates(auth.athlete_id, slug) });
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/marks/register.GET' });
    return jsonError('candidates_read_failed', 'No pudimos leer tus actividades', 500);
  }
}

const BodySchema = z
  .object({
    slug: z.string().min(1).max(60),
    /** Total seconds. */
    value: z.number().positive(),
    /** The day the race happened (ISO), never in the future. */
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    event_name: z.string().trim().max(120).optional().nullable(),
  })
  .strict();

const STATUS: Partial<Record<MarkWriteError, number>> = {
  unknown_mark: 404,
  not_registrable: 409,
  invalid_value: 422,
  invalid_date: 422,
};

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError('invalid_body', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const result = await registerRaceMark({
      athlete_id: auth.athlete_id,
      slug: parsed.data.slug,
      value: parsed.data.value,
      date: parsed.data.date,
      event_name: parsed.data.event_name ?? null,
    });
    if (!result.ok) {
      return jsonError(result.error, 'No pudimos registrar la carrera', STATUS[result.error] ?? 400);
    }
    return jsonOk(result.data);
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/marks/register.POST' });
    return jsonError('mark_register_failed', 'No pudimos registrar la carrera', 500);
  }
}
