import 'server-only';
import { sql } from '@/lib/db';
import { suggestLevel, type Benchmark, type AthleteProfile } from './level-algorithm';

/**
 * Runs the level-suggestion algorithm for a newly onboarded athlete and writes
 * the result to athletes.suggested_level_id + athletes.level_confidence.
 *
 * Safe to fire-and-forget: never throws past the guard clause (unknown errors
 * are rethrown so they surface in server logs, not silently eaten).
 *
 * Only writes when level_id IS NULL — i.e. the coach hasn't manually assigned
 * a level yet. Re-running after manual assignment is a no-op.
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

  // 3. Run algorithm
  const result = suggestLevel(benchmarks, athlete);

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
