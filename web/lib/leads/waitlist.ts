// Lead waitlist store (#18). When the funnel's club is at capacity (lib/coach/capacity.ts),
// a lead that finishes onboarding is stamped `waitlisted_at` (FIFO order) instead of booking
// a call. The coach later MANUALLY releases a plaza (stamps `waitlist_released_at` + the lead
// is emailed the booking link). Everything is keyed off the two stamps on `leads` (migration
// 0102); leads have no per-club scoping until obra 3 — the whole queue belongs to the funnel
// club (lib/leads/funnel-coach.ts).
//
// All writes are idempotent so a replayed onboarding-complete / double-click never
// double-stamps or double-emails.

import { sql, type Sql, type TransactionClient } from '@/lib/db';
import { getCapacityState } from '@/lib/coach/capacity';
import { coachIdForLead, coachNameForLead, funnelCoachId } from './funnel-coach';
import { sendWaitlistReleasedEmail } from './waitlist-email';
import { WAITLIST_RELEASED_TOUCH } from '@fahybrid/shared/domain/leads/nurture';

// Only leads STILL in the top of the pipeline can sit on the waitlist: once the coach
// advances them (agendado) or archives them (convertido/descartado) they leave the list.
// The `status in ('nuevo', 'contactado')` literal below IS this rule (inlined, as elsewhere
// in the leads layer, so the enum comparison stays a plain literal — no bind-param cast).

/** A row's two waitlist stamps — the minimal shape the gate reads (pure, no I/O). */
export interface WaitlistStamps {
  waitlisted_at: Date | string | null;
  waitlist_released_at: Date | string | null;
}

/** A lead is blocking-waitlisted when it's on the list AND the coach hasn't released it. */
export function isRowWaitlisted(row: WaitlistStamps): boolean {
  return row.waitlisted_at != null && row.waitlist_released_at == null;
}

/** One row of the coach's waitlist view — contact + FIFO position + release state. */
export interface WaitlistEntry {
  lead_id: string;
  nombre: string | null;
  email: string;
  objetivo: string | null;
  nivel: string | null;
  ubicacion: string | null;
  waitlisted_at: string; // ISO
  released_at: string | null; // ISO — set once the coach opened a plaza for them
  position: number; // 1-based FIFO rank within the list
}

/** The lead fields the release email needs (returned by joinWaitlist/releaseWaitlistLead). */
export interface WaitlistLeadContact {
  email: string;
  nombre: string | null;
  unsubscribe_token: string;
}

export interface JoinWaitlistResult extends WaitlistLeadContact {
  /** true only when THIS call stamped waitlisted_at (the lead was not already on the list). */
  joined: boolean;
}

/**
 * Put a lead on the waitlist — idempotent. Stamps `waitlisted_at = now()` only if it is
 * null (never re-stamps, so the FIFO position is stable). Always returns the lead's contact
 * fields (whether or not it stamped now) so the caller can send the "joined" email even on a
 * replayed onboarding-complete. Returns null only when the lead id does not exist.
 *
 * A data-modifying CTE does the stamp; the outer select reads the (unchanged) contact + a
 * flag for whether the stamp happened this call. Accepts a `tx` so it can run inside the
 * onboarding-complete transaction.
 */
export async function joinWaitlist(
  leadId: string | number | bigint,
  client: Sql | TransactionClient = sql,
): Promise<JoinWaitlistResult | null> {
  const rows = await client<
    { joined: boolean; email: string; nombre: string | null; unsubscribe_token: string }[]
  >`
    with upd as (
      update leads set waitlisted_at = now(), updated_at = now()
       where id = ${Number(leadId)} and waitlisted_at is null
      returning id
    )
    select l.email, l.nombre, l.unsubscribe_token, exists (select 1 from upd) as joined
    from leads l
    where l.id = ${Number(leadId)}
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * The coach's waitlist: every lead on the list that is still in the top of the pipeline
 * (nuevo/contactado), oldest first, with a 1-based FIFO `position`. Released leads stay
 * listed (their `released_at` is populated) so the coach can see who has already been let
 * through vs who is still waiting.
 */
export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const rows = await sql<
    {
      lead_id: string;
      nombre: string | null;
      email: string;
      objetivo: string | null;
      nivel: string | null;
      ubicacion: string | null;
      waitlisted_at: Date;
      waitlist_released_at: Date | null;
      position: number;
    }[]
  >`
    select id::text as lead_id, nombre, email, objetivo, nivel, ubicacion,
           waitlisted_at, waitlist_released_at,
           (row_number() over (order by waitlisted_at asc))::int as position
    from leads
    where waitlisted_at is not null
      and status in ('nuevo', 'contactado')
    order by waitlisted_at asc
  `;
  return rows.map((r) => ({
    lead_id: r.lead_id,
    nombre: r.nombre,
    email: r.email,
    objetivo: r.objetivo,
    nivel: r.nivel,
    ubicacion: r.ubicacion,
    waitlisted_at: r.waitlisted_at.toISOString(),
    released_at: r.waitlist_released_at ? r.waitlist_released_at.toISOString() : null,
    position: r.position,
  }));
}

/**
 * The actively-waiting count — leads on the list, NOT yet released, still nuevo/contactado.
 * Feeds the dashboard "en espera" badge and the onboarding-complete waitlist position.
 */
export async function countWaitlist(): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n from leads
    where waitlisted_at is not null
      and waitlist_released_at is null
      and status in ('nuevo', 'contactado')
  `;
  return rows[0]?.n ?? 0;
}

