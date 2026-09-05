import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';

/**
 * Escribe el nivel de un atleta. Es el mismo camino que
 * PATCH /api/coach/athletes/[id]/level: el nivel tiene que ser del coach, el
 * atleta también, y la fuente queda `coach`.
 */
export class AthleteLevelError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AthleteLevelError';
  }
}

export async function setAthleteLevel(params: {
  coach_id: number | bigint;
  athlete_id: number;
  level_id: number;
  client?: Sql;
}): Promise<{ level_id: string; level_name: string; level_source: 'coach' }> {
  const client = params.client ?? defaultSql;
  const coachId = Number(params.coach_id);

  const athlete = await client<Array<{ id: string }>>`
    select id::text from athletes
    where id = ${params.athlete_id} and coach_id = ${coachId}
    limit 1
  `;
  if (!athlete[0]) {
    throw new AthleteLevelError('not_found', 'Atleta no encontrado', 404);
  }

  const level = await client<Array<{ id: string; name: string }>>`
    select id::text as id, name
    from athlete_levels
    where id = ${params.level_id} and coach_id = ${coachId}
    limit 1
  `;
  if (!level[0]) {
    throw new AthleteLevelError(
      'not_found',
      'Nivel no encontrado o no pertenece a este coach',
      404,
    );
  }

  await client`
    update athletes
    set level_id = ${params.level_id}, level_source = 'coach'
    where id = ${params.athlete_id}
  `;

  return {
    level_id: String(params.level_id),
    level_name: level[0].name,
    level_source: 'coach',
  };
}
