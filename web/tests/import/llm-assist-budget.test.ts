/**
 * `budgetLlmAssist` — soft caps so a photo week with dozens of grammar-review
 * lines cannot sequential-fire LLM assists until Vercel 504s (incidente
 * 2026-08-06). Cap + deadline → null (honest review survives); never throws.
 */
import { describe, test, expect, vi } from 'vitest';
import { budgetLlmAssist } from '@/lib/import/llm-assist';
import type { LlmAssist } from '@/lib/import/build-proposal';
import type { ParsedLine } from '@fahybrid/shared/domain/import/notation';

const HIT: ParsedLine[] = [
  {
    exercise_token: 'Run',
    prescription: { scheme: 'steady', note: '5k Z2' },
    confidence: 'detected',
    review_reasons: [],
  },
];

function countingAssist(delayMs = 0): { assist: LlmAssist; calls: () => number } {
  let n = 0;
  const assist: LlmAssist = async () => {
    n += 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return HIT;
  };
  return { assist, calls: () => n };
}

describe('budgetLlmAssist', () => {
  test('undefined in → undefined out (no model configured)', () => {
    expect(
      budgetLlmAssist(undefined, {
        deadlineAt: Date.now() + 60_000,
        maxCalls: 4,
        minRemainingMs: 1_000,
      }),
    ).toBeUndefined();
  });

  test('stops after maxCalls; further calls return null without invoking', async () => {
    const { assist, calls } = countingAssist();
    const wrapped = budgetLlmAssist(assist, {
      deadlineAt: Date.now() + 60_000,
      maxCalls: 2,
      minRemainingMs: 1_000,
    })!;

    await expect(wrapped('a')).resolves.toEqual(HIT);
    await expect(wrapped('b')).resolves.toEqual(HIT);
    await expect(wrapped('c')).resolves.toBeNull();
    await expect(wrapped('d')).resolves.toBeNull();
    expect(calls()).toBe(2);
  });

  test('skips when remaining wall time is under minRemainingMs', async () => {
    const { assist, calls } = countingAssist();
    const wrapped = budgetLlmAssist(assist, {
      deadlineAt: Date.now() + 500, // almost expired
      maxCalls: 10,
      minRemainingMs: 5_000, // needs 5s; only 0.5s left
    })!;

    await expect(wrapped('dense wod')).resolves.toBeNull();
    expect(calls()).toBe(0);
  });

  test('allows calls while budget remains', async () => {
    const { assist, calls } = countingAssist();
    const wrapped = budgetLlmAssist(assist, {
      deadlineAt: Date.now() + 30_000,
      maxCalls: 3,
      minRemainingMs: 1_000,
    })!;

    await expect(wrapped('x')).resolves.toEqual(HIT);
    expect(calls()).toBe(1);
  });

  test('propagates underlying null without counting as a hard failure', async () => {
    const assist: LlmAssist = vi.fn(async () => null);
    const wrapped = budgetLlmAssist(assist, {
      deadlineAt: Date.now() + 30_000,
      maxCalls: 2,
      minRemainingMs: 1_000,
    })!;

    await expect(wrapped('x')).resolves.toBeNull();
    await expect(wrapped('y')).resolves.toBeNull();
    // Both started (null is a successful best-effort miss, not a skip).
    expect(assist).toHaveBeenCalledTimes(2);
  });
});
