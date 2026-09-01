// POST /api/coach/exercises/missing
//
// Para cada nombre que una importación no supo resolver, devuelve los ejercicios
// del catálogo del coach que MÁS SE LE PARECEN, para que pueda fusionar en vez de
// duplicar. No crea nada ni decide nada: propone.
//
// Existe como ruta y no en el navegador porque el catálogo vive aquí: bajarse
// cientos de ejercicios al cliente para compararlos es peor por todos lados.
//
// El parecido lo calcula `lib/dashboard/exercises/near-match.ts` (puro y
// testeado); esta ruta solo pone la sesión, el catálogo VISIBLE para ese coach y
// el despacho. Cada candidato viaja con su modalidad a propósito: fusionar un
// remo de ergómetro dentro de un «Remo con barra» manda al atleta por la ruta
// equivocada del entreno en vivo, así que el coach tiene que ver qué es cada uno.

import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { loadCoachExerciseCatalog } from '@/lib/dashboard/coach/ai/exercise-catalog';
import {
  findNearMatches,
  type NearMatchCandidate,
  type ScoredCandidate,
} from '@/lib/dashboard/exercises/near-match';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** El mismo tope que el alta en bloque: son las dos caras de la misma pantalla. */
const MAX_TOKENS = 60;

const missingRequestSchema = z
  .object({
    tokens: z.array(z.string().trim().min(1).max(200)).min(1).max(MAX_TOKENS),
  })
  .strict();

export interface MissingMatchesResponse {
  matches: Array<{ token: string; candidates: ScoredCandidate[] }>;
}

export async function POST(request: Request) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }
  const parsed = missingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  try {
    // El catálogo entero UNA vez, no una consulta por nombre: son treinta
    // nombres contra unos cientos de ejercicios y comparar en memoria es
    // inmediato. `limit: null` = todo lo que el coach ve (base + suyos).
    const rows = await loadCoachExerciseCatalog(sql, session.coach_id, {
      order: 'name',
      limit: null,
    });
    const catalog: NearMatchCandidate[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      modality: r.modality,
      category: r.category,
    }));

    const matches = parsed.data.tokens.map((token) => ({
      token,
      candidates: findNearMatches(token, catalog),
    }));
    return jsonOk<MissingMatchesResponse>({ matches });
  } catch {
    // Sin sugerencias la pantalla sigue siendo usable: se crean sin fusionar.
    // Por eso esto no rompe la importación, solo se queda sin proponer.
    return jsonError('lookup_failed', 'No se pudieron buscar coincidencias.', 502);
  }
}
