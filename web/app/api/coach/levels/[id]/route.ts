import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Ctx {
  params: Promise<{ id: string }>;
}

// Row shape returned by the DB for athlete_levels
interface LevelRow {
  id: string;
  coach_id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
}

const updateLevelSchema = z.object({
  name: z.string().min(1).max(32).optional(),
  label: z.string().min(1).max(64).optional(),
  description: z.string().max(512).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

function parseLevelId(raw: string): number | null {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// PATCH /api/coach/levels/[id]
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const level_id = parseLevelId(rawId);
  if (level_id === null) return jsonError('bad_request', 'id inválido', 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = updateLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  if (Object.keys(parsed.data).length === 0) {
    return jsonError('bad_request', 'No hay campos para actualizar', 400);
  }

  const coach_id = Number(session.coach_id);
  const { name, label, description, sort_order } = parsed.data;

  // Build a dynamic SET clause using individual conditional updates to keep
  // typed template literals (postgres.js doesn't support dynamic fragments easily).
  // We re-fetch after update for a clean returning shape.
  try {
    const existing = await sql<Array<{ id: string }>>`
      select id::text from athlete_levels
      where id = ${level_id} and coach_id = ${coach_id}
      limit 1
    `;
    if (!existing[0]) return jsonError('not_found', 'Nivel no encontrado', 404);

    // Apply only the provided fields
    if (name !== undefined) {
      await sql`update athlete_levels set name = ${name} where id = ${level_id}`;
    }
    if (label !== undefined) {
      await sql`update athlete_levels set label = ${label} where id = ${level_id}`;
    }
    if (description !== undefined) {
      await sql`update athlete_levels set description = ${description} where id = ${level_id}`;
    }
    if (sort_order !== undefined) {
      await sql`update athlete_levels set sort_order = ${sort_order} where id = ${level_id}`;
    }

    const rows = await sql<LevelRow[]>`
      select id::text, coach_id::text, name, label, description, sort_order
      from athlete_levels
      where id = ${level_id}
      limit 1
    `;

    return jsonOk({ level: rows[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('athlete_levels_coach_name_uq') || msg.includes('unique')) {
      return jsonError('conflict', `Ya existe un nivel con ese nombre`, 409);
    }
    throw err;
  }
}

// DELETE /api/coach/levels/[id]
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id: rawId } = await ctx.params;
  const level_id = parseLevelId(rawId);
  if (level_id === null) return jsonError('bad_request', 'id inválido', 400);

  const coach_id = Number(session.coach_id);

  const existing = await sql<Array<{ id: string }>>`
    select id::text from athlete_levels
    where id = ${level_id} and coach_id = ${coach_id}
    limit 1
  `;
  if (!existing[0]) return jsonError('not_found', 'Nivel no encontrado', 404);

  // Guard: refuse deletion if any athlete currently holds this level
  const inUse = await sql<Array<{ cnt: string }>>`
    select count(*)::text as cnt from athletes
    where level_id = ${level_id}
    limit 1
  `;
  if (Number(inUse[0]?.cnt ?? '0') > 0) {
    return jsonError(
      'conflict',
      'No se puede eliminar un nivel asignado a atletas. Reasigna los atletas primero.',
      409,
    );
  }

  await sql`delete from athlete_levels where id = ${level_id} and coach_id = ${coach_id}`;

  return new Response(null, { status: 204 });
}
