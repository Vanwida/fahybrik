import 'server-only';

// Revisiones 1:1 recurrentes coach-atleta (#21). Data layer sobre el sistema de citas
// EXISTENTE (appointments) — cero duplicación:
//   • una revisión ES una cita con sujeto ATLETA (athlete_id) y kind='revision';
//   • el hueco lo calcula computeSlots (agnóstico de sujeto, reutilizado tal cual);
//   • el Meet lo crea createReviewMeeting (reutiliza createCalendarEventWithMeet);
//   • el registro post-llamada reutiliza createSessionReport (#14, outcome='seguimiento').
//
// Flujo (fork A aprobado): el coach PROPONE desde la ficha → el atleta (usuario logado,
// NO token) recibe una notificación y reserva su hueco en la app → auto-aceptada + Meet.
// La cadencia (athletes.review_cadence, default 'mensual' — opt-out) alimenta la señal
// review_1on1_due, que se SILENCIA para un atleta pausado/baja (#13) porque el batch de
// señales ya filtra lifecycle_status='activo'.
//
// Single-coach: sin coach_id en appointments (ver store.ts). Europe/Madrid en todo el
// cálculo de huecos (computeSlots).

import { sql } from '@/lib/db';
import { CitasError, computeSlots } from '@/lib/citas/store';
import { createReviewMeeting } from '@/lib/citas/meeting';
import { isOfferedSlot, type DaySlots } from '@fahybrid/shared/domain/citas/slots';
import type { AppointmentStatus } from '@fahybrid/shared/domain/citas/status';
import {
  REVIEW_APPOINTMENT_KIND,
  REVIEW_PROPOSED_NOTIFICATION_KIND,
  reviewThresholdDays,
  type ReviewCadence,
} from '@fahybrid/shared/domain/coach/reviews';
import { SIGNAL_THRESHOLDS } from '@/lib/coach/signal-config';

// Revisiones de 30 min (fijo en v1, igual que las citas de intro).
const REVIEW_DURATION_MINUTES = 30;
// No re-proponer una revisión al mismo atleta dentro de esta ventana (anti-spam): si hay
// una propuesta reciente sin reservar, proposeReview no inserta otra notificación.
const PROPOSAL_DEDUPE_DAYS = 14;
// Los umbrales de cadencia → días viven una sola vez en signal-config (cero magic numbers).
const CADENCE_THRESHOLDS = {
  mensual: SIGNAL_THRESHOLDS.review_due_mensual_days,
  trimestral: SIGNAL_THRESHOLDS.review_due_trimestral_days,
} as const;

const MS_PER_DAY = 86_400_000;

// ── Views ─────────────────────────────────────────────────────────────────────────
export interface ReviewAppointmentView {
  id: string;
  requested_start: string; // ISO
  duration_minutes: number;
  status: AppointmentStatus;
  meet_link: string | null;
}

export interface AthleteReviewState {
  cadence: ReviewCadence;
  /** Última revisión 1:1 (max session_reports.occurred_at con sujeto atleta), ISO o null. */
  last_review_at: string | null;
  /** Próxima revisión reservada (cita futura pendiente|aceptada, kind='revision'), o null. */
  next_review: ReviewAppointmentView | null;
  /** El coach propuso una revisión (notificación reciente) y el atleta aún no ha reservado. */
  proposal_pending: boolean;
  /** Umbral de cadencia superado y sin próxima revisión → toca revisar (lo mismo que la señal). */
  due: boolean;
}

// ── Helpers privados ────────────────────────────────────────────────────────────
interface AthleteReviewRow {
  athlete_id: string;
  user_id: string;
  email: string;
  full_name: string;
  review_cadence: ReviewCadence;
  created_at: Date;
}

/** Carga el atleta + su usuario. Ownership-gated cuando se pasa coach_id. */
async function loadAthlete(
  athlete_id: bigint | number,
  coach_id?: bigint | number,
): Promise<AthleteReviewRow | null> {
  const rows = await sql<AthleteReviewRow[]>`
    select a.id::text as athlete_id, u.id::text as user_id, u.email, a.full_name,
           a.review_cadence, a.created_at
    from athletes a
    join users u on u.id = a.user_id
    where a.id = ${Number(athlete_id)}
      and (${coach_id != null ? Number(coach_id) : null}::bigint is null
           or a.coach_id = ${coach_id != null ? Number(coach_id) : null}::bigint)
      and u.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

/** La revisión ACTIVA (pendiente|aceptada) de un atleta, si existe. El índice
 *  appointments_one_active_per_athlete garantiza como mucho una. */
async function activeReviewFor(athlete_id: bigint | number): Promise<ReviewAppointmentView | null> {
  const rows = await sql<
    { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null }[]
  >`
    select id::text as id, requested_start, duration_minutes, status::text as status, meet_link
    from appointments
    where athlete_id = ${Number(athlete_id)} and kind = ${REVIEW_APPOINTMENT_KIND}
      and status in ('pendiente', 'aceptada')
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
      }
    : null;
}

