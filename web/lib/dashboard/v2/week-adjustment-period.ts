import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';

/** Evaluar N produce un ajuste para N+1; no son el mismo periodo. */
export function adjustmentWeekFor(evaluatedWeek: string): string {
  return isoDateString(addDays(parseIsoDate(evaluatedWeek), 7));
}

export function evaluatedWeekFor(adjustmentWeek: string): string {
  return isoDateString(addDays(parseIsoDate(adjustmentWeek), -7));
}

/** Sin origen explícito se revisa la primera pendiente; con origen, solo N+1. */
export function pendingForEvaluation<T extends { week_start: string }>(pending: T[], evaluatedWeek?: string): T | null {
  return pending.find((p) => !evaluatedWeek || p.week_start === adjustmentWeekFor(evaluatedWeek)) ?? null;
}
