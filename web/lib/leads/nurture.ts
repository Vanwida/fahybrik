// Lead nurturing data layer (funnel #10). Two responsibilities:
//   • selectNurtureCandidates(now, sql) — every DUE, not-yet-sent, not-excluded touch,
//     one clear SQL branch per sequence (parcial / nuevo / noshow / pensandoselo).
//   • setLeadNoContactar(token, sql)    — the RGPD opt-out mutation behind the public
//     unsubscribe endpoint.
//
// Cadence is NOT hardcoded here: the delay for each touch comes from the shared single
// source (NURTURE_TOUCHES) so the selector and the schedule can never drift. Leads carry
// no coach_id (single-coach launch), so there is no per-coach scoping.
//
// Exclusions applied to EVERY branch (the hard rules from #10):
//   • leads.no_contactar = false            (RGPD opt-out)
//   • leads.status not in (descartado, convertido)
//   • no existing lead_nurture_log row for (lead_id, touch_type)  (idempotency)

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { NURTURE_TOUCHES, type NurtureTouchType } from '@fahybrid/shared/domain/leads/nurture';

export interface NurtureLead {
  id: string;
  email: string;
  nombre: string | null;
}

export interface NurtureCandidate {
  lead: NurtureLead;
  touch_type: NurtureTouchType;
  /** Public booking token (leads.token) for the `/es/cita/<token>` link — null for the
   *  `parcial` sequence, which links to `/es/empieza` (they never finished onboarding). */
  cita_token: string | null;
  /** RGPD opt-out token for the unsubscribe link — always present. */
  unsubscribe_token: string;
}

interface CandidateRow {
  id: string;
  email: string;
  nombre: string | null;
  cita_token: string | null;
  unsubscribe_token: string;
}

/** Shared exclusion clause (RGPD opt-out + terminal statuses + waitlist gate + idempotency).
 *  One source so it can never drift between branches. Assumes the leads row is aliased `l`. */
function notExcluded(client: Sql, touch: NurtureTouchType) {
  // #18 ↔ #10: an actively-waiting lead (on the waitlist, plaza NOT yet released) cannot book a
  // call, so the "reserva tu llamada" sequences must not nurture it (that would be a dead-end
  // CTA). A RELEASED lead CAN book → it keeps its nurture. Hence exclude ONLY the leads that are
  // waitlisted AND not yet released.
  return client`
    l.no_contactar = false
    and l.status not in ('descartado', 'convertido')
    and (l.waitlisted_at is null or l.waitlist_released_at is not null)
    and not exists (
      select 1 from lead_nurture_log g where g.lead_id = l.id and g.touch_type = ${touch}
    )`;
}

function toCandidate(row: CandidateRow, touch: NurtureTouchType): NurtureCandidate {
  const isParcial = NURTURE_TOUCHES[touch].sequence === 'parcial';
  return {
    lead: { id: row.id, email: row.email, nombre: row.nombre },
    touch_type: touch,
    cita_token: isParcial ? null : row.cita_token,
    unsubscribe_token: row.unsubscribe_token,
  };
}

/**
 * Every due nurture touch as of `now`. Runs one query per branch (all independent) and
 * concatenates. `now` is bound as a parameter so tests can pin a deterministic clock.
 */
