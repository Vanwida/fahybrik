// Appointment/booking data layer (funnel #2/#4). Owns every DB read/write for citas,
// the slot computation (via the shared pure engine), and the coach status machine with
// its side-effects (accept → lead advances to `agendado`, meet link via adapter/manual).
//
// Tenancy: an appointment has NO coach_id of its own (0093) — it belongs to the club
// that owns its LEAD (`leads.coach_id`, mig. 0147) or, for a 1:1 review, its ATHLETE
// (`athletes.coach_id`). Every coach-facing read/write scopes through that owner with
// ONE rule, `leadOwnedBy` (lib/leads/owner.ts); another club's cita → 404.
// The AGENDA is per coach since 0220 (`coach_availability[_exceptions].coach_id`): the
// slots a lead sees are its owner's, computed against that coach's own busy citas —
// one coach's booking never blocks another's hour. Europe/Madrid throughout.

import { sql, type TransactionClient } from '@/lib/db';
import { isRowWaitlisted } from '@/lib/leads/waitlist';
import { calendarCoachForLead, leadOwnedBy } from '@/lib/leads/owner';
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
// presencial) OF ONE COACH (0220). Only that coach's windows of the requested modality
// feed the offered slots; the two schedules can overlap freely.
async function loadAvailabilityWindows(
  coach_id: bigint,
  modality: CitaModality,
): Promise<AvailabilityWindow[]> {
  const rows = await sql<{ weekday: number; start_time: string; end_time: string }[]>`
    select weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time
    from coach_availability
    where coach_id = ${Number(coach_id)} and activo and modality = ${modality}::appointment_modality
  `;
  return rows;
}

async function loadBlockedDates(coach_id: bigint): Promise<Set<string>> {
  const rows = await sql<{ fecha: string }[]>`
    select to_char(fecha, 'YYYY-MM-DD') as fecha from coach_availability_exceptions
    where coach_id = ${Number(coach_id)}
  `;
  return new Set(rows.map((r) => r.fecha));
}

/** The active citas that occupy THIS coach's calendar: intro calls of leads they own
 *  (`leadOwnedBy`) + 1:1 reviews of their athletes. The SQL predicate the busy set and
 *  the booking clash re-check share, so they can never disagree. Alias `a` = appointments. */
function coachCalendarPredicate(coach_id: bigint) {
  return sql`(
    exists (select 1 from leads l where l.id = a.lead_id and ${leadOwnedBy(sql, coach_id, sql`l.coach_id`)})
    or exists (select 1 from athletes ath where ath.id = a.athlete_id and ath.coach_id = ${Number(coach_id)})
  )`;
}

async function loadBusyStartMs(coach_id: bigint): Promise<Set<number>> {
  const rows = await sql<{ start: Date }[]>`
    select a.requested_start as start from appointments a
    where a.status in ('pendiente', 'aceptada') and ${coachCalendarPredicate(coach_id)}
  `;
  return new Set(rows.map((r) => r.start.getTime()));
}

/** The bookable slots for the next 14 days in ONE coach's schedule for the given modality
 *  (empty = no availability → UI fallback). `coach_id` null = nobody's calendar → []. Occupancy
 *  is AGNOSTIC of modality (the coach can't be in two places at once) but scoped to the coach. */
export async function computeSlots(
  coach_id: bigint | null,
  modality: CitaModality,
  now: Date = new Date(),
): Promise<DaySlots[]> {
  if (coach_id === null) return [];
  const [availability, blockedDates, busyStartMs] = await Promise.all([
    loadAvailabilityWindows(coach_id, modality),
    loadBlockedDates(coach_id),
    loadBusyStartMs(coach_id),
  ]);
  return generateSlots({ now, availability, blockedDates, busyStartMs });
}

/**
 * Inside a booking transaction: serialize concurrent bookings of the SAME hour of the SAME
 * coach, then re-check nobody active already sits on it. The lock key mixes coach + slot so
 * two coaches booking the same hour never wait on (or block) each other. Throws
 * `slot_unavailable` on a clash. Shared by lead intros and athlete reviews.
 */
