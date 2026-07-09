// Coach-dashboard leads data layer. Reads the standalone `leads` table (web-onboarding
// prospects — migration 0092). Leads have NO coach_id (single-coach launch): every lead
// belongs to the one coach, so there is no per-coach scoping here. Fully isolated from
// the athletes roster (different table, no joins) — a lead is never an athlete until the
// alta flow (task #5) converts it.

import { sql } from '@/lib/db';
import { leadOptionLabel, leadShortLabel } from '@fahybrid/shared/domain/leads/questions';
import { groupLeadSummary, summarizeLead, type LeadSummaryGroup } from '@fahybrid/shared/domain/leads/summary';
import { deriveNextAction, type NextAction } from '@fahybrid/shared/domain/leads/next-action';
import type { AppointmentStatus } from '@fahybrid/shared/domain/citas/status';
import type { SessionOutcome } from '@fahybrid/shared/domain/sessions/outcome';
import { BOX_TIMEZONE } from '@fahybrid/shared/domain/dates';
import { latestAppointmentForLead, type AppointmentView } from '@/lib/citas/store';
import { countWaitlist } from '@/lib/leads/waitlist';
import { buildAltaPrefill, type AltaPrefill } from '@/lib/leads/alta-mapping';
import { listSessionReportsForLead, type SessionReportView } from '@/lib/coach/session-reports';
import { LEAD_STATUS_ORDER, type LeadStatus } from './leads-status';

