import 'server-only';

// PERSONALIZAR EL PLAN (0164) — the PRIMARY path to a personal plan: take the
// athlete's CURRENT microciclo (whatever the level×días periodización already
// gave them) and fork it into a bespoke plan for just this person, from the
// week they're living right now (or, if the coach chooses, from next week)
// onward. Nobody wants to start from zero and throw away what's already built.
//
// WHAT "FORK" MEANS, PRECISELY
// ----------------------------
//   · A REAL COPY, never a reference. New `program_month_templates` +
//     `program_week_templates` rows (via the shared `cloneWeekTemplateRow`,
//     `athlete_id` retargeted to this athlete). Editing the fork can NEVER
//     touch the library microciclo it came from — proven by
//     tests/programming/personalize-plan.db.test.ts.
//   · THE PAST IS NEVER REWRITTEN. Only weeks from the chosen start point
//     forward are copied. Whatever the athlete already executed stays exactly
//     as recorded — this function never touches `workout_executions`, and
//     `instantiateMonthFromTemplate` (called below) only ever replaces
//     assignments still in `status = 'scheduled'`.
//   · ONE SOURCE OF TRUTH FOR "TODAY": the old assignment receipt is trimmed
//     (or, if the fork replaces it entirely from week 1, closed) so the
//     athlete never has two receipts claiming the same calendar dates —
//     `camino.ts` would otherwise draw two overlapping segments, and (0166)
//     the database itself now refuses two overlapping receipts outright.
//   · DETACHES FROM THE SEQUENCE: any active `athlete_sequence_progress` row
//     flips to `status = 'detached'` — current_position/sequence_id/
//     loops_completed are PRESERVED (not deleted), so the cursor is intact for
//     "volver a la periodización" (revert-personal-plan.ts) to flip back later.
//   · The fork STAYS LIVE for the athlete immediately — the same
//     materialize-then-stagger pipeline `assignSequenceToAthlete` /
//     `reanchorPlanAfterResume` use (instantiateMonthFromTemplate is byte-for-
//     byte safe to re-run over already-scheduled days, see
//     insertSlotAssignment's dedupe/replace guard) — not the draft-first
//     `assign-draft` path, because this isn't a NEW delivery, it's a
//     continuation of what the athlete already sees.
//
// THE RACE THIS USED TO LOSE TO (0166)
// -------------------------------------
// Two clicks of "Personalizar plan" — a genuine double-click, or one slow
// request the coach gave up on and retried minutes later — used to both read
// "is this athlete already personal?" BEFORE either had written anything, so
// both passed the guard and both forked (verified in production: athlete 64,
// two full personal forks of the same source, same exact date window). The fix
// is NOT "debounce the button" (that only hides the symptom) — it's making the
// guard-check-then-fork sequence ATOMIC: everything from the read of "what's
// current" through the fork write now happens inside ONE transaction, opened
// with a per-athlete advisory lock as its FIRST statement (same pattern as
// `web/lib/citas/store.ts`'s per-slot booking lock). A second concurrent call
// blocks on the lock until the first COMMITS, then re-reads fresh state under
// the lock and correctly sees "already_personal" — no duplicate fork, no
// orphaned garbage. The database-level backstop (0166's exclude constraint,
// caught generically in `instantiateMonthFromTemplate`) still covers the rarer
// cross-flow case this lock doesn't reach (e.g. a concurrent assign-month on
// the very same athlete) — see that file's comment.

import type { Sql } from '@/lib/db';
import { sql as defaultSql, withOwnOrAmbientTx } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { getCurrentMicrociclo } from '@fahybrid/shared/domain/coach/current-microciclo';
import { cloneWeekTemplateRow } from '@fahybrid/shared/domain/coach/program-months';
import {
  instantiateMonthFromTemplate,
  InstantiateProgramError,
  type InstantiateMonthResult,
} from './instantiate-program';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import { recordAudit, type Actor, type AuditChannel } from '@/lib/audit/record-edit';

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

/**
 * When the personal plan takes effect. Personalize forks from where the
 * athlete IS right now, not a fresh delivery — so unlike assign-month/
 * assign-sequence (a real date picker, see AsignarAtletaModal /
 * ActivarPlanPersonalModal) the only two choices that make sense are "now" or
 * "let this week finish on the standard plan first": `'current_week'`
 * (default, unchanged historical behaviour) or `'next_week'`.
 */
export type PersonalizeStartChoice = 'current_week' | 'next_week';

