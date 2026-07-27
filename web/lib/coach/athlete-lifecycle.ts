// Athlete lifecycle state machine (#13) — the DATA + STATE-MACHINE layer.
//
// The lifecycle (`athletes.lifecycle_status`) is DISTINCT from billing: it is the
// single truth for whether Pablo is coaching the athlete right now, independent of
// what Stripe is doing:
//
//   activo  ──pause──▶  pausado  ──resume──▶  activo
//   activo/pausado ──baja──▶ baja ──re_alta──▶ activo
//
// This file holds the COACH-owned transitions. The athlete drives the same state
// machine from the app through lib/athlete/lifecycle-self-service.ts, which layers
// the pause budget and the scheduled baja on top and then calls straight into these.
//
// Guarantees:
//   • Every mutation runs inside `sql.begin` (atomic; the athlete row is locked
//     `for update` so two concurrent transitions can't race).
//   • baja frees a cupo slot: after the state change commits we call
//     releaseWaitlistToCapacity() (recompute-based, idempotent) so the freed plaza
//     passes to the next waiting lead. It runs POST-COMMIT so the capacity recompute
//     (a separate pool connection) sees the athlete already baja. A PAUSE deliberately
//     does NOT free the plaza — it reserves it, which is the other half of the pause
//     budget deal (docs/DECISIONS.md, 2026-07-26).
//   • History is NEVER deleted. baja preserves everything — it only flips state +
//     cancels billing at period end. RGPD deletion is a separate path (#19).
//
// Sibling agents build on this: the adherence agent excludes the pause intervals
// (getAthletePauseIntervals / isDateInAnyPause), the plan-freeze agent fills the
// resume re-anchor seam, the dobles agent fills the baja pair-dissolve seam.

import { sql, type TransactionClient } from '@/lib/db';
import { recordAudit } from '@/lib/audit/record-edit';
import { getCapacityState } from '@/lib/coach/capacity';
import { releaseWaitlistToCapacity } from '@/lib/leads/waitlist';
import {
  pauseStripeCollection,
  resumeStripeCollection,
  cancelStripeAtPeriodEnd,
} from '@/lib/coach/billing-actions';
import { reanchorPlanAfterResume } from '@/lib/coach/athlete-lifecycle-plan';
import { dissolvePairOnBaja } from '@/lib/dashboard/coach/doubles-pairs';
import { isoDateString, startOfDayInBox } from '@fahybrid/shared/domain/dates';
import {
  type AthleteLifecycleStatus,
  type PauseReason,
  type PauseRequestedBy,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

// Re-export the shared contract so lib callers get the type + reasons from one path.
export {
  PAUSE_REASONS,
  PAUSE_REASON_LABELS,
  LIFECYCLE_STATUS_LABELS,
  isPauseReason,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';
export type {
  AthleteLifecycleStatus,
  PauseReason,
  PauseRequestedBy,
  PauseRequestStatus,
} from '@fahybrid/shared/domain/coach/athlete-lifecycle';

/** Typed lifecycle error so API routes map it straight to an HTTP status/code. */
export class LifecycleError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'LifecycleError';
  }
}

// ── Public result / input shapes (the contract the other agents + APIs consume) ──

export interface LifecycleTransitionResult {
  status: AthleteLifecycleStatus;
}

export interface ReAltaResult {
  status: 'activo';
  /** true when re-activating pushes the roster over the coach's cap (coach override). */
  over_capacity: boolean;
}

export interface PauseAthleteInput {
  athlete_id: bigint;
  reason: PauseReason;
  note?: string | null;
  /** Optional planned return date (ISO YYYY-MM-DD). Omit for an indefinite pause. */
  end_date?: string | null;
  requested_by: PauseRequestedBy;
  coach_id?: bigint | null;
  /** Authorship (#43): the acting user's users.id → athlete_pauses.created_by_user_id
   *  + the audit trail. null for an athlete-requested pause (kind carries the athlete;
   *  no user threaded — the sello self-hides). Distinct from coach_id (a coaches.id). */
  by_user_id?: bigint | null;
}

