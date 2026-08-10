import 'server-only';

// PERSONALIZAR EL PLAN (0164) — the PRIMARY path to a personal plan: take the
// athlete's CURRENT microciclo (whatever the level×días periodización already
// gave them) and fork it into a bespoke plan for just this person, from the
// week they're living right now onward. Nobody wants to start from zero and
// throw away what's already built.
//
// WHAT "FORK" MEANS, PRECISELY
// ----------------------------
//   · A REAL COPY, never a reference. New `program_month_templates` +
//     `program_week_templates` rows (via the shared `cloneWeekTemplateRow`,
//     `athlete_id` retargeted to this athlete). Editing the fork can NEVER
//     touch the library microciclo it came from — proven by
//     tests/programming/personalize-plan.db.test.ts.
//   · THE PAST IS NEVER REWRITTEN. Only weeks from the athlete's CURRENT week
//     forward are copied (`getCurrentMicrociclo().week_index`). Whatever they
//     already executed stays exactly as recorded — this function never touches
//     `workout_executions`, and `instantiateMonthFromTemplate` (called below)
//     only ever replaces assignments still in `status = 'scheduled'`.
//   · ONE SOURCE OF TRUTH FOR "TODAY": the old assignment receipt is trimmed
//     (or, if the fork replaces it entirely from week 1, closed) so the
//     athlete never has two receipts claiming the same calendar dates —
//     `camino.ts` would otherwise draw two overlapping segments.
//   · DETACHES FROM THE SEQUENCE: any active `athlete_sequence_progress` row
//     flips to `status = 'detached'` — current_position/sequence_id/
//     loops_completed are PRESERVED (not deleted), so the cursor is intact if
//     a future "volver a la periodización" ever flips it back to 'active'.
//   · The fork STAYS LIVE for the athlete immediately — the same
//     materialize-then-stagger pipeline `assignSequenceToAthlete` /
//     `reanchorPlanAfterResume` use (instantiateMonthFromTemplate is byte-for-
//     byte safe to re-run over already-scheduled days, see
//     insertSlotAssignment's dedupe/replace guard) — not the draft-first
//     `assign-draft` path, because this isn't a NEW delivery, it's a
//     continuation of what the athlete already sees.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { cloneWeekTemplateRow } from '@fahybrid/shared/domain/coach/program-months';
import {
  instantiateMonthFromTemplate,
  type InstantiateMonthResult,
} from './instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';

export class PersonalizePlanError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'PersonalizePlanError';
  }
}

export type PersonalizePlanResult = {
  month_template_id: string;
  /** Name the fork was given ("«Base building» (personalizado)"). */
  name: string;
  /** How many weeks were copied (current week through the end of the source). */
  week_count: number;
  /** 1-based week of the SOURCE microciclo the fork starts at. */
  forked_from_week: number;
  source_month_template_id: string;
  source_name: string;
  /** Whether an active sequence enrollment was detached by this call. */
  sequence_detached: boolean;
  /** What happened to the athlete's PREVIOUS assignment receipt: trimmed to end
   *  right before the fork (still points at the library source, so nothing about
   *  it was destroyed), or closed (the fork replaced it in full, from week 1). */
  old_assignment: 'trimmed' | 'closed';
  materialization: InstantiateMonthResult;
};

type SourceWeekRow = { position: number; week_template_id: string };
type OldAssignmentRow = { id: string; start_date: string; microcycle_ids: string[] };

