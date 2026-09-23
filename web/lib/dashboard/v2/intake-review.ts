import 'server-only';

// v2 · ALTAS · INTAKE REVIEW — server loader for the coach's per-athlete intake
// review screen. Composes the EXISTING intake surface (no parallel model):
//   · loadIntakeProfile         → onboarding answers + auto-suggestions + warnings
//   · loadIntakePlanOptions     → what the athlete would get with each plan choice
//                                 (their current plan, each group, each programa)
//   · loadClassification        → the agnostic level/días picker data (reused by
//                                 ClasificacionCard, the same control PerfilTab uses)
//
// Before reading the level, we RE-RUN the level suggestion so it reflects the
// athlete's real race history at this moment — including HYROX results imported
// AFTER onboarding (the compute is idempotent + guarded by level_id IS NULL, so
// it's a no-op once the coach has assigned a level). The level coalesce here then
// mirrors GET /api/coach/intake/[athlete_id] exactly. One concept, one behaviour.

import { sql } from '@/lib/db';
import { loadIntakeProfile, IntakeError, type IntakeProfile } from '@/lib/coach/intake';
import { loadIntakePlanOptions, type IntakePlanOptions } from '@/lib/coach/intake-plan-options';
import { loadClassification } from '@/lib/dashboard/v2/atleta-detalle';
import type { ClasificacionData } from '@/lib/dashboard/v2/atleta-detalle-types';
import { computeAndStoreLevelSuggestion } from '@/lib/coach/level-proposal';
import { pickBestRealHyrox, listAthletePastRaces } from '@/lib/races/athlete-races';
import { getUpcomingRaces } from '@/lib/races/next-race';
import { formatRaceTime } from '@/lib/dashboard/coach/race-labels';
import type { RaceHistoryItem, UpcomingRace } from '@fahybrid/shared/schema';

export interface IntakeReviewPayload {
  profile: IntakeProfile;
  /** Qué recibiría con cada elección de plan; `null` si no se pudo calcular. */
  plan_options: IntakePlanOptions | null;
  /** The agnostic level + días classification, for the reused ClasificacionCard.
   *  Its `suggested_level_reason` carries the real-data "por qué". */
  classification: ClasificacionData;
  /** The athlete's races, so the coach reviews the level against real evidence:
   *  past results (imported finishes / expired objectives) + upcoming objectives. */
  races: {
    past: RaceHistoryItem[];
    upcoming: UpcomingRace[];
  };
}

/**
 * Loads the full intake-review payload for one athlete. Returns null when the
 * athlete doesn't exist or isn't owned by this coach (→ notFound upstream); other
 * errors propagate.
 */
export async function loadIntakeReview(params: {
  coach_id: number | bigint;
  athlete_id: number;
}): Promise<IntakeReviewPayload | null> {
  const { coach_id, athlete_id } = params;
  try {
    const profile = await loadIntakeProfile({ athlete_id, coach_id });

    // Refresh the algorithmic suggestion from the athlete's CURRENT races before
    // we read the level, so a result imported after onboarding shows up here.
    // Best-effort + guarded (level_id IS NULL) — never blocks the review.
    try {
      await computeAndStoreLevelSuggestion(Number(athlete_id), Number(coach_id));
    } catch {
      // suggestion best-effort — the coach can still set the level by hand.
    }

    const [plan_options, classification, pastRaces, upcomingRaces] = await Promise.all([
      loadIntakePlanOptions({ coach_id, athlete_id: Number(athlete_id), client: sql }).catch(() => null),
      loadClassification({ coach_id, athlete_id: Number(athlete_id), client: sql }),
      listAthletePastRaces(Number(athlete_id), sql).catch(() => [] as RaceHistoryItem[]),
      getUpcomingRaces(Number(athlete_id), sql).catch(() => [] as UpcomingRace[]),
    ]);

    // "Por qué": a real HYROX result is the gold-standard signal → cite it and the
    // level it maps to (derived from the SAME past list, no extra query). Otherwise,
    // if there's a suggestion at all, it came from the onboarding tests. Null when
    // there's nothing to suggest.
    const bestHyrox = pickBestRealHyrox(pastRaces);
    const suggestedName = classification.suggested_level_name;
    const reason =
      bestHyrox.best_time_seconds != null
        ? `Mejor HYROX real ${formatRaceTime(bestHyrox.best_time_seconds)}${
            suggestedName ? ` → ${suggestedName}` : ''
          }`
        : suggestedName
          ? 'Estimado por los tests del onboarding'
          : null;

    return {
      profile,
      plan_options,
      classification: { ...classification, suggested_level_reason: reason },
      races: { past: pastRaces, upcoming: upcomingRaces },
    };
  } catch (err) {
    if (err instanceof IntakeError && (err.code === 'not_found' || err.code === 'forbidden')) {
      return null;
    }
    throw err;
  }
}
