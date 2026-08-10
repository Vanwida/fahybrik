// Appointment/booking data layer (funnel #2/#4). Owns every DB read/write for citas,
// the slot computation (via the shared pure engine), and the coach status machine with
// its side-effects (accept → lead advances to `agendado`, meet link via adapter/manual).
//
// Tenancy: an appointment has NO coach_id of its own (0093) — it belongs to the club
// that owns its LEAD (`leads.coach_id`, mig. 0147). The coach-facing entry points
// (actOnAppointment, setAppointmentMeetLink) therefore scope through the lead, with the
// `coachOwnsLead` rule (lib/leads/store.ts): theirs or unassigned; another club's → 404.
// Slots + availability stay club-global on purpose (0093: those tables have no owner
// until the multi-coach obra). Timezone Europe/Madrid throughout (shared/domain/dates).

import { sql } from '@/lib/db';
import { isRowWaitlisted } from '@/lib/leads/waitlist';
import { canTransitionLead, type LeadStatus } from '@fahybrid/shared/domain/leads/status';
import {
  APPOINTMENT_ACTION_TO_STATUS,
  canTransitionAppointment,
  type AppointmentStatus,
  type CoachAppointmentAction,
} from '@fahybrid/shared/domain/citas/status';
import {
  generateSlots,
  isOfferedSlot,
  type AvailabilityWindow,
  type DaySlots,
} from '@fahybrid/shared/domain/citas/slots';
import type { CitaModality } from '@fahybrid/shared/schema';

export class CitasError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'CitasError';
  }
}

// ── Slot computation ─────────────────────────────────────────────────────────────
// #40: slots are computed against ONE of the two independent schedules (video |
// presencial). Only the windows of the requested modality feed the offered slots; the two
// schedules can overlap freely (a video window and a presencial window at the same hour).
async function loadAvailabilityWindows(modality: CitaModality): Promise<AvailabilityWindow[]> {
  const rows = await sql<{ weekday: number; start_time: string; end_time: string }[]>`
    select weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
    from coach_availability where activo and modality = ${modality}::appointment_modality
  `;
  return rows;
}

async function loadBlockedDates(): Promise<Set<string>> {
  const rows = await sql<{ fecha: string }[]>`
    select to_char(fecha, 'YYYY-MM-DD') as fecha from coach_availability_exceptions
  `;
  return new Set(rows.map((r) => r.fecha));
}

async function loadBusyStartMs(): Promise<Set<number>> {
  const rows = await sql<{ start: Date }[]>`
    select requested_start as start from appointments where status in ('pendiente', 'aceptada')
  `;
  return new Set(rows.map((r) => r.start.getTime()));
}

/** The bookable slots for the next 14 days in the given modality's schedule (empty = no
 *  availability → UI fallback). Occupancy is AGNOSTIC: busyStartMs is ALL active
 *  appointments regardless of modality (the coach can't be in two places at once). */
export async function computeSlots(modality: CitaModality, now: Date = new Date()): Promise<DaySlots[]> {
  const [availability, blockedDates, busyStartMs] = await Promise.all([
    loadAvailabilityWindows(modality),
    loadBlockedDates(),
    loadBusyStartMs(),
  ]);
  return generateSlots({ now, availability, blockedDates, busyStartMs });
}

// ── Public booking ───────────────────────────────────────────────────────────────
export interface BookingLead {
  id: string;
  nombre: string | null;
  email: string;
}
export interface AppointmentView {
  id: string;
  requested_start: string; // ISO
  duration_minutes: number;
  status: AppointmentStatus;
  meet_link: string | null;
  /** #40: videollamada (Meet) o presencial (en el box). */
  modality: CitaModality;
}
export interface BookingContext {
  lead: BookingLead;
  active_appointment: AppointmentView | null;
  slots: DaySlots[];
  /** #18: lead is on the waitlist and not yet released → no slots offered until released. */
  waitlisted: boolean;
}

// Internal booking row: the public BookingLead plus the two waitlist stamps (#18) the gate
// reads. Kept private so BookingLead stays the lean public shape.
interface LeadBookingRow extends BookingLead {
  waitlisted_at: Date | null;
  waitlist_released_at: Date | null;
}

async function leadByToken(token: string): Promise<LeadBookingRow | null> {
  const rows = await sql<LeadBookingRow[]>`
    select id::text as id, nombre, email, waitlisted_at, waitlist_released_at
    from leads where token = ${token} limit 1
  `;
  return rows[0] ?? null;
}

