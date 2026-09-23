import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { LevelSuggestion } from '@fahybrid/shared/domain/coach/level-criteria';
import { suggestLevelForAthlete, type AthleteProfile, type Benchmark } from './level-algorithm';
import { loadCoachLadder } from './levels';
import { getBestRealHyroxResult } from '@/lib/races/athlete-races';

/**
 * La sugerencia de nivel de un atleta sobre la escalera de SU coach, sin
 * escribir nada: la ficha la lee para decir por qué no hay sugerencia.
 *
 * La escalera son los niveles activos del coach en su orden, con los cortes de
 * cada uno (los suyos o, sin tocar, el defecto por posición) — nunca un nivel
 * buscado por el nombre literal 'N'+n. Null si el atleta no es del coach.
 */
export async function computeLevelSuggestion(
  athleteId: number,
  coachId: number,
  client: Sql = defaultSql,
): Promise<LevelSuggestion | null> {
  const profileRows = await client<AthleteProfile[]>`
    select sex, weight_kg::float8 as weight_kg, training_experience_years::float8 as training_experience_years
    from athletes
    where id = ${athleteId} and coach_id = ${coachId}
    limit 1
  `;
  const athlete = profileRows[0];
  if (!athlete) return null;

  const [benchmarks, ladder, realHyrox] = await Promise.all([
    client<Benchmark[]>`
      select exercise_slug, value::float8 as value, unit
      from athlete_benchmarks
      where athlete_id = ${athleteId}
    `,
    loadCoachLadder(coachId, client),
    getBestRealHyroxResult(athleteId, client),
  ]);

  const sex = athlete.sex === 'male' || athlete.sex === 'female' ? athlete.sex : null;
  return suggestLevelForAthlete({
    ladder,
    benchmarks,
    profile: { ...athlete, sex },
    realHyroxSeconds: realHyrox.best_time_seconds,
  });
}

/**
 * Calcula la sugerencia (`computeLevelSuggestion`) y la guarda en
 * `athletes.suggested_level_id` + `level_confidence`. Cuando no se puede
 * sugerir, se BORRA la sugerencia anterior (una vieja que ya no se sostiene es
 * peor que ninguna) y se devuelve el porqué, para que quien la pinte lo diga
 * (`levelSuggestionGap`).
 *
 * Solo escribe mientras el coach no haya fijado el nivel a mano (`level_id is
 * null`), así que se puede volver a llamar cuando entren carreras nuevas.
 */
export async function computeAndStoreLevelSuggestion(
  athleteId: number,
  coachId: number,
  client: Sql = defaultSql,
): Promise<LevelSuggestion | null> {
  const result = await computeLevelSuggestion(athleteId, coachId, client);
  if (!result) return null;
  await client`
    update athletes
    set suggested_level_id = ${result.status === 'suggested' ? Number(result.level_id) : null},
        level_confidence = ${result.status === 'suggested' ? result.confidence : null}
    where id = ${athleteId}
      and coach_id = ${coachId}
      and level_id is null
  `;
  return result;
}
