import { z } from 'zod';
import { exerciseCategory } from '@fahybrid/shared/schema/_primitives';
import { sql } from '@/lib/db';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { getCoachSession } from '@/lib/auth/coach-session';
import { loadCoachCatalog } from '@/lib/dashboard/exercises/list-exercises';
import {
  createExercise,
  createExerciseSchema,
  ExerciseCreateError,
} from '@/lib/dashboard/exercises/create-exercise';
import { loadCoachExerciseRow } from '@/lib/exercises/coach-override';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  category: exerciseCategory.optional(),
  // The catalog's origin facet — Todos (omitted) | Base | Personalizados | Míos.
  origin: z.enum(['base', 'customized', 'own']).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

/**
 * GET /api/exercises — the coach's catalog: the BASE exercises (each with THEIR
 * override applied) plus the exercises they created. Never another coach's.
 */
export async function GET(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get('category') ?? undefined,
    origin: url.searchParams.get('origin') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError('bad_request', 'Query inválida', 400, parsed.error.flatten());
  }

  const { category, origin, search, limit } = parsed.data;
  const rows = await loadCoachCatalog(sql, session.coach_id, { category, origin, search, limit });
  return jsonOk({ exercises: rows });
}

/**
 * POST /api/exercises — create an exercise the coach is missing (the picker's
 * "crear ejercicio nuevo" row, or the Biblioteca catalog). Body: name + category +
 * modality (+ optional YouTube). The coach DECLARES the modality — it is not derived
 * from the name any more (see create-exercise.ts: the old rule read English regexes
 * and silently filed a Spanish "Remo 500m" under `other`, breaking the analytics that
 * route on it). The row is the coach's OWN — no other coach sees it (mig 0132).
 *
 * RESPONDE LA MISMA FILA QUE GET Y PATCH (`CoachExerciseRow`: contenido fusionado +
 * base_* + override_* + origin), y no la fila cruda de `createExercise`. Esa fila
 * cruda no trae `origin`, así que el catálogo pintaba `EXERCISE_ORIGIN_META[undefined]`
 * y se caía en cuanto se creaba algo desde la Biblioteca — invisible hasta ahora sólo
 * porque crear devolvía 400 antes de llegar. Un endpoint que contesta una forma
 * distinta a la que lista es un endpoint que obliga a cada consumidor a rellenar los
 * huecos a mano, y a que uno de ellos se le olvide.
 */
export async function POST(req: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = createExerciseSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('bad_request', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const created = await createExercise(parsed.data, session.coach_id);
    // Re-read it as the coach sees it. Un ejercicio recién creado es OWN por
    // construcción (no tiene override que fusionar), así que esto no cambia ningún
    // valor — cambia la FORMA, que es lo que el catálogo necesita para pintar la fila
    // sin adivinar. Si desapareciera entre el insert y el select, la fila cruda sigue
    // siendo una respuesta honesta del 201.
    const exercise =
      (await loadCoachExerciseRow(sql, session.coach_id, BigInt(created.id))) ?? created;
    return jsonOk({ exercise }, 201);
  } catch (err) {
    if (err instanceof ExerciseCreateError) {
      return jsonError(err.code, err.message, err.status);
    }
    const message = err instanceof Error ? err.message : 'No se pudo crear';
    return jsonError('internal_error', message, 500);
  }
}
