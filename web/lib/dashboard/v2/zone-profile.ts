import 'server-only';

// v2 · ZONE PROFILE — the single READ source for an athlete's stored zones.
//
// The calculator (athlete profile + test result) and the plan resolver read the
// CURRENT versioned row from athlete_zone_profiles — they NEVER recompute zones.
// This loader returns the latest version per modality for one athlete, scoped to
// the coach (an athlete the coach doesn't own returns nothing). Computation
// happens once, on test entry (the POST endpoint); here we only read the snapshot.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  athleteZoneProfileSchema,
  type AthleteZoneProfile,
} from '@fahybrid/shared/schema/methodology-system';

// One row from athlete_zone_profiles, joined to confirm coach ownership.
interface ZoneProfileRow {
  id: string;
  athlete_id: string;
  modality: string;
  threshold_s: number;
  pace_unit: string;
  source_test_slug: string | null;
  source_benchmark_id: string | null;
  zones_json: unknown;
  version: number;
  // Returned as JS Date by the postgres driver (timestamptz, uncast) → .toISOString().
  recorded_at: Date;
  created_at: Date;
}

/**
 * Load the CURRENT (highest-version) zone profile per modality for one athlete,
 * coach-scoped. Returns the validated profiles ordered by modality. An athlete
 * not owned by the coach (or with no test yet) yields an empty array — the
 * calculator renders its empty state.
 */
export async function loadAthleteZoneProfiles(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<AthleteZoneProfile[]> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = params.athlete_id;

  // DISTINCT ON (modality) ordered by version desc = the current row per modality,
  // but only for an athlete this coach owns (the join is the ownership gate).
  const rows = await client<ZoneProfileRow[]>`
    select distinct on (zp.modality)
      zp.id::text,
      zp.athlete_id::text,
      zp.modality,
      zp.threshold_s::float8 as threshold_s,
      zp.pace_unit,
      zp.source_test_slug,
      zp.source_benchmark_id::text,
      zp.zones_json,
      zp.version,
      zp.recorded_at,
      zp.created_at
    from athlete_zone_profiles zp
    join athletes a on a.id = zp.athlete_id
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
    order by zp.modality, zp.version desc
  `;

  const out: AthleteZoneProfile[] = [];
  for (const r of rows) {
    const parsed = athleteZoneProfileSchema.safeParse({
      id: r.id,
      athlete_id: r.athlete_id,
      modality: r.modality,
      threshold_s: r.threshold_s,
      pace_unit: r.pace_unit,
      source_test_slug: r.source_test_slug,
      source_benchmark_id: r.source_benchmark_id,
      zones_json: r.zones_json,
      version: r.version,
      recorded_at: r.recorded_at.toISOString(),
      created_at: r.created_at.toISOString(),
    });
    // A malformed stored row is skipped rather than crashing the page; the
    // snapshot was zod-validated on write, so this is a belt-and-suspenders net.
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
