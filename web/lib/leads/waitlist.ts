// Lead waitlist store (#18). When the coach is at capacity (lib/coach/capacity.ts), a lead
// that finishes onboarding is stamped `waitlisted_at` (FIFO order) instead of booking a call.
// The coach later MANUALLY releases a plaza (stamps `waitlist_released_at` + the lead is
// emailed the booking link). Everything is keyed off the two stamps on `leads` (migration
// 0102); no per-coach scoping (single-coach launch).
//
// All writes are idempotent so a replayed onboarding-complete / double-click never
// double-stamps or double-emails.

import { sql, type Sql, type TransactionClient } from '@/lib/db';

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
 * a lead_nurture_log claim in the route. `lead` is null only when the lead was never
 * waitlisted (nothing to release).
 *
 * // #13 hook: an athlete baja can call this to open the freed plaza to the next in line.
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
