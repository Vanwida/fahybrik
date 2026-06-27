// Mass Adjustments service layer.
//
// Spec: /docs/ux/10-coach-mass-adjustments.md
// Migration: infra/migrations/0006_coach_mass_adjustments.sql
//
// Public surface:
//   resolveScope    — turn UX scope picker into a list of athlete ids
//   buildPreview    — compute impact (athletes, exercises modified, projection)
//   applyAdjustment — commit + audit + per-target rows for rollback
//   rollbackAdjustment — undo within 7 days
//   listHistory     — past adjustments for the coach
//
// Notes on persistence semantics:
//
// FAHYBRIK does not (yet) have a per-athlete prescription override table —
// `workout_assignments` only carries `template_id` + `template_version` + a
// free-form `notes` field. To honour the spec without a cross-cutting schema
// change we encode the adjustment as a structured note prefix on the
// affected `workout_assignments.notes`. The `coach_mass_adjustment_targets`
// table captures the prior `notes` so rollback is a pure restore. When a
// proper override table lands later, the same target rows give us a clean
// migration path (replay payloads → override rows; drop the prefixed notes).
//
// Hard rules enforced here:
//   * coach_id on every query — Pablo cannot reach another coach's athletes
//   * 7-day rollback window enforced server-side (rollback_deadline column)
//   * audit_log row written on commit AND on rollback
//   * scope_filter snapshot stored verbatim (not recomputed on history)

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import type {
  MassAdjustmentHistoryRow,
  MassAdjustmentPayload,
  MassAdjustmentPreviewResponse,
  MassAdjustmentScope,
  MassAdjustmentStatus,
  MassAdjustmentType,
  PreviewAthleteRow,
} from './mass-adjustments-schema';

const ROLLBACK_WINDOW_DAYS = 7;
const NOTE_PREFIX = '[mass-adj';

export interface ApplyParams {
  coach_id: number | bigint;
  applied_by_user_id: number | bigint;
  scope: MassAdjustmentScope;
  payload: MassAdjustmentPayload;
  excluded_athlete_ids: Array<number | bigint | string>;
  now?: Date;
  client?: Sql;
}

export type PreviewParams = Omit<ApplyParams, 'applied_by_user_id'>;

export interface ResolvedScope {
  athlete_ids: number[];
  athlete_rows: Array<{
    athlete_id: number;
    full_name: string;
    /** Current microciclo NAME (coach data), null when none active. */
    block_type: string | null;
    block_week: number | null;
  }>;
}

interface AthleteWindowAssignment {
  id: number;
  athlete_id: number;
  scheduled_for: string;
  template_id: number;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------

export async function resolveScope(params: {
  coach_id: number | bigint;
  scope: MassAdjustmentScope;
  client?: Sql;
}): Promise<ResolvedScope> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);

  const ids = await scopeToIds(client, coach_id, params.scope);
  if (ids.length === 0) {
    return { athlete_ids: [], athlete_rows: [] };
  }

  const rows = await client<
    Array<{ athlete_id: number; full_name: string; block_type: string | null; block_week: number | null }>
  >`
    select a.id::int as athlete_id,
           a.full_name,
           ab.block_type as block_type,
           ab.block_week as block_week
    from athletes a
    left join lateral (
      -- Current microciclo (AGNOSTIC): receipt window containing today → its
      -- template NAME + 1-based week within that window.
      select
        m.name as block_type,
        greatest(
          1,
          (floor((current_date - date_trunc('week', ama.start_date)::date) / 7) + 1)::int
        ) as block_week
      from athlete_month_assignments ama
      join program_month_templates m on m.id = ama.month_template_id
      where ama.athlete_id = a.id
        and current_date between ama.start_date and ama.end_date
      order by ama.start_date desc
      limit 1
    ) ab on true
    where a.coach_id = ${coach_id}
      and a.id = any(${ids}::bigint[])
    order by a.full_name asc
  `;

  return {
    athlete_ids: rows.map((r) => Number(r.athlete_id)),
    athlete_rows: rows.map((r) => ({
      athlete_id: Number(r.athlete_id),
      full_name: r.full_name,
      block_type: r.block_type ?? null,
      block_week: r.block_week == null ? null : Number(r.block_week),
    })),
  };
}