// ── setReviewCadence (coach) ────────────────────────────────────────────────────
/** Fija la cadencia de revisión de un atleta. Ownership-gated (404 si no es del coach). */
export async function setReviewCadence(args: {
  athlete_id: bigint | number;
  cadence: ReviewCadence;
  coach_id: bigint | number;
}): Promise<{ athlete_id: string; cadence: ReviewCadence }> {
  const rows = await sql<{ id: string; review_cadence: ReviewCadence }[]>`
    update athletes set review_cadence = ${args.cadence}, updated_at = now()
    where id = ${Number(args.athlete_id)} and coach_id = ${Number(args.coach_id)}
    returning id::text as id, review_cadence
  `;
  if (!rows[0]) throw new CitasError('not_found', 'Atleta no encontrado', 404);
  return { athlete_id: rows[0].id, cadence: rows[0].review_cadence };
}

// ── proposeReview (coach) ───────────────────────────────────────────────────────
/**
 * El coach propone una revisión: inserta una notificación al usuario del atleta
 * («<coach> te propone una revisión — reserva tu hueco»; el nombre lo resuelve iOS con
 * `CoachRef`). NO crea cita (la reserva el
 * atleta). Idempotente-ish: no re-propone si ya hay una revisión próxima reservada o una
 * propuesta reciente sin reservar. Reutiliza notifications (type='system' + kind en
 * payload_json), el patrón partner_left/subscription_cancelled.
 */
export async function proposeReview(args: {
  coach_id: bigint | number;
  athlete_id: bigint | number;
  now?: Date;
}): Promise<{ proposed: boolean; reason?: 'already_booked' | 'recent_proposal' }> {
  const now = args.now ?? new Date();
  const athlete = await loadAthlete(args.athlete_id, args.coach_id);
  if (!athlete) throw new CitasError('not_found', 'Atleta no encontrado', 404);

  // Ya tiene una revisión activa → no hace falta proponer.
  const active = await activeReviewFor(args.athlete_id);
  if (active) return { proposed: false, reason: 'already_booked' };

  // Propuesta reciente sin reservar → no repetir (anti-spam).
  const cutoff = new Date(now.getTime() - PROPOSAL_DEDUPE_DAYS * MS_PER_DAY).toISOString();
  const recent = await sql<{ id: string }[]>`
    select id::text as id from notifications
    where user_id = ${Number(athlete.user_id)}
      and type = 'system'
      and payload_json->>'kind' = ${REVIEW_PROPOSED_NOTIFICATION_KIND}
      and created_at >= ${cutoff}::timestamptz
    limit 1
  `;
  if (recent[0]) return { proposed: false, reason: 'recent_proposal' };

  // `sql.json(...)` y NO `JSON.stringify(...)::jsonb`: con la segunda forma
  // postgres.js vuelve a serializar la cadena y la columna guarda un jsonb de
  // tipo *string*, con lo que el `payload_json->>'kind'` de aquí arriba (el
  // anti-spam) y el de getAthleteReviewState no encuentran NUNCA la propuesta
  // que acaban de escribir — y el atleta recibe la misma propuesta una y otra vez.
  await sql`
    insert into notifications (user_id, type, payload_json)
    values (${Number(athlete.user_id)}, 'system', ${sql.json({
      kind: REVIEW_PROPOSED_NOTIFICATION_KIND,
      athlete_id: String(athlete.athlete_id),
      coach_id: String(args.coach_id),
    })})
  `;
  return { proposed: true };
}

// ── listAthleteReviewSlots (atleta) ─────────────────────────────────────────────
/**
 * Huecos ofrecidos para que el atleta reserve su revisión. Reutiliza computeSlots. Si ya
 * tiene una revisión activa devuelve [] (no puede reservar otra — el índice one-active la
 * bloquearía igualmente; la app muestra la reservada vía getAthleteReviewState).
 */
