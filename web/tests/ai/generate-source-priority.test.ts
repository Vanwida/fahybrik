/**
 * LIVE check of the source rule: the coach's method wins, the catalog fills in.
 * Hits a real DB (and, for the new-coach case, the real model), so it is gated on
 * COMPOSE_LIVE=1 and never runs in CI. Reads only.
 */
import { expect, test, describe } from 'vitest';
import { buildImportProposalFromRequest } from '@/lib/import/proposal-service';
import { loadComposableBlocks } from '@/lib/dashboard/coach/ai/suggest-week-from-blocks';
import { getTestSql } from '../utils/test-db';

const LIVE = process.env.COMPOSE_LIVE === '1';
const COACH_ID = Number(process.env.COMPOSE_LIVE_COACH ?? 60);
const MICROCYCLE_ID = process.env.COMPOSE_LIVE_MICROCYCLE;
const FOCUS =
  process.env.COMPOSE_LIVE_FOCUS ??
  '1 semana con doble sesión entre running e híbrido enfocado en HYROX';

(LIVE && MICROCYCLE_ID ? describe : describe.skip)('generate — source priority', () => {
  test(
    "a coach WITH blocks gets HIS method, typed",
    async () => {
      const sql = getTestSql();
      const blocks = await loadComposableBlocks(COACH_ID, sql);
      expect(blocks.length, 'este coach debe tener bloques').toBeGreaterThan(0);

      const started = Date.now();
      const proposal = await buildImportProposalFromRequest({
        coach_id: COACH_ID,
        body: { microcycle_id: Number(MICROCYCLE_ID), mode: 'generate', focus: FOCUS },
        client: sql,
      });
      const elapsed = Date.now() - started;

      const days = proposal.weeks[0]!.days.filter((d) => d.sessions.length > 0);
      const withItems = days.filter((d) =>
        d.sessions.some((s) => s.blocks.some((b) => b.items.length > 0)),
      );

      console.log(
        JSON.stringify(
          {
            bloques_del_coach: blocks.length,
            segundos: Math.round(elapsed / 1000),
            dias_con_sesion: days.length,
            dias_con_items: withItems.length,
            summary: proposal.summary,
            titulos: days.flatMap((d) =>
              d.sessions.flatMap((s) =>
                s.blocks.map((b) => `${d.dow}: ${b.title} (${b.items.length} items)`),
              ),
            ),
          },
          null,
          2,
        ),
      );

      // His method, not ours: real items, and fast because nothing was authored.
      expect(days.length).toBeGreaterThanOrEqual(5);
      expect(proposal.summary.total_items).toBeGreaterThan(0);
      expect(proposal.summary.unresolved).toBe(0);
      expect(elapsed).toBeLessThan(60_000);
    },
    600_000,
  );
});
