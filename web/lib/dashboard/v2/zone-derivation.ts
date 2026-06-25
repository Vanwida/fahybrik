import 'server-only';

// v2 · ZONE DERIVATION — the shared WRITE path for athlete_zone_profiles.
//
// Both entries that produce a zone profile go through here, so the resolve+store
// logic exists ONCE (DRY) and the two never diverge:
//   · the coach manual test  (/api/coach/athletes/[id]/test-result) → coach_test
//   · the onboarding auto-derive (onboarding-zones.ts)              → onboarding_auto
//
// This module owns: loading the coach's offset bands for a unit, and the
// versioned snapshot INSERT (max(version)+1 per athlete×modality, zod-validated
// 6-band JSONB, with provenance + review flag). The zone MATH lives in the shared
// domain (resolveZonesForAthlete); this is only the persistence around it.

import { z } from 'zod';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type { CoachZone, ResolvedZone, ZonePaceUnit } from '@fahybrid/shared/domain/methodology';
import {
  resolvedZoneSnapshotSchema,
  type ResolvedZoneSnapshot,
  type ZoneProfileSource,
} from '@fahybrid/shared/schema/methodology-system';

// One methodology_zones row as returned from the DB.
interface ZoneRow {
  code: string;
  label: string;
  color: string;
  role: string;
  sort_order: number;
  pace_unit: string;
  low_offset_s: number;
  high_offset_s: number | null;
}

/** Load a coach's 6-zone OFFSET model for one pace unit (per_500m | per_km). */
export async function loadCoachZonesForUnit(
  client: Sql,
  coach_id: number,
  pace_unit: ZonePaceUnit,
): Promise<CoachZone[]> {
  const rows = await client<ZoneRow[]>`
    select code, label, color, role, sort_order,
           pace_unit, low_offset_s::float8 as low_offset_s, high_offset_s::float8 as high_offset_s
    from methodology_zones
    where coach_id = ${coach_id} and pace_unit = ${pace_unit}
    order by sort_order asc
  `;
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    color: r.color,
    role: r.role as CoachZone['role'],
    sort_order: r.sort_order,
    pace_unit: r.pace_unit as ZonePaceUnit,
    low_offset_s: r.low_offset_s,
    high_offset_s: r.high_offset_s,
  }));
}

/** Validate the resolved bands into the stored snapshot shape (6 bands). */
export function toZonesSnapshot(zones: ResolvedZone[]): ResolvedZoneSnapshot[] {
  return z.array(resolvedZoneSnapshotSchema).length(6).parse(
    zones.map((zone) => ({
      code: zone.code,
      label: zone.label,
      color: zone.color,
      role: zone.role,
      sort_order: zone.sort_order,
      fast_s: zone.fast_s,
      slow_s: zone.slow_s,
    })),
  );
}

export interface InsertZoneProfileParams {
  athlete_id: number;
  modality: 'row' | 'ski' | 'run' | 'bike';
  threshold_s: number;
  pace_unit: ZonePaceUnit;
  source_test_slug: string | null;
  source_benchmark_id: string | null;
  zones: ResolvedZone[];
  source: ZoneProfileSource;
  needs_review: boolean;
}

export interface InsertedZoneProfile {
  id: string;
  version: number;
  recorded_at: Date;
}

/**
 * Insert a new versioned zone profile (version = max+1 for athlete×modality). The
 * select + insert run in one transaction so concurrent records don't collide the
 * unique (athlete, modality, version). zones_json is zod-validated to exactly 6
 * bands (second net behind the DB CHECK).
 */
export async function insertZoneProfileVersion(
  params: InsertZoneProfileParams,
  client: Sql = defaultSql,
): Promise<InsertedZoneProfile> {
  const zones_json = toZonesSnapshot(params.zones);
  return client.begin(async (tx) => {
    const [{ next_version }] = await tx<{ next_version: number }[]>`
      select coalesce(max(version), 0) + 1 as next_version
      from athlete_zone_profiles
      where athlete_id = ${params.athlete_id} and modality = ${params.modality}
    `;
    const rows = await tx<InsertedZoneProfile[]>`
      insert into athlete_zone_profiles
        (athlete_id, modality, threshold_s, pace_unit, source_test_slug,
         source_benchmark_id, zones_json, version, source, needs_review)
      values (
        ${params.athlete_id}, ${params.modality}, ${params.threshold_s}, ${params.pace_unit},
        ${params.source_test_slug},
        ${params.source_benchmark_id === null ? null : Number(params.source_benchmark_id)},
        ${tx.json(zones_json as unknown as Parameters<typeof tx.json>[0])},
        ${next_version}, ${params.source}, ${params.needs_review}
      )
      returning id::text, version, recorded_at
    `;
    return rows[0];
  });
}
