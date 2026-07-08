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
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import type { DetalleLifecycle } from '@/lib/dashboard/v2/atleta-detalle-types';

const ACTIVE_DEFAULT: DetalleLifecycle = {
  status: 'activo',
  pause_reason: null,
  paused_since: null,
  planned_return: null,
  baja_at: null,
  baja_reason: null,
  pending_request: null,
};

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
      pause_reason: string | null;
      pause_start: string | null;
      pause_end: string | null;
      request_id: string | null;
      request_reason: string | null;
    }[]
  >`
    select
      a.lifecycle_status              as status,
      a.baja_at,
      a.baja_reason,
      cp.reason::text                 as pause_reason,
      cp.start_date::text             as pause_start,
      cp.end_date::text               as pause_end,
      req.id::text                    as request_id,
      req.reason::text                as request_reason
    from athletes a
    left join lateral (
      -- The CURRENT pause when pausado: the latest row not yet closed to a past day
      -- (end_date null = indefinite, or a future "vuelve el" date). Mirrors the
      -- closeCurrentPauseTx predicate so a planned-return pause is still surfaced.
      select reason, start_date, end_date
      from athlete_pauses
      where athlete_id = a.id and (end_date is null or end_date > ${todayIso}::date)
      order by start_date desc
      limit 1
    ) cp on true
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
  return {
    status: r.status,
    pause_reason: isPaused ? toReason(r.pause_reason) : null,
    paused_since: isPaused ? r.pause_start : null,
    planned_return: isPaused ? r.pause_end : null,
    baja_at: r.baja_at ? r.baja_at.toISOString() : null,
    baja_reason: toReason(r.baja_reason),
    // A pending request only matters while activo (the requestPause guard rejects it in
    // any other state) — never surface a stale one for a paused / baja athlete.
    pending_request:
      r.status === 'activo' && r.request_id && r.request_reason && isPauseReason(r.request_reason)
        ? { request_id: r.request_id, reason: r.request_reason }
        : null,
  };
}
