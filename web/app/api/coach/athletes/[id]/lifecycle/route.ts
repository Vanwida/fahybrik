import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  pauseAthlete,
  resumeAthlete,
  bajaAthlete,
  reAltaAthlete,
  LifecycleError,
} from '@/lib/coach/athlete-lifecycle';
import { PAUSE_REASONS } from '@fahybrid/shared/domain/coach/athlete-lifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// PATCH body — one endpoint drives all four lifecycle transitions (#13). `reason` is
// required (and must be a PAUSE_REASONS code) for pause/baja; resume/re_alta ignore it.
const lifecycleSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'baja', 're_alta']),
    reason: z.enum(PAUSE_REASONS).optional(),
    note: z.string().trim().max(1000).optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date debe ser YYYY-MM-DD')
      .optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.action === 'pause' || v.action === 'baja') && !v.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'reason es obligatorio para pause y baja',
      });
    }
  });

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/athletes/[id]/lifecycle — pause | resume | baja | re_alta
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

  const parsed = lifecycleSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos de ciclo de vida inválidos', 422, parsed.error.flatten());
  }

  const coach_id = BigInt(session.coach_id);

  // Ownership-gated: an athlete not owned by this coach is reported as not-found,
  // never disclosed (same posture as the level / training-days endpoints).
  const owned = await sql<Array<{ id: string }>>`
    select id::text as id from athletes where id = ${athlete_id} and coach_id = ${Number(coach_id)}
  `;
  if (!owned[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  const athleteId = BigInt(athlete_id);
  const { action, reason, note, end_date } = parsed.data;

  try {
    switch (action) {
      case 'pause': {
        const result = await pauseAthlete({
          athlete_id: athleteId,
          reason: reason!,
          note,
          end_date,
          requested_by: 'coach',
          coach_id,
          // #43: authorship — the acting coach's users.id (coach_id is a coaches.id).
          by_user_id: session.user_id,
        });
        return jsonOk(result);
      }
      case 'resume': {
        const result = await resumeAthlete({ athlete_id: athleteId });
        return jsonOk(result);
      }
      case 'baja': {
        const result = await bajaAthlete({
          athlete_id: athleteId,
          reason: reason!,
          coach_id,
          // #43: authorship — the acting coach's users.id.
          by_user_id: session.user_id,
        });
        return jsonOk(result);
      }
      case 're_alta': {
        const result = await reAltaAthlete({ athlete_id: athleteId, coach_id });
        return jsonOk(result);
      }
    }
  } catch (err) {
    if (err instanceof LifecycleError) return jsonError(err.code, err.message, err.status);
    console.error('[PATCH /api/coach/athletes/[id]/lifecycle]', err);
    return jsonError('lifecycle_failed', 'No se pudo cambiar el estado del atleta', 500);
  }
}