// Short Madrid "jue 18:00" for the "Llamada …" next-action. es-ES short weekday renders
// "jue," so the trailing comma is stripped. One shared formatter (instantiating Intl is
// comparatively expensive). The coach always reads the same clock the athlete booked.
const APPT_WHEN_FMT = new Intl.DateTimeFormat('es-ES', {
  timeZone: BOX_TIMEZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
function apptWhenShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return APPT_WHEN_FMT.format(d).replace(',', '');
}

// ── List ─────────────────────────────────────────────────────────────────────────
// The list item is the DENSE sales-workbench row: contact + short scannable metadata +
// the single `next_action` (the #1 thing for Pablo). The full option labels live on the
// ficha (LeadDetail), not here — the list uses `leadShortLabel` so a level never renders
// as "Avanzado — con estructura y buena base" in a one-line row.
export interface LeadListItem {
  id: string;
  nombre: string | null;
  email: string;
  /** For the row-end tel affordance (mailto uses email). Null when not captured. */
  telefono: string | null;
  status: LeadStatus;
  created_at: string; // ISO
  submitted_at: string | null; // ISO — null while still `parcial`
  is_partial: boolean;
  // Short, one-line metadata segments ('' when the lead hasn't answered).
  objetivo_short: string;
  nivel_short: string;
  dias_short: string;
  ubicacion_short: string;
  /** Race, e.g. "HYROX BCN · <3 meses" (cual + cuándo), or null when no race set. */
  carrera_short: string | null;
  /** The imperative Pablo should act on next — null = nothing pending / archived. */
  next_action: NextAction | null;
}

export interface LeadsListResult {
  leads: LeadListItem[];
  counts: Record<LeadStatus, number>;
  total: number;
  /** #18: leads actively on the capacity waitlist (nuevo/contactado, not yet released). */
  en_espera: number;
}

interface LeadListRow {
  id: bigint;
  nombre: string | null;
  email: string;
  telefono: string | null;
  status: LeadStatus;
  objetivo: string | null;
  nivel: string | null;
  dias_semana: string | null;
  ubicacion: string | null;
  carrera_cual: string | null;
  carrera_cuando: string | null;
  created_at: Date;
  submitted_at: Date | null;
  alta_sent_at: Date | null;
  // Most-relevant appointment (soonest future active, else latest) — for the next-action.
  appt_status: AppointmentStatus | null;
  appt_start: Date | null;
  // Latest non-deleted 1:1 report: presence flag + outcome (outcome may be null on a report).
  report_id: string | null;
  latest_outcome: SessionOutcome | null;
}

export async function listLeadsForCoach(): Promise<LeadsListResult> {
  // ONE query. Two LATERAL joins fold the per-lead appointment + latest report into the
  // row (no N+1). The appointment lateral picks the "most relevant" slot: a FUTURE active
  // (pendiente|aceptada) slot, soonest first; otherwise the latest slot by time. The
  // waitlist count runs in parallel (#18) — a small separate aggregate, not worth a join.
  const [rows, en_espera] = await Promise.all([
    sql<LeadListRow[]>`
    select l.id, l.nombre, l.email, l.telefono, l.status,
           l.objetivo, l.nivel, l.dias_semana, l.ubicacion,
           l.carrera_cual, l.carrera_cuando,
           l.created_at, l.submitted_at, l.alta_sent_at,
           appt.status as appt_status, appt.requested_start as appt_start,
           sr.report_id, sr.outcome as latest_outcome
    from leads l
    left join lateral (
      select a.status::text as status, a.requested_start
      from appointments a
      where a.lead_id = l.id
      order by
        (a.status in ('pendiente', 'aceptada') and a.requested_start >= now()) desc,
        case when a.status in ('pendiente', 'aceptada') and a.requested_start >= now()
             then a.requested_start end asc nulls last,
        a.requested_start desc
      limit 1
    ) appt on true
    left join lateral (
      select r.id::text as report_id, r.outcome::text as outcome
      from session_reports r
      where r.lead_id = l.id and r.deleted_at is null
      order by r.occurred_at desc
      limit 1
    ) sr on true
    order by l.created_at desc
  `,
    countWaitlist(),
  ]);

  const rankOf = (s: LeadStatus) => {
    const i = LEAD_STATUS_ORDER.indexOf(s);
    return i === -1 ? LEAD_STATUS_ORDER.length : i;
  };

  const leads: LeadListItem[] = rows
    .map((r) => {
      const isPartial = r.status === 'parcial';
      const carrera = [
        leadShortLabel('carrera_cual', r.carrera_cual),
        leadShortLabel('carrera_cuando', r.carrera_cuando),
      ].filter(Boolean);
      const apptStartIso = r.appt_start ? r.appt_start.toISOString() : null;
      const appointment =
        r.appt_status && apptStartIso
          ? {
              status: r.appt_status,
              requested_start: apptStartIso,
              when_short: apptWhenShort(apptStartIso),
            }
          : null;
      return {
        id: String(r.id),
        nombre: r.nombre,
        email: r.email,
        telefono: r.telefono,
        status: r.status,
        created_at: r.created_at.toISOString(),
        submitted_at: r.submitted_at ? r.submitted_at.toISOString() : null,
        is_partial: isPartial,
        objetivo_short: leadShortLabel('objetivo', r.objetivo),
        nivel_short: leadShortLabel('nivel', r.nivel),
        dias_short: leadShortLabel('dias_semana', r.dias_semana),
        ubicacion_short: leadShortLabel('ubicacion', r.ubicacion),
        carrera_short: carrera.length ? carrera.join(' · ') : null,
        next_action: deriveNextAction({
          status: r.status,
          is_partial: isPartial,
          alta_sent_at: r.alta_sent_at ? r.alta_sent_at.toISOString() : null,
          latest_outcome: r.latest_outcome,
          has_report: r.report_id != null,
          appointment,
        }),
      };
    })
    // Triage order (actionable first), then most-recent first within a status.
    .sort((a, b) =>
      rankOf(a.status) - rankOf(b.status) || b.created_at.localeCompare(a.created_at),
    );

  const counts = { parcial: 0, nuevo: 0, contactado: 0, agendado: 0, convertido: 0, descartado: 0 } as Record<
    LeadStatus,
    number
  >;
  for (const l of leads) counts[l.status] += 1;

  return { leads, counts, total: leads.length, en_espera };
}

// ── Detail ───────────────────────────────────────────────────────────────────────
/** One entry in a lead's transition timeline (#43, lead_status_events). */
export interface LeadTimelineEvent {
  from_status: string | null;
  to_status: string;
  /** Person who moved it (users.full_name); null for a system/unknown actor. */
  changed_by_name: string | null;
  changed_by_kind: 'coach' | 'athlete' | 'ai' | 'system' | 'lead';
  created_at: string;
}

export interface LeadDetail {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  edad: number | null;
  sexo_label: string;
  ubicacion_label: string;
  status: LeadStatus;
  source: string;
  created_at: string;
  submitted_at: string | null;
  updated_at: string;
  consent_rgpd: boolean;
  consent_at: string | null;
  is_partial: boolean;
  // Headline display fields for the detail header.
  objetivo_label: string;
  nivel_label: string;
  dias_label: string;
  categoria_objetivo_label: string;
  // Full onboarding answers, grouped by block (codes → Spanish labels).
  summary: LeadSummaryGroup[];
  // The lead's current/most-recent videollamada appointment (null = never booked).
  appointment: AppointmentView | null;
  // 1:1 session reports (#14) — history of the coach's call write-ups, newest first.
  sessions: SessionReportView[];
  // Transition timeline (#43) — who moved this lead through the pipeline, newest first.
  timeline: LeadTimelineEvent[];
  // Alta (#5): whether the alta invite has been sent, the athlete it converted into
  // (once claimed), and the pre-fill for the alta modal (onboarding → athlete profile).
  alta: {
    sent_at: string | null;
    converted_athlete_id: string | null;
    prefill: AltaPrefill;
  };
}

export interface CoachLevelOption {
  id: string;
  name: string;
  label: string;
}

/** The coach's level catalog (N1–N5, seeded in 0057) — drives the alta modal's level select. */
export async function listCoachLevels(coach_id: number | bigint): Promise<CoachLevelOption[]> {
  return await sql<CoachLevelOption[]>`
    select id::text as id, name, label
    from athlete_levels
    where coach_id = ${Number(coach_id)}
    order by sort_order, name
  `;
}

/** A lead's transition history (#43), newest first, with the changer's name resolved. */
async function listLeadTimeline(id: bigint): Promise<LeadTimelineEvent[]> {
  const rows = await sql<
    Array<{
      from_status: string | null;
      to_status: string;
      changed_by_name: string | null;
      changed_by_kind: LeadTimelineEvent['changed_by_kind'];
      created_at: Date;
    }>
  >`
    select
      e.from_status,
      e.to_status,
      u.full_name as changed_by_name,
      e.changed_by_kind::text as changed_by_kind,
      e.created_at
    from lead_status_events e
    left join users u on u.id = e.changed_by_user_id
    where e.lead_id = ${Number(id)}
    order by e.created_at desc, e.id desc
  `;
  return rows.map((r) => ({
    from_status: r.from_status,
    to_status: r.to_status,
    changed_by_name: r.changed_by_name,
    changed_by_kind: r.changed_by_kind,
    created_at: r.created_at.toISOString(),
  }));
}

export async function getLeadDetail(id: bigint): Promise<LeadDetail | null> {
  const rows = await sql<Record<string, unknown>[]>`
    select * from leads where id = ${Number(id)} limit 1
  `;
  const r = rows[0];
  if (!r) return null;

  const createdAt = r.created_at as Date;
  const submittedAt = r.submitted_at as Date | null;
  const updatedAt = r.updated_at as Date;
  const consentAt = r.consent_at as Date | null;
  const [appointment, sessions, timeline] = await Promise.all([
    latestAppointmentForLead(id),
    listSessionReportsForLead(id),
    listLeadTimeline(id),
  ]);

  return {
    id: String(r.id),
    nombre: (r.nombre as string) ?? null,
    email: r.email as string,
    telefono: (r.telefono as string) ?? null,
    edad: (r.edad as number) ?? null,
    sexo_label: leadOptionLabel('sexo', r.sexo as string | null),
    ubicacion_label: leadOptionLabel('ubicacion', r.ubicacion as string | null),
    status: r.status as LeadStatus,
    source: r.source as string,
    created_at: createdAt.toISOString(),
    submitted_at: submittedAt ? submittedAt.toISOString() : null,
    updated_at: updatedAt.toISOString(),
    consent_rgpd: r.consent_rgpd === true,
    consent_at: consentAt ? consentAt.toISOString() : null,
    is_partial: r.status === 'parcial',
    objetivo_label: leadOptionLabel('objetivo', r.objetivo as string | null),
    nivel_label: leadOptionLabel('nivel', r.nivel as string | null),
    dias_label: leadOptionLabel('dias_semana', r.dias_semana as string | null),
    categoria_objetivo_label: leadOptionLabel('categoria_objetivo', r.categoria_objetivo as string | null),
    summary: groupLeadSummary(summarizeLead(r)),
    appointment,
    sessions,
    timeline,
    alta: {
      sent_at: (r.alta_sent_at as Date | null)?.toISOString() ?? null,
      converted_athlete_id: r.converted_athlete_id != null ? String(r.converted_athlete_id) : null,
      // #15: pre-fill the alta price from the latest sales call that carries one
      // (sessions are newest-first, so the first priced report is the latest quote).
      prefill: buildAltaPrefill(r, {
        quoted_price_eur: sessions.find((s) => s.quoted_price_eur != null)?.quoted_price_eur ?? null,
      }),
    },
  };
}

// The pipeline-status mutation lives in web/lib/leads/store.ts (`transitionLeadStatus`),
// alongside the two-phase upserts, so all lead writes + the NO-RETREAT invariant share
// one source of truth.

/** Count of `nuevo` (untouched) leads — powers the sidebar "Leads" badge. */
export async function countNewLeads(): Promise<number> {
  const rows = await sql<{ n: number }[]>`select count(*)::int as n from leads where status = 'nuevo'`;
  return rows[0]?.n ?? 0;
}
