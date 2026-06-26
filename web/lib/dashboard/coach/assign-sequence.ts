import 'server-only';

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import {
  addDays,
  isoDateString,
  mondayOfWeek,
  mondayOfWeekInBox,
  parseIsoDate,
  startOfDayInBox,
} from '@fahybrid/shared/domain/dates';
import type {
  ProgramSequence,
  ProgramSequenceItem,
  SequenceEndPolicy,
} from '@fahybrid/shared/schema/program-sequences';
import {
  SEQUENCE_DAYS_MIN,
  SEQUENCE_DAYS_MAX,
} from '@fahybrid/shared/schema/program-sequences';
import type { ProgressionSpec } from '@fahybrid/shared/domain/prescription';
import { getCoachSequenceCell } from './sequences';
import { markFutureWeeksDraft } from '@/lib/coach/publish-week';
import {
  instantiateMonthFromTemplate,
  InstantiateProgramError,
  type InstantiateMonthResult,
} from './instantiate-program';

// =============================================================================
// AUTO-ASSIGNMENT CORE — translate an athlete's RESOLVED sequence into REAL dated
// workout_assignments (the piece that previously faked it as "B6").
//
// Flow:
//   athlete (level_id + training_days_per_week)
//     → resolveSequenceForAthlete  → the program_sequence cell + ordered items
//     → assignSequenceToAthlete     → materialize item[position=1]'s microciclo
//                                      via the EXISTING month-instantiation pipeline
//                                      (instantiateMonthFromTemplate) + record the
//                                      enrollment cursor in athlete_sequence_progress.
//
// We REUSE instantiateMonthFromTemplate verbatim — it bootstraps the macrocycle +
// block, resolves per-week microcycles, Monday-aligns, and inserts real dated
// workout_assignments (template_id NOT NULL, status 'scheduled') the athlete reads
// via /api/athlete/plan/week. We do NOT reinvent that pipeline.
//
// AGNOSTIC: resolution is by athlete_levels.level_id + training_days_per_week →
// program_sequences cell. The ORDER of the sequence items IS the periodization.
// =============================================================================

export class AssignSequenceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AssignSequenceError';
  }
}

// ---------------------------------------------------------------------------
// resolveSequenceForAthlete — athlete → the program_sequence cell for their
// (level_id, training_days_per_week), or a structured "why not" the UI can show.
//
// Returns a discriminated result rather than throwing for the "not resolvable"
// cases (not classified / no matching cell): those are normal product states a
// coach screen needs to render ("no hay secuencia para N4·5d"), not errors.
// Genuine integrity failures (athlete absent / not owned) DO throw.
// ---------------------------------------------------------------------------
export type ResolveSequenceResult =
  | { ok: true; athlete: ResolvedAthlete; sequence: ProgramSequence }
  | { ok: false; reason: ResolveFailureReason; message: string; athlete?: ResolvedAthlete };

export type ResolvedAthlete = {
  athlete_id: number;
  coach_id: number;
  level_id: number | null;
  level_name: string | null;
  training_days_per_week: number | null;
};

export type ResolveFailureReason =
  | 'not_classified' // level_id is null
  | 'no_training_days' // training_days_per_week is null
  | 'days_out_of_band' // training_days_per_week outside the 3-6 sequence band
  | 'no_sequence_for_cell' // coach has no sequence for (level, days)
  | 'empty_sequence'; // sequence exists but has zero microciclos

// Sequences are only defined for a realistic 3-6 sessions/week band — the band
// constants are single-sourced in shared/schema/program-sequences.ts (imported
// above) so the resolver, the training-days endpoint and the selector agree.

type AthleteRow = {
  athlete_id: string;
  coach_id: string;
  level_id: string | null;
  level_name: string | null;
  training_days_per_week: number | null;
};

