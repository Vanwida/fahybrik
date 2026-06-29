import { z } from 'zod';
import { getAthleteSessionFromBearer } from '@/lib/auth/athlete-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import {
  resolveZonesForAthlete,
  type ZonePaceUnit,
} from '@fahybrid/shared/domain/methodology';
import type { ResolvedZoneSnapshot } from '@fahybrid/shared/schema/methodology-system';
import {
  loadCoachZonesForUnit,
  insertZoneProfileVersion,
  toZonesSnapshot,
} from '@/lib/dashboard/v2/zone-derivation';
import { recordTestBenchmark } from '@/lib/athlete/record-test-benchmark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/athlete/test-result
// -----------------------------
// The athlete self-enters a test (run/row/ski) from the app, feeding their zones.
// This is the ATHLETE-auth twin of the coach endpoint (/api/coach/athletes/[id]/
// test-result): it REUSES the exact same resolve+store seam — resolveZonesForAthlete
// against the athlete's COACH's methodology_zones, then insertZoneProfileVersion —
// so it produces identical zone profiles. The only differences: the bearer is the
// athlete's (not a coach session), the coach is derived from athletes.coach_id, and
// the profile is tagged source='athlete_test'. The latest version per modality is
// current, so "Mis zonas" reflects it immediately; the coach can override by
// recording their own test (a newer version wins).

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

export async function POST(req: Request) {
  const athlete = await getAthleteSessionFromBearer(req.headers.get('authorization'));
  if (!athlete) return jsonError('unauthorized', 'Bearer token required', 401);

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
  const athlete_id = Number(athlete.athlete_id);
  const pace_unit = paceUnitForModality(modality);

  // The resolver applies the athlete's COACH's offset bands — derive the coach.
  const coachRows = await sql<{ coach_id: string | null }[]>`
    select coach_id::text from athletes where id = ${athlete_id}
  `;
  const coachId = coachRows[0]?.coach_id ? Number(coachRows[0].coach_id) : null;
  if (!coachId) {
    return jsonError('precondition_failed', 'Tu cuenta aún no tiene coach asignado.', 409);
  }

  const coachZones = await loadCoachZonesForUnit(sql, coachId, pace_unit);
  if (coachZones.length !== 6) {
    return jsonError(
      'precondition_failed',
      'El modelo de zonas de tu coach no está completo (se esperan 6 zonas).',
      409,
    );
  }

  let zones_json: ResolvedZoneSnapshot[];
  let inserted: { id: string; version: number; recorded_at: Date };
  try {
    const resolved = resolveZonesForAthlete({ modality, threshold_s, pace_unit }, coachZones);
    zones_json = toZonesSnapshot(resolved);
    inserted = await insertZoneProfileVersion(
      {
        athlete_id,
        modality,
        threshold_s,
        pace_unit,
        source_test_slug: source_test_slug ?? null,
        source_benchmark_id: null,
        zones: resolved,
        // Athlete-recorded test: applied immediately (latest version wins). The
        // coach can override with their own test. Not pending review.
        source: 'athlete_test',
        needs_review: false,
      },
      sql,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudieron calcular las zonas';
    return jsonError('unprocessable', msg, 422);
  }

  // KEYSTONE (a) sink: append the threshold as a dated benchmark row = progression
  // evidence (feeds progress-readiness + the coach test_logged signal). Additive,
  // best-effort: the zone profile above is the contract; a benchmark failure must
  // never fail the test the athlete just recorded.
  try {
    await recordTestBenchmark(sql, {
      kind: 'threshold',
      athlete_id,
      modality,
      threshold_s,
      source: 'athlete_test',
    });
  } catch {
    // best-effort progression evidence — the zone profile already committed.
  }

  return jsonOk(
    {
      profile: {
        id: inserted.id,
        athlete_id: String(athlete_id),
        modality,
        threshold_s,
        pace_unit,
        source_test_slug: source_test_slug ?? null,
        source: 'athlete_test',
        needs_review: false,
        zones_json,
        version: inserted.version,
        recorded_at: inserted.recorded_at.toISOString(),
      },
    },
    201,
  );
}
