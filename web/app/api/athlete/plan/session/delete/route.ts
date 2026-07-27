// POST /api/athlete/plan/session/delete
//
// Delete a SELF-ORIGIN session (entreno libre) outright — assignment + execution,
// gone. The missing half of the correction layer that produced Alex's ghosts
// (IMG_2389): the only undo was `reset`, which flips a session back to PENDIENTE —
// exactly right for a coach session, exactly wrong for a free one. THE RULE: a
// free workout is never an obligation — it exists done, or it doesn't exist. Its
// athlete made it; its athlete can delete it.
//
// A coach-origin session refuses with its own code: resetting is the honest move
// there (the plan is the coach's, the athlete only un-marks their log).

import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { captureRouteError } from '@/lib/observability/capture';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BodySchema = z.object({ assignment_id: z.number().int().positive() }).strict();

export async function POST(req: Request): Promise<Response> {
  const auth = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Athlete session required', 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError('invalid_body', 'Datos inválidos', 400);

  try {
    // Athlete-scoped by construction; another athlete's id reads as not_found.
    const rows = await sql<{ id: string; origin: string }[]>`
      select id::text as id, origin::text as origin
      from workout_assignments
      where id = ${parsed.data.assignment_id} and athlete_id = ${auth.athlete_id as unknown as number}
      limit 1
    `;
    const found = rows[0];
    if (!found) return jsonError('not_found', 'Sesión no encontrada', 404);
    if (found.origin !== 'self') {
      return jsonError(
        'coach_session',
        'Esta sesión es de tu entrenador — se puede deshacer, no borrar',
        409,
      );
    }

    // Executions + segments cascade from the assignment FK (0001).
    await sql`delete from workout_assignments where id = ${parsed.data.assignment_id}`;
    return jsonOk({ deleted: true });
  } catch (err) {
    captureRouteError(err, { route: 'api/athlete/plan/session/delete.POST' });
    return jsonError('delete_failed', 'No pudimos borrar el entreno', 500);
  }
}
