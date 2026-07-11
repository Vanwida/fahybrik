// import-review — CLIENT-SAFE view model + wire builders for the #28 importer's
// review step (Fork C: grid + drill-in). Turns the server's typed ImportProposal
// into an editable per-week/per-day model the coach reviews, computes each day's
// honest tone (rest / ok / review / unresolved), and builds the CONFIRM body:
//   · the explicit week mapping (Fork B — each imported week → a container week);
//   · the approved days' sessions in the #33 day-save wire shape;
//   · the synonyms to learn, reconstructed from the ORIGINAL flags + the coach's
//     final resolutions (an unresolved token that now points at an exercise).
//
// Types come from the server module via `import type` (erased at compile — the
// `server-only` side-effect never reaches the client bundle).

import type { EditorSession, EditorBlock } from '@/lib/dashboard/v2/editor-types';
import type { ProposalFlag, ProposalDay, ProposalWeek, ImportProposal } from '@/lib/import/build-proposal';

/** A container week the coach can map an imported week onto (Fork B target). */
export interface MicroWeekRef {
  id: string;
  index: number;
  label: string;
  session_count: number;
}

export interface ReviewDay {
  day_of_week: number;
  dow: string;
  stimulus: string | null;
  /** Editable in the drawer; null = rest / empty (nothing to write). */
  session: EditorSession | null;
  flags: ProposalFlag[];
  /** Coach's selection — false = leave this day out of the import (not written,
   *  not counted, its unresolved lines stop blocking confirm). Rest days ignore it. */
  included: boolean;
}

export interface ReviewWeek {
  /** The xlsx week number (1..12). */
  week: number;
  sheet: string;
  fell_back: boolean;
  /** Fork B — the container week template this imported week writes into. */
  target_week_id: string | null;
  /** Coach's selection — false = leave the WHOLE week out (no mapping required). */
  included: boolean;
  days: ReviewDay[];
}

/** A day's honest tone for the grid. */
export type DayTone = 'rest' | 'skipped' | 'ok' | 'review' | 'unresolved';

function fromProposalDay(d: ProposalDay): ReviewDay {
  return {
    day_of_week: d.day_of_week,
    dow: d.dow,
    stimulus: d.stimulus,
    session: d.session ? structuredClone(d.session) : null,
    flags: d.flags,
    included: true,
  };
}

function fromProposalWeek(w: ProposalWeek, defaultTarget: string | null): ReviewWeek {
  return {
    week: w.week,
    sheet: w.sheet,
    fell_back: w.fell_back,
    target_week_id: defaultTarget,
    included: true,
    days: w.days.map(fromProposalDay),
  };
}

/**
 * Build the editable review model. Default mapping = imported week i → the
 * container week at ordinal position i (the coach can re-map any of them). Extra
 * imported weeks beyond the container's length start unmapped (must be resolved).
 */
export function buildReviewModel(
  proposal: ImportProposal,
  microWeeks: MicroWeekRef[],
): ReviewWeek[] {
  const byIndex = [...microWeeks].sort((a, b) => a.index - b.index);
  return proposal.weeks.map((w, i) => fromProposalWeek(w, byIndex[i]?.id ?? null));
}

/** Items with no catalog exercise across a session (the hard save blocker). */
function sessionUnresolvedCount(session: EditorSession | null): number {
  if (!session) return 0;
  let n = 0;
  for (const block of session.blocks) {
    for (const item of block.items) {
      if (item.exercise_id == null || Number(item.exercise_id) <= 0) n += 1;
    }
  }
  return n;
}

/** True when this day would actually be written on confirm. */
function dayWrites(week: ReviewWeek, day: ReviewDay): boolean {
  return week.included && day.included && !!day.session;
}

/** The day's tone: rest → grey, excluded (day or its whole week) → skipped, any
 *  unresolved exercise → red, any review-confidence line → amber, else green.
 *  Recomputed from the LIVE session so resolving an exercise turns a day green
 *  in place. */
export function dayTone(day: ReviewDay, weekIncluded = true): DayTone {
  if (!day.session) return 'rest';
  if (!weekIncluded || !day.included) return 'skipped';
  if (sessionUnresolvedCount(day.session) > 0) return 'unresolved';
  if (day.flags.some((f) => f.confidence === 'review')) return 'review';
  return 'ok';
}