export type PersonalizePlanResult = {
  month_template_id: string;
  /** Name the fork was given ("«Base building» (personalizado)"). */
  name: string;
  /** How many weeks were copied (chosen start week through the end of the source). */
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

type ForkOutcome = {
  newMonthId: string;
  forkName: string;
  forkStartMonday: string;
  weeksToForkCount: number;
  forkedFromWeek: number;
  sourceMonthId: number;
  sourceName: string;
  sequenceDetached: boolean;
  oldAssignmentOutcome: 'trimmed' | 'closed';
};

export async function personalizePlanForAthlete(params: {
  coach_id: number | bigint;
  athlete_id: number;
  start?: PersonalizeStartChoice;
  /** Quién ejecuta el fork — entra en la fila de auditoría (audit_log). */
  actor: Actor;
  /** Superficie de origen de la escritura (0165). Omitido = panel del coach. */
  channel?: AuditChannel;
  client?: Sql;
}): Promise<PersonalizePlanResult> {
  const client = params.client ?? defaultSql;
  const coach_id = Number(params.coach_id);
  const athlete_id = Number(params.athlete_id);
  const startChoice: PersonalizeStartChoice = params.start ?? 'current_week';

  const owned = await client<Array<{ id: string }>>`
    select id::text from athletes where id = ${athlete_id} and coach_id = ${coach_id} limit 1
  `;
  if (!owned[0]) {
    throw new PersonalizePlanError('not_found', 'Atleta no encontrado', 404);
  }

  // ── Guard + fork, ATOMIC (0166) ─────────────────────────────────────────
  // The advisory lock key is namespaced via hashtext() so it can never collide
  // with an unrelated domain's lock keyed by a small integer (e.g. citas/
  // store.ts's per-slot lock, keyed by raw epoch ms — a different value range
  // entirely, but namespacing costs nothing and documents the intent).
  const outcome: ForkOutcome = await withOwnOrAmbientTx(client, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('athlete_plan_mutation'), ${athlete_id}::int)`;

    // Re-read FRESH now that we hold the lock — this is what closes the race:
    // a concurrent call that committed its fork while we waited is now visible.
    // Cast: getCurrentMicrociclo's `client` param is typed against the raw
    // `postgres` package's `Sql`, while `tx` here is `@/lib/db`'s transaction
    // client — the same runtime shape, different type identity. Deriving the
    // cast target from the function signature itself (rather than naming a
    // type) keeps this correct even if that import ever changes.
    const current = await getCurrentMicrociclo({
      athlete_id,
      client: tx as unknown as Parameters<typeof getCurrentMicrociclo>[0]['client'],
    });
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
      tx<Array<{ name: string }>>`
        select name from program_month_templates
        where id = ${sourceMonthId} and coach_id = ${coach_id}
        limit 1
      `,
      tx<SourceWeekRow[]>`
        select mw.position, mw.week_template_id::text
        from program_month_weeks mw
        where mw.month_template_id = ${sourceMonthId}
        order by mw.position asc
      `,
      tx<OldAssignmentRow[]>`
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

    // 0-based cutoff into the SOURCE template's weeks. 'current_week' (default)
    // forks from the week the athlete is living right now — the historical
    // behaviour. 'next_week' leaves the current week on the standard plan and
    // forks from the one after (one position further in).
    const fromPosition =
      startChoice === 'next_week' ? current.week_index : current.week_index - 1;

    if (startChoice === 'next_week' && fromPosition >= sourceWeeks.length) {
      // The athlete is already in the LAST week of the source microciclo —
      // there is no "next week" left inside it to fork from. Distinct, honest
      // message: this is not a data mismatch (the generic nothing_to_copy
      // below), it's simply the end of the road for this particular choice.
      throw new PersonalizePlanError(
        'next_week_unavailable',
        `«${src.name}» termina esta semana — no hay una semana siguiente que personalizar. Elige "esta semana" en su lugar.`,
        409,
      );
    }

    const weeksToFork = sourceWeeks.filter((w) => w.position >= fromPosition);
    if (weeksToFork.length === 0) {
      throw new PersonalizePlanError(
        'nothing_to_copy',
        'No hay semanas que copiar desde la semana elegida — el microciclo no coincide con lo asignado.',
        409,
      );
    }

    const forkStartMonday =
      startChoice === 'next_week'
        ? isoDateString(addDays(parseIsoDate(current.week_start), 7))
        : current.week_start;

    const forkName = `${src.name} (personalizado)`;
    // Weeks strictly BEFORE the fork point stay on the OLD receipt; keepIds is
    // exactly `fromPosition` long by construction (microcycle_ids is 1:1 with
    // materialized weeks — the same array getCurrentMicrociclo derives week_count
    // from).
    const keepIds = oldAssignment.microcycle_ids.slice(0, fromPosition).map(Number);

    const monthRows = await tx<Array<{ id: string }>>`
      insert into program_month_templates (coach_id, name, athlete_id, personalized_from_id)
      values (${coach_id}, ${forkName}, ${athlete_id}, ${sourceMonthId})
      returning id::text
    `;
    const newMonthId = monthRows[0]!.id;

    for (let i = 0; i < weeksToFork.length; i++) {
      const clonedWeekId = await cloneWeekTemplateRow({
        tx: tx as unknown as Parameters<typeof cloneWeekTemplateRow>[0]['tx'],
        coach_id,
        week_id: Number(weeksToFork[i]!.week_template_id),
        athleteIdOverride: athlete_id,
      });
      await tx`
        insert into program_month_weeks (month_template_id, week_template_id, position)
        values (${Number(newMonthId)}, ${Number(clonedWeekId)}, ${i})
      `;
    }

    let oldAssignmentOutcome: 'trimmed' | 'closed';
    if (keepIds.length === 0) {
      // The fork replaces the OLD receipt in full (personalized from its very
      // first remaining week) — close it rather than leave a zero-week/negative-
      // window row. The library microciclo it pointed at is UNTOUCHED; only this
      // athlete's receipt of it goes away, which is exactly what "personalizado
      // desde ahora" means.
      await tx`delete from athlete_month_assignments where id = ${Number(oldAssignment.id)}`;
      oldAssignmentOutcome = 'closed';
      // Deleting the athlete's only assignment row would make a later re-read see
      // "no prior plans" — instantiateMonthFromTemplate's #34 first-plan check is
      // independently guarded (it only ever injects a calibration battery when the
      // athlete has literally zero calibration_test_id assignments EVER, regardless
      // of assignment-row count), so this is safe: see instantiate-program.ts.
    } else {
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
      oldAssignmentOutcome = 'trimmed';
    }

    const detachRows = await tx<Array<{ id: string }>>`
      update athlete_sequence_progress
      set status = 'detached', updated_at = now()
      where athlete_id = ${athlete_id} and status = 'active'
      returning id::text
    `;

    await tx`
      update athletes
      set plan_mode = 'personal', updated_at = now()
      where id = ${athlete_id}
    `;

    // Auditoría (0114/0165) DENTRO de esta misma transacción: si el fork se
    // deshace, su rastro se deshace con él — nunca un registro que sobreviva a
    // un rollback. entity_id es el mes NUEVO (lo que se está creando); el diff
    // recoge lo suficiente para reconstruir el fork sin volver a leer la app:
    // de dónde viene, desde qué semana, y qué pasó con el recibo viejo.
    await recordAudit(tx, {
      entity_type: 'program_month_templates',
      entity_id: BigInt(newMonthId),
      action: 'create',
      actor: params.actor,
      ...(params.channel ? { channel: params.channel } : {}),
      diff: {
        athlete_id,
        coach_id,
        name: forkName,
        start_choice: startChoice,
        start_date: forkStartMonday,
        week_count: weeksToFork.length,
        forked_from_week: fromPosition + 1,
        source_month_template_id: sourceMonthId,
        source_name: src.name,
        old_assignment: {
          id: Number(oldAssignment.id),
          start_date_before: oldAssignment.start_date,
          outcome: oldAssignmentOutcome,
        },
        sequence_detached: detachRows.length > 0,
      },
    });

    return {
      newMonthId,
      forkName,
      forkStartMonday,
      weeksToForkCount: weeksToFork.length,
      forkedFromWeek: fromPosition + 1,
      sourceMonthId,
      sourceName: src.name,
      sequenceDetached: detachRows.length > 0,
      oldAssignmentOutcome,
    };
  });

  // Outside the tx (instantiateMonthFromTemplate opens its own — the same
  // constraint documented in assign-sequence.ts / athlete-lifecycle-plan.ts: a
  // postgres.js tx object exposes `.savepoint`, not `.begin`). This is the ONE
  // remaining unlocked window — see the top-of-file comment: closed for the
  // realistic double-click race by the lock above, backstopped for the rarer
  // cross-flow race by 0166's exclude constraint (translated to a clean error
  // here exactly like every other materialize caller).
  let materialization: InstantiateMonthResult;
  try {
    materialization = await instantiateMonthFromTemplate({
      coach_id,
      athlete_id,
      month_template_id: Number(outcome.newMonthId),
      start_date: outcome.forkStartMonday,
      client,
    });
  } catch (err) {
    if (err instanceof InstantiateProgramError) {
      throw new PersonalizePlanError(err.code, err.message, err.status);
    }
    throw err;
  }
  await markFutureWeeksDraft({
    coach_id,
    athlete_id,
    start_date: materialization.start_date,
    week_count: materialization.microcycle_ids.length,
    client,
  });

  return {
    month_template_id: outcome.newMonthId,
    name: outcome.forkName,
    week_count: outcome.weeksToForkCount,
    forked_from_week: outcome.forkedFromWeek,
    source_month_template_id: outcome.sourceMonthId.toString(),
    source_name: outcome.sourceName,
    sequence_detached: outcome.sequenceDetached,
    old_assignment: outcome.oldAssignmentOutcome,
    materialization,
  };
}
