import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

interface AthleteLevel {
  level_id: string | null;
  level_name: string | null;
  level_label: string | null;
  suggested_level_id: string | null;
  suggested_level_name: string | null;
  suggested_level_label: string | null;
  level_source: string | null;
  level_confidence: string | null;
}

const patchLevelSchema = z.object({
  level_id: z.number().int().positive(),
});

function parseAthleteId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// GET /api/coach/athletes/[id]/level
export async function GET(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const athlete_id = parseAthleteId(rawId);
  if (athlete_id === null) return jsonError('bad_request', 'id de atleta inválido', 400);

  const coach_id = Number(session.coach_id);

  const rows = await sql<AthleteLevel[]>`
    select
      a.level_id::text                   as level_id,
      al.name                            as level_name,
      al.label                           as level_label,
      a.suggested_level_id::text         as suggested_level_id,
      sal.name                           as suggested_level_name,
      sal.label                          as suggested_level_label,
      a.level_source,
      a.level_confidence
    from athletes a
    left join athlete_levels al  on al.id = a.level_id
    left join athlete_levels sal on sal.id = a.suggested_level_id
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
    limit 1
  `;

  if (!rows[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  return jsonOk(rows[0]);
}

// PATCH /api/coach/athletes/[id]/level
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

  const parsed = patchLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos: level_id debe ser un número positivo', 422, parsed.error.flatten());
  }

  const coach_id = Number(session.coach_id);
  const { level_id } = parsed.data;

  // Verify athlete belongs to this coach
  const athlete = await sql<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${athlete_id} and coach_id = ${coach_id}
    limit 1
  `;
  if (!athlete[0]) return jsonError('not_found', 'Atleta no encontrado', 404);

  // Verify the level belongs to this coach
  const level = await sql<Array<{ id: string }>>`
    select id::text from athlete_levels
    where id = ${level_id} and coach_id = ${coach_id}
    limit 1
  `;
  if (!level[0]) return jsonError('not_found', 'Nivel no encontrado o no pertenece a este coach', 404);

  await sql`
    update athletes
    set level_id = ${level_id}, level_source = 'coach'
    where id = ${athlete_id}
  `;

  return jsonOk({ level_id: level_id.toString(), level_source: 'coach' });
}
