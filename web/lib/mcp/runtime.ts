// Lo que toda tool del conector comparte: cómo se responde, cómo se niega, y
// cómo entra el coach.
//
// Vive aparte de `tools.ts` porque hay varios ficheros de tools (por dominio:
// atletas, plan, carreras, biblioteca, comunicados) y todos necesitan estas tres
// piezas. Tenerlas en uno de ellos obligaría a los demás a importar de un módulo
// que a su vez los importa.
//
// TENANCY. `withCoach` es la única puerta: el `coach_id` sale SIEMPRE del token
// OAuth, nunca de un argumento del cliente, y se resuelve en cada llamada (una
// membresía revocada a mitad de conversación tiene que cortar la siguiente
// pregunta, no la siguiente reconexión). Los errores de propiedad de las libs se
// traducen aquí a UNA frase, la misma para «no existe» y para «es de otro club»:
// confirmar que un id existe en otro sitio ya sería la fuga.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { sql } from '@/lib/db';
import { AthleteDeepDiveError } from '@/lib/coach/athlete-deep-dive';
import { AthletePlanError } from '@/lib/dashboard/coach/athlete-plan';
import { CoachRacesError } from '@/lib/races/coach-races';
import { CommunicationError } from '@/lib/communications/store';
import type { CoachSession } from '@/lib/auth/coach-session';
import { McpNotACoachError, coachFromAuthInfo } from './auth';

/**
 * Lo que se le dice al asistente cuando pide un atleta que no es del club que
 * pregunta — o que no existe. La misma frase para los dos casos, y con la salida:
 * de dónde saca un athlete_id que sí valga.
 */
export const NO_SUCH_ATHLETE_MESSAGE =
  'No hay ningún atleta tuyo con ese identificador. Pide la lista con list_athletes y usa el athlete_id que salga ahí.';

/**
 * Every answer is JSON plus `_resumen`, the one line a person would have said.
 * `structuredContent` carries the same object so a client that understands it
 * gets the data typed instead of re-parsing a string out of the text block.
 */
export function ok(payload: Record<string, unknown>, resumen: string): CallToolResult {
  const body = { _resumen: resumen, ...payload };
  return {
    content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
    structuredContent: body,
  };
}

/**
 * A refusal the assistant can read out loud and act on. `isError` is what stops
 * it from treating the sentence as data and telling the coach his athlete has a
 * readiness of "no encontrado".
 */
export function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * El atleta, si es de ESTE coach. Null si no lo es o no existe — el que llama
 * responde lo mismo en los dos casos.
 *
 * Existe porque una tool necesita dos cosas de esa fila: la comprobación de
 * propiedad EN la tool (aunque la lib que viene después la repita dentro de su
 * WHERE) y el NOMBRE, porque el resumen de una línea empieza por él: el coach
 * piensa en «Ana», no en el atleta 412.
 */
export async function resolveOwnedAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number;
}): Promise<{ athlete_id: string; full_name: string } | null> {
  const rows = await sql<Array<{ athlete_id: string; full_name: string }>>`
    select id::text as athlete_id, full_name
    from athletes
    where id = ${params.athlete_id} and coach_id = ${params.coach_id as number}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Runs a tool body with the coach resolved from the token, turning the expected
 * refusals into readable text instead of a stack trace: not a coach, and a
 * resource that is not his. Anything else rethrows — a DB outage must not be
 * dressed up as a clean answer.
 *
 * Las cuatro libs que se consultan levantan su propio error de propiedad
 * (`AthleteDeepDiveError`, `AthletePlanError`, `CoachRacesError`,
 * `CommunicationError`) y todas lo hacen con el `coach_id` DENTRO del WHERE, así
 * que llegar aquí ya significa «ese id no es tuyo». Solo se traducen los códigos
 * de no-encontrado: un 409 o un 422 de una lib son otra conversación y deben
 * seguir subiendo.
 *
 * `CommunicationError('not_found')` se traduce como atleta porque hoy el único
 * camino que lo levanta desde una tool es la comprobación de propiedad del atleta
 * en `listCommunicationsForAthlete`. Una tool futura que pida UN comunicado por
 * id tendría que traducirlo ella, no aquí.
 */
export async function withCoach(
  authInfo: AuthInfo | undefined,
  body: (
    coach_id: bigint,
    coach_name: string,
    /** La sesión entera, para lo que necesita más que el club: la auditoría
     *  necesita el `user_id` de la PERSONA que dictó la escritura, no del club. */
    session: CoachSession,
  ) => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    const coach = await coachFromAuthInfo(authInfo);
    return await body(coach.coach_id, coach.full_name, coach);
  } catch (err) {
    if (err instanceof McpNotACoachError) return fail(err.message);
    if (err instanceof AthleteDeepDiveError) return fail(NO_SUCH_ATHLETE_MESSAGE);
    if (err instanceof AthletePlanError && err.code === 'not_found') {
      return fail(NO_SUCH_ATHLETE_MESSAGE);
    }
    if (err instanceof CoachRacesError && err.code === 'not_found') {
      return fail(NO_SUCH_ATHLETE_MESSAGE);
    }
    if (err instanceof CommunicationError && err.code === 'not_found') {
      return fail(NO_SUCH_ATHLETE_MESSAGE);
    }
    throw err;
  }
}
