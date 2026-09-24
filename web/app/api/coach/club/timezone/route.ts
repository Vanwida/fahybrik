// GET   /api/coach/club/timezone → { timezone, effective, default_timezone }
// PATCH /api/coach/club/timezone   body: { timezone: 'America/Mexico_City' | null }
//
// El huso del club (`coaches.timezone`, mig 0241): el reloj del «día» del coach
// — su Hoy, la fecha de publicación, cuándo vence un «posponer», la agenda y los
// correos. NULL = el defecto del producto. Solo se guarda un huso que conocen Intl
// y Postgres (`setCoachTimezone`); si no, 422 con el porqué.

import { z } from 'zod';
import { requireCoach } from '@/lib/auth/require-coach';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { parseBody } from '@/lib/coach/api-input';
import { CoachTimezoneError, getCoachTimezoneSetting, setCoachTimezone } from '@/lib/coach/coach-timezone';
import { isValidTimezone } from '@fahybrid/shared/domain/coach/coach-timezone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine((tz) => tz === '' || isValidTimezone(tz), { message: 'Ese huso no existe. Elige uno de la lista.' })
      .nullable(),
  })
  .strict();

export async function GET() {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  return jsonOk(await getCoachTimezoneSetting(auth.session.coach_id));
}

export async function PATCH(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const tz = body.data.timezone;
  try {
    return jsonOk(await setCoachTimezone(auth.session.coach_id, tz ? tz : null));
  } catch (err) {
    if (err instanceof CoachTimezoneError) return jsonError('validation_error', err.message, 422);
    throw err;
  }
}
