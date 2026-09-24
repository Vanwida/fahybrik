// Fixtures de las pruebas de entrega del plan (grupos, asignar a varios,
// publicación por semana). Un club con N atletas, programas de N semanas y
// limpieza en orden de FK — incluidos los lotes (0216) y los cursores de grupo.

import type { Sql } from '@/lib/db';
import {
  makeCoachAndAthlete,
  makeMonthTemplate,
  makeTemplate,
  type Fixture,
} from '../utils/db-fixtures';

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${++seq}-${Math.floor(Math.random() * 1e6)}`;

export interface Club {
  fx: Fixture;
  sql: Sql;
  coachId: number;
  /** El primero es el atleta de la fixture base. */
  athleteIds: number[];
  templateId: number;
  cleanup: () => Promise<void>;
}

export async function makeClub(sql: Sql, athletes: number): Promise<Club> {
  const fx = await makeCoachAndAthlete(sql);
  const ids = [fx.athleteId];
  const extraUsers: number[] = [];
  for (let i = 1; i < athletes; i++) {
    const u = await sql<Array<{ id: string }>>`
      insert into users (email, role) values (${uniq('pd') + '@test.local'}, 'athlete') returning id::text
    `;
    extraUsers.push(Number(u[0]!.id));
    const a = await sql<Array<{ id: string }>>`
      insert into athletes (user_id, coach_id, full_name)
      values (${Number(u[0]!.id)}, ${fx.coachId}, ${`Atleta ${String(i + 1).padStart(2, '0')}`})
      returning id::text
    `;
    ids.push(Number(a[0]!.id));
  }
  const templateId = await makeTemplate({ fx, name: 'Entreno de prueba' });

  const cleanup = async () => {
    const all = ids;
    await sql`delete from coach_assign_batches where coach_id = ${fx.coachId}`;
    await sql`delete from athlete_sequence_progress where athlete_id = any(${all}::bigint[])`;
    await sql`delete from program_sequences where coach_id = ${fx.coachId}`;
    await sql`delete from doubles_pairs where coach_id = ${fx.coachId}`;
    await sql`delete from weekly_plans where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athlete_pauses where athlete_id = any(${all}::bigint[])`;
    await sql`delete from workout_assignments where athlete_id = any(${all}::bigint[])`;
    await sql`delete from athlete_month_assignments where athlete_id = any(${all}::bigint[])`;
    await sql`delete from microcycles where athlete_id = any(${all}::bigint[])`;
    await sql`delete from coach_saved_views where coach_id = ${fx.coachId}`;
    const userIds = await sql<Array<{ user_id: string }>>`
      select user_id::text from athletes where id = any(${all}::bigint[])
    `;
    await sql`delete from notifications where user_id = any(${userIds.map((u) => Number(u.user_id))}::bigint[])`;
    await sql`delete from athletes where id = any(${ids.slice(1)}::bigint[])`;
    if (extraUsers.length > 0) await sql`delete from users where id = any(${extraUsers}::bigint[])`;
    await sql`delete from athlete_levels where coach_id = ${fx.coachId}`;
    await fx.cleanup();
  };

  return { fx, sql, coachId: fx.coachId, athleteIds: ids, templateId, cleanup };
}

/** Un programa de biblioteca de `weeks` semanas con entrenos lunes, miércoles y viernes. */
export async function makeProgram(club: Club, weeks: number, name?: string): Promise<number> {
  const { monthId } = await makeMonthTemplate({
    fx: club.fx,
    weekCount: weeks,
    workoutDays: [1, 3, 5],
    workoutTemplateId: club.templateId,
  });
  if (name) await club.sql`update program_month_templates set name = ${name} where id = ${monthId}`;
  return monthId;
}

export async function makeLevel(club: Club, name: string, sort: number): Promise<number> {
  const rows = await club.sql<Array<{ id: string }>>`
    insert into athlete_levels (coach_id, name, label, sort_order)
    values (${club.coachId}, ${name}, ${name}, ${sort}) returning id::text
  `;
  return Number(rows[0]!.id);
}

export async function weekRow(sql: Sql, athleteId: number, week: string) {
  const rows = await sql<Array<{ status: string; delivery_mode: string }>>`
    select status::text as status, delivery_mode from weekly_plans
    where athlete_id = ${athleteId} and week_start = ${week}::date
  `;
  return rows[0] ?? null;
}

export async function setWeek(sql: Sql, athleteId: number, week: string, status: string, mode = 'scheduled') {
  await sql`
    insert into weekly_plans (athlete_id, week_start, status, delivery_mode)
    values (${athleteId}, ${week}::date, ${status}::weekly_plan_status, ${mode})
    on conflict (athlete_id, week_start) do update set status = excluded.status, delivery_mode = excluded.delivery_mode
  `;
}

export async function sessionCount(sql: Sql, athleteId: number): Promise<number> {
  const rows = await sql<Array<{ n: number }>>`
    select count(*)::int as n from workout_assignments where athlete_id = ${athleteId}
  `;
  return rows[0]?.n ?? 0;
}

/** Lunes de la semana de hoy + `weeks` semanas (día de caja). */
export function mondayPlus(today: string, weeks: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow) + weeks * 7);
  return d.toISOString().slice(0, 10);
}
