import 'server-only';

import { sql } from '@/lib/db';
import type { SessionOutcome } from '@fahybrid/shared/domain/sessions/outcome';
import type { SessionReportInput, SessionReportUpdateInput } from '@fahybrid/shared/schema';

// 1:1 session-report data layer (#14). A report is the coach's write-up of a videollamada:
// with a LEAD (sales call → outcome + price) or an ATHLETE (1:1 seguimiento). History is
// per-person; a converted lead's sales calls follow onto the athlete card via
// leads.converted_athlete_id. Single-coach today, but coach_id is stamped for the future.

export interface SessionReportView {
  id: string;
  lead_id: string | null;
  athlete_id: string | null;
  appointment_id: string | null;
  occurred_at: string; // ISO
  duration_minutes: number;
  notes: string | null;
  next_steps: string | null;
  outcome: SessionOutcome | null;
  quoted_price_eur: number | null;
  /** true when the row's own subject is a lead (a sales call), even if surfaced on an athlete. */
  from_lead: boolean;
  /** #11: when the post-call summary email was sent to the lead. Null = not sent. */
  summary_email_sent_at: string | null;
  created_at: string;
}

export class SessionReportError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_subject',
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'SessionReportError';
  }
}

interface RawRow {
  id: string;
  lead_id: string | null;
  athlete_id: string | null;
  appointment_id: string | null;
  occurred_at: Date;
  duration_minutes: number;
  notes: string | null;
  next_steps: string | null;
  outcome: SessionOutcome | null;
  quoted_price_eur: string | null; // numeric → string in pg
  summary_email_sent_at: Date | null;
  created_at: Date;
}

const COLS = `
  id::text as id, lead_id::text as lead_id, athlete_id::text as athlete_id,
  appointment_id::text as appointment_id, occurred_at, duration_minutes,
  notes, next_steps, outcome, quoted_price_eur::text as quoted_price_eur,
  summary_email_sent_at, created_at
`;

function toView(r: RawRow): SessionReportView {
  return {
    id: r.id,
    lead_id: r.lead_id,
    athlete_id: r.athlete_id,
    appointment_id: r.appointment_id,
    occurred_at: r.occurred_at.toISOString(),
    duration_minutes: r.duration_minutes,
    notes: r.notes,
    next_steps: r.next_steps,
    outcome: r.outcome,
    quoted_price_eur: r.quoted_price_eur != null ? Number(r.quoted_price_eur) : null,
    from_lead: r.lead_id != null,
    summary_email_sent_at: r.summary_email_sent_at ? r.summary_email_sent_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
  };
}

/** Reports for a lead (its sales calls), newest first. */
export async function listSessionReportsForLead(leadId: bigint): Promise<SessionReportView[]> {
  const rows = await sql<RawRow[]>`
    select ${sql.unsafe(COLS)} from session_reports
    where lead_id = ${Number(leadId)} and deleted_at is null
    order by occurred_at desc
  `;
  return rows.map(toView);
}

/**
 * Reports for an athlete — its own 1:1s PLUS the sales calls of the lead it converted
 * from (follow-the-person, via leads.converted_athlete_id). Newest first.
 */
export async function listSessionReportsForAthlete(athleteId: bigint): Promise<SessionReportView[]> {
  const rows = await sql<RawRow[]>`
    select ${sql.unsafe(COLS)} from session_reports
    where deleted_at is null
      and (
        athlete_id = ${Number(athleteId)}
        or lead_id in (select id from leads where converted_athlete_id = ${Number(athleteId)})
      )
    order by occurred_at desc
  `;
  return rows.map(toView);
}

