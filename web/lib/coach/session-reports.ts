import 'server-only';

import { sql } from '@/lib/db';
import { recordAudit, type DbClient } from '@/lib/audit/record-edit';
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
  /** Last write to the row (ISO). Bumped by any update incl. summary-sent, so it is a
   *  reliable EDIT time ONLY when paired with last_edited_by_name (a real content edit). */
  updated_at: string;
  /** Authorship sello (#43): resolved display names for the "parte por X · editó Y"
   *  stamp. null for unattributed rows (the <AuthorStamp> self-hides). created_by is
   *  set on CREATE + backfilled from coach_id; last_edited only on a real edit. */
  created_by_name: string | null;
  last_edited_by_name: string | null;
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
  updated_at: Date;
  created_by_name: string | null;
  last_edited_by_name: string | null;
}

// Column list for the READ path (list + re-read). Aliased on `s` (session_reports)
// because the users join for the authorship names would make bare `id`/`created_at`
// ambiguous. Creates/updates RETURN only the id and re-read through readById, so this
// is the single shape every SessionReportView flows through.
const COLS = `
  s.id::text as id, s.lead_id::text as lead_id, s.athlete_id::text as athlete_id,
  s.appointment_id::text as appointment_id, s.occurred_at, s.duration_minutes,
  s.notes, s.next_steps, s.outcome, s.quoted_price_eur::text as quoted_price_eur,
  s.summary_email_sent_at, s.created_at, s.updated_at,
  cu.full_name as created_by_name, eu.full_name as last_edited_by_name
`;

