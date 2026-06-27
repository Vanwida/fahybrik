// GET /api/athlete/benchmarks
//
// Returns the authenticated athlete's CURRENT (highest-version) strength max per
// lift, plus the full per-lift history (oldest→newest) for progression. Read from
// athlete_strength_maxes (the versioned snapshot) — never recomputed. Powers the
// app's "Mis marcas · 1RM" surface so the athlete sees their maxes the same way
// the coach detail does.
//
// Auth: athlete bearer. The owning coach is derived inside the loader from
// athletes.coach_id — the athlete session carries no coach_id and must not.
//
// Only lifts with ≥1 recorded max appear, ordered by the canonical STRENGTH_LIFTS
// display order. An athlete with no max yet gets an empty `maxes` array (the
// screen renders its empty state).

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import {
  loadStrengthMaxesForAthlete,
  loadStrengthMaxHistory,
} from '@/lib/strength/strength-max';
import { STRENGTH_LIFTS, strengthLiftLabel } from '@fahybrid/shared/domain/strength';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const [current, history] = await Promise.all([
    loadStrengthMaxesForAthlete({ athlete_id: auth.athlete_id }),
    loadStrengthMaxHistory({ athlete_id: auth.athlete_id }),
  ]);

  // The canonical display order (most-programmed first) so the list is stable.
  const orderBySlug = new Map(STRENGTH_LIFTS.map((l, i) => [l.slug, i]));

  const maxes = current
    .slice()
    .sort(
      (a, b) =>
        (orderBySlug.get(a.exercise_slug) ?? Number.MAX_SAFE_INTEGER) -
        (orderBySlug.get(b.exercise_slug) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((m) => ({
      exercise_slug: m.exercise_slug,
      exercise_label: strengthLiftLabel(m.exercise_slug),
      one_rm_kg: m.one_rm_kg,
      unit: 'kg',
      source: m.source,
      version: m.version,
      recorded_at: m.recorded_at,
      test_weight_kg: m.test_weight_kg,
      test_reps: m.test_reps,
      // All versions for this lift, oldest→newest (history is sorted version asc).
      history: history
        .filter((h) => h.exercise_slug === m.exercise_slug)
        .map((h) => ({
          one_rm_kg: h.one_rm_kg,
          version: h.version,
          recorded_at: h.recorded_at,
          source: h.source,
        })),
    }));

  return jsonOk({ maxes });
}
