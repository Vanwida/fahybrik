// #28 importer — WHERE a photo-read week/day lands in the coach's real
// microcycle. Pure (no DB, no I/O): `buildPhotoProposal` (photo-proposal.ts)
// resolves the real week ids first, this module only does the arithmetic.
//
// THE MODEL THIS REPLACES WAS AN INVENTION: "every capture is one week, in
// order, starting from the first". There was no way to import a single loose
// day, three days, or land anything on week 45 of an 11-week block. The new
// rule: the coach NEVER declares WHAT they're uploading (the reader already
// sees the day headers in the photo — it knows how many days there are and
// which ones), only WHERE it starts.
//
// "FOUND" — the unit this whole module reasons about — is a day the reader
// actually saw something on: `day.cards !== undefined && day.cards.length >
// 0`, ANY card kind (workout, note, metrics, rest). NOT `workoutCards(day)`:
// that narrower bar is build-proposal.ts's own "is this trainable" question,
// a different concern. The reader always emits all 7 slots per week it read
// (see imported-week.ts/vision-reader.ts) — 5 or 6 of them are typically
// empty placeholders, never "found", and must never occupy a day/week slot
// here. Dropping that distinction would silently swallow a real "rest" card,
// or worse — a real workout — the coach's photo showed.

import { dayLabel, type DayOfWeek } from '@/lib/dashboard/constants/calendar';
import { ImportError } from './import-shared';
import type { ImportedDay, ImportedWeek } from './imported-week';

/** One real week of the coach's microcycle, in real order — exactly what
 *  `buildPhotoProposal` slices out of `loadMonthTemplateWithWeeks` starting
 *  at `target_week_id`, never re-derived here. */
export interface AvailableWeek {
  id: string;
  /** Real, 0-indexed position within the microcycle
   *  (`program_month_weeks.position`) — `+1` is what a coach reads as
   *  "Semana N", same convention as everywhere else this gets displayed. */
  week_index: number;
}

const PHOTO_SHEET = 'foto'; // mirrors vision-reader.ts's own constant. A week
// this module BUILDS (the anchored branch can split one source week across
// two real weeks, or merge distant ones) has no single source sheet of its
// own anymore, so every output week gets the same generic label.

function hasContent(day: ImportedDay): boolean {
  return day.cards !== undefined && day.cards.length > 0;
}

function assertFits(neededWeeks: number, availableWeeks: AvailableWeek[]): void {
  if (neededWeeks <= availableWeeks.length) return;
  throw new ImportError(
    'week_overflow',
    `El microciclo no tiene sitio desde la semana elegida: caben ${availableWeeks.length} ` +
      `semana${availableWeeks.length === 1 ? '' : 's'} y la foto trae ${neededWeeks}.`,
    422,
  );
}

/**
 * NO day anchor: every day stays on its REAL weekday (whatever the photo's
 * own headers said — untouched). Only which WEEK of the microcycle each
 * found week lands on gets remapped: the first week the reader found → the
 * chosen week; the next ones, consecutively, to whatever comes after it in
 * the microcycle (never preserving a gap between the reader's OWN week
 * numbers — those were only ever its internal bookkeeping for "week 1, week
 * 2…" across one read, not a real calendar position worth keeping).
 */
function placeByRealWeekday(
  weeks: ImportedWeek[],
  availableWeeks: AvailableWeek[],
): ImportedWeek[] {
  assertFits(weeks.length, availableWeeks);
  return weeks.map((w, i) => ({ ...w, week: availableWeeks[i]!.week_index + 1 }));
}

interface FoundDay {
  /** Index into the INPUT `weeks` array (0-based, in the order the reader
   *  returned them — "en el orden en que se ven", per its own prompt). */
  sourceWeekIndex: number;
  day: ImportedDay;
}

/** Every day with real content, across every week, in the exact order the
 *  reader produced them (week ascending, then day_of_week ascending within
 *  each week — the reader's own `toImportedWeeks` always builds a week's
 *  `days` 1..7 in that order, so no extra sort is needed or safe to add). */
function flattenFoundDays(weeks: ImportedWeek[]): FoundDay[] {
  const out: FoundDay[] = [];
  weeks.forEach((w, sourceWeekIndex) => {
    for (const day of w.days) {
      if (hasContent(day)) out.push({ sourceWeekIndex, day });
    }
  });
  return out;
}

