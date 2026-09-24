// ANALYTICS · DRILL-DOWN — the other half of the design's core pattern: every
// aggregate opens its REAL source sessions ("ningún número sin su lista"). Given
// a (kind, params, period) — exactly what the section's DrillRef carried — this
// re-runs the SAME window and returns the rows that produced the number. No
// fabrication: each row is a real segment_executions / set_executions / races /
// athlete_benchmarks / athlete_strength_maxes / workout_executions /
// biometric_streams row.
//
// This file is a THIN DISPATCHER: each section owns its drill handlers in
// ./drills/<section>.ts (co-located with that section's data-loading helpers), so
// a drill never drifts from the card it opens and every module stays digestible.

import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { loadAthleteTimezone } from '@fahybrid/shared/domain/db/athlete-timezone';
import type { DrillDownResult, ResolvedPeriod } from './core';
import { runningDrill, bestEffortDrill } from './drills/running';
import { ergoDrill, ergoPowerDrill, ergoCaloriesDrill } from './drills/ergo';
import { strengthDrill, strengthVolumeDrill, strengthExerciseDrill } from './drills/strength';
import { hyroxRaceDrill, hyroxScoresDrill, hyroxTransferDrill } from './drills/hyrox';
import { recoveryDrill } from './drills/recovery';

export async function buildDrillDown(
  args: { athlete_id: number | bigint; kind: string; params: Record<string, string>; period: ResolvedPeriod },
  client: Sql = defaultSql,
): Promise<DrillDownResult | null> {
  const athleteId = Number(args.athlete_id);
  const { kind, params, period } = args;
  // A row is dated on the ATHLETE's day, like the card it opens (DECISIONS «Qué
  // día es en cada sitio»): his zone, resolved once here.
  const tz = await loadAthleteTimezone(client, athleteId);

  switch (kind) {
    case 'running.volume':
    case 'running.type':
    case 'running.zone':
      return runningDrill(client, athleteId, kind, params, period, tz);
    case 'running.best_effort':
      return bestEffortDrill(client, athleteId, params, period, tz);
    case 'ergo.split':
      return ergoDrill(client, athleteId, params, period, tz);
    case 'ergo.power':
      return ergoPowerDrill(client, athleteId, params, period, tz);
    case 'ergo.calories':
      return ergoCaloriesDrill(client, athleteId, params, period, tz);
    case 'strength.lift':
      return strengthDrill(client, athleteId, params, period, tz);
    case 'strength.volume':
      return strengthVolumeDrill(client, athleteId, period, tz);
    case 'strength.exercise':
      return strengthExerciseDrill(client, athleteId, params, period, tz);
    case 'hyrox.race':
      return hyroxRaceDrill(client, athleteId, params, period);
    case 'hyrox.scores':
      return hyroxScoresDrill(client, athleteId, period, tz);
    case 'hyrox.transfer':
      return hyroxTransferDrill(client, athleteId, period);
    case 'recovery.metric':
      return recoveryDrill(client, athleteId, params, period, tz);
    default:
      return null;
  }
}