export async function selectNurtureCandidates(
  now: Date,
  client: Sql = defaultSql,
): Promise<NurtureCandidate[]> {
  const nowIso = now.toISOString();

  // (A) parcial — email captured, onboarding never finished. Anchored on created_at. Each
  //     touch fires only inside its [delay, delay+window) window (shelf life + first-run safety).
  const parcialT1 = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where l.status = 'parcial'
      and ${nowIso}::timestamptz >= l.created_at + make_interval(days => ${NURTURE_TOUCHES.parcial_t1.delayDays})
      and ${nowIso}::timestamptz <  l.created_at + make_interval(days => ${NURTURE_TOUCHES.parcial_t1.delayDays + NURTURE_TOUCHES.parcial_t1.windowDays})
      and ${notExcluded(client, 'parcial_t1')}
  `;
  const parcialT3 = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where l.status = 'parcial'
      and ${nowIso}::timestamptz >= l.created_at + make_interval(days => ${NURTURE_TOUCHES.parcial_t3.delayDays})
      and ${nowIso}::timestamptz <  l.created_at + make_interval(days => ${NURTURE_TOUCHES.parcial_t3.delayDays + NURTURE_TOUCHES.parcial_t3.windowDays})
      and ${notExcluded(client, 'parcial_t3')}
  `;

  // (B) nuevo — onboarding completed, no call booked (booking auto-advances to agendado, so
  //     status='nuevo' == never booked). Anchored on submitted_at.
  const nuevoT1 = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where l.status = 'nuevo' and l.submitted_at is not null
      and ${nowIso}::timestamptz >= l.submitted_at + make_interval(days => ${NURTURE_TOUCHES.nuevo_t1.delayDays})
      and ${nowIso}::timestamptz <  l.submitted_at + make_interval(days => ${NURTURE_TOUCHES.nuevo_t1.delayDays + NURTURE_TOUCHES.nuevo_t1.windowDays})
      and ${notExcluded(client, 'nuevo_t1')}
  `;
  const nuevoT4 = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where l.status = 'nuevo' and l.submitted_at is not null
      and ${nowIso}::timestamptz >= l.submitted_at + make_interval(days => ${NURTURE_TOUCHES.nuevo_t4.delayDays})
      and ${nowIso}::timestamptz <  l.submitted_at + make_interval(days => ${NURTURE_TOUCHES.nuevo_t4.delayDays + NURTURE_TOUCHES.nuevo_t4.windowDays})
      and ${notExcluded(client, 'nuevo_t4')}
  `;

  // (C) noshow — the lead missed the booked call. Triggered by EITHER a session_report with
  //     outcome='no_asistio' (once occurred_at passed) OR an appointment with status='no_show'
  //     (once requested_start passed). EXISTS so a lead appears at most once regardless.
  const noshow = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where (
        exists (
          select 1 from session_reports sr
          where sr.lead_id = l.id and sr.deleted_at is null
            and sr.outcome = 'no_asistio'::session_report_outcome
            and ${nowIso}::timestamptz >= sr.occurred_at
            and ${nowIso}::timestamptz <  sr.occurred_at + make_interval(days => ${NURTURE_TOUCHES.noshow_rebook.delayDays + NURTURE_TOUCHES.noshow_rebook.windowDays})
        )
        or exists (
          select 1 from appointments a
          where a.lead_id = l.id and a.status = 'no_show'::appointment_status
            and ${nowIso}::timestamptz >= a.requested_start
            and ${nowIso}::timestamptz <  a.requested_start + make_interval(days => ${NURTURE_TOUCHES.noshow_rebook.delayDays + NURTURE_TOUCHES.noshow_rebook.windowDays})
        )
      )
      and ${notExcluded(client, 'noshow_rebook')}
  `;

  // (D) pensandoselo — the call happened and the lead is still deciding. Anchored on the
  //     session_report.occurred_at + 3d.
  const pensandoselo = client<CandidateRow[]>`
    select l.id::text as id, l.email, l.nombre, l.token as cita_token, l.unsubscribe_token
    from leads l
    where exists (
        select 1 from session_reports sr
        where sr.lead_id = l.id and sr.deleted_at is null
          and sr.outcome = 'pensandoselo'::session_report_outcome
          and ${nowIso}::timestamptz >= sr.occurred_at + make_interval(days => ${NURTURE_TOUCHES.pensandoselo_t3.delayDays})
          and ${nowIso}::timestamptz <  sr.occurred_at + make_interval(days => ${NURTURE_TOUCHES.pensandoselo_t3.delayDays + NURTURE_TOUCHES.pensandoselo_t3.windowDays})
      )
      and ${notExcluded(client, 'pensandoselo_t3')}
  `;

  const [a1, a3, b1, b4, c, d] = await Promise.all([
    parcialT1,
    parcialT3,
    nuevoT1,
    nuevoT4,
    noshow,
    pensandoselo,
  ]);

  return [
    ...a1.map((r) => toCandidate(r, 'parcial_t1')),
    ...a3.map((r) => toCandidate(r, 'parcial_t3')),
    ...b1.map((r) => toCandidate(r, 'nuevo_t1')),
    ...b4.map((r) => toCandidate(r, 'nuevo_t4')),
    ...c.map((r) => toCandidate(r, 'noshow_rebook')),
    ...d.map((r) => toCandidate(r, 'pensandoselo_t3')),
  ];
}

/**
 * RGPD opt-out: flag the lead owning `token` as no_contactar. Idempotent and safe on an
 * unknown token (returns false, never throws / never leaks whether the token existed).
 */
export async function setLeadNoContactar(
  token: string,
  client: Sql = defaultSql,
): Promise<boolean> {
  const rows = await client<{ id: string }[]>`
    update leads set no_contactar = true, updated_at = now()
    where unsubscribe_token = ${token} and no_contactar = false
    returning id::text as id
  `;
  return rows.length > 0;
}