export interface BajaAthleteInput {
  athlete_id: bigint;
  reason: PauseReason;
  coach_id?: bigint | null;
  /** Authorship (#43): the acting user's users.id — stamps athletes.baja_by_* (its own
   *  lifecycle-author slot, 0118) + the audit trail so the banner shows who gave the
   *  baja without touching last_edited_by. Distinct from coach_id. */
  by_user_id?: bigint | null;
  /** Who is behind the baja. Defaults to 'coach' — the only author before 0137. */
  by_kind?: 'coach' | 'athlete';
}

export interface RequestPauseInput {
  athlete_id: bigint;
  reason: PauseReason;
  note?: string | null;
}

// Read helpers + their result types (getAthleteLifecycle, listOpenPauseIntervals,
// getAthletePauseIntervals, isDateInAnyPause and PauseInterval/OpenPauseInterval/
// AthleteLifecycle) live in ./athlete-lifecycle-reads to keep this file under 500 lines.
// They are re-exported here so callers still import from '@/lib/coach/athlete-lifecycle'.
export {
  getAthleteLifecycle,
  listOpenPauseIntervals,
  getAthletePauseIntervals,
  isDateInAnyPause,
} from './athlete-lifecycle-reads';
export type { PauseInterval, OpenPauseInterval, AthleteLifecycle } from './athlete-lifecycle-reads';

/** The coach's "today" as an ISO calendar day in the box timezone (Europe/Madrid). */
function boxTodayIso(): string {
  return isoDateString(startOfDayInBox(new Date()));
}

// ── Core mutations (private, run inside a caller-provided transaction) ────────────

/**
 * Flip activo → pausado and OPEN a pause interval, inside `tx`. Guards that the
 * athlete exists and is currently activo (the only legal source state). Shared by
 * pauseAthlete (coach) and confirmPauseRequest (athlete-requested), so the guard +
 * the two writes live in exactly one place.
 */
async function applyPauseTx(
  tx: TransactionClient,
  input: PauseAthleteInput,
  todayIso: string,
): Promise<void> {
  const rows = await tx<{ lifecycle_status: AthleteLifecycleStatus }[]>`
    select lifecycle_status from athletes where id = ${input.athlete_id} for update
  `;
  const current = rows[0];
  if (!current) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
  if (current.lifecycle_status !== 'activo') {
    throw new LifecycleError(
      'invalid_transition',
      `No se puede pausar a un atleta en estado ${current.lifecycle_status}`,
      409,
    );
  }

  await tx`
    update athletes set lifecycle_status = 'pausado', updated_at = now()
    where id = ${input.athlete_id}
  `;
  // Authorship (#43): created_by_user_id = the acting user (coach), created_by_kind =
  // WHO the pause is on behalf of (= requested_by: 'coach' or 'athlete'). RETURNING the
  // new id so the audit trail below points at this exact pause, all in one tx.
  const ins = await tx<{ id: string }[]>`
    insert into athlete_pauses (
      athlete_id, start_date, end_date, reason, note, requested_by,
      created_by_coach_id, created_by_user_id, created_by_kind
    ) values (
      ${input.athlete_id},
      ${todayIso}::date,
      ${input.end_date ?? null}::date,
      ${input.reason},
      ${input.note ?? null},
      ${input.requested_by},
      ${input.coach_id ?? null},
      ${input.by_user_id ?? null},
      ${input.requested_by}
    )
    returning id::text as id
  `;
  await recordAudit(tx, {
    entity_type: 'athlete_pauses',
    entity_id: BigInt(ins[0]!.id),
    action: 'create',
    actor: { kind: input.requested_by, user_id: input.by_user_id ?? null },
    diff: { reason: input.reason },
  });
}

/**
 * Close the athlete's current pause interval at `todayIso`, inside `tx`. Closes an
 * indefinite pause (end_date null → today) AND corrects a planned pause whose end is
 * still in the future to the ACTUAL return day — so adherence never excludes days the
 * athlete was already back. A pause that already elapsed (end_date < today) is left
 * untouched. At most one such interval exists (you can only pause when activo).
 */
async function closeCurrentPauseTx(
  tx: TransactionClient,
  athleteId: bigint,
  todayIso: string,
): Promise<void> {
  await tx`
    update athlete_pauses set end_date = ${todayIso}::date
    where athlete_id = ${athleteId}
      and (end_date is null or end_date > ${todayIso}::date)
  `;
}

// ── Public transitions ───────────────────────────────────────────────────────────

