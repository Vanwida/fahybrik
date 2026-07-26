import 'server-only';

// Athlete lifecycle DETAIL for the coach ficha (#13). The state machine + read helpers
// in web/lib/coach/athlete-lifecycle.ts are the source of truth for mutations; this is
// the single READ the ficha header + banner consume. One round-trip returns everything
// the UI needs: the lifecycle state, the CURRENT pause (reason + since + planned return),
// the baja context, and any PENDING athlete-initiated pause request.
//
// Why not getAthleteLifecycle(): that read only surfaces INDEFINITE pauses (end_date is
// null) and omits the reason. A coach who set a "vuelve el" date needs to see it, so the
// CURRENT pause here mirrors the closeCurrentPauseTx predicate (end_date null OR still in
// the future) and pulls the reason too. Ownership is already gated by the ficha's shell
// load upstream — this reads the same athlete row by id.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  isPauseReason,
  type AthleteLifecycleStatus,
  type PauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';
import { diffDays, isoDateString, parseIsoDate, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import {
  PAUSE_BUDGET_WINDOW_DAYS,
  computePauseBudget,
} from '@fahybrid/shared/domain/coach/pause-budget';
import type { DetalleLifecycle } from '@/lib/dashboard/v2/atleta-detalle-types';

const ACTIVE_DEFAULT: DetalleLifecycle = {
  status: 'activo',
  pause_reason: null,
  paused_since: null,
  planned_return: null,
  paused_by_name: null,
  paused_by_kind: null,
  baja_at: null,
  baja_reason: null,
  baja_by_name: null,
  pending_request: null,
  baja_scheduled_for: null,
  baja_scheduled_in_days: null,
  pause_days_available: null,
};

/** Coerce a stored actor_kind to the person kinds a pause can carry, else null. */
function toPauseByKind(v: string | null): 'coach' | 'athlete' | null {
  return v === 'coach' || v === 'athlete' ? v : null;
}

/** Coerce a stored reason string to the typed code, or null when it is not a known code. */
function toReason(v: string | null): PauseReason | null {
  return v != null && isPauseReason(v) ? v : null;
}

export async function loadAthleteLifecycleDetail(params: {
  athlete_id: number | bigint;
  client?: Sql;
}): Promise<DetalleLifecycle> {
  const client = params.client ?? defaultSql;
  const todayIso = isoDateString(startOfDayInBox(new Date()));

  const rows = await client<
    {
      status: AthleteLifecycleStatus;
      baja_at: Date | null;
      baja_reason: string | null;
      baja_by_name: string | null;
      baja_scheduled_for: string | null;
      pause_reason: string | null;
      pause_start: string | null;
      pause_end: string | null;
      pause_by_name: string | null;
      pause_by_kind: string | null;
      request_id: string | null;
      request_reason: string | null;
    }[]
  >`
    select
      a.lifecycle_status              as status,
      a.baja_at,
      a.baja_reason,
      bu.full_name                    as baja_by_name,
      a.baja_scheduled_for::text      as baja_scheduled_for,
      cp.reason::text                 as pause_reason,
      cp.start_date::text             as pause_start,
      cp.end_date::text               as pause_end,
      pu.full_name                    as pause_by_name,
      cp.created_by_kind::text        as pause_by_kind,
      req.id::text                    as request_id,
      req.reason::text                as request_reason
    from athletes a
    left join lateral (
      -- The CURRENT pause when pausado: the latest row not yet closed to a past day
      -- (end_date null = indefinite, or a future "vuelve el" date). Mirrors the
      -- closeCurrentPauseTx predicate so a planned-return pause is still surfaced.
      select reason, start_date, end_date, created_by_user_id, created_by_kind
      from athlete_pauses
      where athlete_id = a.id and (end_date is null or end_date > ${todayIso}::date)
      order by start_date desc
      limit 1
    ) cp on true
    -- Authorship (#43): the pause opener + the coach who gave the baja (the baja is
    -- the athlete's last edit — athletes.last_edited_by → the actor of the baja).
    left join users pu on pu.id = cp.created_by_user_id
    left join users bu on bu.id = a.baja_by_user_id
    left join lateral (
      -- The PENDING athlete-initiated pause request, if any (at most one per athlete).
      select id, reason
      from athlete_pause_requests
      where athlete_id = a.id and status = 'pending'
      order by created_at desc
      limit 1
    ) req on true
    where a.id = ${params.athlete_id}
    limit 1
  `;

  const r = rows[0];
  if (!r) return ACTIVE_DEFAULT;

  const isPaused = r.status === 'pausado';
  const isBaja = r.status === 'baja';
  // Pause budget: the same arithmetic the athlete sees, so the two surfaces can never
  // disagree about how many days are left. Cheap enough to read every span — an athlete
  // accumulates a handful of rows, not thousands.
  const spans = await client<{ start_date: string; end_date: string | null }[]>`
    select start_date::text as start_date, end_date::text as end_date
    from athlete_pauses
    where athlete_id = ${params.athlete_id}
      and coalesce(end_date, current_date) >= ${todayIso}::date - ${PAUSE_BUDGET_WINDOW_DAYS}
  `;
  const budget = computePauseBudget(spans, todayIso);

  return {
    status: r.status,
    pause_reason: isPaused ? toReason(r.pause_reason) : null,
    paused_since: isPaused ? r.pause_start : null,
    planned_return: isPaused ? r.pause_end : null,
    paused_by_name: isPaused ? r.pause_by_name : null,
    paused_by_kind: isPaused ? toPauseByKind(r.pause_by_kind) : null,
    baja_at: r.baja_at ? r.baja_at.toISOString() : null,
    baja_reason: toReason(r.baja_reason),
    baja_by_name: isBaja ? r.baja_by_name : null,
    // A pending request only matters while activo (the requestPause guard rejects it in
    // any other state) — never surface a stale one for a paused / baja athlete.
    pending_request:
      r.status === 'activo' && r.request_id && r.request_reason && isPauseReason(r.request_reason)
        ? { request_id: r.request_id, reason: r.request_reason }
        : null,
    // Only meaningful while the baja has NOT landed — once applied, `status` says baja
    // and the column is cleared, so a stale value can never linger in the UI.
    baja_scheduled_for: isBaja ? null : r.baja_scheduled_for,
    baja_scheduled_in_days:
      !isBaja && r.baja_scheduled_for
        ? Math.max(0, diffDays(parseIsoDate(r.baja_scheduled_for), parseIsoDate(todayIso)))
        : null,
    pause_days_available: budget.available_days,
  };
}