export interface ReleasedLead extends WaitlistLeadContact {
  /** Opaque booking token for the /es/cita/<token> link in the release email. */
  token: string;
}

/**
 * MANUALLY release a plaza to a waitlisted lead (the coach action). Stamps
 * `waitlist_released_at = now()` only if the lead is on the list and not already released
 * (idempotent). Returns the lead's booking token + contact so the route can email the
 * booking link; `released` is true only when THIS call did the stamping.
 *
 * The lead contact is returned whenever the lead is on the waitlist (even if already
 * released) so a retry after a failed email can re-send — the email itself is de-duped via
 * a lead_nurture_log claim (see releaseAndNotifyLead). `lead` is null only when the lead was
 * never waitlisted (nothing to release).
 *
 * This is the low-level STAMP only. The full stamp+notify path both triggers use is
 * releaseAndNotifyLead; the recompute-based auto FIFO release is releaseWaitlistToCapacity.
 */
export async function releaseWaitlistLead(
  leadId: string | number | bigint,
): Promise<{ released: boolean; lead: ReleasedLead | null }> {
  const rows = await sql<
    { released: boolean; token: string; email: string; nombre: string | null; unsubscribe_token: string }[]
  >`
    with upd as (
      update leads set waitlist_released_at = now(), updated_at = now()
       where id = ${Number(leadId)}
         and waitlisted_at is not null
         and waitlist_released_at is null
      returning id
    )
    select l.token, l.email, l.nombre, l.unsubscribe_token, exists (select 1 from upd) as released
    from leads l
    where l.id = ${Number(leadId)} and l.waitlisted_at is not null
    limit 1
  `;
  const row = rows[0];
  if (!row) return { released: false, lead: null };
  return {
    released: row.released,
    lead: { token: row.token, email: row.email, nombre: row.nombre, unsubscribe_token: row.unsubscribe_token },
  };
}

/** Outcome of the shared release+notify path — consumed by the manual override route (mapped
 *  to HTTP) and the auto FIFO release (counts newly-opened plazas). */
export interface ReleaseAndNotifyResult {
  /** false only when the lead was never on the waitlist → nothing to release. */
  found: boolean;
  /** true when THIS call stamped waitlist_released_at (false if it was already released). */
  released: boolean;
  /** true when the release email is owed→sent (now, or already sent on a prior release). */
  emailed: boolean;
}

/**
 * The FULL release+notify path shared by the manual coach override (the release-waitlist route)
 * and the automatic FIFO release (releaseWaitlistToCapacity, below) — one source, no duplication:
 *   1. stamp waitlist_released_at via releaseWaitlistLead (idempotent; the plaza stays open even
 *      if the email fails — durable release),
 *   2. claim-before-send the "se ha liberado una plaza" email using lead_nurture_log's UNIQUE
 *      (lead_id, 'waitlist_released') as the idempotency key, so a replay / concurrent run never
 *      double-emails; a failed send DELETES the claim so the next attempt re-sends.
 * Safe to call repeatedly on the same lead.
 */
