import {
  coerceCoachMaxMicrocycleWeeks,
  MICROCICLO_DEFAULT_MAX_WEEKS,
} from '@fahybrid/shared/domain/coach/program-months';

/** GET /api/coach/levels is best-effort for the tope. HTML/401/parse fail → default. */
export async function readMaxMicrocycleWeeksFromLevelsResponse(
  res: Response,
): Promise<number> {
  if (!res.ok) return MICROCICLO_DEFAULT_MAX_WEEKS;
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return MICROCICLO_DEFAULT_MAX_WEEKS;
  }
  if (!body || typeof body !== 'object' || !('max_microcycle_weeks' in body)) {
    return MICROCICLO_DEFAULT_MAX_WEEKS;
  }
  return coerceCoachMaxMicrocycleWeeks(body.max_microcycle_weeks);
}
