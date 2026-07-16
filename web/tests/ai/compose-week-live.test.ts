/**
 * LIVE ground-truth check for the week composer. Hits a real DB and the real
 * model, so it is gated on COMPOSE_LIVE=1 and never runs in CI.
 *
 * Reads only. Writes a full day's JSON to COMPOSE_LIVE_OUT for inspection.
 */
import { expect, test, describe } from 'vitest';
import { suggestWeekPlan } from '@/lib/dashboard/coach/ai/suggest-week';
import { weekDaysToProposal } from '@/lib/import/generate-proposal';
import { getTestSql } from '../utils/test-db';
import { writeFileSync } from 'node:fs';

const LIVE = process.env.COMPOSE_LIVE === '1';
const COACH_ID = Number(process.env.COMPOSE_LIVE_COACH ?? 60);
const FOCUS =
  process.env.COMPOSE_LIVE_FOCUS ??
  '1 semana con doble sesión entre running e híbrido enfocado en HYROX';

(LIVE ? describe : describe.skip)('compose-week (live)', () => {
  test(
    'composes real sessions for the coach',
    async () => {
      const sql = getTestSql();
      const week = await suggestWeekPlan({
        coach_id: COACH_ID,
        body: { focus: FOCUS, mode: 'slow', level: 'pro' },
        client: sql,
      });
      const proposal = weekDaysToProposal({ days: week.days, sheetLabel: week.name });

      // `exercise_id` comes back as a BigInt from postgres; JSON.stringify chokes.
      const bigintSafe = (_k: string, v: unknown) => (typeof v === 'bigint' ? Number(v) : v);
      const out = process.env.COMPOSE_LIVE_OUT;
      if (out) {
        writeFileSync(
          out,
          JSON.stringify({ source: week.source, notes: week.notes, week, proposal }, bigintSafe, 2),
        );
      }

      const trainingDays = proposal.weeks[0]!.days.filter((d) => d.session != null);
      console.log(
        JSON.stringify(
          {
            source: week.source,
            notes: week.notes,
            training_days: trainingDays.length,
            summary: proposal.summary,
            per_day: trainingDays.map((d) => ({
              dow: d.dow,
              blocks: d.session!.blocks.length,
              groups: d.session!.blocks.map((b) => b.group),
              items: d.session!.blocks.reduce((n, b) => n + b.items.length, 0),
              review: d.flags.filter((f) => f.confidence === 'review').length,
            })),
          },
          null,
          2,
        ),
      );

      expect(week.source).toBe('llm');
      expect(trainingDays.length).toBeGreaterThanOrEqual(5);
      for (const d of trainingDays) {
        const groups = d.session!.blocks.map((b) => b.group);
        expect(groups, `${d.dow} sin calentamiento`).toContain('calentamiento');
        expect(groups, `${d.dow} sin principal`).toContain('principal');
        expect(groups, `${d.dow} sin vuelta`).toContain('vuelta');
        expect(d.flags.every((f) => !f.unresolved_exercise)).toBe(true);
      }
    },
    600_000,
  );
});
