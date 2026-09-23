// «Enviar a varios»: a quién le llega un mensaje del coach elegido por atletas
// y/o grupos. Cada destinatario lo recibe en SU hilo 1:1 (nunca un chat de
// grupo), así que aquí solo se resuelve el conjunto — el envío es el de siempre.
//
// Un grupo = sus miembros ACTIVOS (`athlete_sequence_progress.status = 'active'`,
// plan §4.5). Todo con dueño: un atleta o un grupo que no sea del coach hace
// fallar la resolución entera (no se manda nada a medias).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

export class BroadcastForbiddenError extends Error {
  constructor() {
    super('Uno o más atletas o grupos no son tuyos');
  }
}

/**
 * Los ids de atleta (únicos, ordenados) a los que va el mensaje. Lanza
 * `BroadcastForbiddenError` si algún atleta o grupo pedido no es del coach.
 * Un atleta dado de baja nunca recibe un envío por estar en un grupo; si se le
 * elige a mano, sí (el coach lo ha pedido explícitamente).
 */
export async function resolveBroadcastRecipients(params: {
  coach_id: bigint | number;
  athlete_ids: ReadonlyArray<string | number>;
  group_ids: ReadonlyArray<string | number>;
  client?: Sql;
}): Promise<number[]> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athleteIds = [...new Set(params.athlete_ids.map(Number))];
  const groupIds = [...new Set(params.group_ids.map(Number))];

  const [owned, groups, members] = await Promise.all([
    athleteIds.length
      ? client<Array<{ id: string }>>`
          select id::text from athletes where coach_id = ${coach_id} and id = any(${athleteIds}::bigint[])
        `
      : Promise.resolve([]),
    groupIds.length
      ? client<Array<{ id: string }>>`
          select id::text from program_sequences where coach_id = ${coach_id} and id = any(${groupIds}::bigint[])
        `
      : Promise.resolve([]),
    groupIds.length
      ? client<Array<{ id: string }>>`
          select distinct a.id::text as id
          from athlete_sequence_progress sp
          join program_sequences ps on ps.id = sp.sequence_id and ps.coach_id = ${coach_id}
          join athletes a on a.id = sp.athlete_id and a.coach_id = ${coach_id}
          where sp.status = 'active'
            and sp.sequence_id = any(${groupIds}::bigint[])
            and a.lifecycle_status::text <> 'baja'
        `
      : Promise.resolve([]),
  ]);

  if (owned.length !== athleteIds.length || groups.length !== groupIds.length) {
    throw new BroadcastForbiddenError();
  }
  const all = new Set<number>(athleteIds);
  for (const m of members) all.add(Number(m.id));
  return [...all].sort((a, b) => a - b);
}
