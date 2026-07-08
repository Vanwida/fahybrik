// Coach capacity (#18). Single-coach launch: there is exactly ONE coach row, so nothing
// here is scoped by coach_id — same shape as lib/citas/store.ts and coach_availability.
// The cap lives on coaches.max_athletes (migration 0102); null = no limit (waitlist off).
//
// "Active athletes" = distinct HUMANS with an active subscription right now. A dobles pair
// shares ONE subscription (user_id + partner_user_id both point at real athletes), so it
// counts as 2 humans toward the cap — the real coaching load, which is what the cap caps.

import { sql } from '@/lib/db';

// multi-coach TODO: when the product goes multi-coach, scope every query here by coach_id
// (athletes.coach_id → subscriptions) and drop the "order by id limit 1" single-coach pick.

export interface CapacityState {
  /** Distinct athletes (humans) with an ACTIVE subscription right now. A dobles pair = 2. */
  active: number;
  /** The coach's cap, or null when uncapped (waitlist disabled). */
  max: number | null;
  /** true when capped AND at/over the cap → new leads go on the waitlist. */
  full: boolean;
  /** Remaining plazas, or null when uncapped. Never negative. */
  slots_available: number | null;
}

/** Read the live capacity: how many active athletes vs the single coach's cap. */
export async function getCapacityState(): Promise<CapacityState> {
  const [activeRows, maxRows] = await Promise.all([
    sql<{ n: number }[]>`
      select count(distinct a.id)::int as n
      from athletes a
      join subscriptions s on (s.user_id = a.user_id or s.partner_user_id = a.user_id)
      where s.status = 'active'
    `,
    sql<{ max_athletes: number | null }[]>`
      select max_athletes from coaches order by id limit 1
    `,
  ]);
  const active = activeRows[0]?.n ?? 0;
  const max = maxRows[0]?.max_athletes ?? null;
  const full = max !== null && active >= max;
  const slots_available = max === null ? null : Math.max(0, max - active);
  return { active, max, full, slots_available };
}

/** The single coach's cap (coaches.max_athletes). null = no limit. Backs the Disponibilidad cupo field. */
export async function getMaxAthletes(): Promise<number | null> {
  const rows = await sql<{ max_athletes: number | null }[]>`
    select max_athletes from coaches order by id limit 1
  `;
  return rows[0]?.max_athletes ?? null;
}

/**
 * Set the single coach's cap. The CALLER must Zod-validate `value` (integer >= 0, or null
 * to remove the limit) before calling — the Disponibilidad page passes the validated cupo
 * field straight through here.
 */
export async function setMaxAthletes(value: number | null): Promise<void> {
  await sql`
    update coaches set max_athletes = ${value}, updated_at = now()
    where id = (select id from coaches order by id limit 1)
  `;
}