/**
 * PAUSE. Guards activo, flips to pausado, opens a pause interval. The plan freeze +
 * adherence exclusion are driven off this state by the sibling agents.
 *
 * The plaza is NOT released to the waitlist: a paused athlete keeps their slot. That
 * is what the pause budget pays for — see lib/athlete/lifecycle-self-service.ts and
 * the capacity query, which counts pausado.
 *
 * No budget check here on purpose. The cap is a rule for self-service; the coach is
 * the human override and can park an athlete for as long as the situation needs.
 */
export async function pauseAthlete(input: PauseAthleteInput): Promise<LifecycleTransitionResult> {
  const todayIso = boxTodayIso();
  await sql.begin((tx) => applyPauseTx(tx, input, todayIso));
  // #15(billing): pause Stripe collection so a paused athlete is not charged.
  // POST-COMMIT + guarded — a Stripe failure must never break the pause.
  try {
    await pauseStripeCollection(input.athlete_id);
  } catch {
    // Swallow: the athlete is paused; billing is reconcilable by the coach.
  }
  return { status: 'pausado' };
}

/**
 * RESUME (auto-resume from pausado). Guards pausado, closes the open interval, flips
 * back to activo. The plan re-anchor is NOT done here — it is the plan-freeze agent's.
 */
export async function resumeAthlete(input: { athlete_id: bigint }): Promise<LifecycleTransitionResult> {
  const todayIso = boxTodayIso();
  await sql.begin(async (tx) => {
    const rows = await tx<{ lifecycle_status: AthleteLifecycleStatus }[]>`
      select lifecycle_status from athletes where id = ${input.athlete_id} for update
    `;
    const current = rows[0];
    if (!current) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
    if (current.lifecycle_status !== 'pausado') {
      throw new LifecycleError(
        'invalid_transition',
        `Solo se puede reanudar a un atleta pausado (estado actual: ${current.lifecycle_status})`,
        409,
      );
    }
    await closeCurrentPauseTx(tx, input.athlete_id, todayIso);
    await tx`
      update athletes set lifecycle_status = 'activo', updated_at = now()
      where id = ${input.athlete_id}
    `;
  });
  // #13(plan): re-anchor the sequence at next Monday. POST-COMMIT (it opens its own
  // transaction) and BEST-EFFORT — the resume already committed; if the re-anchor
  // hits an edge (no active sequence, cursor drift) the coach re-plans manually.
  try {
    await reanchorPlanAfterResume(input.athlete_id);
  } catch {
    // Swallow: the athlete is active; a failed re-anchor is recoverable by the coach.
  }
  // #15(billing): clear the Stripe pause so invoicing resumes. POST-COMMIT +
  // guarded — a Stripe failure must never break the resume.
  try {
    await resumeStripeCollection(input.athlete_id);
  } catch {
    // Swallow: the athlete is active; billing is reconcilable by the coach.
  }
  return { status: 'activo' };
}

/**
 * BAJA (leaves the roster). Flips to baja, records baja_at/baja_reason, closes any
 * open pause, and cancels the athlete's OWN active subscription at period end
 * (mirrors web/lib/athlete/account-deletion.ts:99-110, the billing part only).
 *
 * NOT done here — baja preserves history and is NOT an RGPD deletion (that is #19):
 *   • no users.deleted_at / email anonymization,
 *   • no account_deletion_jobs enqueue,
 *   • no history rows touched.
 * The freed plaza passes to the waitlist post-commit.
 */
