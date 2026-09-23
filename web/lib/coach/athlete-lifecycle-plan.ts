// #13 — RESUME PLAN RE-ANCHOR. When a paused athlete is resumed their plan was
// frozen mid-sequence; the already-materialized workout_assignments now sit in the
// past. This re-materializes the athlete's CURRENT sequence position starting NEXT
// Monday (no elapsed days) so they pick the cycle back up cleanly.
//
// Wiring: athlete-lifecycle.ts owns the resumeAthlete transition and adds the
// one-line call to reanchorPlanAfterResume itself (this module deliberately does NOT
// import or edit that file). Everything here REUSES the existing sequence machinery
// (loadSequenceById + materializeItem) — the SAME pipeline assign-sequence.ts uses,
// so a re-anchored cycle is byte-identical to a freshly-assigned one, with the same
// weekly delivery. The sequence is loaded BY ITS ID (the enrollment's), never
// re-resolved from a level × days cell: since 0215 a group may have no such rule
// (level/days NULL), and the old cell lookup silently skipped those athletes.

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeekInBox } from '@fahybrid/shared/domain/dates';
import { loadSequenceById, materializeItem } from '@/lib/dashboard/coach/assign-sequence';

/**
 * Re-materialize the athlete's CURRENT sequence microciclo at NEXT Monday.
 *
 * Defensive + idempotent-ish:
 *   • No active `athlete_sequence_progress` row / no resolvable sequence cell / cursor
 *     past the sequence's items → NO-OP (never throws for the "no plan" case).
 *   • Already re-anchored (a receipt for this position starting >= next Monday exists)
 *     → NO-OP, so a double resume doesn't double-materialize.
 *
 * `client` MUST be a TOP-LEVEL client (the pool). instantiateMonthFromTemplate opens
 * its OWN transaction internally (`client.begin`), which a postgres.js tx object does
 * NOT expose (only `.savepoint`) — the same constraint assign-sequence.ts documents.
 * Call this POST-COMMIT of the resume transaction (like releaseWaitlistToCapacity).
 */
export async function reanchorPlanAfterResume(
  athlete_id: bigint,
  client: Sql = defaultSql,
): Promise<void> {
  // 1) The athlete's active enrollment cursor (sequence + position). None ⇒ no-op.
  const enrollments = await client<
    Array<{ sequence_id: string; coach_id: string; current_position: number }>
  >`
    select sequence_id::text as sequence_id, coach_id::text as coach_id, current_position
    from athlete_sequence_progress
    where athlete_id = ${athlete_id} and status = 'active'
    limit 1
  `;
  const enr = enrollments[0];
  if (!enr) return;

  const coachId = Number(enr.coach_id);

  // 2) The enrolled sequence itself (by id, coach-scoped) — with or without the
  //    level × days rule — to read the programa at the athlete's CURRENT position.
  const sequence = await loadSequenceById(Number(enr.sequence_id), coachId, client);
  if (!sequence || sequence.items.length === 0) return;

  const item = sequence.items.find((it) => it.position === enr.current_position) ?? null;
  if (!item) return; // cursor drifted past the items → nothing to re-anchor
  const monthTemplateId = Number(item.month_template_id);

  // 3) Start next Monday (box tz) — the "no elapsed days" discipline the initial
  //    assign + the sequence walk use (assign-sequence.ts nextMicrocicloStartDate).
  const startDate = isoDateString(addDays(mondayOfWeekInBox(new Date()), 7));

  // Idempotency-ish guard: a receipt for this position already starting at/after
  // next Monday means we re-anchored already → don't double-materialize.
  const already = await client<Array<{ n: number }>>`
    select count(*)::int as n
    from athlete_month_assignments
    where athlete_id = ${athlete_id}
      and month_template_id = ${monthTemplateId}
      and start_date >= ${startDate}::date
  `;
  if ((already[0]?.n ?? 0) > 0) return;

  // 4) Re-materialize via the shared pipeline (same delivery as assign/advance:
  //    each week opens by itself N days before it starts).
  await materializeItem({
    coachId,
    athleteId: Number(athlete_id),
    monthTemplateId,
    startDate,
    client,
  });
}