export async function listAthleteReviewSlots(args: {
  athlete_id: bigint | number;
  now?: Date;
}): Promise<DaySlots[]> {
  const now = args.now ?? new Date();
  const active = await activeReviewFor(args.athlete_id);
  if (active) return [];
  // #40: reviews are video-only (createReviewMeeting mints a Meet) → the video schedule.
  return computeSlots('video', now);
}

// ── bookAthleteReview (atleta) ──────────────────────────────────────────────────
/**
 * El atleta reserva su revisión en un hueco. Crea la cita (athlete_id, lead_id null,
 * kind='revision', status='aceptada' auto-aceptada), con las MISMAS garantías de carrera
 * que bookAppointment (advisory lock por hueco + re-chequeo de solape; el índice
 * one-active-per-athlete corta el doble-booking). NO toca el pipeline de leads (no hay
 * lead). Luego crea el Meet (best-effort) y lo sella. Devuelve la cita + meet_link.
 */
export async function bookAthleteReview(args: {
  athlete_id: bigint | number;
  requested_start: string;
  now?: Date;
}): Promise<{ appointment: ReviewAppointmentView; meet_link: string | null }> {
  const now = args.now ?? new Date();
  const athlete = await loadAthlete(args.athlete_id);
  if (!athlete) throw new CitasError('not_found', 'Atleta no encontrado', 404);

  const existing = await activeReviewFor(args.athlete_id);
  if (existing) throw new CitasError('already_booked', 'Ya tienes una revisión reservada', 409);

  const startMs = Date.parse(args.requested_start);
  if (Number.isNaN(startMs)) throw new CitasError('invalid_slot', 'Hueco no válido', 400);

  // #40: reviews are video-only (createReviewMeeting mints a Meet) → the video schedule.
  const slots = await computeSlots('video', now);
  if (!isOfferedSlot(slots, startMs)) {
    throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
  }
  const startIso = new Date(startMs).toISOString();

  let appointment: ReviewAppointmentView;
  try {
    appointment = await sql.begin(async (tx) => {
      // Mismas dos garantías que bookAppointment: (1) advisory lock por hueco serializa
      // reservas concurrentes del MISMO hueco; (2) el índice parcial one-active-per-athlete
      // (23505 abajo) corta que el mismo atleta reserve dos.
      await tx`select pg_advisory_xact_lock(${startMs})`;

      const clash = await tx<{ id: string }[]>`
        select id::text as id from appointments
        where requested_start = ${startIso}::timestamptz and status in ('pendiente', 'aceptada')
        limit 1
      `;
      if (clash.length) {
        throw new CitasError('slot_unavailable', 'Ese hueco ya no está disponible', 409);
      }

      const rows = await tx<
        { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null }[]
      >`
        insert into appointments (athlete_id, requested_start, duration_minutes, status, kind)
        values (${Number(args.athlete_id)}, ${startIso}, ${REVIEW_DURATION_MINUTES}, 'aceptada', ${REVIEW_APPOINTMENT_KIND})
        returning id::text as id, requested_start, duration_minutes, status::text as status, meet_link
      `;
      const a = rows[0]!;
      return {
        id: a.id,
        requested_start: a.requested_start.toISOString(),
        duration_minutes: a.duration_minutes,
        status: a.status,
        meet_link: a.meet_link,
      };
    });
  } catch (err) {
    if (err instanceof CitasError) throw err;
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      throw new CitasError('already_booked', 'Ya tienes una revisión reservada', 409);
    }
    throw err;
  }

  // Meet best-effort (reutiliza createCalendarEventWithMeet vía createReviewMeeting). null =
  // se pegará manualmente. Se sella review-scoped: setAppointmentMeetLink (store.ts) hace un
  // inner join con leads y daría 404 en una revisión, así que el update va aquí.
  let meetLink = appointment.meet_link;
  const meeting = await createReviewMeeting({
    appointmentId: appointment.id,
    start: new Date(appointment.requested_start),
    durationMinutes: appointment.duration_minutes,
    athleteEmail: athlete.email,
    athleteName: athlete.full_name,
  });
  if (meeting.meet_link) {
    await sql`
      update appointments
        set meet_link = ${meeting.meet_link},
            google_event_id = coalesce(${meeting.event_id ?? null}, google_event_id),
            updated_at = now()
      where id = ${Number(appointment.id)}
    `;
    meetLink = meeting.meet_link;
  }

  return { appointment: { ...appointment, meet_link: meetLink }, meet_link: meetLink };
}