/** Create a report. occurred_at/duration default from the linked appointment, else now/30. */
export async function createSessionReport(args: {
  coach_id: number | bigint;
  input: SessionReportInput;
}): Promise<SessionReportView> {
  const { coach_id, input } = args;

  return await sql.begin(async (tx) => {
    // Default the timing from the linked appointment when the coach didn't set it.
    let occurredAt = input.occurred_at ?? null;
    let duration = input.duration_minutes ?? null;
    if (input.appointment_id != null && (occurredAt == null || duration == null)) {
      const appt = await tx<{ requested_start: Date; duration_minutes: number }[]>`
        select requested_start, duration_minutes from appointments where id = ${input.appointment_id} limit 1
      `;
      if (appt[0]) {
        occurredAt = occurredAt ?? appt[0].requested_start.toISOString();
        duration = duration ?? appt[0].duration_minutes;
      }
    }

    const inserted = await tx<RawRow[]>`
      insert into session_reports (
        lead_id, athlete_id, appointment_id, coach_id,
        occurred_at, duration_minutes, notes, next_steps, outcome, quoted_price_eur
      ) values (
        ${input.lead_id ?? null}, ${input.athlete_id ?? null}, ${input.appointment_id ?? null}, ${Number(coach_id)},
        ${occurredAt ?? new Date().toISOString()}::timestamptz, ${duration ?? 30},
        ${input.notes ?? null}, ${input.next_steps ?? null},
        ${input.outcome ?? null}, ${input.quoted_price_eur ?? null}
      )
      returning ${tx.unsafe(COLS)}
    `;
    return toView(inserted[0]!);
  });
}

/** Edit a report's content (subject never moves). Coach-scoped. */
export async function updateSessionReport(args: {
  id: bigint;
  coach_id: number | bigint;
  input: SessionReportUpdateInput;
}): Promise<SessionReportView> {
  const { id, coach_id, input } = args;
  const rows = await sql<RawRow[]>`
    update session_reports set
      occurred_at      = coalesce(${input.occurred_at ?? null}::timestamptz, occurred_at),
      duration_minutes = coalesce(${input.duration_minutes ?? null}, duration_minutes),
      notes            = ${input.notes ?? null},
      next_steps       = ${input.next_steps ?? null},
      outcome          = ${input.outcome ?? null},
      quoted_price_eur = ${input.quoted_price_eur ?? null},
      updated_at       = now()
    where id = ${Number(id)} and coach_id = ${Number(coach_id)} and deleted_at is null
    returning ${sql.unsafe(COLS)}
  `;
  if (!rows[0]) throw new SessionReportError('not_found', 'Parte no encontrado', 404);
  return toView(rows[0]);
}

export interface SessionReportForSummary {
  report: SessionReportView;
  lead_email: string;
  lead_nombre: string | null;
}

/**
 * Load a LEAD report + the lead's contact, for the post-call summary email (#11). The
 * summary only goes to a lead (the sales call); an athlete-only report has no lead_id
 * and returns null.
 */
export async function getSessionReportForSummary(args: {
  id: bigint;
  coach_id: number | bigint;
}): Promise<SessionReportForSummary | null> {
  const rows = await sql<(RawRow & { lead_email: string | null; lead_nombre: string | null })[]>`
    select sr.id::text as id, sr.lead_id::text as lead_id, sr.athlete_id::text as athlete_id,
           sr.appointment_id::text as appointment_id, sr.occurred_at, sr.duration_minutes,
           sr.notes, sr.next_steps, sr.outcome, sr.quoted_price_eur::text as quoted_price_eur,
           sr.summary_email_sent_at, sr.created_at,
           l.email as lead_email, l.nombre as lead_nombre
    from session_reports sr
    left join leads l on l.id = sr.lead_id
    where sr.id = ${Number(args.id)} and sr.coach_id = ${Number(args.coach_id)} and sr.deleted_at is null
    limit 1
  `;
  const r = rows[0];
  if (!r || r.lead_email == null) return null;
  return { report: toView(r), lead_email: r.lead_email, lead_nombre: r.lead_nombre };
}

/** Stamp the post-call summary email as sent (#11). Coach-scoped. */
export async function markSummarySent(args: { id: bigint; coach_id: number | bigint }): Promise<void> {
  await sql`
    update session_reports set summary_email_sent_at = now(), updated_at = now()
    where id = ${Number(args.id)} and coach_id = ${Number(args.coach_id)} and deleted_at is null
  `;
}

/** Soft-delete a report. Coach-scoped. */
export async function deleteSessionReport(args: { id: bigint; coach_id: number | bigint }): Promise<void> {
  const rows = await sql<{ id: string }[]>`
    update session_reports set deleted_at = now(), updated_at = now()
    where id = ${Number(args.id)} and coach_id = ${Number(args.coach_id)} and deleted_at is null
    returning id::text as id
  `;
  if (!rows[0]) throw new SessionReportError('not_found', 'Parte no encontrado', 404);
}
