import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { sequenceDaysPerWeek } from '@fahybrid/shared/schema/program-sequences';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// training_days_per_week is the second half of an athlete's assignment
// classification (the first being level_id). The resolver only produces an
// assignable sequence cell once BOTH are set, and sequences are only defined for
// the 3-6 sessions/week band → we validate against the shared band schema so the
// stored value can never fall outside what the resolver can match.
const patchTrainingDaysSchema = z.object({
  training_days_per_week: sequenceDaysPerWeek,
});

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/athletes/[id]/training-days
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = patchTrainingDaysSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(
      'validation_error',
      'Datos inválidos: los días/semana deben estar entre 3 y 6.',
      422,
      parsed.error.flatten(),
    );
  }

  const coach_id = Number(session.coach_id);
  const { training_days_per_week } = parsed.data;

  // Ownership-gated update: an athlete not owned by this coach is reported as
  // not-found, never disclosed (same posture as the level endpoint).
  const updated = await sql<Array<{ id: string }>>`
    update athletes
    set training_days_per_week = ${training_days_per_week}
    where id = ${athlete_id} and coach_id = ${coach_id}
    returning id::text as id
  `;
  if (!updated[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  return jsonOk({ training_days_per_week });
}
