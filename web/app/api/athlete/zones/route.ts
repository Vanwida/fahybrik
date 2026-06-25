// GET /api/athlete/zones
//
// Returns the authenticated athlete's CURRENT (highest-version) zone profile per
// modality — the 6 absolute pace bands resolved once on test entry and stored in
// athlete_zone_profiles (read, never recomputed). Powers a future Profile/Stats
// "Mis zonas" screen so the athlete can see their bands the same way the coach
// calculator does.
//
// Auth: athlete bearer. The owning coach is derived inside the loader from
// athletes.coach_id — the athlete session carries no coach_id and must not.
//
// AGNOSTIC: every label/color/code comes from the stored snapshot (coach data);
// this route only reads + formats. An athlete with no test yet gets an empty
// `modalities` array (the screen renders its empty state).

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { loadAthleteZoneProfilesForAthlete } from '@/lib/dashboard/v2/zone-profile';
import {
  formatResolvedPaceBand,
  paceUnitSuffix,
  type ResolvedPaceBand,
} from '@fahybrid/shared/domain/methodology';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Athlete-facing label for a stored profile modality (matches the iOS / coach
// vocabulary). Kept local so this route has no server-only import dependency.
const MODALITY_LABEL: Record<'row' | 'ski' | 'run' | 'bike', string> = {
  row: 'Remo',
  ski: 'Ski-Erg',
  run: 'Carrera',
  bike: 'Bike-Erg',
};

export async function GET(request: Request) {
  const auth = await getAthleteSessionFromBearer(request.headers.get('authorization'));
  if (!auth) return jsonError('unauthorized', 'Bearer token required', 401);

  const profiles = await loadAthleteZoneProfilesForAthlete({ athlete_id: auth.athlete_id });

  const modalities = profiles.map((p) => ({
    modality: p.modality,
    modality_label: MODALITY_LABEL[p.modality],
    pace_unit: p.pace_unit,
    pace_unit_label: paceUnitSuffix(p.pace_unit),
    // The test result (threshold = Z4 lower bound), seconds per pace_unit.
    threshold_s: p.threshold_s,
    source_test_slug: p.source_test_slug,
    version: p.version,
    recorded_at: p.recorded_at,
    // The 6 resolved bands, easiest→hardest, each with its ready-to-render range.
    zones: [...p.zones_json]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((z) => {
        const band: ResolvedPaceBand = {
          fast_s: z.fast_s,
          slow_s: z.slow_s,
          pace_unit: p.pace_unit,
          zone_codes: [z.code],
        };
        return {
          code: z.code,
          label: z.label,
          color: z.color,
          role: z.role,
          sort_order: z.sort_order,
          fast_s: z.fast_s,
          slow_s: z.slow_s,
          range_label: formatResolvedPaceBand(band),
        };
      }),
  }));

  return jsonOk({ modalities });
}