/** Total unresolved-exercise lines across the INCLUDED days (the confirm gate).
 *  Excluding a day/week removes its unresolved lines from the count — one odd
 *  exercise never blocks importing the rest. */
export function totalUnresolved(weeks: ReviewWeek[]): number {
  return weeks.reduce(
    (acc, w) =>
      acc +
      w.days.reduce(
        (a, d) => a + (dayWrites(w, d) ? sessionUnresolvedCount(d.session) : 0),
        0,
      ),
    0,
  );
}

/** Every non-rest INCLUDED day that would be written (for the "N días" readout). */
export function totalWritableDays(weeks: ReviewWeek[]): number {
  return weeks.reduce((acc, w) => acc + w.days.filter((d) => dayWrites(w, d)).length, 0);
}

/** Non-rest days the coach chose to leave out (day excluded, or its week). */
export function totalExcludedDays(weeks: ReviewWeek[]): number {
  return weeks.reduce(
    (acc, w) => acc + w.days.filter((d) => d.session && !dayWrites(w, d)).length,
    0,
  );
}

/** INCLUDED weeks that still lack a container-week mapping (blocks confirm).
 *  An excluded week needs no destination. */
export function unmappedWeekCount(weeks: ReviewWeek[]): number {
  return weeks.filter((w) => w.days.some((d) => dayWrites(w, d)) && !w.target_week_id).length;
}

// ── Wire builders ─────────────────────────────────────────────────────────────

interface WireItem {
  uid: string;
  exercise_id: number | null;
  exercise_name: string;
  prescription: EditorBlock['items'][number]['prescription'];
  notes?: string;
}

function blockToWire(block: EditorBlock) {
  return {
    uid: block.uid,
    title: block.title,
    format: block.format,
    methodology_group_id: block.methodology_group_id ?? null,
    source_block_id: block.source_block_id ?? null,
    items: block.items.map(
      (it): WireItem => ({
        uid: it.uid,
        exercise_id: it.exercise_id,
        exercise_name: it.exercise_name,
        prescription: it.prescription,
        ...(it.notes ? { notes: it.notes } : {}),
      }),
    ),
  };
}

function sessionToWire(session: EditorSession) {
  return {
    uid: session.uid,
    slot: session.slot,
    ...(session.focus && session.focus.trim() ? { focus: session.focus.trim() } : {}),
    blocks: session.blocks.map(blockToWire),
  };
}

export interface ConfirmBody {
  microcycle_id: number;
  weeks: Array<{
    target_week_template_id: number;
    day_of_week: number;
    session: ReturnType<typeof sessionToWire>;
  }>;
  synonyms: Array<{ term: string; exercise_id: number }>;
}

/**
 * Build the CONFIRM request. Only INCLUDED non-rest days of INCLUDED weeks with a
 * mapped target week are sent. Synonyms are reconstructed from the ORIGINAL flags:
 * a token that was unresolved and now points at an exercise is learned (deduped by
 * normalized-ish term+id pair) — an excluded day teaches nothing. Rest days,
 * excluded days/weeks and unmapped weeks are silently skipped here — the caller
 * gates on `unmappedWeekCount`/`totalUnresolved` before enabling confirm.
 */
export function buildConfirmBody(microcycleId: string, weeks: ReviewWeek[]): ConfirmBody {
  const out: ConfirmBody = { microcycle_id: Number(microcycleId), weeks: [], synonyms: [] };
  const seen = new Set<string>();

  for (const w of weeks) {
    if (!w.included || !w.target_week_id) continue;
    const target = Number(w.target_week_id);
    for (const d of w.days) {
      if (!d.session || !d.included) continue;
      out.weeks.push({
        target_week_template_id: target,
        day_of_week: d.day_of_week,
        session: sessionToWire(d.session),
      });

      const flagByUid = new Map(d.flags.map((f) => [f.uid, f]));
      for (const block of d.session.blocks) {
        for (const item of block.items) {
          const f = flagByUid.get(item.uid);
          const token = f?.exercise_token.trim();
          if (
            f?.unresolved_exercise &&
            token &&
            item.exercise_id != null &&
            Number(item.exercise_id) > 0
          ) {
            const key = `${token.toLowerCase()}::${Number(item.exercise_id)}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.synonyms.push({ term: token, exercise_id: Number(item.exercise_id) });
            }
          }
        }
      }
    }
  }
  return out;
}
