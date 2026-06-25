import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/zone-profile/confirm
// --------------------------------------------------
// Confirm an athlete's AUTO-derived (onboarding) zone profile for one modality:
// flip needs_review=false on the CURRENT (highest-version) profile. This is the
// coach's "estas zonas valen" — the auto profile becomes validated (it already
// fed the doses; confirming just clears the "revisar" state). To CHANGE the zones
// the coach registers a manual test instead (that path writes a coach_test that
// always wins). Coach-ownership gated.

const bodySchema = z.object({
  modality: z.enum(['row', 'ski', 'run', 'bike']),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const athlete_id = Number(id);
  if (!Number.isFinite(athlete_id) || athlete_id <= 0) {
    return jsonError('bad_request', 'Atleta inválido', 400);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const { modality } = parsed.data;
  const coach_id = Number(session.coach_id);

  // Ownership gate.
  const owned = await sql<{ id: string }[]>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id}
  `;
  if (owned.length === 0) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  // Clear needs_review on the current (highest-version) profile for this modality.
  const updated = await sql<{ id: string; needs_review: boolean }[]>`
    update athlete_zone_profiles zp
    set needs_review = false
    where zp.id = (
      select id from athlete_zone_profiles
      where athlete_id = ${athlete_id} and modality = ${modality}
      order by version desc
      limit 1
    )
    returning zp.id::text, zp.needs_review
  `;
  if (updated.length === 0) {
    return jsonError('not_found', 'No hay perfil de zonas para esta modalidad', 404);
  }

  return jsonOk({ profile_id: updated[0].id, modality, needs_review: updated[0].needs_review });
}
