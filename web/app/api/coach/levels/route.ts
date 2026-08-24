import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadCoachMaxMicrocicloWeeks } from '@/lib/coach/microcycle-limits';
import { MICROCICLO_DEFAULT_MAX_WEEKS } from '@fahybrid/shared/domain/coach/program-months';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Row shape returned by the DB for athlete_levels
interface LevelRow {
  id: string;
  coach_id: string;
  name: string;
  label: string;
  description: string | null;
  sort_order: number;
}

// POST body schema
const createLevelSchema = z.object({
  name: z.string().min(1).max(32),
  label: z.string().min(1).max(64),
  description: z.string().max(512).optional(),
  sort_order: z.number().int().min(0).optional(),
});

// GET /api/coach/levels
export async function GET() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const coach_id = Number(session.coach_id);

  // Los niveles y el tope de semanas de un microciclo (card 135) viajan en el
  // MISMO endpoint: es el que el modal "Nuevo microciclo" ya pide al abrirse
  // (NuevoMicrocicloModal.tsx), así que no hace falta ni un endpoint nuevo ni
  // pasar el valor por dos árboles de componentes.
  const [rows, maxMicrocicloWeeks] = await Promise.all([
    sql<LevelRow[]>`
      select id::text, coach_id::text, name, label, description, sort_order
      from athlete_levels
      where coach_id = ${coach_id}
      order by sort_order asc, id asc
    `,
    loadCoachMaxMicrocicloWeeks({ coach_id }).catch(() => MICROCICLO_DEFAULT_MAX_WEEKS),
  ]);

  return jsonOk({ levels: rows, max_microcycle_weeks: maxMicrocicloWeeks });
}

// POST /api/coach/levels
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = createLevelSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const { name, label, description, sort_order } = parsed.data;
  const coach_id = Number(session.coach_id);

  try {
    const rows = await sql<LevelRow[]>`
      insert into athlete_levels (coach_id, name, label, description, sort_order)
      values (
        ${coach_id},
        ${name},
        ${label},
        ${description ?? null},
        ${sort_order ?? 0}
      )
      returning id::text, coach_id::text, name, label, description, sort_order
    `;

    return jsonOk({ level: rows[0] }, 201);
  } catch (err) {
    // Unique constraint (coach_id, name)
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('athlete_levels_coach_name_uq') || msg.includes('unique')) {
      return jsonError('conflict', `Ya existe un nivel con nombre "${name}"`, 409);
    }
    throw err;
  }
}
