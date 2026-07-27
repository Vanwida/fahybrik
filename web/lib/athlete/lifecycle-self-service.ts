// Pausing and leaving, driven by the ATHLETE from the app (#13).
//
// The entry to FAHYBRID is a conversation: an interview, then a Stripe link by email.
// The exit is not. Stopping the money can never depend on someone returning a call —
// it is the athlete's money, and in the EU cancelling cannot be harder than signing up.
// So both transitions are a button here, and the coach is TOLD, not asked.
//
// Two things this layer adds on top of the coach-owned state machine in
// lib/coach/athlete-lifecycle.ts:
//
//   • THE PAUSE BUDGET. A pause voids the Stripe invoices, so it is capped at four
//     weeks per rolling year (shared/domain/coach/pause-budget.ts). The cap is what
//     buys the other half: while paused, the plaza is reserved instead of going to
//     the waitlist. The coach has no cap — he is the human override.
//
//   • THE SCHEDULED BAJA. A coach's baja is immediate. An athlete's is not: between
//     the tap and the end of the period there can be three weeks ALREADY PAID, and
//     freezing the plan that day would be charging for nothing. So we stamp
//     `baja_scheduled_for` (0137), leave them activo, and the lifecycle cron applies
//     it on the day. Until then, one button takes it back.
//
// Dates are box-local (Europe/Madrid): a pause that starts "today" has to mean the
// athlete's today, not UTC's.

import { sql } from '@/lib/db';
import { recordAudit } from '@/lib/audit/record-edit';
import { getSubscriptionByUserId } from '@/lib/stripe';
import {
  LifecycleError,
  bajaAthlete,
  getAthleteLifecycle,
  getAthletePauseIntervals,
  pauseAthlete,
  resumeAthlete,
  type AthleteLifecycleStatus,
  type PauseReason,
} from '@/lib/coach/athlete-lifecycle';
import { cancelStripeAtPeriodEnd, uncancelStripeAtPeriodEnd } from '@/lib/coach/billing-actions';
import {
  alertCoachBajaCanceled,
  alertCoachBajaScheduled,
  alertCoachPauseStarted,
} from '@/lib/athlete/lifecycle-coach-alerts';
import {
  computePauseBudget,
  pauseSpanLength,
  type PauseBudget,
} from '@fahybrid/shared/domain/coach/pause-budget';
import { diffDays, isoDateString, parseIsoDate, startOfDayInBox } from '@fahybrid/shared/domain/dates';

/** The athlete's "today" as an ISO calendar day in the box timezone. */
function boxTodayIso(): string {
  return isoDateString(startOfDayInBox(new Date()));
}

// ── The state the app renders ────────────────────────────────────────────────────

export interface SelfServiceState {
  status: AthleteLifecycleStatus;
  pause: PauseBudget & {
    /** While pausado: the day they come back. null for an open-ended coach pause. */
    returns_on: string | null;
    /** While pausado: the day the pause started. */
    since: string | null;
  };
  baja: {
    /** ISO day the scheduled baja lands. null when none is scheduled. */
    scheduled_for: string | null;
    /** Days from today until it lands. null when none is scheduled. */
    days_left: number | null;
  };
  billing: {
    /** ISO day of the next renewal, as mirrored from Stripe. */
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    /** true while paused — Stripe is voiding invoices, so nothing is being charged. */
    collection_paused: boolean;
  };
}

/**
 * Everything Perfil › Mi suscripción needs in one read: where the athlete stands, how
 * much pause is left, and what billing is about to do.
 */
export async function getSelfServiceState(input: {
  athlete_id: bigint;
  user_id: bigint;
}): Promise<SelfServiceState> {
  const todayIso = boxTodayIso();
  const [lifecycle, spans, scheduled, sub] = await Promise.all([
    getAthleteLifecycle(input.athlete_id),
    getAthletePauseIntervals(input.athlete_id),
    readScheduledBaja(input.athlete_id),
    getSubscriptionByUserId(sql, input.user_id),
  ]);
  if (!lifecycle) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);

  const budget = computePauseBudget(spans, todayIso);
  const open = lifecycle.open_pause;
  // `end_date` IS the return day (the coach dialog's "Vuelve el"), so it needs no shift.
  const returns_on = open?.end_date ?? null;

  return {
    status: lifecycle.lifecycle_status,
    pause: {
      ...budget,
      returns_on,
      since: open?.start_date ?? null,
    },
    baja: {
      scheduled_for: scheduled?.scheduled_for ?? null,
      days_left: scheduled
        ? Math.max(0, diffDays(parseIsoDate(scheduled.scheduled_for), parseIsoDate(todayIso)))
        : null,
    },
    billing: {
      current_period_end: sub?.current_period_end ? isoDateString(sub.current_period_end) : null,
      cancel_at_period_end: sub?.cancel_at_period_end ?? false,
      collection_paused: lifecycle.lifecycle_status === 'pausado',
    },
  };
}

