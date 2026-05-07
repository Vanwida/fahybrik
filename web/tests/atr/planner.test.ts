import { describe, expect, test } from 'vitest';
import {
  DEFAULT_BLOCK_SPECS,
  findCurrentBlock,
  planMacrocycle,
} from '@/lib/atr/planner';
import { addDays, isoDateString, parseIsoDate } from '@/lib/atr/dates';

describe('planMacrocycle', () => {
  test('default specs lay 13 weeks ending on the event date', () => {
    const event = parseIsoDate('2026-08-30');
    const plan = planMacrocycle({ target_event_date: event });

    const weeks = DEFAULT_BLOCK_SPECS.reduce((s, b) => s + b.weeks, 0);
    expect(weeks).toBe(13);
    expect(plan.end_date).toBe('2026-08-30');
    expect(plan.start_date).toBe(isoDateString(addDays(event, -(weeks * 7 - 1))));

    expect(plan.blocks.map((b) => b.type)).toEqual(['ACC', 'TRANS', 'REAL']);
    expect(plan.blocks[0].microcycles).toHaveLength(6);
    expect(plan.blocks[1].microcycles).toHaveLength(4);
    expect(plan.blocks[2].microcycles).toHaveLength(3);

    // microcycle continuity: each starts the day after the previous one ends
    for (const block of plan.blocks) {
      for (let i = 1; i < block.microcycles.length; i++) {
        const prevEnd = parseIsoDate(block.microcycles[i - 1].end_date);
        const thisStart = parseIsoDate(block.microcycles[i].start_date);
        expect(thisStart.getTime() - prevEnd.getTime()).toBe(86_400_000);
      }
    }

    // last microcycle of REAL ends on the event date
    const lastBlock = plan.blocks[plan.blocks.length - 1];
    const lastMicro = lastBlock.microcycles[lastBlock.microcycles.length - 1];
    expect(lastMicro.end_date).toBe('2026-08-30');
  });

  test('rejects bogus block specs', () => {
    expect(() => planMacrocycle({ target_event_date: '2026-08-30', block_specs: [] })).toThrow();
    expect(() =>
      planMacrocycle({ target_event_date: '2026-08-30', block_specs: [{ type: 'REAL', weeks: 0 }] }),
    ).toThrow();
  });

  test('accepts custom block specs', () => {
    const plan = planMacrocycle({
      target_event_date: '2026-09-01',
      block_specs: [
        { type: 'ACC', weeks: 4 },
        { type: 'REAL', weeks: 2 },
      ],
    });
    expect(plan.blocks).toHaveLength(2);
    expect(plan.blocks[0].microcycles).toHaveLength(4);
    expect(plan.blocks[1].microcycles).toHaveLength(2);
  });
});

describe('findCurrentBlock', () => {
  const plan = planMacrocycle({ target_event_date: '2026-08-30' });

  test('returns the block + microcycle for a date inside ACC', () => {
    const accStart = parseIsoDate(plan.blocks[0].start_date);
    const found = findCurrentBlock(plan, addDays(accStart, 8));
    expect(found?.block.type).toBe('ACC');
    expect(found?.microcycle.week_number).toBe(2);
  });

  test('returns the block + microcycle for the event day itself', () => {
    const found = findCurrentBlock(plan, parseIsoDate('2026-08-30'));
    expect(found?.block.type).toBe('REAL');
    expect(found?.microcycle.week_number).toBe(3);
    expect(found?.weeks_to_event).toBe(0);
  });

  test('returns null for a date outside the macrocycle', () => {
    const before = parseIsoDate('2026-01-01');
    const after = parseIsoDate('2027-01-01');
    expect(findCurrentBlock(plan, before)).toBeNull();
    expect(findCurrentBlock(plan, after)).toBeNull();
  });
});
