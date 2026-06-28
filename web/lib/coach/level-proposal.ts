import 'server-only';
import { sql } from '@/lib/db';
import {
  suggestLevel,
  scoreHyroxTime,
  type Benchmark,
  type AthleteProfile,
  type LevelResult,
} from './level-algorithm';
import { getBestRealHyroxResult } from '@/lib/races/athlete-races';

/**
 * Runs the level-suggestion for a newly onboarded athlete and writes the result
 * to athletes.suggested_level_id + athletes.level_confidence.
 *
 * Signal priority:
 *   1. A REAL HYROX singles result (an actual finish, imported or logged) is the
 *      gold standard — it sets the level directly via the single-source time→level
 *      mapping (scoreHyroxTime), with high confidence. You don't average a proxy
 *      (5k, squat, a self-declared time) once you have the real measurement.
 *   2. Otherwise fall back to the benchmark/experience algorithm (suggestLevel),
 *      which already factors the self-declared HYROX time + 5k + 2k row + squat.
 *
 * Safe to fire-and-forget: never throws past the guard clause (unknown errors
 * are rethrown so they surface in server logs, not silently eaten).
 *
 * Only writes when level_id IS NULL — i.e. the coach hasn't manually assigned
 * a level yet. Re-running after manual assignment is a no-op, so it's safe to
 * call again whenever new races are imported (e.g. on intake-review load).
 */
export async function computeAndStoreLevelSuggestion(
  athleteId: number,
  coachId: number,
): Promise<void> {
  // 1. Load benchmarks
  const benchmarks = await sql<Benchmark[]>`
    SELECT exercise_slug, value::float AS value, unit
    FROM athlete_benchmarks
    WHERE athlete_id = ${athleteId}
  `;

  // 2. Load profile (sex, weight_kg, training_experience_years)
  const profileRows = await sql<AthleteProfile[]>`
    SELECT sex, weight_kg, training_experience_years
    FROM athletes
    WHERE id = ${athleteId} AND coach_id = ${coachId}
    LIMIT 1
  `;
  const athlete = profileRows[0];
  if (!athlete) return;

  // 3. Resolve the level. Real HYROX result wins; else the benchmark algorithm.
  const realHyrox = await getBestRealHyroxResult(athleteId, sql);
  const result: LevelResult =
    realHyrox.best_time_seconds != null
      ? {
          suggested_level: scoreHyroxTime(realHyrox.best_time_seconds, athlete.sex),
          confidence: 'high',
          signals_used: ['hyrox_real_result'],
        }
      : suggestLevel(benchmarks, athlete);

  // 4. Find the matching level_id for this coach (levels are named 'N1'–'N5')
  const levelRows = await sql<Array<{ id: number }>>`
    SELECT id FROM athlete_levels
    WHERE coach_id = ${coachId} AND name = ${'N' + result.suggested_level}
    LIMIT 1
  `;
  const level = levelRows[0];
  if (!level) return;

  // 5. Write suggested_level_id + level_confidence (only when not yet manually assigned)
  await sql`
    UPDATE athletes
    SET suggested_level_id = ${level.id},
        level_confidence = ${result.confidence}
    WHERE id = ${athleteId}
      AND coach_id = ${coachId}
      AND level_id IS NULL
  `;
}