async function readScheduledBaja(
  athlete_id: bigint,
): Promise<{ scheduled_for: string; reason: PauseReason | null } | null> {
  const rows = await sql<{ scheduled_for: string | null; reason: string | null }[]>`
    select to_char(baja_scheduled_for, 'YYYY-MM-DD') as scheduled_for, baja_reason as reason
    from athletes where id = ${athlete_id as unknown as number}
    limit 1
  `;
  const row = rows[0];
  if (!row?.scheduled_for) return null;
  return { scheduled_for: row.scheduled_for, reason: (row.reason as PauseReason | null) ?? null };
}

// ── Transitions ──────────────────────────────────────────────────────────────────

export interface PauseSelfInput {
  athlete_id: bigint;
  user_id: bigint;
  reason: PauseReason;
  /** ISO day the athlete comes back and trains again. Must be after today. */
  return_date: string;
  note?: string | null;
}

/**
 * PAUSE, self-service. Checks the budget, applies the pause, tells the coach.
 *
 * `end_date` is stored as the RETURN day, which is what the coach's own dialog has
 * always written ("Vuelve el") and what every row in production already means. The
 * return day is not itself a paused day — see shared/domain/coach/pause-budget.ts.
 */
export async function pauseSelf(input: PauseSelfInput): Promise<{ status: 'pausado'; days: number }> {
  const todayIso = boxTodayIso();
  const returnDate = parseIsoDate(input.return_date);
  const today = parseIsoDate(todayIso);
  if (returnDate <= today) {
    throw new LifecycleError('invalid_return_date', 'La fecha de vuelta tiene que ser posterior a hoy', 400);
  }

  const scheduled = await readScheduledBaja(input.athlete_id);
  if (scheduled) {
    throw new LifecycleError(
      'baja_scheduled',
      'Tienes una baja programada. Cancélala antes de pausar.',
      409,
    );
  }

  const days = pauseSpanLength(todayIso, input.return_date);
  const budget = computePauseBudget(await getAthletePauseIntervals(input.athlete_id), todayIso);
  if (days > budget.available_days) {
    throw new LifecycleError(
      'pause_budget_exceeded',
      budget.available_days === 0
        ? 'Has usado tus semanas de pausa de este año'
        : `Solo te quedan ${budget.available_days} días de pausa`,
      409,
    );
  }

  await pauseAthlete({
    athlete_id: input.athlete_id,
    reason: input.reason,
    note: input.note ?? null,
    end_date: input.return_date,
    requested_by: 'athlete',
    by_user_id: input.user_id,
  });

  // Best-effort: the pause is already committed, an alert that fails must not undo it.
  await alertCoachPauseStarted({
    athlete_id: input.athlete_id,
    reason: input.reason,
    returns_on: input.return_date,
    days,
    available_after: Math.max(0, budget.available_days - days),
  }).catch(() => undefined);

  return { status: 'pausado', days };
}

/** RESUME early, self-service ("Volver ya"). The unused days go straight back to the budget. */
export async function resumeSelf(input: { athlete_id: bigint }): Promise<{ status: 'activo' }> {
  await resumeAthlete({ athlete_id: input.athlete_id });
  return { status: 'activo' };
}

export interface ScheduleBajaInput {
  athlete_id: bigint;
  user_id: bigint;
  reason: PauseReason;
}

export interface ScheduleBajaResult {
  /** ISO day it lands. Equal to today when it was applied on the spot. */
  scheduled_for: string;
  /** true when there was no paid runway left and the baja applied immediately. */
  applied_now: boolean;
}

/**
 * BAJA, self-service. Normally SCHEDULED at the end of the paid period so the athlete
 * keeps everything they paid for. Applied immediately in the two cases where there is
 * nothing left to honour: no live subscription, and an athlete who is already paused
 * (their invoices are being voided, so there is no paid runway to run out).
 */
