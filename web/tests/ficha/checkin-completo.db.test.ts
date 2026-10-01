import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeTestSql, describeWithDb, getTestSql } from '../utils/test-db';
import { makeCoachAndAthlete, type Fixture } from '../utils/db-fixtures';
import { loadFichaCheckin } from '@/lib/dashboard/v2/ficha-checkin';
import { checkinDimensionRows, checkinFreshnessLabel } from '@/lib/dashboard/coach/checkin-presentation';
import { listPendingWeekAdjustments } from '@/lib/dashboard/coach/week-adjustments';
import { evaluateAthleteWeek } from '@/lib/dashboard/coach/weekly-evaluation';
import { pendingForEvaluation } from '@/lib/dashboard/v2/week-adjustment-period';

const sql = getTestSql();
describeWithDb('check-in íntegro y evaluación contextual (BD real)', () => {
  let fx: Fixture;
  let other: Fixture;
  let today: string;
  let yesterday: string;
  beforeAll(async () => {
    fx = await makeCoachAndAthlete(sql);
    other = await makeCoachAndAthlete(sql);
    await sql`update athletes set timezone = 'America/Los_Angeles' where id = ${fx.athleteId}`;
    const days = await sql<Array<{ today: string; yesterday: string }>>`
      select to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD') as today,
             to_char((now() at time zone 'America/Los_Angeles')::date - 1, 'YYYY-MM-DD') as yesterday`;
    today = days[0]!.today;
    yesterday = days[0]!.yesterday;
  });
  afterAll(async () => {
    if (fx) await fx.cleanup();
    if (other) await other.cleanup();
    await closeTestSql();
  });

  it('sin respuesta conserva 7 fechas y 7 huecos; otro coach no accede al check-in', async () => {
    const fresh = await loadFichaCheckin(sql, fx.coachId, fx.athleteId);
    expect(fresh.last_checkin).toBeNull();
    expect(fresh.checkin_week).toHaveLength(7);
    expect(fresh.checkin_week.at(-1)!.iso).toBe(today);
    expect(fresh.checkin_week.every((d) => d.sub_score === null)).toBe(true);
    expect(await loadFichaCheckin(sql, other.coachId, fx.athleteId)).toEqual({ last_checkin: null, checkin_week: [] });
  });

  it('respeta la fecha local, las cinco respuestas, la nota y la adaptación', async () => {
    await sql`insert into daily_checkins
      (athlete_id, recorded_for, recorded_at, soreness, mood, motivation, fatigue, sleep_quality, sub_score, notes, adaptive_flag)
      values (${fx.athleteId}, ${yesterday}::date, (${today}::date + interval '5 hours') at time zone 'UTC', 5, 2, 4, 4, null, 32, '  Piernas cargadas  ', 'consider_swap_z2_30')`;
    const state = await loadFichaCheckin(sql, fx.coachId, fx.athleteId);
    expect(state.last_checkin).toMatchObject({ recorded_for: yesterday, days_ago: 1, soreness: 5, mood: 2, motivation: 4, fatigue: 4, sleep_quality: null, notes: 'Piernas cargadas', adaptive_flag: 'consider_swap_z2_30', answered: false });
    expect(state.last_checkin!.time_label).toMatch(/^2[12]:00$/);
    expect(checkinFreshnessLabel(state.last_checkin!)).toBe('Check-in de ayer');
    expect(checkinDimensionRows(state.last_checkin!).map((d) => d.value)).toEqual([1, 2, 4, 2, null]);
    expect(state.checkin_week.filter((d) => d.sub_score != null)).toEqual([expect.objectContaining({ iso: yesterday, sub_score: 32 })]);
    expect(state.checkin_week.at(-1)).toMatchObject({ iso: today, sub_score: null });
  });

  it('abrir un hilo no marca la respuesta; solo un mensaje real posterior lo hace', async () => {
    const thread = await sql<Array<{ id: string }>>`insert into chat_threads (coach_id, athlete_id)
      values (${fx.coachId}, ${fx.athleteId}) returning id::text`;
    const threadId = Number(thread[0]!.id);
    expect((await loadFichaCheckin(sql, fx.coachId, fx.athleteId)).last_checkin!.answered).toBe(false);
    await sql`insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
      values (${threadId}, ${fx.coachUserId}, 'coach', 'Mensaje anterior', (${today}::date + interval '4 hours') at time zone 'UTC')`;
    expect((await loadFichaCheckin(sql, fx.coachId, fx.athleteId)).last_checkin!.answered).toBe(false);
    await sql`insert into chat_messages (thread_id, sender_user_id, sender_role, body, created_at)
      values (${threadId}, ${fx.coachUserId}, 'coach', 'He leído tu check-in', (${today}::date + interval '6 hours') at time zone 'UTC')`;
    expect((await loadFichaCheckin(sql, fx.coachId, fx.athleteId)).last_checkin!.answered).toBe(true);
    await sql`delete from chat_messages where thread_id = ${threadId}`;
    await sql`delete from chat_threads where id = ${threadId}`;
  });

  it('un check-in viejo sigue fechado y una fecha futura no se presenta como hoy', async () => {
    await sql`insert into daily_checkins (athlete_id, recorded_for, recorded_at, sub_score)
      values (${fx.athleteId}, ${today}::date + 1, now(), 100)`;
    await sql`update daily_checkins set recorded_for = ${today}::date - 10 where athlete_id = ${fx.athleteId} and recorded_for = ${yesterday}::date`;
    const state = await loadFichaCheckin(sql, fx.coachId, fx.athleteId);
    expect(state.last_checkin!.days_ago).toBe(10);
    expect(checkinFreshnessLabel(state.last_checkin!)).toBe('Último check-in hace 10 días');
    expect(state.checkin_week.every((d) => d.sub_score === null)).toBe(true);
  });

  it('evaluar una semana pasada conserva exactamente la selección, sin usar hoy', async () => {
    const evaluated = await evaluateAthleteWeek({ athlete_id: fx.athleteId, week_start: '2026-09-07', client: sql });
    expect(evaluated.week_start).toBe('2026-09-07');
    expect(evaluated.week_end).toBe('2026-09-13');
    expect(evaluated.week_feed.days.map((d) => d.iso_date)).toEqual(['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']);
  });

  it('dos propuestas reales se eligen por N+1 y no se mezclan entre coaches', async () => {
    const proposal = { recommendation: 'soften', rationale: 'Semana exigente', coach_summary: 'Reducir volumen', slot_changes: [] };
    for (const week of ['2026-09-14', '2026-09-28']) {
      await sql`insert into week_adjustment_proposals (athlete_id, week_start, verdict, proposal_json)
        values (${fx.athleteId}, ${week}::date, 'needs_adjustment', ${sql.json(proposal)})`;
    }
    await sql`insert into week_adjustment_proposals (athlete_id, week_start, verdict, proposal_json)
      values (${other.athleteId}, '2026-09-28', 'needs_adjustment', ${sql.json(proposal)})`;
    const pending = await listPendingWeekAdjustments({ coach_id: fx.coachId, client: sql });
    expect(pending).toHaveLength(2);
    expect(pendingForEvaluation(pending, '2026-09-21')?.week_start).toBe('2026-09-28');
    expect(pendingForEvaluation(pending, '2026-10-05')).toBeNull();
    expect(pending.every((p) => p.athlete_id === String(fx.athleteId))).toBe(true);
  });
});
