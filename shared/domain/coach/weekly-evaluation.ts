import type { Sql } from 'postgres';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  parseIsoDate,
  startOfDayInBox,
} from '../atr/dates';
import { buildAthleteContextPack, type AthleteContextPack } from './pablo-ia-context';
import {
  evaluateWeeklyVerdictFromContext,
  type WeeklyVerdict,
} from './weekly-verdict-rules';

export type { WeeklyVerdict } from './weekly-verdict-rules';
export { evaluateWeeklyVerdictFromContext } from './weekly-verdict-rules';

export type WeeklyEvaluationResult = {
  athlete_id: string;
  week_start: string;
  week_end: string;
  verdict: WeeklyVerdict;
  context_pack: AthleteContextPack;
  triggers: string[];
};

function parseWeekStart(iso: string): Date {
  return mondayOfWeek(parseIsoDate(iso));
}

/** Lunes de la semana N-1 respecto a hoy (zona del box) — default cuando no se pasa week_start. */
export function defaultEvaluationWeekStart(now: Date = new Date()): string {
  const today = startOfDayInBox(now);
  // mondayOfWeek(today - 7d) = lunes de la semana anterior.
  return isoDateString(mondayOfWeek(addDays(today, -7)));
}

export async function evaluateAthleteWeek(params: {
  athlete_id: number | bigint;
  week_start?: string;
  client: Sql;
}): Promise<WeeklyEvaluationResult> {
  const client = params.client;
  const today = startOfDayInBox(new Date());
  const weekStart = params.week_start
    ? parseWeekStart(params.week_start)
    : mondayOfWeek(addDays(today, -7));
  const weekStartIso = isoDateString(weekStart);
  const weekEndIso = isoDateString(addDays(weekStart, 6));

  const pack = await buildAthleteContextPack({
    athlete_id: params.athlete_id,
    on_date: addDays(weekStart, 6),
    client,
  });

  const { verdict, triggers } = evaluateWeeklyVerdictFromContext(pack);

  return {
    athlete_id: String(params.athlete_id),
    week_start: weekStartIso,
    week_end: weekEndIso,
    verdict,
    context_pack: pack,
    triggers,
  };
}