async function scopeToIds(
  client: Sql,
  coach_id: number,
  scope: MassAdjustmentScope,
): Promise<number[]> {
  switch (scope.kind) {
    case 'selection':
    case 'manual': {
      const ids = scope.athlete_ids.map((v) => Number(v));
      const rows = await client<Array<{ id: number }>>`
        select id::int as id from athletes
        where coach_id = ${coach_id} and id = any(${ids}::bigint[])
      `;
      return rows.map((r) => Number(r.id));
    }
    case 'filter': {
      const block = scope.block ?? null;
      const week = scope.week ?? null;
      const rows = await client<Array<{ id: number }>>`
        select a.id::int as id
        from athletes a
        left join lateral (
          -- Current microciclo (AGNOSTIC): receipt window containing today.
          select
            m.name as block_type,
            greatest(
              1,
              (floor((current_date - date_trunc('week', ama.start_date)::date) / 7) + 1)::int
            ) as week_number
          from athlete_month_assignments ama
          join program_month_templates m on m.id = ama.month_template_id
          where ama.athlete_id = a.id
            and current_date between ama.start_date and ama.end_date
          order by ama.start_date desc
          limit 1
        ) ab on true
        where a.coach_id = ${coach_id}
          and (${block}::text is null or ab.block_type = ${block}::text)
          and (${week}::int is null or ab.week_number = ${week}::int)
      `;
      return rows.map((r) => Number(r.id));
    }
    case 'a_event': {
      const event_id = Number(scope.event_id);
      // Athletes whose TARGET race is linked to this catalog event (unified spine,
      // via races.event_id). Distinct: an athlete has at most one target race.
      const rows = await client<Array<{ id: number }>>`
        select distinct a.id::int as id
        from athletes a
        join races r on r.athlete_id = a.id
        where a.coach_id = ${coach_id}
          and r.event_id = ${event_id}
          and r.priority = 'target'
      `;
      return rows.map((r) => Number(r.id));
    }
  }
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export async function buildPreview(
  params: PreviewParams,
): Promise<MassAdjustmentPreviewResponse> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const excluded = new Set(
    params.excluded_athlete_ids.map((v) => String(v)).map(Number).filter((n) => !Number.isNaN(n)),
  );

  const resolved = await resolveScope({
    coach_id: params.coach_id,
    scope: params.scope,
    client,
  });
  const after_exclusions = resolved.athlete_rows.filter(
    (r) => !excluded.has(r.athlete_id),
  );

  if (after_exclusions.length === 0) {
    return {
      athletes: [],
      total_assignments_touched: 0,
      projection: { strength_load_pct_delta: 0, running_volume_pct_delta: 0 },
      suggested_exclusions: [],
    };
  }

  const window = windowForPayload(params.payload, now);
  const ids = after_exclusions.map((r) => r.athlete_id);
  const assignments = await loadWindowAssignments(client, ids, window);

  const exercisesPerAssignment = await countMatchingExercises(
    client,
    assignments,
    params.payload,
  );

  const warnings = await loadWarnings(client, ids, now);

  const athletes: PreviewAthleteRow[] = after_exclusions.map((row) => {
    const myAssignments = assignments.filter((a) => a.athlete_id === row.athlete_id);
    const exercises_modified = myAssignments.reduce(
      (s, a) => s + (exercisesPerAssignment.get(a.id) ?? 0),
      0,
    );
    return {
      athlete_id: String(row.athlete_id),
      full_name: row.full_name,
      block_type: row.block_type,
      block_week: row.block_week,
      exercises_modified,
      warnings: warnings.get(row.athlete_id) ?? [],
    };
  });

  const total_assignments_touched = assignments.length;
  const projection = projectVolume(params.payload, athletes);
  const suggested_exclusions = athletes
    .filter((a) => a.warnings.length > 0)
    .map((a) => a.athlete_id);

  return {
    athletes,
    total_assignments_touched,
    projection,
    suggested_exclusions,
  };
}

