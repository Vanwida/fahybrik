import { z } from 'zod';
import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  resolveZonesForAthlete,
  type CoachZone,
  type ZonePaceUnit,
} from '@fahybrid/shared/domain/methodology';
import {
  resolvedZoneSnapshotSchema,
  type ResolvedZoneSnapshot,
} from '@fahybrid/shared/schema/methodology-system';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/coach/athletes/[id]/test-result
// ------------------------------------------
// Record a test result for one athlete: the threshold (test) pace for a modality
// IN → the 6 absolute zone bands, computed ONCE by the resolver against the
// COACH's methodology_zones, snapshotted into a new versioned athlete_zone_profiles
// row OUT. This is the single write path that feeds the zone calculator + the plan
// resolver; both READ the stored snapshot and never recompute.
//
// The modality's pace_unit is fixed (ergo row/ski → per_500m, run → per_km), so
// the client sends only modality + threshold_s. The coach owns the athlete (gate)
// and owns the zone math (methodology_zones).

/** Pace unit is intrinsic to the modality — not a client choice. */
function paceUnitForModality(modality: 'row' | 'ski' | 'run' | 'bike'): ZonePaceUnit {
  return modality === 'run' ? 'per_km' : 'per_500m';
}

const bodySchema = z.object({
  modality: z.enum(['row', 'ski', 'run', 'bike']),
  // The test result: the threshold (Z4 lower bound) pace, in seconds per the
  // modality's unit (per_500m ergo | per_km run). e.g. row 1:55 → 115.
  threshold_s: z.number().positive().max(36000),
  // Optional provenance: the test type slug that produced this (TEST_TYPES.slug).
  source_test_slug: z.string().min(1).max(60).optional(),
});

// A methodology_zones row as returned from the DB.
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

async function loadCoachZones(coach_id: number, pace_unit: ZonePaceUnit): Promise<CoachZone[]> {
  const rows = await sql<ZoneRow[]>`
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

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const athlete_id = Number(id);
  if (!Number.isFinite(athlete_id) || athlete_id <= 0) {
    return jsonError('bad_request', 'Atleta inválido', 400);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError('validation_error', 'Datos inválidos', 422, parsed.error.flatten());
  }

  const { modality, threshold_s, source_test_slug } = parsed.data;
  const coach_id = Number(session.coach_id);
  const pace_unit = paceUnitForModality(modality);

  // Ownership gate: the athlete must belong to this coach.
  const owned = await sql<{ id: string }[]>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id}
  `;
  if (owned.length === 0) {
    return jsonError('not_found', 'Atleta no encontrado', 404);
  }

  // Resolve the coach's offset bands against this threshold → 6 absolute bands.
  const coachZones = await loadCoachZones(coach_id, pace_unit);
  if (coachZones.length !== 6) {
    return jsonError(
      'precondition_failed',
      'El modelo de zonas del coach no está completo (se esperan 6 zonas).',
      409,
    );
  }

  let zones_json: ResolvedZoneSnapshot[];
  try {
    const resolved = resolveZonesForAthlete({ modality, threshold_s, pace_unit }, coachZones);
    // Validate the snapshot shape (second net behind the DB CHECK + the resolver).
    zones_json = z.array(resolvedZoneSnapshotSchema).length(6).parse(
      resolved.map((zone) => ({
        code: zone.code,
        label: zone.label,
        color: zone.color,
        role: zone.role,
        sort_order: zone.sort_order,
        fast_s: zone.fast_s,
        slow_s: zone.slow_s,
      })),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudieron calcular las zonas';
    return jsonError('unprocessable', msg, 422);
  }

  // Insert a new version = max(version for athlete×modality) + 1. The select +
  // insert run in one transaction so concurrent records don't collide the unique
  // (athlete, modality, version).
  const inserted = await sql.begin(async (tx) => {
    const [{ next_version }] = await tx<{ next_version: number }[]>`
      select coalesce(max(version), 0) + 1 as next_version
      from athlete_zone_profiles
      where athlete_id = ${athlete_id} and modality = ${modality}
    `;
    const rows = await tx<
      { id: string; version: number; recorded_at: Date }[]
    >`
      insert into athlete_zone_profiles
        (athlete_id, modality, threshold_s, pace_unit, source_test_slug, zones_json, version)
      values (
        ${athlete_id}, ${modality}, ${threshold_s}, ${pace_unit},
        ${source_test_slug ?? null},
        ${tx.json(zones_json as unknown as Parameters<typeof tx.json>[0])},
        ${next_version}
      )
      returning id::text, version, recorded_at
    `;
    return rows[0];
  });

  return jsonOk(
    {
      profile: {
        id: inserted.id,
        athlete_id: String(athlete_id),
        modality,
        threshold_s,
        pace_unit,
        source_test_slug: source_test_slug ?? null,
        zones_json,
        version: inserted.version,
        recorded_at: inserted.recorded_at.toISOString(),
      },
    },
    201,
  );
}