export async function releaseAndNotifyLead(
  leadId: string | number | bigint,
): Promise<ReleaseAndNotifyResult> {
  const { released, lead } = await releaseWaitlistLead(leadId);
  if (!lead) return { found: false, released: false, emailed: false };

  // Claim-before-send: only the run that WINS the insert sends; a lost claim ⇒ already emailed.
  const claim = await sql<{ id: string }[]>`
    insert into lead_nurture_log (lead_id, touch_type)
    values (${Number(leadId)}, ${WAITLIST_RELEASED_TOUCH})
    on conflict (lead_id, touch_type) do nothing
    returning id::text as id
  `;
  if (claim.length === 0) return { found: true, released, emailed: true };

  const emailRes = await sendWaitlistReleasedEmail({
    email: lead.email,
    nombre: lead.nombre,
    cita_token: lead.token,
    unsubscribe_token: lead.unsubscribe_token,
    coach_name: await coachNameForLead(sql, BigInt(leadId)),
    coach_id: (await coachIdForLead(sql, BigInt(leadId)))?.toString() ?? null,
  });

  if (!emailRes.sent) {
    // Keep the release stamped; drop the claim so a retry re-sends.
    await sql`delete from lead_nurture_log where id = ${Number(claim[0]!.id)}`;
    return { found: true, released, emailed: false };
  }

  return { found: true, released, emailed: true };
}

/**
 * AUTOMATIC FIFO release (#18 hybrid): open exactly as many plazas as are genuinely free and
 * notify the oldest waiting leads in arrival order. Recompute-based, so it is idempotent and
 * safe to run repeatedly — a plaza already opened to a not-yet-booked lead HOLDS its slot, so
 * we never over-release.
 *
 *   available = max_athletes − active − released_pending
 *     • max_athletes    the single coach's cap (null ⇒ uncapped ⇒ waitlist off ⇒ release nothing)
 *     • active          distinct athletes with an active subscription (getCapacityState — DRY,
 *                        the exact same active-count query the capacity gate uses)
 *     • released_pending leads already handed a plaza but not yet booked/converted (still
 *                        nuevo/contactado with waitlist_released_at set) — they still hold a slot
 *
 * When available > 0, release the `available` oldest actively-waiting leads (waitlisted, not yet
 * released, still nuevo/contactado) via the shared releaseAndNotifyLead path — the same one the
 * manual button uses. The manual "Liberar plaza" override still jumps the queue on top of this.
 *
 * // #13 hook: an athlete baja/pausa (#13, not yet built) calls this on deactivation to pass the
 * freed plaza to the next in line. It also runs on a cupo increase (api/coach/capacity) and daily
 * (api/cron/nurture) as a safety net for slots freed by any other means.
 */
export async function releaseWaitlistToCapacity(): Promise<{ released: number }> {
  // Leads have no club column yet, so the waitlist is the FUNNEL club's queue and
  // it is measured against THAT club's cap (see lib/leads/funnel-coach.ts).
  const coachId = await funnelCoachId();
  if (coachId === null) return { released: 0 }; // no club yet → no cap → nothing to release

  const [{ active, max }, pendingRows] = await Promise.all([
    getCapacityState(coachId),
    sql<{ n: number }[]>`
      select count(*)::int as n from leads
      where waitlist_released_at is not null
        and status in ('nuevo', 'contactado')
    `,
  ]);
  if (max === null) return { released: 0 }; // uncapped → waitlist disabled → nothing to release

  const releasedPending = pendingRows[0]?.n ?? 0;
  const available = max - active - releasedPending;
  if (available <= 0) return { released: 0 };

  // Oldest actively-waiting leads first (FIFO), capped at the free-slot count.
  const waiting = await sql<{ id: string }[]>`
    select id::text as id from leads
    where waitlisted_at is not null
      and waitlist_released_at is null
      and status in ('nuevo', 'contactado')
    order by waitlisted_at asc
    limit ${available}
  `;

  let released = 0;
  for (const row of waiting) {
    // Sequential: sending is a per-lead network call and the batch is tiny (bounded by the free
    // plazas). `available` is computed once up-front, so releasing here never over-opens.
    const r = await releaseAndNotifyLead(Number(row.id));
    if (r.released) released += 1;
  }
  return { released };
}

/**
 * Whether a lead is blocking-waitlisted (on the list, not released) — blocks booking until
 * released. Accepts either a lead id (reads the stamps) or an already-loaded row's stamps
 * (pure, no query). Missing lead → false.
 */
export async function isLeadWaitlisted(lead: string | number | bigint | WaitlistStamps): Promise<boolean> {
  if (typeof lead === 'object') return isRowWaitlisted(lead);
  const rows = await sql<WaitlistStamps[]>`
    select waitlisted_at, waitlist_released_at from leads where id = ${Number(lead)} limit 1
  `;
  const row = rows[0];
  return row ? isRowWaitlisted(row) : false;
}
