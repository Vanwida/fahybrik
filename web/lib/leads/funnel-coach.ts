import { sql as defaultSql, type Sql } from '@/lib/db';

/**
 * The club that owns the PUBLIC funnel (fahybrid.com → /empieza → leads).
 *
 * Leads carry no coach_id yet (that column lands with the business-schema work,
 * obra 3 of docs/multi-coach-plan.html), so every funnel-side capacity/waitlist
 * computation is attributed to the funnel's club — resolved HERE and only here.
 * When leads gain their tenant column this resolver dies and each lead names its
 * club.
 *
 * Resolution:
 *   1. FUNNEL_COACH_ID env (explicit config — the real club's coaches.id). Set
 *      it in the deploy env; production data holds stray dev/demo coach rows, so
 *      an implicit pick cannot name the club reliably.
 *   2. Fallback: the lowest coaches.id — EXACTLY the pick the pre-scoping code
 *      made (`order by id limit 1`), so an env without the variable behaves as
 *      it always did.
 *
 * Returns null when no club exists yet (fresh install) — callers treat that as
 * "no cap, no waitlist".
 */
export async function funnelCoachId(client: Sql = defaultSql): Promise<bigint | null> {
  const configured = process.env.FUNNEL_COACH_ID?.trim();
  if (configured && /^\d+$/.test(configured)) return BigInt(configured);

  const rows = await client<{ id: string | null }[]>`
    select min(id)::text as id from coaches
  `;
  const id = rows[0]?.id;
  return id != null ? BigInt(id) : null;
}
