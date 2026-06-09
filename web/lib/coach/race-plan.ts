// Race plan server logic.
//
// Implements the dashboard side of /docs/ux/12-race-plan-and-prep.md:
//   * load(athlete_id, coach_id) → race-plan editor state (or unlock-state).
//   * upsert(payload) → save edits while plan is editable by Pablo.
//   * approve(race_plan_id) → freeze plan for the athlete.
//   * loadResultAndDebrief(athlete_id) → post-race surface (read-only here;
//     iOS submits results + debriefs).
//
// Coach ownership is verified on every mutation. All section payloads are
// stored as jsonb (see /infra/migrations/0008_race_plans.sql).

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  defaultNutrition,
  defaultStationPacing,
  HYROX_ELEMENT_COUNT,
  HYROX_STATION_LABELS,
  RACE_PLAN_APPROVAL_LEAD_DAYS,
  RACE_PLAN_UNLOCK_DAYS,
  type RacePlan,
  type RacePlanContingency,
  type RacePlanKitItem,
  type RacePlanMentalCue,
  type RacePlanNutrition,
  type RacePlanStationActual,
  type RacePlanStationPacing,
  type RacePlanStatus,
  type RacePlanUpsert,
  type RaceDebrief,
  type RaceResult,
  type RacePaceRealism,
} from './race-plan-schema';

export class RacePlanError extends Error {
  constructor(
    public code:
      | 'not_found'
      | 'forbidden'
      | 'no_a_event'
      | 'too_early'
      | 'a_event_passed'
      | 'plan_locked'
      | 'plan_already_approved'
      | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'RacePlanError';
  }
}

export interface RacePlanState {
  status:
    | 'no_a_event'        // athlete has no A-event configured
    | 'too_early'         // A-event > 21 días → editor bloqueado
    | 'a_event_passed'    // A-event en el pasado y sin race_result → "completar registro"
    | 'editable_draft'    // editor activo en draft
    | 'approved'          // Pablo aprobó, lock para atleta
    | 'locked'            // post-race
    | 'completed';        // race_result + debrief
  athlete_id: string;
  athlete_name: string;
  a_event: {
    event_id: string;
    name: string;
    iso_date: string;
    days_until: number;
    is_in_past: boolean;
  } | null;
  race_plan: RacePlan | null;
  race_result: RaceResult | null;
  race_debrief: RaceDebrief | null;
  // Banner copy + CTA hint for the UI. Server-formatted so the page is
  // purely presentational.
  banner: {
    title: string;
    detail: string;
    severity: 'info' | 'warning' | 'success';
  } | null;
}

// =============================================================================
// Load
// =============================================================================

