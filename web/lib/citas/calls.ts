// The coach's lead intro calls — the "Próximas llamadas" list and the "llamadas hoy"
// count. Scoped to the coach through the lead's owner (`leadOwnedBy`, lib/leads/owner.ts).

import { sql } from '@/lib/db';
import { leadOwnedBy } from '@/lib/leads/owner';
import type { CitaModality } from '@fahybrid/shared/schema';

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

/** Lead intro calls of THIS coach still ahead TODAY (Europe/Madrid calendar day, from now
 *  to midnight) — the "llamadas hoy" count of the Negocio badge and Hoy. #21: lead calls only
 *  (lead_id not null); athlete 1:1 reviews are a separate surface. */
export async function countCallsToday(coach_id: bigint | number, now: Date = new Date()): Promise<number> {
  const rows = await sql<{ n: number }[]>`
    select count(*)::int as n
    from appointments a join leads l on l.id = a.lead_id
    where a.status = 'aceptada'
      and a.requested_start >= ${now.toISOString()}::timestamptz
      and a.requested_start < (
        (date_trunc('day', ${now.toISOString()}::timestamptz at time zone 'Europe/Madrid') + interval '1 day')
          at time zone 'Europe/Madrid'
      )
      and ${leadOwnedBy(sql, coach_id, sql`l.coach_id`)}
  `;
  return rows[0]?.n ?? 0;
}

/** All of THIS coach's upcoming accepted lead calls, soonest first — "Próximas llamadas". */
export async function listUpcomingCalls(coach_id: bigint | number): Promise<UpcomingCall[]> {
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
      and ${leadOwnedBy(sql, coach_id, sql`l.coach_id`)}
    order by a.requested_start asc
  `;
  return rows.map((r) => ({
    ...r,
    requested_start: r.requested_start.toISOString(),
  }));
}

