// #13 — RESUME PLAN RE-ANCHOR. When a paused athlete is resumed their plan was
// frozen mid-sequence; the already-materialized workout_assignments now sit in the
// past. This re-materializes the athlete's CURRENT sequence position starting NEXT
// Monday (no elapsed days) so they pick the cycle back up cleanly.
//
// Wiring: athlete-lifecycle.ts owns the resumeAthlete transition and adds the
// one-line call to reanchorPlanAfterResume itself (this module deliberately does NOT
// import or edit that file). Everything here REUSES the existing sequence machinery
// (getCoachSequenceCell + instantiateMonthFromTemplate + markFutureWeeksDraft) — the
// SAME pipeline assign-sequence.ts uses, so a re-anchored cycle is byte-identical to
// a freshly-assigned one, with staggered weekly delivery (only week 1 published).

import 'server-only';
import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, mondayOfWeekInBox } from '@fahybrid/shared/domain/dates';
import { getCoachSequenceCell } from '@/lib/dashboard/coach/sequences';
import { instantiateMonthFromTemplate } from '@/lib/dashboard/coach/instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';

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

  // 2) Resolve the enrolled sequence cell (by its coach + level/days) so we can read
  //    the microciclo template at the athlete's CURRENT position.
  const meta = await client<Array<{ level_id: string; days_per_week: number }>>`
    select level_id::text as level_id, days_per_week
    from program_sequences
    where id = ${Number(enr.sequence_id)} and coach_id = ${coachId}
    limit 1
  `;
  const m = meta[0];
  if (!m) return;

  const sequence = await getCoachSequenceCell(coachId, Number(m.level_id), m.days_per_week, client);
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

  // 4) Re-materialize via the shared pipeline, then stagger future weeks (only week 1
  //    delivered; the Saturday cron unlocks the rest — same as assign/advance).
  const result = await instantiateMonthFromTemplate({
    coach_id: coachId,
    athlete_id,
    month_template_id: monthTemplateId,
    start_date: startDate,
    client,
  });
  await markFutureWeeksDraft({
    coach_id: coachId,
    athlete_id,
    start_date: result.start_date,
    week_count: result.microcycle_ids.length,
    client,
  });
}