async function loadResolvedAthlete(
  athleteId: number,
  coachId: number | bigint,
  client: Sql,
): Promise<ResolvedAthlete> {
  // Ownership-gated read: an athlete not owned by this coach is reported as
  // not-found (404), never disclosed (same posture as the deep-dive services).
  const rows = await client<AthleteRow[]>`
    select a.id::text as athlete_id,
           a.coach_id::text as coach_id,
           a.level_id::text as level_id,
           al.name as level_name,
           a.training_days_per_week
    from athletes a
    left join athlete_levels al on al.id = a.level_id
    where a.id = ${athleteId} and a.coach_id = ${String(coachId)}
    limit 1
  `;
  const row = rows[0];
  if (!row) {
    throw new AssignSequenceError(
      'athlete_not_found',
      'Atleta no encontrado para este coach.',
      404,
    );
  }
  return {
    athlete_id: Number(row.athlete_id),
    coach_id: Number(row.coach_id),
    level_id: row.level_id == null ? null : Number(row.level_id),
    level_name: row.level_name,
    training_days_per_week: row.training_days_per_week,
  };
}

export async function resolveSequenceForAthlete(
  athleteId: number,
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<ResolveSequenceResult> {
  const athlete = await loadResolvedAthlete(athleteId, coachId, client);

  if (athlete.level_id == null) {
    return {
      ok: false,
      reason: 'not_classified',
      message: 'El atleta aún no está clasificado en un nivel.',
      athlete,
    };
  }
  if (athlete.training_days_per_week == null) {
    return {
      ok: false,
      reason: 'no_training_days',
      message: 'El atleta no tiene definidos los días de entrenamiento por semana.',
      athlete,
    };
  }
  if (
    athlete.training_days_per_week < SEQUENCE_DAYS_MIN ||
    athlete.training_days_per_week > SEQUENCE_DAYS_MAX
  ) {
    return {
      ok: false,
      reason: 'days_out_of_band',
      message: `Las secuencias cubren ${SEQUENCE_DAYS_MIN}-${SEQUENCE_DAYS_MAX} días/semana; el atleta tiene ${athlete.training_days_per_week}.`,
      athlete,
    };
  }

  const sequence = await getCoachSequenceCell(
    coachId,
    athlete.level_id,
    athlete.training_days_per_week,
    client,
  );
  if (!sequence) {
    const cell = `${athlete.level_name ?? `nivel ${athlete.level_id}`}·${athlete.training_days_per_week}d`;
    return {
      ok: false,
      reason: 'no_sequence_for_cell',
      message: `No hay secuencia para ${cell}.`,
      athlete,
    };
  }
  if (sequence.items.length === 0) {
    const cell = `${athlete.level_name ?? `nivel ${athlete.level_id}`}·${athlete.training_days_per_week}d`;
    return {
      ok: false,
      reason: 'empty_sequence',
      message: `La secuencia de ${cell} no tiene microciclos definidos.`,
      athlete,
    };
  }

  return { ok: true, athlete, sequence };
}

// ---------------------------------------------------------------------------
// assignSequenceToAthlete — enroll an athlete in their resolved sequence and
// MATERIALIZE the first microciclo into real dated workout_assignments.
//
// START DATE choice: next Monday (box timezone). The materializer Monday-aligns
// whatever start_date it receives; passing "today" mid-week would align BACKWARDS
// into the current (partly past) week, dumping already-elapsed days. The next full
// Mon–Sun week is the clean, predictable start the athlete sees on their plan.
// A caller may override with an explicit start_date (also Monday-aligned downstream).
//
// IDEMPOTENCY: instantiateMonthFromTemplate has NO dedup guard (it double-inserts
// on re-call). We guard at THIS layer: if the athlete already has an active
// athlete_sequence_progress row for this sequence at position 1, we DO NOT
// re-materialize — we return the existing enrollment (already_enrolled: true).
// This is the discipline that prevents the duplicate-workout / fake-assignment
// failure mode.
// ---------------------------------------------------------------------------
export type AssignSequenceResult = {
  sequence_id: number;
  position: number;
  month_template_id: number;
  progress_id: number;
  already_enrolled: boolean;
  materialization: InstantiateMonthResult | null;
};

type ProgressRow = {
  id: string;
  sequence_id: string;
  current_position: number;
  status: string;
};

export async function assignSequenceToAthlete(
  athleteId: number,
  coachId: number | bigint,
  startDate?: string,
  client: Sql = defaultSql,
): Promise<AssignSequenceResult> {
  const resolved = await resolveSequenceForAthlete(athleteId, coachId, client);
  if (!resolved.ok) {
    throw new AssignSequenceError(resolved.reason, resolved.message, 409);
  }
  const { sequence } = resolved;

  // position=1 item is the first microciclo to materialize. Items are returned
  // ordered by position asc, and position is 1-indexed/contiguous (0059), so the
  // first element IS position 1 — but resolve it by value, not by index, to be safe.
  const firstItem =
    sequence.items.find((it) => it.position === 1) ?? sequence.items[0]!;

  // Idempotency guard: an existing active enrollment on THIS sequence at position 1
  // means we already materialized; don't double-insert.
  const existing = await client<ProgressRow[]>`
    select id::text, sequence_id::text, current_position, status
    from athlete_sequence_progress
    where athlete_id = ${athleteId} and status = 'active'
    limit 1
  `;
  const active = existing[0];
  if (
    active &&
    Number(active.sequence_id) === Number(sequence.id) &&
    active.current_position === 1
  ) {
    return {
      sequence_id: Number(sequence.id),
      position: 1,
      month_template_id: Number(firstItem.month_template_id),
      progress_id: Number(active.id),
      already_enrolled: true,
      materialization: null,
    };
  }

  const start = startDate ?? isoDateString(addDays(mondayOfWeekInBox(new Date()), 7));

  // Materialize the first microciclo via the EXISTING pipeline + stagger its weeks
  // (materializeItem: materialize → markFutureWeeksDraft → faithful error mapping;
  // the SAME helper the advance paths use). We pass the top-level pooled client
  // (NOT a transaction): instantiateMonthFromTemplate owns and opens its OWN
  // transaction internally via `client.begin` (postgres.js tx objects expose
  // `.savepoint`, not `.begin`, so it must be given a top-level client). Its
  // materialization is therefore atomic on its own.
  //
  // We then write the enrollment cursor in a SEPARATE statement. Order is
  // materialize → progress (not the reverse) so the cursor only exists once real
  // workouts exist: the primary idempotency guard above keys on the progress row,
  // so the normal "assigned twice" case is a no-op. A crash strictly between the
  // (committed) materialization and the progress insert is the only window that
  // could leave workouts without a cursor — consistent with the existing
  // assign-month semantics (no cross-call dedup) and recoverable by re-assigning.
  const materialization = await materializeItem({
    coachId,
    athleteId,
    monthTemplateId: firstItem.month_template_id,
    startDate: start,
    client,
  });

  // Upsert the enrollment cursor. If a different active sequence existed, move the
  // athlete onto this one at position 1 (the partial-unique on status='active'
  // guarantees a single active row; we update it in place via the partial-index
  // conflict target).
  const upserted = await client<{ id: string }[]>`
    insert into athlete_sequence_progress
      (athlete_id, coach_id, sequence_id, current_position, status)
    values (${athleteId}, ${String(coachId)}, ${Number(sequence.id)}, 1, 'active')
    on conflict (athlete_id) where status = 'active'
    do update set
      coach_id = excluded.coach_id,
      sequence_id = excluded.sequence_id,
      current_position = 1,
      loops_completed = 0,
      updated_at = now()
    returning id::text
  `;
  const progressId = Number(upserted[0]!.id);

  return {
    sequence_id: Number(sequence.id),
    position: 1,
    month_template_id: Number(firstItem.month_template_id),
    progress_id: progressId,
    already_enrolled: false,
    materialization,
  };
}

// =============================================================================
// SEQUENCE WALK — advance an athlete to the NEXT microciclo, or resolve the
// end-policy when the current microciclo is the LAST item of the sequence.
//
// "current microciclo finished" — the gate for advancing — is true when the
// athlete's CURRENT position has a materialization receipt (athlete_month_assignments)
// whose date window is over EITHER by the calendar (end_date < today, box tz)
// OR by the work (every workout_assignment in that window is in a terminal
// status: completed | missed | skipped — only `scheduled` is outstanding). Either
// condition means the microciclo is done; we don't advance while sessions remain.
//
// END-POLICY at the last item (program_sequences.end_policy):
//   · repeat   → re-materialize item[1] (a fresh loop), cursor back to 1, and bump
//                loops_completed. The coach's per-loop progression (progression_pct
//                scoped by progression_applies_to) is applied to the re-materialized
//                doses — cumulative (factor ^ loops_completed), template never mutated.
//                No lever set / pct 0 ⇒ the loop repeats verbatim.
//   · level_up → next level by athlete_levels.sort_order (strictly greater,
//                nearest). Re-resolve the sequence for (next level, SAME days). If
//                a sequence exists there: mark the current enrollment completed,
//                promote the athlete (athletes.level_id := next level), create a
//                NEW active enrollment on the next level's sequence and materialize
//                ITS item[1]. If there's no next level OR no sequence there → fall
//                back to `stop` with a clear reason (never silently dead-ends).
//   · stop     → mark the enrollment completed, no further materialization.
//
// REUSES the chunk-1 materializer (instantiateMonthFromTemplate) verbatim and the
// chunk-1 resolver (resolveSequenceForAthlete) for the level_up re-resolution.
// AGNOSTIC: levels via athlete_levels.sort_order, microciclos via month templates.
// =============================================================================

/** Outcome of an advancement attempt — a discriminated union the UI/endpoint map. */
export type AdvanceOutcome =
  | 'not_yet_finished' // current microciclo still has outstanding sessions / future dates
  | 'advanced' // moved to the next item in the same sequence
  | 'looped' // last item + repeat → restarted at item 1 (coach's per-loop progression applied)
  | 'leveled_up' // last item + level_up → promoted to the next level's sequence
  | 'stopped' // last item + stop (or level_up fallback) → enrollment completed
  | 'no_active_enrollment'; // athlete has no active sequence to advance

export type AdvanceSequenceResult = {
  outcome: AdvanceOutcome;
  /** Sequence the athlete is on AFTER the call (changes only on level_up). */
  sequence_id: number | null;
  /** 1-indexed cursor AFTER the call (null when no enrollment / stopped). */
  position: number | null;
  /** The microciclo materialized this call, if any (null for no-op / stop). */
  materialized_month_template_id: number | null;
  materialization: InstantiateMonthResult | null;
  /** Human one-liner — always set, including the no-op / fallback reasons. */
  message: string;
};

type ActiveEnrollmentRow = {
  id: string;
  sequence_id: string;
  current_position: number;
  loops_completed: number;
};

/**
 * Is the athlete's CURRENT microciclo (the materialized item at `monthTemplateId`)
 * finished? True when its latest receipt window has elapsed (end_date < today) OR
 * every workout in that window is terminal. False (don't advance) when there's no
 * receipt yet (nothing materialized → nothing to finish) or sessions remain.
 */
async function isCurrentMicrocicloFinished(
  athleteId: number,
  monthTemplateId: number,
  client: Sql,
): Promise<boolean> {
  // Latest materialization receipt for THIS position's microciclo template.
  const receipts = await client<{ end_date: string; microcycle_ids: string[] }[]>`
    select to_char(end_date, 'YYYY-MM-DD') as end_date,
           microcycle_ids
    from athlete_month_assignments
    where athlete_id = ${athleteId}
      and month_template_id = ${monthTemplateId}
    order by start_date desc
    limit 1
  `;
  const receipt = receipts[0];
  if (!receipt) return false; // never materialized → not "finished", just not started

  // Time-done: the whole dated window is in the past (box tz).
  const todayIso = isoDateString(startOfDayInBox(new Date()));
  if (receipt.end_date < todayIso) return true;

  // Work-done: every workout_assignment of this receipt's microcycles is terminal
  // (completed | missed | skipped). Only `scheduled` is outstanding. A window with
  // zero assignments is NOT considered done by work (avoids advancing past an
  // empty-but-future microciclo); the time branch above handles the past case.
  const microIds = receipt.microcycle_ids.map(Number).filter((n) => Number.isFinite(n));
  if (microIds.length === 0) return false;
  const outstanding = await client<{ n: number }[]>`
    select count(*)::int as n
    from workout_assignments
    where athlete_id = ${athleteId}
      and microcycle_id = any(${microIds}::bigint[])
      and status = 'scheduled'
  `;
  const total = await client<{ n: number }[]>`
    select count(*)::int as n
    from workout_assignments
    where athlete_id = ${athleteId}
      and microcycle_id = any(${microIds}::bigint[])
  `;
  return (total[0]?.n ?? 0) > 0 && (outstanding[0]?.n ?? 0) === 0;
}

/**
 * Start date for the NEXT microciclo. Prefer the Monday AFTER the current
 * microciclo's window (seamless continuation). If that Monday is already in the
 * past — the athlete finished EARLY (work-done before the calendar) — fall back to
 * next Monday so we never dump already-elapsed days (same discipline as the
 * initial assign). Always Monday-aligned (the materializer re-aligns downstream).
 */
async function nextMicrocicloStartDate(
  athleteId: number,
  currentMonthTemplateId: number,
  client: Sql,
): Promise<string> {
  const receipts = await client<{ end_date: string }[]>`
    select to_char(end_date, 'YYYY-MM-DD') as end_date
    from athlete_month_assignments
    where athlete_id = ${athleteId}
      and month_template_id = ${currentMonthTemplateId}
    order by start_date desc
    limit 1
  `;
  const nextMonday = isoDateString(addDays(mondayOfWeekInBox(new Date()), 7));
  const end = receipts[0]?.end_date;
  if (!end) return nextMonday;
  // Monday after the current window's end.
  const afterWindow = isoDateString(mondayOfWeek(addDays(parseIsoDate(end), 7)));
  return afterWindow > nextMonday ? afterWindow : nextMonday;
}

/**
 * The per-loop progression spec for materializing a microciclo at `loops`
 * completed loops, or `undefined` when there's nothing to scale (no lever set, or
 * loop 0 → verbatim). Single source of scope+amount = the coach's sequence fields;
 * the actual dose scaling lives in the agnostic domain helper (applyProgression).
 */
function buildProgressionSpec(
  sequence: ProgramSequence,
  loops: number,
): ProgressionSpec | undefined {
  if (loops <= 0) return undefined;
  const pct = sequence.progression_pct;
  const appliesTo = sequence.progression_applies_to;
  if (pct == null || pct <= 0 || appliesTo == null) return undefined;
  return { appliesTo, pct, loops };
}

/** Item at a given 1-indexed position (by value, not array index — robust to gaps). */
function itemAtPosition(
  sequence: ProgramSequence,
  position: number,
): ProgramSequenceItem | null {
  return sequence.items.find((it) => it.position === position) ?? null;
}

export async function advanceSequenceForAthlete(
  athleteId: number,
  coachId: number | bigint,
  client: Sql = defaultSql,
): Promise<AdvanceSequenceResult> {
  // 1) The athlete's active enrollment cursor.
  const enrollments = await client<ActiveEnrollmentRow[]>`
    select id::text, sequence_id::text, current_position, loops_completed
    from athlete_sequence_progress
    where athlete_id = ${athleteId}
      and coach_id = ${String(coachId)}
      and status = 'active'
    limit 1
  `;
  const enrollment = enrollments[0];
  if (!enrollment) {
    return {
      outcome: 'no_active_enrollment',
      sequence_id: null,
      position: null,
      materialized_month_template_id: null,
      materialization: null,
      message: 'El atleta no está inscrito en ninguna secuencia activa.',
    };
  }

  const progressId = Number(enrollment.id);
  const currentPosition = enrollment.current_position;
  // Loops completed so far drives the cumulative progression factor. Mid-sequence
  // items of a repeated loop scale by the loop the athlete is CURRENTLY in (so the
  // WHOLE loop progresses coherently, not just item[1]); loop 0 ⇒ verbatim.
  const loopsCompleted = enrollment.loops_completed ?? 0;

  // 2) Load the enrolled sequence cell directly (the cursor's sequence_id is the
  //    source of truth — NOT a re-resolve, which could drift if the athlete's
  //    level/days changed mid-walk). We read its rows via the same loader.
  const sequence = await loadSequenceById(Number(enrollment.sequence_id), coachId, client);
  if (!sequence || sequence.items.length === 0) {
    // The sequence was emptied/deleted under the athlete — close the enrollment so
    // it stops surfacing as advanceable; surfacing a card for a vanished sequence
    // would be a dead control.
    await markEnrollmentCompleted(progressId, client);
    return {
      outcome: 'stopped',
      sequence_id: Number(enrollment.sequence_id),
      position: null,
      materialized_month_template_id: null,
      materialization: null,
      message: 'La secuencia ya no existe o no tiene microciclos; inscripción cerrada.',
    };
  }

  const currentItem = itemAtPosition(sequence, currentPosition);
  if (!currentItem) {
    // Cursor points past the sequence's items (sequence shrank). Treat as last-item
    // and resolve the end-policy from where it stands.
    return resolveEndPolicy({
      athleteId,
      coachId,
      sequence,
      progressId,
      loopsCompleted,
      currentMonthTemplateId: null,
      client,
    });
  }

  // 3) Gate: only advance once the current microciclo is finished.
  const finished = await isCurrentMicrocicloFinished(
    athleteId,
    Number(currentItem.month_template_id),
    client,
  );
  if (!finished) {
    return {
      outcome: 'not_yet_finished',
      sequence_id: Number(sequence.id),
      position: currentPosition,
      materialized_month_template_id: null,
      materialization: null,
      message: 'El microciclo actual aún no ha terminado.',
    };
  }

  const lastPosition = sequence.items.reduce((max, it) => Math.max(max, it.position), 0);

  // 4a) MID-SEQUENCE — a next item exists → materialize it, advance the cursor.
  if (currentPosition < lastPosition) {
    const nextItem = itemAtPosition(sequence, currentPosition + 1);
    if (nextItem) {
      const start = await nextMicrocicloStartDate(
        athleteId,
        Number(currentItem.month_template_id),
        client,
      );
      const materialization = await materializeItem({
        coachId,
        athleteId,
        monthTemplateId: Number(nextItem.month_template_id),
        startDate: start,
        progression: buildProgressionSpec(sequence, loopsCompleted),
        client,
      });
      await client`
        update athlete_sequence_progress
        set current_position = ${currentPosition + 1}, updated_at = now()
        where id = ${progressId}
      `;
      return {
        outcome: 'advanced',
        sequence_id: Number(sequence.id),
        position: currentPosition + 1,
        materialized_month_template_id: Number(nextItem.month_template_id),
        materialization,
        message: `Avanzado al microciclo ${currentPosition + 1}.`,
      };
    }
  }

  // 4b) LAST ITEM — resolve the end-policy.
  return resolveEndPolicy({
    athleteId,
    coachId,
    sequence,
    progressId,
    loopsCompleted,
    currentMonthTemplateId: Number(currentItem.month_template_id),
    client,
  });
}

// ---------------------------------------------------------------------------
// End-policy resolution (last item reached).
// ---------------------------------------------------------------------------
async function resolveEndPolicy(params: {
  athleteId: number;
  coachId: number | bigint;
  sequence: ProgramSequence;
  progressId: number;
  /** Loops completed BEFORE this resolution (the repeat branch increments it). */
  loopsCompleted: number;
  /** The current item's microciclo (for start-date continuation); null if cursor drifted. */
  currentMonthTemplateId: number | null;
  client: Sql;
}): Promise<AdvanceSequenceResult> {
  const {
    athleteId,
    coachId,
    sequence,
    progressId,
    loopsCompleted,
    currentMonthTemplateId,
    client,
  } = params;
  const policy: SequenceEndPolicy = sequence.end_policy;

  const startDate = currentMonthTemplateId
    ? await nextMicrocicloStartDate(athleteId, currentMonthTemplateId, client)
    : isoDateString(addDays(mondayOfWeekInBox(new Date()), 7));

  if (policy === 'repeat') {
    const firstItem = itemAtPosition(sequence, 1) ?? sequence.items[0]!;
    // A fresh loop begins → bump the loop counter and apply the coach's per-loop
    // progression to the re-materialized doses (scoped strictly by the coach's
    // progression_applies_to). The library microciclo template is NOT mutated — the
    // cumulative factor lives entirely in the materialized cycle. When no lever is
    // set (or pct 0) buildProgressionSpec is undefined ⇒ the loop repeats verbatim.
    const nextLoop = loopsCompleted + 1;
    const materialization = await materializeItem({
      coachId,
      athleteId,
      monthTemplateId: Number(firstItem.month_template_id),
      startDate,
      progression: buildProgressionSpec(sequence, nextLoop),
      client,
    });
    await client`
      update athlete_sequence_progress
      set current_position = 1, loops_completed = ${nextLoop}, updated_at = now()
      where id = ${progressId}
    `;
    return {
      outcome: 'looped',
      sequence_id: Number(sequence.id),
      position: 1,
      materialized_month_template_id: Number(firstItem.month_template_id),
      materialization,
      message: 'Secuencia terminada; reiniciando el ciclo desde el primer microciclo.',
    };
  }

  if (policy === 'level_up') {
    const promotion = await resolveLevelUp(athleteId, coachId, sequence, client);
    if (promotion) {
      // Mark current enrollment completed, promote the athlete, create a NEW active
      // enrollment on the next level's sequence + materialize ITS first microciclo.
      await markEnrollmentCompleted(progressId, client);
      await client`
        update athletes
        set level_id = ${promotion.nextLevelId}, level_source = 'algorithm'
        where id = ${athleteId}
      `;
      const firstItem =
        itemAtPosition(promotion.nextSequence, 1) ?? promotion.nextSequence.items[0]!;
      const materialization = await materializeItem({
        coachId,
        athleteId,
        monthTemplateId: Number(firstItem.month_template_id),
        startDate,
        client,
      });
      await client`
        insert into athlete_sequence_progress
          (athlete_id, coach_id, sequence_id, current_position, status)
        values (${athleteId}, ${String(coachId)}, ${promotion.nextSequence.id}, 1, 'active')
      `;
      return {
        outcome: 'leveled_up',
        sequence_id: Number(promotion.nextSequence.id),
        position: 1,
        materialized_month_template_id: Number(firstItem.month_template_id),
        materialization,
        message: `Subido a ${promotion.nextLevelName}; empezando su primer microciclo.`,
      };
    }
    // Fall back to `stop` with a clear reason (no next level / no sequence there).
    await markEnrollmentCompleted(progressId, client);
    return {
      outcome: 'stopped',
      sequence_id: Number(sequence.id),
      position: null,
      materialized_month_template_id: null,
      materialization: null,
      message:
        'Secuencia terminada. No hay un nivel superior con secuencia definida; plan en pausa.',
    };
  }

  // policy === 'stop'
  await markEnrollmentCompleted(progressId, client);
  return {
    outcome: 'stopped',
    sequence_id: Number(sequence.id),
    position: null,
    materialized_month_template_id: null,
    materialization: null,
    message: 'Secuencia terminada (política: detener).',
  };
}

/**
 * Find the next level (athlete_levels.sort_order strictly greater, nearest) that
 * ALSO has a sequence for the athlete's current days/week. Returns null when
 * there's no higher level or no sequence cell there (→ stop fallback).
 */
async function resolveLevelUp(
  athleteId: number,
  coachId: number | bigint,
  currentSequence: ProgramSequence,
  client: Sql,
): Promise<{ nextLevelId: number; nextLevelName: string; nextSequence: ProgramSequence } | null> {
  // The current level's sort_order (anchored on the enrolled sequence's level).
  const cur = await client<{ sort_order: number }[]>`
    select sort_order from athlete_levels
    where id = ${currentSequence.level_id} and coach_id = ${String(coachId)}
    limit 1
  `;
  const currentSort = cur[0]?.sort_order;
  if (currentSort == null) return null;

  // Ascending candidates strictly above the current level (nearest first).
  const candidates = await client<{ id: string; name: string }[]>`
    select id::text, name from athlete_levels
    where coach_id = ${String(coachId)}
      and sort_order > ${currentSort}
    order by sort_order asc
  `;

  for (const cand of candidates) {
    const nextSequence = await getCoachSequenceCell(
      coachId,
      Number(cand.id),
      currentSequence.days_per_week,
      client,
    );
    if (nextSequence && nextSequence.items.length > 0) {
      return {
        nextLevelId: Number(cand.id),
        nextLevelName: cand.name,
        nextSequence,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Small shared helpers (DRY across the advancement paths).
// ---------------------------------------------------------------------------

/** Load a sequence cell by its id (coach-scoped), reusing the existing cell loader. */
async function loadSequenceById(
  sequenceId: number,
  coachId: number | bigint,
  client: Sql,
): Promise<ProgramSequence | null> {
  const rows = await client<{ level_id: string; days_per_week: number }[]>`
    select level_id::text, days_per_week
    from program_sequences
    where id = ${sequenceId} and coach_id = ${String(coachId)}
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  return getCoachSequenceCell(coachId, Number(row.level_id), row.days_per_week, client);
}

/**
 * Materialize one microciclo via the chunk-1 pipeline, then apply STAGGERED
 * WEEKLY DELIVERY (first week published, rest draft). Maps errors faithfully.
 * Used by every advance path (mid-sequence, loop, level-up) so advancing to a
 * multi-week microciclo surfaces only its first week — the Saturday cron unlocks
 * the rest. The initial assign (assignSequenceToAthlete) staggers identically.
 */
async function materializeItem(params: {
  coachId: number | bigint;
  athleteId: number;
  monthTemplateId: number | bigint;
  startDate: string;
  /** Per-loop progressive-overload (repeated loops); undefined ⇒ verbatim. */
  progression?: ProgressionSpec;
  client: Sql;
}): Promise<InstantiateMonthResult> {
  let result: InstantiateMonthResult;
  try {
    result = await instantiateMonthFromTemplate({
      coach_id: params.coachId,
      athlete_id: params.athleteId,
      month_template_id: params.monthTemplateId,
      start_date: params.startDate,
      progression: params.progression,
      client: params.client,
    });
  } catch (err) {
    if (err instanceof InstantiateProgramError) {
      throw new AssignSequenceError(err.code, err.message, err.status);
    }
    throw err;
  }

  await markFutureWeeksDraft({
    coach_id: params.coachId,
    athlete_id: params.athleteId,
    start_date: result.start_date,
    week_count: result.microcycle_ids.length,
    client: params.client,
  });

  return result;
}

async function markEnrollmentCompleted(progressId: number, client: Sql): Promise<void> {
  await client`
    update athlete_sequence_progress
    set status = 'completed', updated_at = now()
    where id = ${progressId}
  `;
}
