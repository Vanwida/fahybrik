// POST /api/coach/exercises/resolve — la palabra de la línea rápida → un
// ejercicio del catálogo de ESTE coach (lib/exercises/resolve.ts, PLAN §4.9).
// Varias palabras en una llamada (un día pegado entero). snake_case.

import { jsonError, jsonOk } from '@/lib/api/responses';
import { requireCoach } from '@/lib/auth/require-coach';
import { resolveExercises } from '@/lib/exercises/resolve';
import { learnSynonymSchema, resolveTokensSchema } from '@/lib/dashboard/programming/schemas';
import { learnSynonym } from '@/lib/import/exercise-resolve';
import { invisibleExerciseIds } from '@/lib/exercises/coach-override';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = resolveTokensSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', 'Escribe al menos un ejercicio.', 400);
  const results = await resolveExercises({ coach_id: auth.session.coach_id, tokens: parsed.data.tokens });
  return jsonOk({ results });
}

// PUT — el coach eligió un ejercicio para una palabra: se aprende como sinónimo
// SUYO (coach_exercise_synonyms), así la próxima vez sale solo.
export async function PUT(req: Request) {
  const auth = await requireCoach();
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = learnSynonymSchema.safeParse(body);
  if (!parsed.success) return jsonError('invalid_payload', 'Datos no válidos', 400);
  const exerciseId = Number(parsed.data.exercise_id);
  if ((await invisibleExerciseIds(sql, auth.session.coach_id, [exerciseId])).length > 0) {
    return jsonError('not_found', 'Ese ejercicio no está en tu catálogo.', 404);
  }
  await learnSynonym(Number(auth.session.coach_id), parsed.data.term, exerciseId);
  return jsonOk({ ok: true });
}
