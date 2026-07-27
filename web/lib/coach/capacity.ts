// Coach capacity (#18), scoped by club: every read/write takes the coach_id the
// caller already resolved (session, athlete row, or the funnel's club — see
// lib/leads/funnel-coach.ts). The cap lives on coaches.max_athletes (migration
// 0102); null = no limit (waitlist off).
//
// "Occupied plazas" = distinct HUMANS of THIS club holding a slot on the roster:
// an active subscription AND athletes.lifecycle_status in ('activo','pausado')
// (#13). The lifecycle gate is what frees a plaza on BAJA — a baja athlete may
// still hold an active subscription (billing cancels only at period end), so
// subscription alone would keep counting them and never open the slot.
//
// A PAUSE holds the plaza (2026-07-26, docs/DECISIONS.md). Pausing stops the billing,
// so it is capped (4 weeks per rolling year, shared/domain/coach/pause-budget.ts) and
// what the cap buys is precisely this: the slot is still there when they come back.
// Giving it away would make the promise false — the athlete would return to a full
// roster — and would push them to cancel instead of pause, which is strictly worse.
//
// A dobles pair shares ONE subscription (user_id + partner_user_id both point at real
// athletes), so it counts as 2 humans toward the cap — the real coaching load, which
// is what the cap caps.

import { sql } from '@/lib/db';

export interface CapacityState {
  /** Distinct athletes (humans) holding a plaza right now — activo + pausado. A dobles pair = 2. */
  active: number;
  /** How many of `active` are paused (plaza reserved, not being billed). */
  paused: number;
  /** The coach's cap, or null when uncapped (waitlist disabled). */
  max: number | null;
  /** true when capped AND at/over the cap → new leads go on the waitlist. */
  full: boolean;
  /** Remaining plazas, or null when uncapped. Never negative. */
  slots_available: number | null;
}

/** Read the live capacity of ONE club: its active athletes vs its cap. */
export async function getCapacityState(coach_id: number | bigint): Promise<CapacityState> {
  const [activeRows, maxRows] = await Promise.all([
    sql<{ n: number; paused: number }[]>`
      select
        count(distinct a.id)::int as n,
        count(distinct a.id) filter (where a.lifecycle_status = 'pausado')::int as paused
      from athletes a
      join subscriptions s on (s.user_id = a.user_id or s.partner_user_id = a.user_id)
      where s.status = 'active'
        and a.lifecycle_status in ('activo', 'pausado')
        and a.coach_id = ${Number(coach_id)}
    `,
    sql<{ max_athletes: number | null }[]>`
      select max_athletes from coaches where id = ${Number(coach_id)} limit 1
    `,
  ]);
  const active = activeRows[0]?.n ?? 0;
  const paused = activeRows[0]?.paused ?? 0;
  const max = maxRows[0]?.max_athletes ?? null;
  const full = max !== null && active >= max;
  const slots_available = max === null ? null : Math.max(0, max - active);
  return { active, paused, max, full, slots_available };
}

/** The club's cap (coaches.max_athletes). null = no limit. Backs the Disponibilidad cupo field. */
export async function getMaxAthletes(coach_id: number | bigint): Promise<number | null> {
  const rows = await sql<{ max_athletes: number | null }[]>`
    select max_athletes from coaches where id = ${Number(coach_id)} limit 1
  `;
  return rows[0]?.max_athletes ?? null;
}

/**
 * Set the club's cap. The CALLER must Zod-validate `value` (integer >= 0, or null
 * to remove the limit) before calling — the Disponibilidad page passes the validated cupo
 * field straight through here.
 */
export async function setMaxAthletes(
  coach_id: number | bigint,
  value: number | null,
): Promise<void> {
  await sql`
    update coaches set max_athletes = ${value}, updated_at = now()
    where id = ${Number(coach_id)}
  `;
}