function projectVolume(
  payload: MassAdjustmentPayload,
  athletes: PreviewAthleteRow[],
): { strength_load_pct_delta: number; running_volume_pct_delta: number } {
  if (athletes.length === 0) {
    return { strength_load_pct_delta: 0, running_volume_pct_delta: 0 };
  }
  if (payload.type === 'strength_load_pct') {
    return { strength_load_pct_delta: payload.delta_pct, running_volume_pct_delta: 0 };
  }
  if (payload.type === 'running_volume_pct') {
    return { strength_load_pct_delta: 0, running_volume_pct_delta: payload.delta_pct };
  }
  return { strength_load_pct_delta: 0, running_volume_pct_delta: 0 };
}

// ---------------------------------------------------------------------------
// Apply (commit)
// ---------------------------------------------------------------------------

export interface ApplyResult {
  adjustment_id: string;
  athletes_affected: number;
  rollback_deadline: string;
}

export async function applyAdjustment(params: ApplyParams): Promise<ApplyResult> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();
  const excluded = new Set(
    params.excluded_athlete_ids.map((v) => String(v)).map(Number).filter((n) => !Number.isNaN(n)),
  );

  const resolved = await resolveScope({
    coach_id: params.coach_id,
    scope: params.scope,
    client,
  });
  const targets = resolved.athlete_rows.filter((r) => !excluded.has(r.athlete_id));
  if (targets.length === 0) {
    throw new MassAdjustmentError('empty_scope', 'No athletes selected after exclusions');
  }

  const window = windowForPayload(params.payload, now);
  const rollback_deadline = new Date(now.getTime() + ROLLBACK_WINDOW_DAYS * 86_400_000);

  const result = await client.begin(async (tx) => {
    const inserted = await tx<Array<{ id: bigint }>>`
      insert into coach_mass_adjustments (
        coach_id, adjustment_type, scope_filter_json, adjustment_payload,
        athletes_affected_count, athletes_affected_json,
        applied_by_user_id, applied_at, rollback_deadline
      ) values (
        ${Number(params.coach_id)},
        ${params.payload.type}::coach_mass_adjustment_type,
        ${JSON.stringify(params.scope)}::jsonb,
        ${JSON.stringify(params.payload)}::jsonb,
        ${targets.length},
        ${JSON.stringify(targets.map((t) => ({ athlete_id: t.athlete_id, full_name: t.full_name })))}::jsonb,
        ${Number(params.applied_by_user_id)},
        ${now.toISOString()}::timestamptz,
        ${rollback_deadline.toISOString()}::timestamptz
      )
      returning id
    `;
    const adjustment_id = inserted[0].id;

    const athleteIds = targets.map((t) => t.athlete_id);

    if (params.payload.type === 'insert_session') {
      const new_rows = await tx<Array<{ id: bigint; athlete_id: bigint }>>`
        insert into workout_assignments (
          athlete_id, scheduled_for, template_id, template_version, status, notes
        )
        select
          a.id,
          (current_date + ${params.payload.day_offset}::int)::date,
          ${Number(params.payload.template_id)}::bigint,
          coalesce((select max(template_version) from workout_assignments wa where wa.template_id = ${Number(params.payload.template_id)}::bigint), 1),
          'scheduled',
          ${notePrefix(adjustment_id, params.payload)}
        from athletes a
        where a.coach_id = ${Number(params.coach_id)}
          and a.id = any(${athleteIds}::bigint[])
        returning id, athlete_id
      `;
      for (const r of new_rows) {
        await tx`
          insert into coach_mass_adjustment_targets (
            adjustment_id, athlete_id, assignment_id, prior_state_json
          ) values (
            ${adjustment_id}, ${r.athlete_id}, ${r.id}, null
          )
        `;
      }
    } else {
      // All other types operate on existing assignments in the window.
      const assignments = await loadWindowAssignments(tx as unknown as Sql, athleteIds, window);
      for (const a of assignments) {
        const prior = {
          notes: a.notes,
          scheduled_for: a.scheduled_for,
          status: 'scheduled',
        };

        if (params.payload.type === 'delete_session') {
          await tx`
            update workout_assignments
            set status = 'skipped',
                notes = ${appendNote(a.notes, adjustment_id, params.payload)}
            where id = ${a.id}
          `;
        } else if (params.payload.type === 'reschedule_shift') {
          const target_date = shiftDate(a.scheduled_for, params.payload.shift_days);
          await tx`
            update workout_assignments
            set scheduled_for = ${target_date}::date,
                notes = ${appendNote(a.notes, adjustment_id, params.payload)}
            where id = ${a.id}
          `;
        } else {
          // strength_load_pct | running_volume_pct | refactor_exercise | private_note
          await tx`
            update workout_assignments
            set notes = ${appendNote(a.notes, adjustment_id, params.payload)}
            where id = ${a.id}
          `;
        }

        await tx`
          insert into coach_mass_adjustment_targets (
            adjustment_id, athlete_id, assignment_id, prior_state_json
          ) values (
            ${adjustment_id}, ${a.athlete_id}, ${a.id}, ${JSON.stringify(prior)}::jsonb
          )
        `;
      }
    }

    await tx`
      insert into audit_log (actor_user_id, entity_type, entity_id, action, diff_json)
      values (
        ${Number(params.applied_by_user_id)},
        'coach_mass_adjustments',
        ${adjustment_id},
        'create',
        ${JSON.stringify({
          type: params.payload.type,
          scope_kind: params.scope.kind,
          athletes_affected_count: targets.length,
          rollback_deadline: rollback_deadline.toISOString(),
        })}::jsonb
      )
    `;

    // Notify each athlete (best-effort; uses notifications table).
    const userIds = await tx<Array<{ user_id: bigint }>>`
      select user_id from athletes where id = any(${athleteIds}::bigint[])
    `;
    for (const u of userIds) {
      if (u.user_id == null) continue;
      await tx`
        insert into notifications (user_id, type, payload_json)
        values (
          ${u.user_id},
          'workout_edited',
          ${JSON.stringify({
            kind: 'mass_adjustment',
            adjustment_id: String(adjustment_id),
            adjustment_type: params.payload.type,
          })}::jsonb
        )
      `;
    }

    return {
      adjustment_id: String(adjustment_id),
      athletes_affected: targets.length,
      rollback_deadline: rollback_deadline.toISOString(),
    };
  });

  return result;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export async function rollbackAdjustment(params: {
  coach_id: number | bigint;
  rolled_back_by_user_id: number | bigint;
  adjustment_id: number | bigint;
  now?: Date;
  client?: Sql;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = params.client ?? defaultSql;
  const now = params.now ?? new Date();

  const rows = await client<
    Array<{
      id: bigint;
      coach_id: bigint;
      adjustment_type: MassAdjustmentType;
      adjustment_payload: MassAdjustmentPayload;
      status: MassAdjustmentStatus;
      rollback_deadline: Date;
    }>
  >`
    select id, coach_id, adjustment_type, adjustment_payload, status, rollback_deadline
    from coach_mass_adjustments
    where id = ${Number(params.adjustment_id)}
      and coach_id = ${Number(params.coach_id)}
    limit 1
  `;
  const found = rows[0];
  if (!found) return { ok: false, reason: 'not_found' };
  if (found.status === 'rolled_back') return { ok: false, reason: 'already_rolled_back' };
  if (now.getTime() > new Date(found.rollback_deadline).getTime()) {
    return { ok: false, reason: 'rollback_window_expired' };
  }

  await client.begin(async (tx) => {
    const targets = await tx<
      Array<{ assignment_id: bigint | null; prior_state_json: { notes: string | null; scheduled_for: string; status: string } | null }>
    >`
      select assignment_id, prior_state_json
      from coach_mass_adjustment_targets
      where adjustment_id = ${Number(params.adjustment_id)}
    `;

    if (found.adjustment_type === 'insert_session') {
      // Inserted rows: delete them.
      const ids = targets
        .map((t) => (t.assignment_id == null ? null : Number(t.assignment_id)))
        .filter((n): n is number => n != null);
      if (ids.length > 0) {
        await tx`
          delete from workout_assignments where id = any(${ids}::bigint[])
        `;
      }
    } else {
      // Restore prior state.
      for (const t of targets) {
        if (t.assignment_id == null || t.prior_state_json == null) continue;
        const prior = t.prior_state_json;
        await tx`
          update workout_assignments
          set notes = ${prior.notes},
              scheduled_for = ${prior.scheduled_for}::date,
              status = ${prior.status}::assignment_status
          where id = ${Number(t.assignment_id)}
        `;
      }
    }

    await tx`
      update coach_mass_adjustments
      set status = 'rolled_back',
          rolled_back_at = ${now.toISOString()}::timestamptz,
          rolled_back_by_user_id = ${Number(params.rolled_back_by_user_id)}
      where id = ${Number(params.adjustment_id)}
    `;

    await tx`
      insert into audit_log (actor_user_id, entity_type, entity_id, action, diff_json)
      values (
        ${Number(params.rolled_back_by_user_id)},
        'coach_mass_adjustments',
        ${Number(params.adjustment_id)},
        'restore',
        ${JSON.stringify({ rolled_back_at: now.toISOString() })}::jsonb
      )
    `;
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listHistory(params: {
  coach_id: number | bigint;
  limit?: number;
  client?: Sql;
}): Promise<MassAdjustmentHistoryRow[]> {
  const client = params.client ?? defaultSql;
  const limit = Math.max(1, Math.min(200, params.limit ?? 50));

  const rows = await client<
    Array<{
      id: bigint;
      adjustment_type: MassAdjustmentType;
      status: MassAdjustmentStatus;
      scope_filter_json: MassAdjustmentScope;
      adjustment_payload: MassAdjustmentPayload;
      athletes_affected_count: number;
      applied_at: Date;
      rollback_deadline: Date;
      rolled_back_at: Date | null;
    }>
  >`
    select id, adjustment_type, status, scope_filter_json, adjustment_payload,
           athletes_affected_count, applied_at, rollback_deadline, rolled_back_at
    from coach_mass_adjustments
    where coach_id = ${Number(params.coach_id)}
    order by applied_at desc
    limit ${limit}
  `;

  return rows.map((r) => ({
    id: String(r.id),
    adjustment_type: r.adjustment_type,
    status: r.status,
    scope_summary: scopeSummary(r.scope_filter_json),
    athletes_affected_count: Number(r.athletes_affected_count),
    applied_at: r.applied_at.toISOString(),
    rollback_deadline: r.rollback_deadline.toISOString(),
    rolled_back_at: r.rolled_back_at?.toISOString() ?? null,
    payload_summary: payloadSummary(r.adjustment_payload),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DateWindow {
  start_iso: string;
  end_iso: string;
}

function windowForPayload(payload: MassAdjustmentPayload, now: Date): DateWindow {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const startIso = start.toISOString().slice(0, 10);
  const weeks = 'weeks_ahead' in payload ? payload.weeks_ahead : 1;
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + weeks * 7);
  const endIso = end.toISOString().slice(0, 10);
  return { start_iso: startIso, end_iso: endIso };
}

async function loadWindowAssignments(
  client: Sql,
  athlete_ids: number[],
  window: DateWindow,
): Promise<AthleteWindowAssignment[]> {
  if (athlete_ids.length === 0) return [];
  const rows = await client<
    Array<{
      id: number;
      athlete_id: number;
      scheduled_for: string;
      template_id: number;
      notes: string | null;
    }>
  >`
    select id::int as id,
           athlete_id::int as athlete_id,
           to_char(scheduled_for, 'YYYY-MM-DD') as scheduled_for,
           template_id::int as template_id,
           notes
    from workout_assignments
    where athlete_id = any(${athlete_ids}::bigint[])
      and scheduled_for >= ${window.start_iso}::date
      and scheduled_for <  ${window.end_iso}::date
      and status = 'scheduled'
    order by athlete_id, scheduled_for
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    athlete_id: Number(r.athlete_id),
    scheduled_for: r.scheduled_for,
    template_id: Number(r.template_id),
    notes: r.notes,
  }));
}

async function countMatchingExercises(
  client: Sql,
  assignments: AthleteWindowAssignment[],
  payload: MassAdjustmentPayload,
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (assignments.length === 0) return out;
  const templateIds = Array.from(new Set(assignments.map((a) => a.template_id)));

  if (
    payload.type === 'strength_load_pct' ||
    payload.type === 'running_volume_pct' ||
    payload.type === 'refactor_exercise'
  ) {
    const rows = await client<
      Array<{ template_id: number; count: number }>
    >`
      select ts.template_id::int as template_id, count(*)::int as count
      from template_segments ts
      join exercises e on e.id = ts.exercise_id
      where ts.template_id = any(${templateIds}::bigint[])
        and ${
          payload.type === 'strength_load_pct'
            ? client`e.category = 'strength'`
            : payload.type === 'running_volume_pct'
              ? client`e.category = 'cardio'`
              : client`e.id = ${Number(payload.from_exercise_id)}::bigint`
        }
      group by ts.template_id
    `;
    const byTemplate = new Map<number, number>(
      rows.map((r) => [Number(r.template_id), Number(r.count)]),
    );
    for (const a of assignments) {
      out.set(a.id, byTemplate.get(a.template_id) ?? 0);
    }
    return out;
  }

  // For insert/delete/reschedule/note → count is "1 sesión" per assignment.
  for (const a of assignments) out.set(a.id, 1);
  return out;
}

async function loadWarnings(
  client: Sql,
  athlete_ids: number[],
  now: Date,
): Promise<Map<number, Array<'hrv_crash' | 'no_sync' | 'rpe_high' | 'manual_override'>>> {
  const out = new Map<number, Array<'hrv_crash' | 'no_sync' | 'rpe_high' | 'manual_override'>>();
  if (athlete_ids.length === 0) return out;

  const rows = await client<
    Array<{
      athlete_id: number;
      hrv_recent: number | null;
      hrv_baseline: number | null;
      last_sync_at: Date | null;
      rpe_yesterday: number | null;
    }>
  >`
    with hrv_recent as (
      select athlete_id, avg(value_numeric)::float as v
      from biometric_streams
      where metric_type = 'hrv'
        and recorded_at >= ${now.toISOString()}::timestamptz - interval '7 days'
        and athlete_id = any(${athlete_ids}::bigint[])
      group by athlete_id
    ),
    hrv_baseline as (
      select athlete_id, avg(value_numeric)::float as v
      from biometric_streams
      where metric_type = 'hrv'
        and recorded_at >= ${now.toISOString()}::timestamptz - interval '60 days'
        and recorded_at <  ${now.toISOString()}::timestamptz - interval '14 days'
        and athlete_id = any(${athlete_ids}::bigint[])
      group by athlete_id
    ),
    last_sync as (
      select athlete_id, max(recorded_at) as ts
      from biometric_streams
      where athlete_id = any(${athlete_ids}::bigint[])
      group by athlete_id
    ),
    rpe_yest as (
      select we.athlete_id, max(we.perceived_exertion)::float as v
      from workout_executions we
      where coalesce(we.ended_at, we.started_at, we.created_at)
              >= current_date - interval '1 day'
        and coalesce(we.ended_at, we.started_at, we.created_at) < current_date
        and we.athlete_id = any(${athlete_ids}::bigint[])
      group by we.athlete_id
    )
    select a.id::int as athlete_id,
           hr.v as hrv_recent,
           hb.v as hrv_baseline,
           ls.ts as last_sync_at,
           ry.v as rpe_yesterday
    from athletes a
    left join hrv_recent hr on hr.athlete_id = a.id
    left join hrv_baseline hb on hb.athlete_id = a.id
    left join last_sync ls on ls.athlete_id = a.id
    left join rpe_yest ry on ry.athlete_id = a.id
    where a.id = any(${athlete_ids}::bigint[])
  `;

  for (const r of rows) {
    const reasons: Array<'hrv_crash' | 'no_sync' | 'rpe_high' | 'manual_override'> = [];
    if (r.hrv_recent != null && r.hrv_baseline != null && r.hrv_recent - r.hrv_baseline <= -10) {
      reasons.push('hrv_crash');
    }
    if (r.last_sync_at == null) {
      reasons.push('no_sync');
    } else {
      const minsAgo = (now.getTime() - r.last_sync_at.getTime()) / 60_000;
      if (minsAgo > 60 * 48) reasons.push('no_sync');
    }
    if (r.rpe_yesterday != null && r.rpe_yesterday >= 9) {
      reasons.push('rpe_high');
    }
    out.set(Number(r.athlete_id), reasons);
  }
  return out;
}

function appendNote(
  current: string | null,
  adjustment_id: bigint,
  payload: MassAdjustmentPayload,
): string {
  const tag = notePrefix(adjustment_id, payload);
  if (!current) return tag;
  return `${current}\n${tag}`;
}

function notePrefix(adjustment_id: bigint, payload: MassAdjustmentPayload): string {
  switch (payload.type) {
    case 'strength_load_pct':
      return `${NOTE_PREFIX}#${adjustment_id}] carga strength ${formatPct(payload.delta_pct)}`;
    case 'running_volume_pct':
      return `${NOTE_PREFIX}#${adjustment_id}] volumen running ${formatPct(payload.delta_pct)}`;
    case 'refactor_exercise':
      return `${NOTE_PREFIX}#${adjustment_id}] refactor #${payload.from_exercise_id} → #${payload.to_exercise_id}`;
    case 'insert_session':
      return `${NOTE_PREFIX}#${adjustment_id}] sesión añadida`;
    case 'delete_session':
      return `${NOTE_PREFIX}#${adjustment_id}] sesión eliminada`;
    case 'reschedule_shift':
      return `${NOTE_PREFIX}#${adjustment_id}] reprogramado ${payload.shift_days >= 0 ? '+' : ''}${payload.shift_days}d`;
    case 'private_note':
      return `${NOTE_PREFIX}#${adjustment_id}] ${payload.body}`;
  }
}

function formatPct(n: number): string {
  return `${n > 0 ? '+' : ''}${n}%`;
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number(s));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function scopeSummary(scope: MassAdjustmentScope): string {
  switch (scope.kind) {
    case 'selection':
      return `${scope.athlete_ids.length} atletas (selección)`;
    case 'manual':
      return `${scope.athlete_ids.length} atletas (manual)`;
    case 'a_event':
      return `A-event #${scope.event_id}`;
    case 'filter': {
      const parts: string[] = [];
      if (scope.block) parts.push(`bloque ${scope.block}`);
      if (scope.week) parts.push(`semana ${scope.week}`);
      if (scope.level && scope.level !== 'todos') parts.push(`nivel ${scope.level}`);
      return parts.length === 0 ? 'todos' : parts.join(' · ');
    }
  }
}

function payloadSummary(payload: MassAdjustmentPayload): string {
  switch (payload.type) {
    case 'strength_load_pct':
      return `Carga strength ${formatPct(payload.delta_pct)}`;
    case 'running_volume_pct':
      return `Volumen running ${formatPct(payload.delta_pct)}`;
    case 'refactor_exercise':
      return `Refactor ejercicio #${payload.from_exercise_id} → #${payload.to_exercise_id}`;
    case 'insert_session':
      return `Sesión añadida (+${payload.day_offset}d)`;
    case 'delete_session':
      return `Sesión eliminada (+${payload.day_offset}d)`;
    case 'reschedule_shift':
      return `Reprogramar ${payload.shift_days >= 0 ? '+' : ''}${payload.shift_days}d`;
    case 'private_note':
      return 'Nota privada';
  }
}

export class MassAdjustmentError extends Error {
  constructor(
    public code: 'empty_scope' | 'rollback_window_expired' | 'not_found' | 'already_rolled_back',
    message: string,
  ) {
    super(message);
    this.name = 'MassAdjustmentError';
  }
}