export async function lockAndCheckSlot(
  tx: TransactionClient,
  coach_id: bigint,
  startMs: number,
): Promise<void> {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`cita:${coach_id}:${startMs}`}, 0))`;
  const startIso = new Date(startMs).toISOString();
  const clash = await tx<{ id: string }[]>`
    select a.id::text as id from appointments a
    where a.requested_start = ${startIso}::timestamptz and a.status in ('pendiente', 'aceptada')
      and ${coachCalendarPredicate(coach_id)}
    limit 1
  `;
  if (clash.length) {
    throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
  }
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
// reads and the lead's owner (whose calendar it books). Kept private so BookingLead stays
// the lean public shape.
interface LeadBookingRow extends BookingLead {
  waitlisted_at: Date | null;
  waitlist_released_at: Date | null;
  coach_id: string | null;
}

async function leadByToken(token: string): Promise<LeadBookingRow | null> {
  const rows = await sql<LeadBookingRow[]>`
    select id::text as id, nombre, email, waitlisted_at, waitlist_released_at,
           coach_id::text as coach_id
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
  const calendar = calendarCoachForLead(row.coach_id == null ? null : BigInt(row.coach_id));
  const slots = active || waitlisted ? [] : await computeSlots(calendar, modality, now);
  return { lead, active_appointment: active, slots, waitlisted };
}

export interface BookResult {
  appointment: AppointmentView;
  lead: BookingLead;
  created: boolean;
  /** The coach whose calendar this cita occupies (the lead's owner, or the funnel coach
   *  for an unassigned lead) — for the presencial address (`getStudioLocation`). */
  coach_id: bigint;
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

  const calendar = calendarCoachForLead(row.coach_id == null ? null : BigInt(row.coach_id));
  const slots = await computeSlots(calendar, args.modality, now);
  if (calendar === null || !isOfferedSlot(slots, startMs)) {
    throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
  }

  const startIso = new Date(startMs).toISOString();
  try {
    return await sql.begin(async (tx) => {
      // AUTO-ACCEPT (#2/#4 redesign): a reservation IS the confirmed cita — there is no
      // coach approval step. Two guards make that race-safe:
      //   1) A per-(coach, slot) advisory xact lock + clash re-check (lockAndCheckSlot):
      //      two DIFFERENT leads can't both confirm the same hour of the same coach.
      //   2) The one-active-per-lead partial unique index (23505 below) stops the SAME
      //      lead double-booking.
      await lockAndCheckSlot(tx, calendar, startMs);

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
        coach_id: calendar,
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
// The coach's call lists/counts live in ./calls; re-exported for existing imports.
export { countCallsToday, listUpcomingCalls, type UpcomingCall } from './calls';

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
 *  (`leadOwnedBy`). Review appointments (lead_id null) never
 *  resolve here — the inner join is deliberate (see lib/citas/reviews.ts). */
async function appointmentWithLead(id: bigint, coach_id: bigint | null): Promise<AppointmentWithLead | null> {
  const scope =
    coach_id === null
      ? sql``
      : sql`and ${leadOwnedBy(sql, coach_id, sql`l.coach_id`)}`;
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
 * Tenancy: scoped through the lead's owner (leadOwnedBy) — another club's cita
 * reads as nonexistent → not_found 404.
 */
export async function actOnAppointment(args: {
  id: bigint;
  /** The acting coach (session.coach_id) — the cita's lead must be theirs (leadOwnedBy). */
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
 *  Tenancy: `coach_id` scopes through the lead's owner (leadOwnedBy) → alien cita 404;
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

// Availability CRUD + the presencial address live in ./availability (per coach, 0220);
// re-exported so existing imports from this module keep resolving.
export {
  getStudioLocation,
  getAvailability,
  setAvailability,
  addException,
  removeException,
  type AvailabilityRow,
  type ExceptionRow,
} from './availability';
