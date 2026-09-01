import 'server-only';

// El borde HTTP del comunicado: autenticar, sacar el id de la ruta, leer el
// cuerpo y traducir un error de dominio a su status.
//
// Existe porque los cuatro actos del atleta (visto, hecho, respondido, paso
// marcado) son la MISMA envoltura con distinta llamada dentro, y copiarla cuatro
// veces es la forma más fácil de que una de ellas se olvide de comprobar algo.

import { NextResponse } from 'next/server';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { recomputeAthlete } from '@/lib/coach/attention/recompute';
import { CommunicationError } from './store';

export interface RouteCtx {
  params: Promise<{ id: string }>;
}

/** Un id de la ruta, o null si no es un entero positivo. */
export function parseId(raw: string): string | null {
  return /^\d+$/.test(raw) && Number(raw) > 0 ? raw : null;
}

/** Traduce el error de dominio a su respuesta. Lo que no es de dominio es un
 *  fallo nuestro: se registra con su contexto y sale como 500. */
export function communicationErrorResponse(err: unknown, context: string): NextResponse {
  if (err instanceof CommunicationError) return jsonError(err.code, err.message, err.status);
  console.error(context, err);
  return jsonError('request_failed', 'No se pudo completar la operación', 500);
}

/** El cuerpo JSON, o `{}` cuando la petición no trae ninguno (un «visto» no lo
 *  necesita). Un JSON roto sí es un error: no se adivina. */
async function readBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim().length === 0) return {};
  return JSON.parse(text) as unknown;
}

/**
 * La envoltura de todo acto del atleta sobre un comunicado: Bearer, id válido,
 * cuerpo leído y errores traducidos. El acto en sí lo pone cada ruta.
 */
export async function athleteCommunicationAct<T>(
  req: Request,
  ctx: RouteCtx,
  context: string,
  run: (args: {
    athlete_id: bigint;
    communication_id: string;
    body: unknown;
  }) => Promise<T>,
): Promise<NextResponse> {
  const session = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!session) return jsonError('unauthorized', 'Sesión de atleta requerida', 401);

  const { id: rawId } = await ctx.params;
  const communication_id = parseId(rawId);
  if (!communication_id) return jsonError('bad_request', 'Id de comunicado inválido', 400);

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  try {
    const result = await run({ athlete_id: session.athlete_id, communication_id, body });
    // Los cuatro actos cambian lo que este comunicado le sigue reclamando, así
    // que la señal del coach en /hoy se recalcula YA y no espera al barrido de
    // los quince minutos: perseguir a quien acaba de responder es peor que no
    // haber avisado. Best-effort, como en el resto de mutaciones — si falla, el
    // barrido lo arregla solo.
    void recomputeAthlete({ athlete_id: session.athlete_id }).catch(() => {});
    return jsonOk(result);
  } catch (err) {
    return communicationErrorResponse(err, context);
  }
}
