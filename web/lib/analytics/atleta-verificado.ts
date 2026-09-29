import 'server-only';

// UN ATLETA VERIFICADO — el id de atleta que los cargadores de analíticas
// aceptan, y que solo se puede fabricar por dos caminos:
//
//   · la sesión firmada del atleta (`desdeSesionDeAtleta`): el id sale del
//     token, nunca de la petición;
//   · el guard del coach (`verificarAtletaDelCoach`): comprueba en la base que
//     el atleta pertenece al club del coach, o devuelve null.
//
// Con esto, una consulta filtrada por `athlete_id` en `web/lib/analytics/*` es
// de ámbito seguro por construcción: no hay forma de llamar al cargador con un
// id que venga de la URL sin pasar por aquí. Es lo que sostiene el
// `// tenancy: verified-owner` de esas consultas (tests/tenancy/ambito).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

// Un símbolo REAL, no solo de tipos: la marca existe en el objeto, así que
// tampoco se puede fabricar el tipo con un objeto literal por accidente.
const verificado: unique symbol = Symbol('atleta-verificado');

export interface AtletaVerificado {
  readonly athlete_id: number;
  /** Quién lo verificó: la sesión del atleta, o el coach dueño. */
  readonly por: 'atleta' | 'coach';
  readonly coach_id: number | null;
  readonly [verificado]: true;
}

/**
 * LA ESCOTILLA, y es la única: un id que YA verificó una ruta anterior a este
 * módulo (las zonas de FC del reloj, `/api/athlete/zones`, la ficha del coach…
 * todas comprueban al atleta antes de leer sus anclas). Existe para que
 * `loadHrAnchors(athlete_id)` siga sirviendo a sus veinte llamadores sin
 * cambiarles la firma. No se usa en código nuevo: lo nuevo verifica con las dos
 * funciones de abajo. `grep atletaYaVerificado` tiene que devolver un solo
 * llamador aparte de este fichero.
 */
export function atletaYaVerificado(athlete_id: number): AtletaVerificado {
  return { athlete_id, por: 'atleta', coach_id: null, [verificado]: true } as AtletaVerificado;
}

/** El atleta de una sesión firmada. El id viene del token, no de la petición. */
export function desdeSesionDeAtleta(session: { athlete_id: bigint | number }): AtletaVerificado {
  return { athlete_id: Number(session.athlete_id), por: 'atleta', coach_id: null, [verificado]: true } as AtletaVerificado;
}

/**
 * El atleta `athlete_id` si pertenece al club de `coach_id`; null si no (la ruta
 * contesta 404 sin decir si existe: es de otro club o no existe, y da igual).
 */
export async function verificarAtletaDelCoach(
  athlete_id: number,
  coach_id: bigint | number,
  client: Sql = defaultSql,
): Promise<AtletaVerificado | null> {
  if (!Number.isSafeInteger(athlete_id) || athlete_id <= 0) return null;
  const rows = await client<Array<{ id: string }>>`
    select id::text as id from athletes
    where id = ${athlete_id} and coach_id = ${coach_id}
    limit 1
  `;
  if (rows.length === 0) return null;
  return { athlete_id, por: 'coach', coach_id: Number(coach_id), [verificado]: true } as AtletaVerificado;
}
