import 'server-only';

// v2 · ALTAS · INTAKE REVIEW — server loader for the coach's per-athlete intake
// review screen. Composes the EXISTING intake surface (no parallel model):
//   · loadIntakeProfile         → onboarding answers + auto-suggestions + warnings
//   · proposeFirstMonthForIntake → the level-matched first microciclo suggestion
//   · loadClassification        → the agnostic level/días picker data (reused by
//                                 ClasificacionCard, the same control PerfilTab uses)
//
// The level coalesce here mirrors GET /api/coach/intake/[athlete_id] exactly so
// the month proposal is computed against the same level (coach-assigned, else the
// algorithm's suggestion). One concept, one behaviour.

import { sql } from '@/lib/db';
import { loadIntakeProfile, IntakeError, type IntakeProfile } from '@/lib/coach/intake';
import {
  proposeFirstMonthForIntake,
  type IntakeMonthProposal,
} from '@/lib/coach/intake-month-proposal';
import { loadClassification } from '@/lib/dashboard/v2/atleta-detalle';
import type { ClasificacionData } from '@/lib/dashboard/v2/atleta-detalle-types';

export interface IntakeReviewPayload {
  profile: IntakeProfile;
  /** Level-matched first-microciclo suggestion; null until a level is set. */
  month_proposal: IntakeMonthProposal | null;
  /** The agnostic level + días classification, for the reused ClasificacionCard. */
  classification: ClasificacionData;
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

    // Effective level = coach-assigned, else the algorithm's suggestion. Mirrors
    // the GET intake route so the month proposal lines up with what the coach sees.
    const levelRows = await sql<Array<{ level_id: string | null }>>`
      select coalesce(a.level_id, a.suggested_level_id)::text as level_id
      from athletes a
      where a.id = ${Number(athlete_id)} and a.coach_id = ${Number(coach_id)}
      limit 1
    `;
    const levelId = levelRows[0]?.level_id ?? null;

    const [month_proposal, classification] = await Promise.all([
      levelId
        ? proposeFirstMonthForIntake({ coach_id, athlete_id, level_id: Number(levelId) }).catch(
            () => null,
          )
        : Promise.resolve(null),
      loadClassification({ coach_id, athlete_id: Number(athlete_id), client: sql }),
    ]);

    return { profile, month_proposal, classification };
  } catch (err) {
    if (err instanceof IntakeError && (err.code === 'not_found' || err.code === 'forbidden')) {
      return null;
    }
    throw err;
  }
}
