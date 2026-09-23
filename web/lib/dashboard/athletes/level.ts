import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { checkAssignableLevel } from '@/lib/coach/level-options';

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

  const athlete = await client<Array<{ id: string; level_id: string | null }>>`
    select id::text, level_id::text from athletes
    where id = ${params.athlete_id} and coach_id = ${coachId}
    limit 1
  `;
  if (!athlete[0]) {
    throw new AthleteLevelError('not_found', 'Atleta no encontrado', 404);
  }

  // Del coach y activo — o el que ya lleva (retirar un nivel no obliga a cambiárselo).
  const check = await checkAssignableLevel(client, coachId, params.level_id, [athlete[0].level_id]);
  if (!check.ok) {
    throw new AthleteLevelError(check.reason === 'archived' ? 'level_archived' : 'not_found', check.message, check.reason === 'archived' ? 422 : 404);
  }
  await client`
    update athletes
    set level_id = ${params.level_id}, level_source = 'coach'
    where id = ${params.athlete_id}
  `;

  return {
    level_id: String(params.level_id),
    level_name: check.level.name,
    level_source: 'coach',
  };
}
