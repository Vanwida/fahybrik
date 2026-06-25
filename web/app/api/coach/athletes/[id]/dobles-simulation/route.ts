// GET + PUT /api/coach/athletes/[id]/dobles-simulation
//
// The coach authors the Dobles SIMULATION: how the 8 HYROX functional stations
// split between a paired team (route athlete = A, their users.partner_id = B),
// the running plan, the RoxZone relay, and a one-line tactical note. Storage is
// A/B-neutral (migration 0055); the athlete API resolves it per-reader. This
// coach route is A-centric — "self" is always the athlete in [id].
//
// GET   → the saved simulation OR a sensible prefilled DEFAULT (8 stations at
//         50/50) so the coach starts from something, never a blank page.
// PUT   → server-side Zod validation + idempotent upsert keyed on
//         (athlete_a_user_id, athlete_b_user_id, target_event_id).
//
// Coach-scoped: never touches an athlete that is not this coach's.

import { getCoachSession } from '@/lib/auth/coach-session';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { sql } from '@/lib/db';
import { AthleteIdParamSchema } from '@/lib/dashboard/coach/deep-dive-types';
import { captureRouteError } from '@/lib/observability/capture';
import {
  doblesSimulationPutSchema,
  defaultStationSplits,
  normalizeStationSplit,
  DOBLES_STATIONS,
  type DoblesStationSplit,
  type DoblesSimulationCoachResponse,
} from '@fahybrid/shared/schema/dobles-simulation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATION_LABEL = new Map<number, string>(
  DOBLES_STATIONS.map((s) => [s.station_index, s.label]),
);

interface PairResolution {
  athlete_a_user_id: bigint;
  athlete_a_name: string;
  athlete_b_user_id: bigint | null;
  athlete_b_name: string | null;
}

/**
 * Resolve the route athlete (A) and their linked Dobles partner (B), scoped to
 * the coach. Returns null when the athlete is not this coach's. `athlete_b_*`
 * is null when the athlete has no linked partner (the coach can still author a
 * draft simulation; it just stores no partner side until paired).
 */