async function activeAppointmentFor(leadId: string): Promise<AppointmentView | null> {
  const rows = await sql<
    { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null; modality: CitaModality }[]
  >`
    select id::text as id, requested_start, duration_minutes, status::text as status, meet_link,
           modality::text as modality
    from appointments
    where lead_id = ${Number(leadId)} and status in ('pendiente', 'aceptada')
    order by requested_start asc limit 1
  `;
  const a = rows[0];
  return a
    ? {
        id: a.id,
        requested_start: a.requested_start.toISOString(),
        duration_minutes: a.duration_minutes,
        status: a.status,
        meet_link: a.meet_link,
        modality: a.modality,
      }
    : null;
}

/** Public booking page data for a token. Throws CitasError(404) on a bad token.
 *  #40: slots are computed for the requested modality's schedule (video | presencial). */
export async function getBookingContext(
  token: string,
  modality: CitaModality,
  now: Date = new Date(),
): Promise<BookingContext> {
  const row = await leadByToken(token);
  if (!row) throw new CitasError('not_found', 'Enlace no válido', 404);
  const lead: BookingLead = { id: row.id, nombre: row.nombre, email: row.email };
  const waitlisted = isRowWaitlisted(row); // #18: on the list, not released → hide slots
  const active = await activeAppointmentFor(lead.id);
  // No slots when they already have an active appointment OR they're waitlisted-unreleased
  // (mirrors the existing empty-slots fallback the UI already renders).
  const slots = active || waitlisted ? [] : await computeSlots(modality, now);
  return { lead, active_appointment: active, slots, waitlisted };
}

export interface BookResult {
  appointment: AppointmentView;
  lead: BookingLead;
  created: boolean;
}

/**
 * Book a slot for the lead identified by `token`. Re-checks the slot against a freshly
 * computed set (never trusts the client) and relies on the DB partial-unique index to
 * guarantee one active appointment per lead. Returns the created `pendiente` appointment.
 */
export async function bookAppointment(args: {
  token: string;
  startIso: string;
  /** #40: the modality the lead picked — stored on the appointment and used to re-check the
   *  slot against that schedule. Occupancy stays agnostic (any active cita blocks the hour). */
  modality: CitaModality;
  now?: Date;
}): Promise<BookResult> {
  const now = args.now ?? new Date();
  const row = await leadByToken(args.token);
  if (!row) throw new CitasError('not_found', 'Enlace no válido', 404);

  // #18 server-enforced gate: a waitlisted-but-unreleased lead must not be able to book by
  // replaying this endpoint (the UI hides slots, but the server is the real authority).
  if (isRowWaitlisted(row)) throw new CitasError('waitlisted', 'Estás en lista de espera', 409);
  const lead: BookingLead = { id: row.id, nombre: row.nombre, email: row.email };

  const existing = await activeAppointmentFor(lead.id);
  if (existing) throw new CitasError('already_booked', 'Ya tienes una cita en curso', 409);

  const startMs = Date.parse(args.startIso);
  if (Number.isNaN(startMs)) throw new CitasError('invalid_slot', 'Hueco no válido', 400);

  const slots = await computeSlots(args.modality, now);
  if (!isOfferedSlot(slots, startMs)) {
    throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
  }

  const startIso = new Date(startMs).toISOString();
  try {
    return await sql.begin(async (tx) => {
      // AUTO-ACCEPT (#2/#4 redesign): a reservation IS the confirmed cita — there is no
      // coach approval step. Two guards make that race-safe:
      //   1) A per-slot advisory xact lock serializes concurrent bookings of the SAME
      //      hueco (two DIFFERENT leads can't both confirm it). Key = slot epoch ms; it
      //      releases at commit.
      //   2) The one-active-per-lead partial unique index (23505 below) stops the SAME
      //      lead double-booking.
      await tx`select pg_advisory_xact_lock(${startMs})`;

      // Holding the slot lock, re-check nobody active already sits on it.
      const clash = await tx<{ id: string }[]>`
        select id::text as id from appointments
        where requested_start = ${startIso}::timestamptz and status in ('pendiente', 'aceptada')
        limit 1
      `;
      if (clash.length) {
        throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
      }

      const rows = await tx<
        { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null; modality: CitaModality }[]
      >`
        insert into appointments (lead_id, requested_start, duration_minutes, status, modality)
        values (${Number(lead.id)}, ${startIso}, 30, 'aceptada', ${args.modality}::appointment_modality)
        returning id::text as id, requested_start, duration_minutes, status::text as status, meet_link,
                  modality::text as modality
      `;
      const a = rows[0];

      // The booking is the ONE place a cita touches the lead pipeline now (moved here
      // from the old coach-accept step): advance the lead to `agendado`, forward-only.
      await tx`
        update leads set status = 'agendado'::lead_status, updated_at = now()
        where id = ${Number(lead.id)} and status in ('parcial', 'nuevo', 'contactado')
      `;

      return {
        appointment: {
          id: a.id,
          requested_start: a.requested_start.toISOString(),
          duration_minutes: a.duration_minutes,
          status: a.status,
          meet_link: a.meet_link,
          modality: a.modality,
        },
        lead,
        created: true,
      };
    });
  } catch (err) {
    if (err instanceof CitasError) throw err;
    // Unique-violation on the one-active-per-lead index → a race; surface as conflict.
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      throw new CitasError('already_booked', 'Ya tienes una cita en curso', 409);
    }
    throw err;
  }
}

