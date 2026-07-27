/**
 * Real-DB integration test for the LLM fallback path in
 * `proposeWeekAdjustment`.
 *
 * The system MUST degrade to a deterministic heuristic
 * (`buildHeuristicProposal`) when no LLM is configured. We assert that path
 * WITHOUT calling any LLM — by clearing every LLM-config env var so
 * `isCoachIaLlmConfigured()` returns false. The heuristic reads real
 * `workout_assignments` + a real recovery template from the DB and persists a
 * real `week_adjustment_proposals` row, which we read back.
 */
import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { proposeWeekAdjustment } from '@/lib/coach/ai-propose-week-adjustment';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import {
  makeAssignment,
  makeCoachAndAthlete,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

// Env vars that, if set, would route to the LLM. We clear them per-test so the
// fallback is exercised deterministically (and restore after).
const LLM_ENV_KEYS = [
  'PABLO_IA_MODEL',
  'PABLO_IA_API_KEY',
  'LLM_PROVIDER',
  'LLM_CHAT_MODEL',
  'LLM_MODEL',
  'LLM_CHAT_API_KEY',
  'LLM_API_KEY',
  'OPENROUTER_API_KEY',
  'LLM_EMBEDDING_MODEL',
];

// Evaluated week: drive needs_adjustment via missed sessions in this window.
const WEEK_START = '2026-04-06'; // Monday
const EVAL_DAYS = ['2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09'];
// Heuristic reads the NEXT week's scheduled assignments (week_start + 7).
const NEXT_WEEK = '2026-04-13';
const NEXT_DAYS = ['2026-04-13', '2026-04-15'];

describeWithDb('proposeWeekAdjustment heuristic fallback (real DB, no LLM)', () => {
  const sql = getTestSql();
  const cleanups: Array<() => Promise<void>> = [];
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await sql`select 1 as ok`;
  });
  beforeEach(() => {
    for (const k of LLM_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(async () => {
    for (const k of LLM_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    while (cleanups.length) await cleanups.pop()!();
  });
  afterAll(async () => {
    await closeTestSql();
  });

  test('needs_adjustment + no LLM → heuristic soften proposal pointing at recovery template', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);

    const hardTpl = await makeTemplate({ fx, name: 'Hard intervals' });
    // Recovery template — name match drives the heuristic's swap target.
    const recoveryTpl = await makeTemplate({ fx, name: 'Recovery flow + movilidad' });

    // Evaluated week: 3 missed → needs_adjustment (missed>=2, compliance<60%).
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[0]!, status: 'completed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[1]!, status: 'missed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[2]!, status: 'missed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[3]!, status: 'missed' });
    // Next week: scheduled sessions the heuristic can soften (first one swapped).
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: NEXT_DAYS[0]!, status: 'scheduled', notes: 'slot:am' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: NEXT_DAYS[1]!, status: 'scheduled', notes: 'slot:am' });

    const rec = await proposeWeekAdjustment({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      week_start: WEEK_START,
      client: sql,
    });

    expect(rec.verdict).toBe('needs_adjustment');
    expect(rec.week_start).toBe(NEXT_WEEK);
    // Deterministic heuristic: softens the FIRST scheduled session of N+1 by
    // swapping it for a recovery-named template, and produces exactly 1 change.
    expect(rec.proposal.recommendation).toBe('soften');
    expect(rec.proposal.slot_changes).toHaveLength(1);
    const change = rec.proposal.slot_changes[0]!;
    expect(change.date).toBe(NEXT_DAYS[0]);
    expect(String(change.from_template_id)).toBe(String(hardTpl));
    // The swap target is THE COACH'S OWN recovery template — the heuristic is
    // owner-scoped (obra 0), so with exactly one matching template in this
    // club's library the pick is pinned, not just "some recovery on the branch".
    expect(String(change.to_template_id)).toBe(String(recoveryTpl));

    // Persisted as a real pending proposal row.
    const persisted = await sql<Array<{ status: string; verdict: string }>>`
      select status::text, verdict from week_adjustment_proposals where id = ${Number(rec.id)}
    `;
    expect(persisted[0]!.status).toBe('pending');
    expect(persisted[0]!.verdict).toBe('needs_adjustment');
  }, 60000);

  test('ok verdict short-circuits to keep without invoking the heuristic swap', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup);
    const tpl = await makeTemplate({ fx, name: 'session' });
    // Full compliance in evaluated week → verdict ok.
    for (const d of EVAL_DAYS) {
      await makeAssignment({ fx, templateId: tpl, scheduledForIso: d, status: 'completed' });
    }

    const rec = await proposeWeekAdjustment({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      week_start: WEEK_START,
      client: sql,
    });

    expect(rec.verdict).toBe('ok');
    expect(rec.proposal.recommendation).toBe('keep');
    expect(rec.proposal.slot_changes).toEqual([]);
  }, 60000);

  test('scope por club: la heurística NUNCA propone la plantilla recovery de otro coach', async () => {
    const fx: Fixture = await makeCoachAndAthlete(sql);
    const otherClub: Fixture = await makeCoachAndAthlete(sql);
    cleanups.push(fx.cleanup, otherClub.cleanup);

    // El OTRO club tiene recovery; el club del atleta NO.
    await makeTemplate({ fx: otherClub, name: 'Recovery ajeno' });
    const hardTpl = await makeTemplate({ fx, name: 'Hard intervals' });

    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[0]!, status: 'completed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[1]!, status: 'missed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[2]!, status: 'missed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: EVAL_DAYS[3]!, status: 'missed' });
    await makeAssignment({ fx, templateId: hardTpl, scheduledForIso: NEXT_DAYS[0]!, status: 'scheduled', notes: 'slot:am' });

    const rec = await proposeWeekAdjustment({
      coach_id: fx.coachId,
      athlete_id: fx.athleteId,
      week_start: WEEK_START,
      client: sql,
    });

    // Va mal, pero sin recovery PROPIO no hay swap: cero cambios y revisión
    // manual — jamás la plantilla del otro club.
    expect(rec.verdict).toBe('needs_adjustment');
    expect(rec.proposal.slot_changes).toEqual([]);
    expect(rec.proposal.recommendation).toBe('keep');
  }, 60000);
});