export async function loadRacePlanState(params: {
  athlete_id: string;
  coach_id: bigint | number;
  now?: Date;
  client?: Sql;
}): Promise<RacePlanState> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const numericId = Number(params.athlete_id);
  if (!Number.isFinite(numericId) || numericId <= 0) {
    throw new RacePlanError('not_found', `athlete ${params.athlete_id} not found`);
  }

  const athleteRows = await client<Array<{ full_name: string }>>`
    select full_name
    from athletes
    where id = ${numericId} and coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (athleteRows.length === 0) {
    throw new RacePlanError('forbidden', 'athlete not assigned to coach');
  }
  const athlete_name = athleteRows[0].full_name;

  const eventRows = await client<
    Array<{
      event_id: string;
      name: string;
      iso_date: string;
    }>
  >`
    select
      e.id::text                           as event_id,
      e.name                               as name,
      to_char(e.start_date, 'YYYY-MM-DD')  as iso_date
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${numericId}
      and ate.priority   = 'A'
    order by e.start_date asc
    limit 1
  `;

  if (eventRows.length === 0) {
    return {
      status: 'no_a_event',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event: null,
      race_plan: null,
      race_result: null,
      race_debrief: null,
      banner: {
        severity: 'info',
        title: 'No hay A-event configurado',
        detail: 'Configura el A-event en el intake del atleta para activar el race plan.',
      },
    };
  }

  const ev = eventRows[0];
  const days_until = daysBetween(now, ev.iso_date);
  const is_in_past = days_until < 0;
  const a_event = {
    event_id: ev.event_id,
    name: ev.name,
    iso_date: ev.iso_date,
    days_until,
    is_in_past,
  };

  // Load the most recent plan for this athlete+event.
  const plan = await loadActivePlan(client, numericId, ev.event_id);

  // Past event without a plan → still allow review path (edge case; rare).
  if (is_in_past && plan == null) {
    return {
      status: 'a_event_passed',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event,
      race_plan: null,
      race_result: null,
      race_debrief: null,
      banner: {
        severity: 'warning',
        title: 'A-event ya celebrado',
        detail: 'No hay plan registrado para este evento.',
      },
    };
  }

  // Plan exists but no result yet → check date.
  let race_result: RaceResult | null = null;
  let race_debrief: RaceDebrief | null = null;
  if (plan != null) {
    race_result = await loadRaceResult(client, plan.id);
    if (race_result != null) {
      race_debrief = await loadRaceDebrief(client, race_result.id);
    }
  }

  // States derived.
  if (race_result != null) {
    return {
      status: race_debrief != null ? 'completed' : 'locked',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event,
      race_plan: plan,
      race_result,
      race_debrief,
      banner:
        race_debrief != null
          ? {
              severity: 'success',
              title: 'Carrera + debrief completados',
              detail: 'Plan, resultado y lecciones registrados.',
            }
          : {
              severity: 'info',
              title: 'Esperando debrief del atleta',
              detail: 'Debrief no completado en iOS todavía.',
            },
    };
  }

  if (plan == null) {
    if (days_until > RACE_PLAN_UNLOCK_DAYS) {
      return {
        status: 'too_early',
        athlete_id: params.athlete_id,
        athlete_name,
        a_event,
        race_plan: null,
        race_result: null,
        race_debrief: null,
        banner: {
          severity: 'info',
          title: `Se activa ${RACE_PLAN_UNLOCK_DAYS} días antes`,
          detail: `Faltan ${days_until} días. El editor se desbloquea cuando queden ${RACE_PLAN_UNLOCK_DAYS} o menos.`,
        },
      };
    }
    // Eligible but no plan yet — UI will show "crear plan" CTA which calls
    // upsert with defaults.
    return {
      status: 'editable_draft',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event,
      race_plan: null,
      race_result: null,
      race_debrief: null,
      banner: {
        severity: 'info',
        title: 'Crea el race plan',
        detail: `Faltan ${days_until} días. Recomendado aprobar al menos ${RACE_PLAN_APPROVAL_LEAD_DAYS} días antes.`,
      },
    };
  }

  // Plan exists and not yet raced.
  if (plan.status === 'approved') {
    return {
      status: 'approved',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event,
      race_plan: plan,
      race_result: null,
      race_debrief: null,
      banner: {
        severity: 'success',
        title: 'Plan aprobado',
        detail: 'El atleta no puede editar. Tú puedes hacer correcciones puntuales.',
      },
    };
  }
  if (plan.status === 'locked') {
    return {
      status: 'locked',
      athlete_id: params.athlete_id,
      athlete_name,
      a_event,
      race_plan: plan,
      race_result: null,
      race_debrief: null,
      banner: {
        severity: 'warning',
        title: 'Plan congelado',
        detail: 'Sólo lectura.',
      },
    };
  }
  // Draft.
  const detailDraft =
    days_until <= RACE_PLAN_APPROVAL_LEAD_DAYS
      ? `Faltan ${days_until} días — aprueba el plan ya.`
      : `Faltan ${days_until} días. Aprueba al menos ${RACE_PLAN_APPROVAL_LEAD_DAYS} días antes.`;
  return {
    status: 'editable_draft',
    athlete_id: params.athlete_id,
    athlete_name,
    a_event,
    race_plan: plan,
    race_result: null,
    race_debrief: null,
    banner: {
      severity: days_until <= RACE_PLAN_APPROVAL_LEAD_DAYS ? 'warning' : 'info',
      title: 'Editor abierto',
      detail: detailDraft,
    },
  };
}

// =============================================================================
// Upsert (Pablo creates or edits a draft / approved plan)
// =============================================================================

export async function upsertRacePlan(params: {
  coach_id: bigint | number;
  payload: RacePlanUpsert;
  now?: Date;
  client?: Sql;
}): Promise<RacePlan> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const athlete_id = Number(params.payload.athlete_id);
  const target_event_id = Number(params.payload.target_event_id);
  if (!Number.isFinite(athlete_id) || !Number.isFinite(target_event_id)) {
    throw new RacePlanError('invalid', 'athlete_id / target_event_id inválidos');
  }

  const owns = await client<Array<{ n: number }>>`
    select count(*)::int as n from athletes
    where id = ${athlete_id} and coach_id = ${params.coach_id as number}
  `;
  if ((owns[0]?.n ?? 0) === 0) {
    throw new RacePlanError('forbidden', 'athlete not assigned to coach');
  }

  // A-event must be the priority A target for this athlete + must not be in
  // the past + must be within unlock window.
  const ev = await client<Array<{ iso_date: string }>>`
    select to_char(e.start_date, 'YYYY-MM-DD') as iso_date
    from athlete_target_events ate
    join events e on e.id = ate.event_id
    where ate.athlete_id = ${athlete_id}
      and ate.event_id   = ${target_event_id}
      and ate.priority   = 'A'
    limit 1
  `;
  if (ev.length === 0) {
    throw new RacePlanError('no_a_event', 'evento no es A-target del atleta');
  }
  const days_until = daysBetween(now, ev[0].iso_date);
  if (days_until < 0) {
    throw new RacePlanError('a_event_passed', 'el evento ya ocurrió');
  }
  if (days_until > RACE_PLAN_UNLOCK_DAYS) {
    throw new RacePlanError('too_early', `el race plan se desbloquea ${RACE_PLAN_UNLOCK_DAYS} días antes`);
  }

  const existing = await loadActivePlan(client, athlete_id, String(target_event_id));

  // If locked, reject. If approved, allow Pablo's edits but keep status.
  if (existing?.status === 'locked') {
    throw new RacePlanError('plan_locked', 'el plan está congelado');
  }

  // Merge payloads — undefined fields preserve existing values.
  const station_pacing =
    params.payload.station_pacing ?? existing?.station_pacing ?? defaultStationPacing();
  const nutrition = params.payload.nutrition ?? existing?.nutrition ?? defaultNutrition();
  const kit = params.payload.kit ?? existing?.kit ?? [];
  const mental_cues = params.payload.mental_cues ?? existing?.mental_cues ?? [];
  const contingency = params.payload.contingency ?? existing?.contingency ?? [];
  const time_goal_seconds =
    params.payload.time_goal_seconds !== undefined
      ? params.payload.time_goal_seconds
      : existing?.time_goal_seconds ?? null;
  const coach_note =
    params.payload.coach_note !== undefined ? params.payload.coach_note : existing?.coach_note ?? null;

  // Server-side: ensure station labels stay aligned with HYROX positions.
  const normalized = station_pacing.map((s) => ({
    ...s,
    label: HYROX_STATION_LABELS[s.station_index] ?? s.label,
  }));

  if (existing == null) {
    const inserted = await client<
      Array<{
        id: string;
        athlete_id: string;
        target_event_id: string;
        time_goal_seconds: number | null;
        station_pacing_json: unknown;
        nutrition_json: unknown;
        kit_json: unknown;
        mental_cues_json: unknown;
        contingency_json: unknown;
        coach_note: string | null;
        status: RacePlanStatus;
        approved_by_coach_id: string | null;
        approved_at: Date | null;
        version: number;
        parent_race_plan_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      insert into race_plans (
        athlete_id,
        target_event_id,
        time_goal_seconds,
        station_pacing_json,
        nutrition_json,
        kit_json,
        mental_cues_json,
        contingency_json,
        coach_note,
        status,
        version
      ) values (
        ${athlete_id},
        ${target_event_id},
        ${time_goal_seconds},
        ${JSON.stringify(normalized)}::jsonb,
        ${JSON.stringify(nutrition)}::jsonb,
        ${JSON.stringify(kit)}::jsonb,
        ${JSON.stringify(mental_cues)}::jsonb,
        ${JSON.stringify(contingency)}::jsonb,
        ${coach_note},
        'draft',
        1
      )
      returning id::text, athlete_id::text, target_event_id::text,
                time_goal_seconds, station_pacing_json, nutrition_json,
                kit_json, mental_cues_json, contingency_json, coach_note,
                status, approved_by_coach_id::text, approved_at, version,
                parent_race_plan_id::text, created_at, updated_at
    `;
    return rowToPlan(inserted[0]);
  }

  const updated = await client<
    Array<{
      id: string;
      athlete_id: string;
      target_event_id: string;
      time_goal_seconds: number | null;
      station_pacing_json: unknown;
      nutrition_json: unknown;
      kit_json: unknown;
      mental_cues_json: unknown;
      contingency_json: unknown;
      coach_note: string | null;
      status: RacePlanStatus;
      approved_by_coach_id: string | null;
      approved_at: Date | null;
      version: number;
      parent_race_plan_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    update race_plans set
      time_goal_seconds   = ${time_goal_seconds},
      station_pacing_json = ${JSON.stringify(normalized)}::jsonb,
      nutrition_json      = ${JSON.stringify(nutrition)}::jsonb,
      kit_json            = ${JSON.stringify(kit)}::jsonb,
      mental_cues_json    = ${JSON.stringify(mental_cues)}::jsonb,
      contingency_json    = ${JSON.stringify(contingency)}::jsonb,
      coach_note          = ${coach_note}
    where id = ${Number(existing.id)}
    returning id::text, athlete_id::text, target_event_id::text,
              time_goal_seconds, station_pacing_json, nutrition_json,
              kit_json, mental_cues_json, contingency_json, coach_note,
              status, approved_by_coach_id::text, approved_at, version,
              parent_race_plan_id::text, created_at, updated_at
  `;
  if (updated.length === 0) {
    throw new RacePlanError('not_found', 'race plan not found');
  }
  return rowToPlan(updated[0]);
}

// =============================================================================
// Approve (Pablo locks the plan for the athlete)
// =============================================================================

export async function approveRacePlan(params: {
  coach_id: bigint | number;
  race_plan_id: bigint | number | string;
  client?: Sql;
}): Promise<RacePlan> {
  const client = params.client ?? defaultSql;
  const planId = Number(params.race_plan_id);
  if (!Number.isFinite(planId) || planId <= 0) {
    throw new RacePlanError('not_found', 'race_plan not found');
  }

  // Verify ownership through athletes table.
  const owns = await client<Array<{ status: RacePlanStatus }>>`
    select rp.status as status
    from race_plans rp
    join athletes a on a.id = rp.athlete_id
    where rp.id = ${planId}
      and a.coach_id = ${params.coach_id as number}
    limit 1
  `;
  if (owns.length === 0) {
    throw new RacePlanError('forbidden', 'no autorizado para este plan');
  }
  if (owns[0].status === 'approved') {
    throw new RacePlanError('plan_already_approved', 'el plan ya está aprobado');
  }
  if (owns[0].status === 'locked') {
    throw new RacePlanError('plan_locked', 'el plan está congelado');
  }

  const updated = await client<
    Array<{
      id: string;
      athlete_id: string;
      target_event_id: string;
      time_goal_seconds: number | null;
      station_pacing_json: unknown;
      nutrition_json: unknown;
      kit_json: unknown;
      mental_cues_json: unknown;
      contingency_json: unknown;
      coach_note: string | null;
      status: RacePlanStatus;
      approved_by_coach_id: string | null;
      approved_at: Date | null;
      version: number;
      parent_race_plan_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    update race_plans set
      status               = 'approved',
      approved_by_coach_id = ${params.coach_id as number},
      approved_at          = now()
    where id = ${planId}
    returning id::text, athlete_id::text, target_event_id::text,
              time_goal_seconds, station_pacing_json, nutrition_json,
              kit_json, mental_cues_json, contingency_json, coach_note,
              status, approved_by_coach_id::text, approved_at, version,
              parent_race_plan_id::text, created_at, updated_at
  `;
  return rowToPlan(updated[0]);
}