export async function bajaAthlete(input: BajaAthleteInput): Promise<LifecycleTransitionResult> {
  const todayIso = boxTodayIso();
  await sql.begin(async (tx) => {
    const rows = await tx<{ lifecycle_status: AthleteLifecycleStatus; user_id: bigint }[]>`
      select lifecycle_status, user_id from athletes where id = ${input.athlete_id} for update
    `;
    const current = rows[0];
    if (!current) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
    if (current.lifecycle_status === 'baja') {
      throw new LifecycleError('invalid_transition', 'El atleta ya está de baja', 409);
    }

    // Authorship (#43): a baja is a LIFECYCLE event, not a profile edit — stamp its
    // OWN baja_by_* columns (0118) inline, next to baja_at/baja_reason, so the banner
    // shows who gave the baja WITHOUT lighting up the header's "editado por". The
    // audit trail records it too.
    const byKind = input.by_kind ?? 'coach';
    await tx`
      update athletes
      set lifecycle_status = 'baja',
          baja_at = now(),
          baja_reason = ${input.reason},
          baja_by_user_id = ${input.by_user_id ?? null},
          baja_by_kind = ${byKind},
          -- The scheduled baja has arrived (or the coach got there first): either way
          -- there is nothing left for the lifecycle cron to apply (0137).
          baja_scheduled_for = null,
          updated_at = now()
      where id = ${input.athlete_id}
    `;
    await recordAudit(tx, {
      entity_type: 'athletes',
      entity_id: input.athlete_id,
      action: 'update',
      actor: { kind: byKind, user_id: input.by_user_id ?? null },
      diff: { lifecycle_status: 'baja', reason: input.reason },
    });
    await closeCurrentPauseTx(tx, input.athlete_id, todayIso);

    // Billing: cancel at period end (do NOT cut access now). Owner-scoped, exactly
    // like account-deletion — a dobles partner's shared sub is the dobles agent's seam.
    await tx`
      update subscriptions set cancel_at_period_end = true, updated_at = now()
      where user_id = ${current.user_id}
        and status = 'active'
        and cancel_at_period_end = false
    `;
    // #13(dobles): a baja dissolves the athlete's active pair across the 3 axes
    // (training/account/billing) and notifies the surviving partner — inside the
    // baja transaction so it's atomic. The shared-subscription split is #15.
    await dissolvePairOnBaja(input.athlete_id, tx);
  });
  await releaseWaitlistToCapacity();
  // #15(billing): make the local cancel_at_period_end real in Stripe (cancel at
  // period end — access continues until the paid period elapses). POST-COMMIT +
  // guarded — a Stripe failure must never break the baja.
  try {
    await cancelStripeAtPeriodEnd(input.athlete_id);
  } catch {
    // Swallow: the athlete is baja; billing is reconcilable by the coach.
  }
  return { status: 'baja' };
}

/**
 * RE-ALTA (baja → activo). Guards baja, clears the baja fields. Recomputes capacity
 * AFTER commit (so the just-reactivated athlete counts) and returns over_capacity:
 * the caller WARNS but the transition still commits (coach override).
 *
 * // #13(billing): re-alta does NOT un-cancel the Stripe subscription. If baja set
 * cancel_at_period_end and the period has not elapsed, reactivating billing is a
 * Stripe-side concern (webhook / re-subscribe) — deliberately out of scope here.
 */
export async function reAltaAthlete(input: { athlete_id: bigint }): Promise<ReAltaResult> {
  // The plaza being re-occupied belongs to the ATHLETE's club — read it off the
  // row (not the caller) so the post-commit capacity check scores the right cap.
  let athleteCoachId: bigint | null = null;
  await sql.begin(async (tx) => {
    const rows = await tx<
      { lifecycle_status: AthleteLifecycleStatus; coach_id: bigint | null }[]
    >`
      select lifecycle_status, coach_id from athletes where id = ${input.athlete_id} for update
    `;
    const current = rows[0];
    if (!current) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
    if (current.lifecycle_status !== 'baja') {
      throw new LifecycleError(
        'invalid_transition',
        `Solo se puede dar de re-alta a un atleta de baja (estado actual: ${current.lifecycle_status})`,
        409,
      );
    }
    athleteCoachId = current.coach_id;
    await tx`
      update athletes
      set lifecycle_status = 'activo',
          baja_at = null,
          baja_reason = null,
          baja_scheduled_for = null,
          updated_at = now()
      where id = ${input.athlete_id}
    `;
  });

  // A coachless (free) athlete occupies no club plaza → no cap to exceed.
  const cap = athleteCoachId !== null ? await getCapacityState(athleteCoachId) : null;
  const over_capacity = cap !== null && cap.max !== null && cap.active > cap.max;
  return { status: 'activo', over_capacity };
}

// ── Pause requests (athlete-initiated → coach-confirmed) ──────────────────────────

/**
 * REQUEST a pause (athlete-initiated, from the app). Inserts a pending row. Rejects
 * if the athlete is already pausado / baja, or if a pending request already exists.
 * This is NOT a pause — the coach must confirm it (confirmPauseRequest).
 */
