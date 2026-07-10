// GET / PATCH /api/athlete/availability
//
// El ATLETA edita su propio horario semanal (disponibilidad por día) DESPUÉS del
// onboarding. `athletes.availability_json` = {mon..sun -> program|other_activity|
// rest} (mig 0047). GET devuelve el estado actual; PATCH mergea los días enviados
// y persiste. Autenticado con el bearer del atleta (misma vía que el resto de
// /api/athlete/*).
//
// REPARTO A FUTURAS (#47) — el punto de enganche:
//   El materializador (instantiate-program.ts → instantiateWeekIntoMicrocycle →
//   remapWeekDaysToAvailability) lee `availability_json` FRESCO en CADA
//   materialización. Por eso, cambiar aquí la disponibilidad se aplica solo a las
//   semanas que se materialicen DESPUÉS de este PATCH. Las semanas YA
//   materializadas (filas `workout_assignments` con `scheduled_for`) NO se tocan:
//   su reparto quedó fijado al materializarse y reescribirlas pisaría el plan y
//   los datos que el atleta ya haya registrado. No hay re-distribución de filas
//   existentes por diseño (scope #47).

import { z } from 'zod';
import { sql } from '@/lib/db';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  AVAILABILITY_VALUES,
  parseAvailability,
  deriveTrainingDaysPerWeek,
  type Availability,
} from '@fahybrid/shared/domain/coach/intake-availability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Valor por día (single source = AVAILABILITY_VALUES en shared).
const availabilityValueSchema = z.enum(AVAILABILITY_VALUES);

// PATCH body. Cada día es OPCIONAL: el cliente puede enviar el set completo (7) o
// sólo los que cambian; se MERGEAN sobre lo almacenado (los días no enviados se
// conservan, nunca se borran). `.strict()` rechaza claves desconocidas.
const availabilityPatchSchema = z.object({
  availability: z
    .object({
      mon: availabilityValueSchema.optional(),
      tue: availabilityValueSchema.optional(),
      wed: availabilityValueSchema.optional(),
      thu: availabilityValueSchema.optional(),
      fri: availabilityValueSchema.optional(),
      sat: availabilityValueSchema.optional(),
      sun: availabilityValueSchema.optional(),
    })
    .strict(),
});

// Availability actual del atleta (parseada/saneada). `null` = atleta inexistente.
async function loadAvailability(athlete_id: number): Promise<Availability | null> {
  const rows = await sql<Array<{ availability_json: unknown }>>`
    select availability_json from athletes where id = ${athlete_id} limit 1
  `;
  if (rows.length === 0) return null;
  return parseAvailability(rows[0]!.availability_json);
}

// Respuesta canónica (snake_case): la disponibilidad + los días de entreno/semana
// DERIVADOS (los días marcados 'program'). `training_days_per_week` es null cuando
// no hay ningún día 'program' (nunca se inventa un 0 confuso).
function availabilityResponse(availability: Availability) {
  return {
    availability,
    training_days_per_week: deriveTrainingDaysPerWeek(availability),
  };
}

export async function GET(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Athlete bearer required', 401);

  const availability = await loadAvailability(Number(session.athlete_id));
  if (availability === null) return jsonError('not_found', 'Athlete not found', 404);

  return jsonOk(availabilityResponse(availability));
}

export async function PATCH(req: Request) {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Athlete bearer required', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'Body must be valid JSON', 400);
  }

  const parsed = availabilityPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid availability payload', 422, parsed.error.flatten());
  }

  const athleteId = Number(session.athlete_id);

  const current = await loadAvailability(athleteId);
  if (current === null) return jsonError('not_found', 'Athlete not found', 404);

  // Merge de los días enviados sobre lo almacenado; parseAvailability vuelve a
  // sanear antes de persistir (defensa en profundidad).
  const merged = parseAvailability({ ...current, ...parsed.data.availability });

  try {
    const updated = await sql<Array<{ id: string }>>`
      update athletes
      set availability_json = ${sql.json(merged)}::jsonb,
          updated_at = now()
      where id = ${athleteId}
      returning id::text as id
    `;
    if (updated.length === 0) return jsonError('not_found', 'Athlete not found', 404);
  } catch (err) {
    console.error('[PATCH /api/athlete/availability]', err);
    return jsonError('internal_error', 'Failed to update availability', 500);
  }

  // El cambio afecta a la materialización FUTURA (ver cabecera). Devolvemos el
  // estado ya mergeado para que el cliente refleje la verdad sin re-fetch.
  return jsonOk(availabilityResponse(merged));
}