/** The lead's current appointment for the dashboard cita block: the active one if any,
 *  else the most recent. Null when the lead never booked. */
export async function latestAppointmentForLead(leadId: bigint): Promise<AppointmentView | null> {
  const rows = await sql<
    { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null; modality: CitaModality }[]
  >`
    select id::text as id, requested_start, duration_minutes, status::text as status, meet_link,
           modality::text as modality
    from appointments
    where lead_id = ${Number(leadId)}
    order by (status in ('pendiente', 'aceptada')) desc, requested_start desc
    limit 1
  `;
  const a = rows[0];
  return a
    ? {
        id: a.id,
        requested_start: a.requested_start.toISOString(),
        duration_minutes: a.duration_minutes,
        status: a.status,
        meet_link: a.meet_link,
        modality: a.modality,
      }
    : null;
}

// ── Coach side ───────────────────────────────────────────────────────────────────
// Auto-accept (#2/#4): a booking is confirmed on the spot, so the coach surface is
// "Próximas llamadas" (accepted, upcoming) — not a pending-approval queue.
export interface UpcomingCall {
  id: string;
  lead_id: string;
  lead_nombre: string | null;
  lead_email: string;
  lead_token: string;
  requested_start: string;
  duration_minutes: number;
  meet_link: string | null;
  /** #40: videollamada (Meet) o presencial (en el box). */
  modality: CitaModality;
}

/** Accepted calls in the next ~48h (today/tomorrow) — folded into the sidebar badge.
 *  #21: scoped to LEAD intro calls (lead_id not null) so it stays in sync with
 *  listUpcomingCalls (which inner-joins leads). Athlete 1:1 reviews (lead_id null) are a
 *  separate surface (the athlete app + the coach ficha), never the sales-call badge. */
