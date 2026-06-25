import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { backfillOnboardingZones } from '@/lib/dashboard/v2/onboarding-zones';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/zones/backfill
// ------------------------------
// One-shot backfill: derive auto zone profiles from onboarding benchmarks for the
// calling coach's athletes who onboarded BEFORE the auto-derive trigger existed.
// Idempotent (re-running is a no-op via the per-athlete skip rules) and never
// clobbers a coach test. New athletes get their zones automatically on intake
// submit; this is only for the existing roster.

export async function POST() {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const results = await backfillOnboardingZones({ coach_id: Number(session.coach_id) });

  const inserted = results.reduce((n, r) => n + r.inserted.length, 0);
  const athletes_touched = results.filter((r) => r.inserted.length > 0).length;

  return jsonOk({
    athletes_scanned: results.length,
    athletes_touched,
    profiles_inserted: inserted,
    results,
  });
}