export async function scheduleBajaSelf(input: ScheduleBajaInput): Promise<ScheduleBajaResult> {
  const todayIso = boxTodayIso();
  const lifecycle = await getAthleteLifecycle(input.athlete_id);
  if (!lifecycle) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
  if (lifecycle.lifecycle_status === 'baja') {
    throw new LifecycleError('invalid_transition', 'Ya estás de baja', 409);
  }
  const already = await readScheduledBaja(input.athlete_id);
  if (already) {
    throw new LifecycleError('already_scheduled', 'Ya tienes una baja programada', 409);
  }

  const sub = await getSubscriptionByUserId(sql, input.user_id);
  const periodEnd = sub?.current_period_end ? isoDateString(sub.current_period_end) : null;
  const hasRunway =
    lifecycle.lifecycle_status === 'activo' &&
    periodEnd !== null &&
    parseIsoDate(periodEnd) > parseIsoDate(todayIso);

  if (!hasRunway || !sub || !periodEnd) {
    await bajaAthlete({
      athlete_id: input.athlete_id,
      reason: input.reason,
      by_user_id: input.user_id,
      by_kind: 'athlete',
    });
    await alertCoachBajaScheduled({
      athlete_id: input.athlete_id,
      reason: input.reason,
      scheduled_for: todayIso,
      days_left: 0,
    }).catch(() => undefined);
    return { scheduled_for: todayIso, applied_now: true };
  }

  await sql.begin(async (tx) => {
    await tx`
      update athletes
      set baja_scheduled_for = ${periodEnd}::date,
          baja_reason        = ${input.reason},
          baja_by_user_id    = ${input.user_id as unknown as number},
          baja_by_kind       = 'athlete',
          updated_at         = now()
      where id = ${input.athlete_id as unknown as number}
    `;
    // Mirror it locally too, so the coach's billing panel and the renewal signal both
    // see the cancellation without waiting for the Stripe webhook to come back.
    // Pinned to the CONCRETE subscription resolved above (never a blanket
    // user_id+status sweep — subscriptions carry no club column until obra 4).
    await tx`
      update subscriptions set cancel_at_period_end = true, updated_at = now()
      where id = ${sub.id as unknown as number}
        and status = 'active'
        and cancel_at_period_end = false
    `;
    await recordAudit(tx, {
      entity_type: 'athletes',
      entity_id: input.athlete_id,
      action: 'update',
      actor: { kind: 'athlete', user_id: input.user_id },
      diff: { baja_scheduled_for: periodEnd, reason: input.reason },
    });
  });

  // POST-COMMIT + guarded, like every other Stripe call in the lifecycle.
  try {
    await cancelStripeAtPeriodEnd(input.athlete_id);
  } catch {
    // Swallow: the baja is scheduled; billing is reconcilable by the coach.
  }
  await alertCoachBajaScheduled({
    athlete_id: input.athlete_id,
    reason: input.reason,
    scheduled_for: periodEnd,
    days_left: diffDays(parseIsoDate(periodEnd), parseIsoDate(todayIso)),
  }).catch(() => undefined);

  return { scheduled_for: periodEnd, applied_now: false };
}

/** UNDO a scheduled baja. Only possible while it has not landed — after that it is a re-alta. */
export async function cancelScheduledBaja(input: {
  athlete_id: bigint;
  user_id: bigint;
}): Promise<{ status: 'activo' }> {
  const scheduled = await readScheduledBaja(input.athlete_id);
  if (!scheduled) {
    throw new LifecycleError('not_scheduled', 'No tienes ninguna baja programada', 409);
  }

  // The undo un-cancels the same CONCRETE subscription the baja cancelled —
  // symmetric with scheduleBajaSelf, never a blanket user_id+status sweep.
  const sub = await getSubscriptionByUserId(sql, input.user_id);

  await sql.begin(async (tx) => {
    await tx`
      update athletes
      set baja_scheduled_for = null,
          baja_reason        = null,
          baja_by_user_id    = null,
          baja_by_kind       = null,
          updated_at         = now()
      where id = ${input.athlete_id as unknown as number}
    `;
    if (sub) {
      await tx`
        update subscriptions set cancel_at_period_end = false, updated_at = now()
        where id = ${sub.id as unknown as number}
          and status = 'active'
          and cancel_at_period_end = true
      `;
    }
    await recordAudit(tx, {
      entity_type: 'athletes',
      entity_id: input.athlete_id,
      action: 'update',
      actor: { kind: 'athlete', user_id: input.user_id },
      diff: { baja_scheduled_for: null },
    });
  });

  try {
    await uncancelStripeAtPeriodEnd(input.athlete_id);
  } catch {
    // Swallow: locally they are staying; Stripe is reconcilable by the coach.
  }
  await alertCoachBajaCanceled(input.athlete_id).catch(() => undefined);
  return { status: 'activo' };
}