export async function countUpcomingCallsSoon(): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from appointments
    where status = 'aceptada' and lead_id is not null
      and requested_start >= now() and requested_start < now() + interval '48 hours'
  `;
  return rows[0]?.n ?? 0;
}

/** All upcoming accepted calls, soonest first — the "Próximas llamadas" card. */
export async function listUpcomingCalls(): Promise<UpcomingCall[]> {
  const rows = await sql<
    {
      id: string;
      lead_id: string;
      lead_nombre: string | null;
      lead_email: string;
      lead_token: string;
      requested_start: Date;
      duration_minutes: number;
      meet_link: string | null;
      modality: CitaModality;
    }[]
  >`
    select a.id::text as id, a.lead_id::text as lead_id, l.nombre as lead_nombre,
           l.email as lead_email, l.token as lead_token,
           a.requested_start, a.duration_minutes, a.meet_link, a.modality::text as modality
    from appointments a join leads l on l.id = a.lead_id
    where a.status = 'aceptada' and a.requested_start >= now()
    order by a.requested_start asc
  `;
  return rows.map((r) => ({
    ...r,
    requested_start: r.requested_start.toISOString(),
  }));
}

export interface AppointmentWithLead extends AppointmentView {
  lead_id: string;
  lead_nombre: string | null;
  lead_email: string;
  lead_token: string;
  coach_note: string | null;
  /** Google Calendar event id (set when the meeting was auto-created) — drives the
   *  cancel-hook delete. Null on manual/no-Google appointments. */
  google_event_id: string | null;
}

/** The appointment + its lead, optionally scoped to a coach. `coach_id = null` skips the
 *  tenancy predicate (trusted internal caller); a bigint scopes via the lead's owner
 *  (coachOwnsLead rule: theirs or unassigned). Review appointments (lead_id null) never
 *  resolve here — the inner join is deliberate (see lib/citas/reviews.ts). */
async function appointmentWithLead(id: bigint, coach_id: bigint | null): Promise<AppointmentWithLead | null> {
  const scope =
    coach_id === null
      ? sql``
      : sql`and (l.coach_id = ${Number(coach_id)} or l.coach_id is null)`;
  const rows = await sql<
    {
      id: string;
      lead_id: string;
      lead_nombre: string | null;
      lead_email: string;
      lead_token: string;
      requested_start: Date;
      duration_minutes: number;
      status: AppointmentStatus;
      meet_link: string | null;
      modality: CitaModality;
      coach_note: string | null;
      google_event_id: string | null;
    }[]
  >`
    select a.id::text as id, a.lead_id::text as lead_id, l.nombre as lead_nombre,
           l.email as lead_email, l.token as lead_token,
           a.requested_start, a.duration_minutes, a.status::text as status, a.meet_link,
           a.modality::text as modality, a.coach_note, a.google_event_id
    from appointments a join leads l on l.id = a.lead_id
    where a.id = ${Number(id)} ${scope} limit 1
  `;
  const a = rows[0];
  return a
    ? {
        id: a.id,
        lead_id: a.lead_id,
        lead_nombre: a.lead_nombre,
        lead_email: a.lead_email,
        lead_token: a.lead_token,
        requested_start: a.requested_start.toISOString(),
        duration_minutes: a.duration_minutes,
        status: a.status,
        meet_link: a.meet_link,
        modality: a.modality,
        coach_note: a.coach_note,
        google_event_id: a.google_event_id,
      }
    : null;
}

export interface ActOnAppointmentResult {
  appointment: AppointmentWithLead;
  /** The status the appointment moved into. */
  newStatus: AppointmentStatus;
}

/**
 * Coach acts on an appointment (accept/reject/cancel/complete/no_show). Validates the
 * transition, applies side-effects atomically:
 *   • accept  → status=aceptada; lead advances to `agendado` (forward-only); meet_link
 *     set from the provided value (or left null → the adapter/manual paste fills it later).
 * Returns the updated appointment; the ROUTE fires the matching email.
 *
 * Tenancy: scoped through the lead's owner (coachOwnsLead rule) — another club's cita
 * reads as nonexistent → not_found 404.
 */
export async function actOnAppointment(args: {
  id: bigint;
  /** The acting coach (session.coach_id) — the cita's lead must be theirs or unassigned. */
  coach_id: bigint;
  action: CoachAppointmentAction;
  meet_link?: string;
  coach_note?: string;
}): Promise<ActOnAppointmentResult> {
  const current = await appointmentWithLead(args.id, args.coach_id);
  if (!current) throw new CitasError('not_found', 'Cita no encontrada', 404);

  const to = APPOINTMENT_ACTION_TO_STATUS[args.action];
  if (!canTransitionAppointment(current.status, to)) {
    throw new CitasError(
      'invalid_transition',
      `La cita no puede pasar de "${current.status}" a "${to}"`,
      409,
    );
  }

  await sql.begin(async (tx) => {
    await tx`
      update appointments
         set status = ${to}::appointment_status,
             meet_link = coalesce(${args.meet_link ?? null}, meet_link),
             coach_note = coalesce(${args.coach_note ?? null}, coach_note),
             updated_at = now()
       where id = ${Number(args.id)}
    `;
    // Accept advances the lead to `agendado` — the ONE place a booking touches the lead
    // pipeline. Forward-only: skip if the lead is already agendado/converted/discarded.
    if (to === 'aceptada') {
      const leadRows = await tx<{ status: LeadStatus }[]>`
        select status::text as status from leads where id = ${Number(current.lead_id)} limit 1
      `;
      const leadStatus = leadRows[0]?.status;
      if (leadStatus && canTransitionLead(leadStatus, 'agendado')) {
        await tx`update leads set status = 'agendado'::lead_status, updated_at = now() where id = ${Number(current.lead_id)}`;
      }
    }
  });

  const updated = await appointmentWithLead(args.id, args.coach_id);
  if (!updated) throw new CitasError('not_found', 'Cita no encontrada', 404);
  return { appointment: updated, newStatus: to };
}

/** Paste/replace the Meet link on an existing appointment (re-sends the email in the route).
 *  Tenancy: `coach_id` scopes through the lead's owner (coachOwnsLead rule) → alien cita 404;
 *  `null` = trusted internal caller (the public booking route sealing the link on the
 *  appointment it created in this same request — there is no coach session there). */
export async function setAppointmentMeetLink(args: {
  id: bigint;
  /** Acting coach, or null for the trusted post-booking path. */
  coach_id: bigint | null;
  meet_link: string;
  /** Persisted alongside the link when the meeting was auto-created via Google, so
   *  a later cancel can delete the calendar event. */
  google_event_id?: string | null;
}): Promise<AppointmentWithLead> {
  const current = await appointmentWithLead(args.id, args.coach_id);
  if (!current) throw new CitasError('not_found', 'Cita no encontrada', 404);
  const rows = await sql<{ id: string }[]>`
    update appointments
      set meet_link = ${args.meet_link},
          google_event_id = coalesce(${args.google_event_id ?? null}, google_event_id),
          updated_at = now()
    where id = ${Number(args.id)} returning id::text as id
  `;
  if (!rows[0]) throw new CitasError('not_found', 'Cita no encontrada', 404);
  const updated = await appointmentWithLead(args.id, args.coach_id);
  if (!updated) throw new CitasError('not_found', 'Cita no encontrada', 404);
  return updated;
}

/** Persist ONLY the Google Calendar event id (no meet_link) — the presencial path, where a
 *  calendar event is created with a location but no Meet room. Lets the cancel-hook delete
 *  the event later. Idempotent (coalesce keeps an existing id if we pass null). */
export async function setAppointmentGoogleEventId(id: bigint, google_event_id: string): Promise<void> {
  await sql`
    update appointments
      set google_event_id = coalesce(${google_event_id}, google_event_id), updated_at = now()
    where id = ${Number(id)}
  `;
}

/** #40: the presencial location, reused from the coach profile (no new column). Single-coach:
 *  prefer the coach who has ACTUALLY configured a studio (name or address set) so it reads the
 *  real one even if other/demo coach rows exist; fall back to the lowest id otherwise. Multi-coach
 *  adds a coach_id filter here. Null when no coach row exists; name/address individually null when
 *  the profile field is unset. */
export async function getStudioLocation(): Promise<{ name: string | null; address: string | null } | null> {
  const rows = await sql<{ studio_name: string | null; location: string | null }[]>`
    select studio_name, location from coaches
    order by (studio_name is not null or location is not null) desc, id asc
    limit 1
  `;
  const c = rows[0];
  return c ? { name: c.studio_name, address: c.location } : null;
}

// ── Availability (coach) ─────────────────────────────────────────────────────────
export interface AvailabilityRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  /** #40: which of the two independent schedules this window belongs to. */
  modality: CitaModality;
}
export interface ExceptionRow {
  id: string;
  fecha: string;
  motivo: string | null;
}

export async function getAvailability(): Promise<{ windows: AvailabilityRow[]; exceptions: ExceptionRow[] }> {
  const windows = await sql<AvailabilityRow[]>`
    select id::text as id, weekday, to_char(start_time, 'HH24:MI') as start_time,
           to_char(end_time, 'HH24:MI') as end_time, modality::text as modality
    from coach_availability where activo order by modality, weekday, start_time
  `;
  const exceptions = await sql<{ id: string; fecha: Date; motivo: string | null }[]>`
    select id::text as id, fecha, motivo from coach_availability_exceptions
    where fecha >= (now() at time zone 'Europe/Madrid')::date order by fecha
  `;
  return {
    windows,
    exceptions: exceptions.map((e) => ({
      id: e.id,
      fecha: e.fecha.toISOString().slice(0, 10),
      motivo: e.motivo,
    })),
  };
}

/** Replace the FULL weekly availability with the given windows (transactional). Each window
 *  carries its modality (#40): the two schedules (video | presencial) are stored in the same
 *  table and can overlap (two rows at the same time, one per modality). */
export async function setAvailability(
  windows: { weekday: number; start_time: string; end_time: string; modality: CitaModality }[],
): Promise<void> {
  await sql.begin(async (tx) => {
    await tx`delete from coach_availability`;
    for (const w of windows) {
      await tx`
        insert into coach_availability (weekday, start_time, end_time, activo, modality)
        values (${w.weekday}, ${w.start_time}, ${w.end_time}, true, ${w.modality}::appointment_modality)
      `;
    }
  });
}

export async function addException(fecha: string, motivo: string | null): Promise<ExceptionRow> {
  const rows = await sql<{ id: string; fecha: Date; motivo: string | null }[]>`
    insert into coach_availability_exceptions (fecha, motivo) values (${fecha}, ${motivo})
    on conflict (fecha) do update set motivo = excluded.motivo
    returning id::text as id, fecha, motivo
  `;
  const e = rows[0];
  return { id: e.id, fecha: e.fecha.toISOString().slice(0, 10), motivo: e.motivo };
}

export async function removeException(id: bigint): Promise<void> {
  await sql`delete from coach_availability_exceptions where id = ${Number(id)}`;
}