// ── cancelAthleteReview (coach ficha) ───────────────────────────────────────────
/**
 * Cancela la revisión ACTIVA (pendiente|aceptada) de un atleta desde la ficha del coach.
 * Ownership-gated: solo toca una cita cuyo atleta pertenece al coach. NO usa
 * actOnAppointment (que hace inner join con leads y daría 404 en una revisión, lead_id
 * null). Devuelve el google_event_id para que la ruta borre el evento de Calendar
 * best-effort. `cancelled: false` cuando no había nada que cancelar (guard idempotente).
 */
export async function cancelAthleteReview(args: {
  coach_id: bigint | number;
  athlete_id: bigint | number;
}): Promise<{ cancelled: boolean; google_event_id: string | null }> {
  const rows = await sql<{ id: string; google_event_id: string | null }[]>`
    update appointments a
       set status = 'cancelada'::appointment_status, updated_at = now()
     where a.athlete_id = ${Number(args.athlete_id)}
       and a.kind = ${REVIEW_APPOINTMENT_KIND}
       and a.status in ('pendiente', 'aceptada')
       and exists (
         select 1 from athletes ath
          where ath.id = a.athlete_id and ath.coach_id = ${Number(args.coach_id)}
       )
     returning a.id::text as id, a.google_event_id
  `;
  const row = rows[0];
  return { cancelled: Boolean(row), google_event_id: row?.google_event_id ?? null };
}

// ── getAthleteReviewState (coach ficha + app del atleta) ─────────────────────────
/** Estado de revisión del atleta: cadencia, última revisión, próxima reservada,
 *  propuesta pendiente y si toca (due). Ownership-gated cuando se pasa coach_id. */
export async function getAthleteReviewState(args: {
  athlete_id: bigint | number;
  coach_id?: bigint | number;
  now?: Date;
}): Promise<AthleteReviewState> {
  const now = args.now ?? new Date();
  const athlete = await loadAthlete(args.athlete_id, args.coach_id);
  if (!athlete) throw new CitasError('not_found', 'Atleta no encontrado', 404);

  const [lastRows, nextRows, proposalRows] = await Promise.all([
    sql<{ ts: Date | null }[]>`
      select max(occurred_at) as ts from session_reports
      where athlete_id = ${Number(args.athlete_id)} and deleted_at is null
    `,
    sql<
      { id: string; requested_start: Date; duration_minutes: number; status: AppointmentStatus; meet_link: string | null }[]
    >`
      select id::text as id, requested_start, duration_minutes, status::text as status, meet_link
      from appointments
      where athlete_id = ${Number(args.athlete_id)} and kind = ${REVIEW_APPOINTMENT_KIND}
        and status in ('pendiente', 'aceptada') and requested_start >= ${now.toISOString()}::timestamptz
      order by requested_start asc limit 1
    `,
    sql<{ id: string }[]>`
      select id::text as id from notifications
      where user_id = ${Number(athlete.user_id)}
        and type = 'system'
        and payload_json->>'kind' = ${REVIEW_PROPOSED_NOTIFICATION_KIND}
        and created_at >= ${new Date(now.getTime() - PROPOSAL_DEDUPE_DAYS * MS_PER_DAY).toISOString()}::timestamptz
      limit 1
    `,
  ]);

  const lastReviewAt = lastRows[0]?.ts ?? null;
  const nextRow = nextRows[0] ?? null;
  const next_review: ReviewAppointmentView | null = nextRow
    ? {
        id: nextRow.id,
        requested_start: nextRow.requested_start.toISOString(),
        duration_minutes: nextRow.duration_minutes,
        status: nextRow.status,
        meet_link: nextRow.meet_link,
      }
    : null;

  // Referencia para "vencida": la última revisión o, si nunca la hubo, el alta del atleta.
  // Así una cadencia recién puesta no vence al instante (solo tras un periodo desde el alta).
  const reference = lastReviewAt ?? athlete.created_at;
  const daysSince = Math.floor((now.getTime() - reference.getTime()) / MS_PER_DAY);
  const thresholdDays = reviewThresholdDays(athlete.review_cadence, CADENCE_THRESHOLDS);
  const due = thresholdDays != null && next_review === null && daysSince > thresholdDays;

  return {
    cadence: athlete.review_cadence,
    last_review_at: lastReviewAt ? lastReviewAt.toISOString() : null,
    next_review,
    proposal_pending: proposalRows.length > 0 && next_review === null,
    due,
  };
}