// =============================================================================
// Internal helpers
// =============================================================================

async function loadActivePlan(
  client: Sql,
  athlete_id: number,
  target_event_id: number | string,
): Promise<RacePlan | null> {
  const rows = await client<
    Array<{
      id: string;
      athlete_id: string;
      target_event_id: string;
      time_goal_seconds: number | null;
      station_pacing_json: unknown;
      nutrition_json: unknown;
      kit_json: unknown;
      mental_cues_json: unknown;
      contingency_json: unknown;
      coach_note: string | null;
      status: RacePlanStatus;
      approved_by_coach_id: string | null;
      approved_at: Date | null;
      version: number;
      parent_race_plan_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    select id::text, athlete_id::text, target_event_id::text,
           time_goal_seconds, station_pacing_json, nutrition_json,
           kit_json, mental_cues_json, contingency_json, coach_note,
           status, approved_by_coach_id::text, approved_at, version,
           parent_race_plan_id::text, created_at, updated_at
    from race_plans
    where athlete_id      = ${athlete_id}
      and target_event_id = ${Number(target_event_id)}
    order by version desc, id desc
    limit 1
  `;
  if (rows.length === 0) return null;
  return rowToPlan(rows[0]);
}

async function loadRaceResult(client: Sql, race_plan_id: string | number): Promise<RaceResult | null> {
  const rows = await client<
    Array<{
      id: string;
      race_plan_id: string;
      athlete_id: string;
      finish_time_seconds: number;
      finish_position: number | null;
      division: string | null;
      station_actuals_json: unknown;
      recorded_at: Date;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    select id::text, race_plan_id::text, athlete_id::text,
           finish_time_seconds, finish_position, division,
           station_actuals_json, recorded_at, created_at, updated_at
    from race_results
    where race_plan_id = ${Number(race_plan_id)}
    limit 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    race_plan_id: r.race_plan_id,
    athlete_id: r.athlete_id,
    finish_time_seconds: r.finish_time_seconds,
    finish_position: r.finish_position,
    division: r.division,
    station_actuals: parseStationActuals(r.station_actuals_json),
    recorded_at: r.recorded_at.toISOString(),
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

async function loadRaceDebrief(client: Sql, race_result_id: string | number): Promise<RaceDebrief | null> {
  const rows = await client<
    Array<{
      id: string;
      race_result_id: string;
      athlete_id: string;
      soreness_post: number;
      energy_during: number;
      had_crisis: boolean;
      crisis_at_station: number | null;
      crisis_notes: string | null;
      what_worked: string | null;
      what_to_improve: string | null;
      pace_realism: RacePaceRealism;
      lessons_text: string | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    select id::text, race_result_id::text, athlete_id::text,
           soreness_post, energy_during, had_crisis, crisis_at_station,
           crisis_notes, what_worked, what_to_improve, pace_realism, lessons_text,
           created_at, updated_at
    from race_debriefs
    where race_result_id = ${Number(race_result_id)}
    limit 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    race_result_id: r.race_result_id,
    athlete_id: r.athlete_id,
    soreness_post: r.soreness_post,
    energy_during: r.energy_during,
    had_crisis: r.had_crisis,
    crisis_at_station: r.crisis_at_station,
    crisis_notes: r.crisis_notes,
    what_worked: r.what_worked,
    what_to_improve: r.what_to_improve,
    pace_realism: r.pace_realism,
    lessons_text: r.lessons_text,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function rowToPlan(r: {
  id: string;
  athlete_id: string;
  target_event_id: string;
  time_goal_seconds: number | null;
  station_pacing_json: unknown;
  nutrition_json: unknown;
  kit_json: unknown;
  mental_cues_json: unknown;
  contingency_json: unknown;
  coach_note: string | null;
  status: RacePlanStatus;
  approved_by_coach_id: string | null;
  approved_at: Date | null;
  version: number;
  parent_race_plan_id: string | null;
  created_at: Date;
  updated_at: Date;
}): RacePlan {
  return {
    id: r.id,
    athlete_id: r.athlete_id,
    target_event_id: r.target_event_id,
    time_goal_seconds: r.time_goal_seconds,
    station_pacing: parseStationPacing(r.station_pacing_json),
    nutrition: parseNutrition(r.nutrition_json),
    kit: parseKit(r.kit_json),
    mental_cues: parseMentalCues(r.mental_cues_json),
    contingency: parseContingency(r.contingency_json),
    coach_note: r.coach_note,
    status: r.status,
    approved_by_coach_id: r.approved_by_coach_id,
    approved_at: r.approved_at?.toISOString() ?? null,
    version: r.version,
    parent_race_plan_id: r.parent_race_plan_id,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

function parseStationPacing(j: unknown): RacePlanStationPacing[] {
  if (!Array.isArray(j)) return defaultStationPacing();
  const out: RacePlanStationPacing[] = [];
  for (let i = 1; i <= HYROX_ELEMENT_COUNT; i++) {
    const found = (j as Array<Record<string, unknown>>).find(
      (x) => Number(x.station_index) === i,
    );
    if (found) {
      out.push({
        station_index: i,
        label: typeof found.label === 'string' ? found.label : HYROX_STATION_LABELS[i] ?? `Element ${i}`,
        target_pace: typeof found.target_pace === 'string' ? found.target_pace : null,
        note: typeof found.note === 'string' ? found.note : null,
      });
    } else {
      out.push({
        station_index: i,
        label: HYROX_STATION_LABELS[i] ?? `Element ${i}`,
        target_pace: null,
        note: null,
      });
    }
  }
  return out;
}

function parseNutrition(j: unknown): RacePlanNutrition {
  const o = (j ?? {}) as Record<string, unknown>;
  return {
    pre_3h: typeof o.pre_3h === 'string' ? o.pre_3h : null,
    pre_45m: typeof o.pre_45m === 'string' ? o.pre_45m : null,
    intra: typeof o.intra === 'string' ? o.intra : null,
    post: typeof o.post === 'string' ? o.post : null,
  };
}

function parseKit(j: unknown): RacePlanKitItem[] {
  if (!Array.isArray(j)) return [];
  return (j as Array<Record<string, unknown>>)
    .filter((x) => typeof x.item === 'string')
    .map((x) => ({
      item: String(x.item),
      checked: x.checked === true,
      notes: typeof x.notes === 'string' ? x.notes : null,
    }));
}

function parseMentalCues(j: unknown): RacePlanMentalCue[] {
  if (!Array.isArray(j)) return [];
  return (j as Array<Record<string, unknown>>)
    .filter((x) => typeof x.cue === 'string')
    .map((x) => ({
      station_index:
        typeof x.station_index === 'number' && x.station_index >= 1 && x.station_index <= HYROX_ELEMENT_COUNT
          ? Number(x.station_index)
          : null,
      cue: String(x.cue),
    }));
}

function parseContingency(j: unknown): RacePlanContingency[] {
  if (!Array.isArray(j)) return [];
  return (j as Array<Record<string, unknown>>)
    .filter((x) => typeof x.trigger === 'string' && typeof x.action === 'string')
    .map((x) => ({ trigger: String(x.trigger), action: String(x.action) }));
}

function parseStationActuals(j: unknown): RacePlanStationActual[] {
  if (!Array.isArray(j)) return [];
  return (j as Array<Record<string, unknown>>)
    .filter((x) => typeof x.station_index === 'number' && typeof x.duration_seconds === 'number')
    .map((x) => ({
      station_index: Number(x.station_index),
      duration_seconds: Number(x.duration_seconds),
      notes: typeof x.notes === 'string' ? x.notes : null,
    }));
}

function daysBetween(now: Date, isoDate: string): number {
  const target = new Date(`${isoDate}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
}
