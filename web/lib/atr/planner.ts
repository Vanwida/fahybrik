// Pure ATR macrocycle planner. Given a target event date, lay down REAL → TRANS →
// ACC blocks backwards from the event, each split into 1-week microcycles.
//
// Defaults are Pablo-tunable knobs (will be replaced by per-athlete config once
// the coach UI ships). The shape follows Issurin's classical block periodization
// but compressed: ACC (volume + general capacity) → TRANS (race-specific
// threshold) → REAL (peaking + sharpening).

import { addDays, diffDays, isoDateString, parseIsoDate, startOfDayUtc } from './dates';

export type AtrBlockType = 'ACC' | 'TRANS' | 'REAL';

export type BlockSpec = {
  type: AtrBlockType;
  /** Number of 7-day microcycles in this block. */
  weeks: number;
};

// Defaults per the brief. REAL last (closest to event), ACC first (furthest).
// Order is *temporal* — index 0 starts the macrocycle, last entry ends at the event.
export const DEFAULT_BLOCK_SPECS: ReadonlyArray<BlockSpec> = [
  { type: 'ACC', weeks: 6 },
  { type: 'TRANS', weeks: 4 },
  { type: 'REAL', weeks: 3 },
];

export type PlannedMicrocycle = {
  week_number: number;       // 1-indexed within the block
  start_date: string;        // YYYY-MM-DD
  end_date: string;          // YYYY-MM-DD (inclusive, 6 days after start)
};

export type PlannedBlock = {
  type: AtrBlockType;
  position: number;          // 0-indexed within macrocycle
  start_date: string;
  end_date: string;          // inclusive
  microcycles: PlannedMicrocycle[];
};

export type PlannedMacrocycle = {
  start_date: string;
  end_date: string;          // inclusive
  blocks: PlannedBlock[];
};

export type PlanInput = {
  /** Target event date — final REAL microcycle ends *on* this date. */
  target_event_date: Date | string;
  /** Optional override for block durations. */
  block_specs?: ReadonlyArray<BlockSpec>;
};

function normalizeEventDate(d: Date | string): Date {
  if (typeof d === 'string') return parseIsoDate(d);
  return startOfDayUtc(d);
}

export function planMacrocycle(input: PlanInput): PlannedMacrocycle {
  const eventDate = normalizeEventDate(input.target_event_date);
  const specs = input.block_specs ?? DEFAULT_BLOCK_SPECS;

  if (specs.length === 0) {
    throw new Error('planMacrocycle: at least one block spec required');
  }
  for (const s of specs) {
    if (!Number.isInteger(s.weeks) || s.weeks < 1) {
      throw new Error(`planMacrocycle: block ${s.type} must have weeks >= 1`);
    }
  }

  const totalWeeks = specs.reduce((s, b) => s + b.weeks, 0);
  const macroStart = addDays(eventDate, -(totalWeeks * 7 - 1));

  const blocks: PlannedBlock[] = [];
  let cursor = macroStart;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const blockStart = cursor;
    const microcycles: PlannedMicrocycle[] = [];
    for (let w = 0; w < spec.weeks; w++) {
      const microStart = addDays(blockStart, w * 7);
      const microEnd = addDays(microStart, 6);
      microcycles.push({
        week_number: w + 1,
        start_date: isoDateString(microStart),
        end_date: isoDateString(microEnd),
      });
    }
    const blockEnd = addDays(blockStart, spec.weeks * 7 - 1);
    blocks.push({
      type: spec.type,
      position: i,
      start_date: isoDateString(blockStart),
      end_date: isoDateString(blockEnd),
      microcycles,
    });
    cursor = addDays(blockEnd, 1);
  }

  return {
    start_date: isoDateString(macroStart),
    end_date: isoDateString(eventDate),
    blocks,
  };
}

// Locate the block + microcycle covering a given date inside a planned macrocycle.
// Returns null if the date is outside the macrocycle.
export function findCurrentBlock(
  plan: PlannedMacrocycle,
  on_date: Date,
): {
  block: PlannedBlock;
  microcycle: PlannedMicrocycle;
  weeks_to_event: number;
} | null {
  const today = startOfDayUtc(on_date);
  const macroEnd = parseIsoDate(plan.end_date);
  if (today < parseIsoDate(plan.start_date) || today > macroEnd) return null;

  for (const block of plan.blocks) {
    const blockStart = parseIsoDate(block.start_date);
    const blockEnd = parseIsoDate(block.end_date);
    if (today >= blockStart && today <= blockEnd) {
      for (const micro of block.microcycles) {
        const ms = parseIsoDate(micro.start_date);
        const me = parseIsoDate(micro.end_date);
        if (today >= ms && today <= me) {
          return {
            block,
            microcycle: micro,
            weeks_to_event: Math.ceil(diffDays(macroEnd, today) / 7),
          };
        }
      }
    }
  }
  return null;
}