export async function personalizePlanForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number;
  client?: Sql;
}): Promise<PersonalizePlanResult> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  if (!owned[0]) {
    throw new PersonalizePlanError('not_found', 'Atleta no encontrado', 404);
  }

  const current = await getCurrentMicrociclo({ athlete_id, client });
  if (!current) {
    throw new PersonalizePlanError(
      'no_active_plan',
      'Este atleta no tiene un plan activo ahora mismo — no hay nada que personalizar.',
      409,
    );
  }
  if (current.template_athlete_id != null) {
    throw new PersonalizePlanError(
      'already_personal',
      'El plan actual de este atleta ya es un plan personal.',
      409,
    );
  }

  const sourceMonthId = Number(current.month_template_id);

  const [srcRows, sourceWeeks, oldAssignmentRows] = await Promise.all([
    client<Array<{ name: string }>>`
      select name from program_month_templates
      where id = ${sourceMonthId} and coach_id = ${coach_id}
      limit 1
    `,
    client<SourceWeekRow[]>`
      select mw.position, mw.week_template_id::text
      from program_month_weeks mw
      where mw.month_template_id = ${sourceMonthId}
      order by mw.position asc
    `,
    client<OldAssignmentRow[]>`
      select id::text, to_char(start_date, 'YYYY-MM-DD') as start_date, microcycle_ids
      from athlete_month_assignments
      where id = ${Number(current.assignment_id)}
      limit 1
    `,
  ]);
  const src = srcRows[0];
  const oldAssignment = oldAssignmentRows[0];
  if (!src || !oldAssignment) {
    throw new PersonalizePlanError('not_found', 'Microciclo no encontrado', 404);
  }

  // 0-based: the week the athlete is living right now. Sliced against the
  // TEMPLATE's actual weeks (which can, rarely, have drifted in count from what
  // was materialized if the coach edited the microciclo after assigning it) — if
  // that leaves nothing to copy, fail loudly rather than build a 0-week fork.
  const fromPosition = current.week_index - 1;
  const weeksToFork = sourceWeeks.filter((w) => w.position >= fromPosition);
  if (weeksToFork.length === 0) {
    throw new PersonalizePlanError(
      'nothing_to_copy',
      'No hay semanas que copiar desde la semana actual — el microciclo no coincide con lo asignado.',
      409,
    );
  }

  const forkName = `${src.name} (personalizado)`;
  // Weeks strictly BEFORE the fork point stay on the OLD receipt; keepIds is
  // exactly `fromPosition` long by construction (microcycle_ids is 1:1 with
  // materialized weeks — the same array getCurrentMicrociclo derives week_count
  // from).
  const keepIds = oldAssignment.microcycle_ids.slice(0, fromPosition).map(Number);

  let newMonthId = '';
  let sequenceDetached = false;

  await client.begin(async (tx) => {
    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, athlete_id, personalized_from_id)
      values (${coach_id}, ${forkName}, ${athlete_id}, ${sourceMonthId})
      returning id::text
    `;
    newMonthId = monthRows[0]!.id;

    for (let i = 0; i < weeksToFork.length; i++) {
      const clonedWeekId = await cloneWeekTemplateRow({
        tx,
        coach_id,
        week_id: Number(weeksToFork[i]!.week_template_id),
        athleteIdOverride: athlete_id,
      });
      await tx`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${Number(newMonthId)}, ${Number(clonedWeekId)}, ${i})
      `;
    }

    if (keepIds.length === 0) {
      // The fork replaces the OLD receipt in full (personalized from week 1) —
      // close it rather than leave a zero-week/negative-window row. The library
      // microciclo it pointed at is UNTOUCHED; only this athlete's receipt of it
      // goes away, which is exactly what "personalizado desde ahora" means.
      await tx`delete from athlete_month_assignments where id = ${Number(oldAssignment.id)}`;
      // Deleting the athlete's only assignment row would make a later re-read see
      // "no prior plans" — instantiateMonthFromTemplate's #34 first-plan check is
      // independently guarded (it only ever injects a calibration battery when the
      // athlete has literally zero calibration_test_id assignments EVER, regardless
      // of assignment-row count), so this is safe: see instantiate-program.ts.
    } else {
      const forkStartMonday = current!.week_start;
      const newEnd = isoDateString(addDays(parseIsoDate(forkStartMonday), -1));
      const countRows = await tx<Array<{ n: number }>>`
        select count(*)::int as n from workout_assignments
        where microcycle_id = any(${keepIds}::bigint[])
      `;
      await tx`
        update athlete_month_assignments
        set end_date = ${newEnd}::date,
            microcycle_ids = ${keepIds}::bigint[],
            assignment_count = ${countRows[0]?.n ?? 0}
        where id = ${Number(oldAssignment.id)}
      `;
    }

    const detachRows = await tx<Array<{ id: string }>>`
      update athlete_sequence_progress
      set status = 'detached', updated_at = now()
      where athlete_id = ${athlete_id} and status = 'active'
      returning id::text
    `;
    sequenceDetached = detachRows.length > 0;
  });

  // Outside the tx (instantiateMonthFromTemplate opens its own — the same
  // constraint documented in assign-sequence.ts / athlete-lifecycle-plan.ts: a
  // postgres.js tx object exposes `.savepoint`, not `.begin`).
  const materialization = await instantiateMonthFromTemplate({
    coach_id,
    athlete_id,
    month_template_id: Number(newMonthId),
    start_date: current.week_start,
    client,
  });
  await markFutureWeeksDraft({
    coach_id,
    athlete_id,
    start_date: materialization.start_date,
    week_count: materialization.microcycle_ids.length,
    client,
  });

  return {
    month_template_id: newMonthId,
    name: forkName,
    week_count: weeksToFork.length,
    forked_from_week: current.week_index,
    source_month_template_id: current.month_template_id.toString(),
    source_name: src.name,
    sequence_detached: sequenceDetached,
    old_assignment: keepIds.length === 0 ? 'closed' : 'trimmed',
    materialization,
  };
}