/**
 * WITH a day anchor: the FIRST found day lands exactly on `targetWeekday`,
 * inside the chosen week. Every other found day follows it, keeping the SAME
 * relative gap it had in the photo — one linear day-index
 * (`sourceWeekIndex*7 + (day_of_week-1)`) both before and after the anchor,
 * so "Monday + Wednesday" (gap 2) anchored on Tuesday becomes
 * "Tuesday + Thursday" (still gap 2), and a gap wide enough to cross a
 * 7-day boundary rolls into the NEXT real week — exactly like a real
 * calendar would, never wrapping back into the one that started it.
 *
 * This is ONE rule, not two: "a single found day" is just the case where
 * every other found day happens not to exist, so the anchor is the whole
 * answer — no separate branch needed for it.
 *
 * A source week can end up split across two real weeks (its Friday crosses
 * into the next one) or two source weeks can end up merged into one (a huge
 * gap between two captures skips the empty weeks between them without
 * inventing content for them) — both are the direct, intended consequence of
 * "preserve the gap", not bugs.
 */
function placeByAnchor(
  weeks: ImportedWeek[],
  availableWeeks: AvailableWeek[],
  targetWeekday: number,
): ImportedWeek[] {
  const found = flattenFoundDays(weeks);
  // Defensive only: buildPhotoProposal already refuses an empty reading
  // before this ever runs — the reader itself never emits a week with zero
  // cards ("no ocupa número de semana", vision-reader.ts).
  if (found.length === 0) {
    throw new ImportError(
      'empty_reading',
      'No se ha reconocido ningún entreno en las capturas.',
      422,
    );
  }

  const baseAbsolute = found[0]!.sourceWeekIndex * 7 + (found[0]!.day.day_of_week - 1);
  const byRelativeWeek = new Map<number, ImportedDay[]>();
  let maxRelativeWeek = 0;

  for (const { sourceWeekIndex, day } of found) {
    const sourceAbsolute = sourceWeekIndex * 7 + (day.day_of_week - 1);
    // `found` is strictly increasing in `sourceAbsolute` (weeks then days,
    // both already ascending) — this is never negative.
    const relativeOffset = sourceAbsolute - baseAbsolute;
    const newAbsolute = targetWeekday - 1 + relativeOffset;
    const relativeWeek = Math.floor(newAbsolute / 7);
    const newDayOfWeek = (newAbsolute % 7) + 1;
    maxRelativeWeek = Math.max(maxRelativeWeek, relativeWeek);

    const placed: ImportedDay = {
      ...day,
      day_of_week: newDayOfWeek,
      dow: dayLabel(newDayOfWeek as DayOfWeek, true),
    };
    const bucket = byRelativeWeek.get(relativeWeek);
    if (bucket) bucket.push(placed);
    else byRelativeWeek.set(relativeWeek, [placed]);
  }

  assertFits(maxRelativeWeek + 1, availableWeeks);

  const out: ImportedWeek[] = [];
  for (let rel = 0; rel <= maxRelativeWeek; rel += 1) {
    const days = byRelativeWeek.get(rel);
    // A real week strictly BETWEEN two placed ones, holding nothing itself
    // (a wide gap between two captures) — nothing to place, nothing to
    // review; skipped, not fabricated as an empty entry.
    if (!days || days.length === 0) continue;
    out.push({ week: availableWeeks[rel]!.week_index + 1, sheet: PHOTO_SHEET, fell_back: false, days });
  }
  return out;
}

/**
 * The single entry point: `readWeekVision`'s raw findings → the SAME shape,
 * repositioned onto the coach's real microcycle. `targetWeekday` undefined
 * picks `placeByRealWeekday`; a value 1..7 picks `placeByAnchor`. Throws a
 * translated `ImportError` (`week_overflow`, 422) when the photo needs more
 * weeks than exist from `target_week_id` onward — never silently truncated.
 */
export function placeImportedWeeks(
  weeks: ImportedWeek[],
  availableWeeks: AvailableWeek[],
  targetWeekday: number | undefined,
): ImportedWeek[] {
  return targetWeekday === undefined
    ? placeByRealWeekday(weeks, availableWeeks)
    : placeByAnchor(weeks, availableWeeks, targetWeekday);
}