// The authorship join, shared by every read (#43): resolve the author + last editor
// users → display names for the <AuthorStamp>. LEFT so unattributed rows still return.
const FROM_JOINED = `
  from session_reports s
  left join users cu on cu.id = s.created_by_user_id
  left join users eu on eu.id = s.last_edited_by_user_id
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
    updated_at: r.updated_at.toISOString(),
    created_by_name: r.created_by_name,
    last_edited_by_name: r.last_edited_by_name,
  };
}

/** Re-read a report by id (with the authorship join) → the full view. Used by
 *  create/update to return the resolved author names after a write. Runs on the
 *  passed client so a caller inside sql.begin re-reads within the same tx. */
async function readSessionReportById(client: DbClient, id: bigint): Promise<SessionReportView | null> {
  const rows = await client<RawRow[]>`
    select ${client.unsafe(COLS)} ${client.unsafe(FROM_JOINED)}
    where s.id = ${Number(id)} and s.deleted_at is null
    limit 1
  `;
  return rows[0] ? toView(rows[0]) : null;
}

/** Reports for a lead (its sales calls), newest first. */
export async function listSessionReportsForLead(leadId: bigint): Promise<SessionReportView[]> {
  const rows = await sql<RawRow[]>`
    select ${sql.unsafe(COLS)} ${sql.unsafe(FROM_JOINED)}
    where s.lead_id = ${Number(leadId)} and s.deleted_at is null
    order by s.occurred_at desc
  `;
  return rows.map(toView);
}

/**
 * Reports for an athlete — its own 1:1s PLUS the sales calls of the lead it converted
 * from (follow-the-person, via leads.converted_athlete_id). Newest first.
 */
export async function listSessionReportsForAthlete(athleteId: bigint): Promise<SessionReportView[]> {
  const rows = await sql<RawRow[]>`
    select ${sql.unsafe(COLS)} ${sql.unsafe(FROM_JOINED)}
    where s.deleted_at is null
      and (
        s.athlete_id = ${Number(athleteId)}
        or s.lead_id in (select id from leads where converted_athlete_id = ${Number(athleteId)})
      )
    order by s.occurred_at desc
  `;
  return rows.map(toView);
}

/** Create a report. occurred_at/duration default from the linked appointment, else now/30. */
export async function createSessionReport(args: {
  coach_id: number | bigint;
  input: SessionReportInput;
  /** Authorship (#43): the acting coach's users.id → created_by + the audit trail.
   *  Distinct from coach_id (a coaches.id). Omitted → unattributed (backfill-only). */
  by_user_id?: bigint | null;
}): Promise<SessionReportView> {
  const { coach_id, input, by_user_id } = args;

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

    // Authorship (#43): stamp created_by inline (the INSERT builds the row), kind
    // 'coach'. last_edited stays NULL until a real edit so the "editó X" sello only
    // lights up on a genuine later edit (mirrors the athlete ficha's read gate).
    const inserted = await tx<{ id: string }[]>`
      insert into session_reports (
        lead_id, athlete_id, appointment_id, coach_id,
        occurred_at, duration_minutes, notes, next_steps, outcome, quoted_price_eur,
        created_by_user_id, created_by_kind
      ) values (
        ${input.lead_id ?? null}, ${input.athlete_id ?? null}, ${input.appointment_id ?? null}, ${Number(coach_id)},
        ${occurredAt ?? new Date().toISOString()}::timestamptz, ${duration ?? 30},
        ${input.notes ?? null}, ${input.next_steps ?? null},
        ${input.outcome ?? null}, ${input.quoted_price_eur ?? null},
        ${by_user_id ?? null}, 'coach'
      )
      returning id::text as id
    `;
    const id = BigInt(inserted[0]!.id);
    await recordAudit(tx, {
      entity_type: 'session_reports',
      entity_id: id,
      action: 'create',
      actor: { kind: 'coach', user_id: by_user_id ?? null },
      diff: {
        lead_id: input.lead_id ?? null,
        athlete_id: input.athlete_id ?? null,
        outcome: input.outcome ?? null,
      },
    });
    return (await readSessionReportById(tx, id))!;
  });
}

/** Edit a report's content (subject never moves). Coach-scoped. */
export async function updateSessionReport(args: {
  id: bigint;
  coach_id: number | bigint;
  input: SessionReportUpdateInput;
  /** Authorship (#43): the acting coach's users.id → last_edited_by + the audit trail. */
  by_user_id?: bigint | null;
}): Promise<SessionReportView> {
  const { id, coach_id, input, by_user_id } = args;
  return await sql.begin(async (tx) => {
    // Authorship (#43): stamp last_edited_by inline (no extra UPDATE), kind 'coach'.
    const updated = await tx<{ id: string }[]>`
      update session_reports set
        occurred_at            = coalesce(${input.occurred_at ?? null}::timestamptz, occurred_at),
        duration_minutes       = coalesce(${input.duration_minutes ?? null}, duration_minutes),
        notes                  = ${input.notes ?? null},
        next_steps             = ${input.next_steps ?? null},
        outcome                = ${input.outcome ?? null},
        quoted_price_eur       = ${input.quoted_price_eur ?? null},
        last_edited_by_user_id = ${by_user_id ?? null},
        last_edited_by_kind    = 'coach',
        updated_at             = now()
      where id = ${Number(id)} and coach_id = ${Number(coach_id)} and deleted_at is null
      returning id::text as id
    `;
    if (!updated[0]) throw new SessionReportError('not_found', 'Parte no encontrado', 404);
    const rid = BigInt(updated[0].id);
    await recordAudit(tx, {
      entity_type: 'session_reports',
      entity_id: rid,
      action: 'update',
      actor: { kind: 'coach', user_id: by_user_id ?? null },
      diff: { outcome: input.outcome ?? null },
    });
    return (await readSessionReportById(tx, rid))!;
  });
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
           sr.summary_email_sent_at, sr.created_at, sr.updated_at,
           cu.full_name as created_by_name, eu.full_name as last_edited_by_name,
           l.email as lead_email, l.nombre as lead_nombre
    from session_reports sr
    left join leads l on l.id = sr.lead_id
    left join users cu on cu.id = sr.created_by_user_id
    left join users eu on eu.id = sr.last_edited_by_user_id
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