export async function requestPause(
  input: RequestPauseInput,
): Promise<{ request_id: string; status: 'pending' }> {
  return sql.begin(async (tx) => {
    const rows = await tx<{ lifecycle_status: AthleteLifecycleStatus }[]>`
      select lifecycle_status from athletes where id = ${input.athlete_id} for update
    `;
    const current = rows[0];
    if (!current) throw new LifecycleError('not_found', 'Atleta no encontrado', 404);
    if (current.lifecycle_status === 'pausado') {
      throw new LifecycleError('already_paused', 'Ya estás en pausa', 409);
    }
    if (current.lifecycle_status === 'baja') {
      throw new LifecycleError('invalid_state', 'No puedes solicitar una pausa estando de baja', 409);
    }

    const pending = await tx<{ id: string }[]>`
      select id::text as id from athlete_pause_requests
      where athlete_id = ${input.athlete_id} and status = 'pending'
      limit 1
    `;
    if (pending.length > 0) {
      throw new LifecycleError('request_exists', 'Ya tienes una solicitud de pausa pendiente', 409);
    }

    const ins = await tx<{ id: string }[]>`
      insert into athlete_pause_requests (athlete_id, reason, note)
      values (${input.athlete_id}, ${input.reason}, ${input.note ?? null})
      returning id::text as id
    `;
    return { request_id: ins[0]!.id, status: 'pending' as const };
  });
}

/**
 * CONFIRM a pending pause request (coach). Marks it confirmed and applies the pause
 * (requested_by='athlete') in the SAME transaction — either both happen or neither.
 * The pause guard still holds: if the athlete is no longer activo the whole thing
 * rolls back with invalid_transition.
 *
 * Kept for the requests already sitting in the table and for a coach who prefers to
 * be asked. The app itself no longer goes through here — an athlete pausing from the
 * app applies the pause directly (lib/athlete/lifecycle-self-service.ts).
 */
export async function confirmPauseRequest(input: {
  request_id: bigint;
  coach_id: bigint;
}): Promise<LifecycleTransitionResult> {
  const todayIso = boxTodayIso();
  let pausedAthleteId: bigint | null = null;
  const result = await sql.begin(async (tx) => {
    const reqRows = await tx<
      { athlete_id: bigint; reason: PauseReason; note: string | null; status: string }[]
    >`
      select athlete_id, reason, note, status
      from athlete_pause_requests
      where id = ${input.request_id} for update
    `;
    const req = reqRows[0];
    if (!req) throw new LifecycleError('not_found', 'Solicitud no encontrada', 404);
    if (req.status !== 'pending') {
      throw new LifecycleError('already_resolved', 'La solicitud ya fue resuelta', 409);
    }

    await tx`
      update athlete_pause_requests
      set status = 'confirmed', resolved_at = now(), resolved_by_coach_id = ${input.coach_id}
      where id = ${input.request_id}
    `;
    await applyPauseTx(
      tx,
      {
        athlete_id: req.athlete_id,
        reason: req.reason,
        note: req.note,
        end_date: null,
        requested_by: 'athlete',
        coach_id: input.coach_id,
      },
      todayIso,
    );
    pausedAthleteId = req.athlete_id;
    return { status: 'pausado' as const };
  });
  // #15(billing): confirming an athlete-requested pause reaches the SAME pausado
  // end-state as pauseAthlete, so Stripe collection must pause here too (else a
  // paused athlete keeps being charged). POST-COMMIT + guarded.
  if (pausedAthleteId != null) {
    try {
      await pauseStripeCollection(pausedAthleteId);
    } catch {
      // Swallow: the athlete is paused; billing is reconcilable by the coach.
    }
  }
  return result;
}

/** DECLINE a pending pause request (coach). No state change beyond the request row. */
export async function declinePauseRequest(input: {
  request_id: bigint;
  coach_id: bigint;
}): Promise<{ status: 'declined' }> {
  await sql.begin(async (tx) => {
    const reqRows = await tx<{ status: string }[]>`
      select status from athlete_pause_requests where id = ${input.request_id} for update
    `;
    const req = reqRows[0];
    if (!req) throw new LifecycleError('not_found', 'Solicitud no encontrada', 404);
    if (req.status !== 'pending') {
      throw new LifecycleError('already_resolved', 'La solicitud ya fue resuelta', 409);
    }
    await tx`
      update athlete_pause_requests
      set status = 'declined', resolved_at = now(), resolved_by_coach_id = ${input.coach_id}
      where id = ${input.request_id}
    `;
  });
  return { status: 'declined' };
}
