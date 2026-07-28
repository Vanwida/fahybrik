// GET /api/athlete/zones
//
// The athlete's zones, both axes, in one call.
//
//   `modalities` — the CURRENT (highest-version) PACE profile per modality: the 6
//     absolute bands resolved once on test entry and stored in
//     athlete_zone_profiles (read, never recomputed).
//   `hr`         — the 5 absolute HEART-RATE bands, resolved from the athlete's
//     threshold HR. THE SERVER IS THE ONLY PLACE THESE ARE COMPUTED: the phone
//     used to derive its own from a percentage of a max HR it invented when it
//     had none, which put its Z2 on a completely different stretch of the dial
//     from the coach's (see shared/domain/methodology/hr-zones.ts). It now paints
//     what this route returns and nothing else.
//
// Auth: athlete bearer. The owning coach is derived inside the loader from
// athletes.coach_id — the athlete session carries no coach_id and must not.
//
// AGNOSTIC: every pace label/color/code comes from the stored snapshot (coach
// data); this route only reads + formats. An athlete with no test yet gets an
// empty `modalities` array and `hr: null` — both are honest empty states with a
// way out (the test that produces them), not zeros.

import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { buildHrZonesDTO, loadAthleteHrZones } from '@/lib/athlete/hr-zones';
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

  const [profiles, hrZones] = await Promise.all([
    loadAthleteZoneProfilesForAthlete({ athlete_id: auth.athlete_id }),
    loadAthleteHrZones(auth.athlete_id),
  ]);

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

  // The HR block. Null (not an empty list, not zeros) when nothing anchors the
  // bands — the phone shows "aún no tenemos tus zonas de pulso" and offers the
  // test, which is the only thing that creates them.
  return jsonOk({ modalities, hr: buildHrZonesDTO(hrZones) });
}