async function resolvePair(
  athlete_id: number,
  coach_id: bigint,
): Promise<PairResolution | null> {
  const rows = await sql<
    {
      a_user_id: string;
      a_name: string;
      b_user_id: string | null;
      b_name: string | null;
    }[]
  >`
    select
      ua.id::text                              as a_user_id,
      a.full_name                              as a_name,
      ub.id::text                              as b_user_id,
      coalesce(ab.full_name, null)             as b_name
    from athletes a
    join users ua on ua.id = a.user_id
    left join users ub on ub.id = ua.partner_id and ub.deleted_at is null
    left join athletes ab on ab.user_id = ub.id
    where a.id = ${athlete_id} and a.coach_id = ${coach_id}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    athlete_a_user_id: BigInt(row.a_user_id),
    athlete_a_name: row.a_name,
    athlete_b_user_id: row.b_user_id ? BigInt(row.b_user_id) : null,
    athlete_b_name: row.b_name,
  };
}

interface SimulationRow {
  target_event_id: string | null;
  station_splits: DoblesStationSplit[];
  running_note: string | null;
  roxzone_note: string | null;
  tactical_note: string | null;
  updated_at: string;
}

/** Attach the static station label to each split for the editor. */
function withLabels(
  splits: DoblesStationSplit[],
): Array<DoblesStationSplit & { label: string }> {
  // Canonical order, exactly the 8 stations — sort defensively so a row stored
  // out of order still renders in race order.
  return DOBLES_STATIONS.map((station) => {
    const found = splits.find((s) => s.station_index === station.station_index);
    const base: DoblesStationSplit = found ?? {
      station_index: station.station_index,
      assigned_to: 'split',
      self_share: 0.5,
    };
    return { ...base, label: station.label };
  });
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  const athleteId = Number(parsedId.data.id);

  try {
    const pair = await resolvePair(athleteId, session.coach_id);
    if (!pair) return jsonError('not_found', 'Atleta no encontrado', 404);

    let row: SimulationRow | undefined;
    if (pair.athlete_b_user_id !== null) {
      const rows = await sql<SimulationRow[]>`
        select
          target_event_id::text as target_event_id,
          station_splits,
          running_note,
          roxzone_note,
          tactical_note,
          updated_at::text as updated_at
        from dobles_simulations
        where athlete_a_user_id = ${pair.athlete_a_user_id}
          and athlete_b_user_id = ${pair.athlete_b_user_id}
        order by updated_at desc
        limit 1
      `;
      row = rows[0];
    }

    const response: DoblesSimulationCoachResponse = row
      ? {
          exists: true,
          athlete_a_name: pair.athlete_a_name,
          athlete_b_name: pair.athlete_b_name,
          has_partner: pair.athlete_b_user_id !== null,
          target_event_id: row.target_event_id ? Number(row.target_event_id) : null,
          station_splits: withLabels(row.station_splits),
          running_note: row.running_note,
          roxzone_note: row.roxzone_note,
          tactical_note: row.tactical_note,
          updated_at: row.updated_at,
        }
      : {
          exists: false,
          athlete_a_name: pair.athlete_a_name,
          athlete_b_name: pair.athlete_b_name,
          has_partner: pair.athlete_b_user_id !== null,
          target_event_id: null,
          station_splits: withLabels(defaultStationSplits()),
          running_note: null,
          roxzone_note: null,
          tactical_note: null,
          updated_at: null,
        };

    return jsonOk<DoblesSimulationCoachResponse>(response);
  } catch (err) {
    captureRouteError(err, {
      route: 'api/coach/athletes/[id]/dobles-simulation.GET',
    });
    return jsonError('internal', 'No se pudo cargar la simulación', 500);
  }
}

export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getCoachSession();
  if (!session) return jsonError('unauthorized', 'Sesión requerida', 401);

  const { id } = await ctx.params;
  const parsedId = AthleteIdParamSchema.safeParse({ id });
  if (!parsedId.success) return jsonError('bad_request', 'ID inválido', 400);

  const athleteId = Number(parsedId.data.id);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError('bad_request', 'JSON inválido', 400);
  }

  const parsed = doblesSimulationPutSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonError('bad_request', 'Datos inválidos', 400, parsed.error.flatten());
  }

  try {
    const pair = await resolvePair(athleteId, session.coach_id);
    if (!pair) return jsonError('not_found', 'Atleta no encontrado', 404);
    if (pair.athlete_b_user_id === null) {
      return jsonError(
        'no_partner',
        'El atleta no tiene pareja de Dobles vinculada',
        409,
      );
    }

    // Normalize each split so the stored A-share never contradicts assigned_to.
    const normalized = parsed.data.station_splits.map(normalizeStationSplit);

    // Idempotent upsert keyed on the unique (A, B, coalesce(event,0)) index.
    await sql`
      insert into dobles_simulations (
        athlete_a_user_id,
        athlete_b_user_id,
        target_event_id,
        station_splits,
        running_note,
        roxzone_note,
        tactical_note,
        created_by_coach_id
      ) values (
        ${pair.athlete_a_user_id},
        ${pair.athlete_b_user_id},
        ${parsed.data.target_event_id},
        ${sql.json(normalized)},
        ${parsed.data.running_note ?? null},
        ${parsed.data.roxzone_note ?? null},
        ${parsed.data.tactical_note ?? null},
        ${session.coach_id}
      )
      on conflict (athlete_a_user_id, athlete_b_user_id, coalesce(target_event_id, 0))
      do update set
        station_splits = excluded.station_splits,
        running_note   = excluded.running_note,
        roxzone_note   = excluded.roxzone_note,
        tactical_note  = excluded.tactical_note,
        target_event_id = excluded.target_event_id,
        updated_at     = now()
    `;

    const labeled = normalized.map((s) => ({
      ...s,
      label: STATION_LABEL.get(s.station_index) ?? `Estación ${s.station_index}`,
    }));

    const response: DoblesSimulationCoachResponse = {
      exists: true,
      athlete_a_name: pair.athlete_a_name,
      athlete_b_name: pair.athlete_b_name,
      has_partner: true,
      target_event_id: parsed.data.target_event_id,
      station_splits: labeled,
      running_note: parsed.data.running_note ?? null,
      roxzone_note: parsed.data.roxzone_note ?? null,
      tactical_note: parsed.data.tactical_note ?? null,
      updated_at: new Date().toISOString(),
    };

    return jsonOk<DoblesSimulationCoachResponse>(response);
  } catch (err) {
    captureRouteError(err, {
      route: 'api/coach/athletes/[id]/dobles-simulation.PUT',
    });
    return jsonError('internal', 'No se pudo guardar la simulación', 500);
  }
}
