import 'server-only';

// GRUPOS — lectura (§4.5). Un grupo = `program_sequences` (0059 + 0215): nombre del
// coach, cadena ordenada de programas y, si tiene nivel y días, la regla de
// pertenencia automática. Miembros = cursores activos (`athlete_sequence_progress`).
// Todo va por coach: el grupo de otro coach no existe para este.

import type { Sql } from '@/lib/db';
import { sql as defaultSql } from '@/lib/db';
import { addDays, isoDateString, parseIsoDate } from '@fahybrid/shared/domain/dates';
import { groupAnchorFromMembers, windowEnd, type MemberAnchorVote } from '@fahybrid/shared/domain/coach/plan-placement';
import type {
  GroupCalendarItem,
  GroupDetail,
  GroupMember,
  GroupProgram,
  GroupSummary,
} from '@fahybrid/shared/schema/groups';
import { getSequenceById } from '@/lib/dashboard/coach/sequences';
import { AssignManyError, loadPrograms, type GroupPlanContext } from './assign-many-plan';
import { boxToday } from './week-publishing';

type GroupRow = {
  id: string;
  name: string | null;
  level_id: string | null;
  level_name: string | null;
  level_label: string | null;
  days_per_week: number | null;
  end_policy: GroupSummary['end_policy'];
  progression_pct: string | number | null;
  progression_applies_to: GroupSummary['progression_applies_to'];
  member_count: number;
  updated_at: string;
};

type ItemRow = { id: string; sequence_id: string; position: number; month_template_id: string };

export function groupDisplayName(g: { name: string | null; level_name: string | null; days_per_week: number | null }): string {
  if (g.name && g.name.trim()) return g.name.trim();
  const parts = [
    g.level_name ? `Nivel ${g.level_name}` : null,
    g.days_per_week != null ? `${g.days_per_week} ${g.days_per_week === 1 ? 'día' : 'días'}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Grupo sin nombre';
}

async function loadGroupRows(client: Sql, coach_id: number, only?: number): Promise<GroupRow[]> {
  return client<GroupRow[]>`
    select ps.id::text, ps.name, ps.level_id::text, al.name as level_name, al.label as level_label,
           ps.days_per_week, ps.end_policy, ps.progression_pct, ps.progression_applies_to,
           (select count(*)::int from athlete_sequence_progress asp
             where asp.sequence_id = ps.id and asp.status = 'active') as member_count,
           ps.updated_at::text
    from program_sequences ps
    left join athlete_levels al on al.id = ps.level_id
    where ps.coach_id = ${coach_id} and (${only ?? null}::bigint is null or ps.id = ${only ?? null}::bigint)
    order by lower(coalesce(ps.name, al.name, '')), ps.days_per_week nulls last, ps.id
  `;
}

async function summarize(client: Sql, coach_id: number, rows: GroupRow[]): Promise<GroupSummary[]> {
  if (rows.length === 0) return [];
  const items = await client<ItemRow[]>`
    select id::text, sequence_id::text, position, month_template_id::text
    from program_sequence_items where sequence_id = any(${rows.map((r) => Number(r.id))}::bigint[])
    order by sequence_id, position
  `;
  const programs = await loadPrograms(client, coach_id, items.map((i) => Number(i.month_template_id)));
  return rows.map((r) => {
    const own: GroupProgram[] = items
      .filter((i) => i.sequence_id === r.id)
      .map((i) => {
        const p = programs.get(Number(i.month_template_id));
        return {
          item_id: i.id,
          position: i.position,
          program_id: i.month_template_id,
          name: p?.name ?? 'Programa no disponible',
          weeks: p?.weeks ?? 0,
          sessions: p ? p.sessions_by_week.reduce((a, b) => a + b, 0) : 0,
        };
      });
    return {
      id: r.id,
      name: r.name,
      display_name: groupDisplayName(r),
      level: r.level_id ? { id: r.level_id, name: r.level_name ?? '', label: r.level_label ?? '' } : null,
      days_per_week: r.days_per_week,
      auto_rule: r.level_id != null && r.days_per_week != null,
      end_policy: r.end_policy,
      progression_pct: r.progression_pct == null ? null : Number(r.progression_pct),
      progression_applies_to: r.progression_applies_to,
      member_count: r.member_count,
      programs: own,
      total_weeks: own.reduce((a, p) => a + p.weeks, 0),
      updated_at: r.updated_at,
    };
  });
}

export async function listGroups(coach_id: number | bigint, client: Sql = defaultSql): Promise<GroupSummary[]> {
  const coach = Number(coach_id);
  return summarize(client, coach, await loadGroupRows(client, coach));
}

/** Calendario de una vuelta de la cadena, fechado desde el ancla del grupo. */
function calendarFrom(
  programs: GroupProgram[],
  anchor: { position: number; program_start: string } | null,
): GroupCalendarItem[] {
  if (!anchor) return [];
  const chain = programs.filter((p) => p.weeks > 0).sort((a, b) => a.position - b.position);
  const idx = chain.findIndex((p) => p.position === anchor.position);
  if (idx < 0) return [];
  const starts = new Map<number, string>([[idx, anchor.program_start]]);
  for (let i = idx + 1; i < chain.length; i++) {
    const prev = chain[i - 1]!;
    starts.set(i, isoDateString(addDays(parseIsoDate(starts.get(i - 1)!), prev.weeks * 7)));
  }
  for (let i = idx - 1; i >= 0; i--) {
    starts.set(i, isoDateString(addDays(parseIsoDate(starts.get(i + 1)!), -chain[i]!.weeks * 7)));
  }
  return chain.map((p, i) => ({
    position: p.position,
    program_id: p.program_id,
    name: p.name,
    start_date: starts.get(i)!,
    end_date: windowEnd(starts.get(i)!, p.weeks),
  }));
}

export async function getGroup(
  coach_id: number | bigint,
  group_id: number,
  client: Sql = defaultSql,
): Promise<GroupDetail | null> {
  const coach = Number(coach_id);
  const rows = await loadGroupRows(client, coach, group_id);
  if (rows.length === 0) return null;
  const [summary] = await summarize(client, coach, rows);
  const today = boxToday();

  const members = await client<
    Array<{
      athlete_id: string;
      name: string;
      avatar_url: string | null;
      level_label: string | null;
      lifecycle: GroupMember['lifecycle'];
      position: number;
      joined_at: string;
      plan_end: string | null;
    }>
  >`
    select a.id::text as athlete_id, a.full_name as name, a.avatar_url, al.name as level_label,
           a.lifecycle_status::text as lifecycle, asp.current_position as position,
           asp.started_at::text as joined_at,
           (select to_char(max(ama.end_date), 'YYYY-MM-DD') from athlete_month_assignments ama
             where ama.athlete_id = a.id) as plan_end
    from athlete_sequence_progress asp
    join athletes a on a.id = asp.athlete_id
    left join athlete_levels al on al.id = a.level_id
    where asp.sequence_id = ${group_id} and asp.coach_id = ${coach} and asp.status = 'active'
    order by a.full_name, a.id
  `;
  const receipts =
    members.length === 0
      ? []
      : await client<Array<{ athlete_id: string; month_template_id: string; start_date: string; end_date: string }>>`
          select distinct on (athlete_id, month_template_id)
                 athlete_id::text, month_template_id::text,
                 to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date
          from athlete_month_assignments
          where athlete_id = any(${members.map((m) => Number(m.athlete_id))}::bigint[])
          order by athlete_id, month_template_id, start_date desc
        `;
  const receiptOf = new Map(receipts.map((r) => [`${r.athlete_id}|${r.month_template_id}`, r]));

  const memberRows: GroupMember[] = members.map((m) => {
    const item = summary!.programs.find((p) => p.position === m.position) ?? null;
    const rec = item ? receiptOf.get(`${m.athlete_id}|${item.program_id}`) : undefined;
    const programStart =
      rec && item ? isoDateString(addDays(parseIsoDate(rec.end_date), 1 - item.weeks * 7)) : null;
    const inside = rec != null && today >= rec.start_date && today <= rec.end_date;
    const week =
      inside && programStart
        ? Math.floor((parseIsoDate(today).getTime() - parseIsoDate(programStart).getTime()) / 604_800_000) + 1
        : null;
    return {
      athlete_id: m.athlete_id,
      name: m.name,
      avatar_url: m.avatar_url,
      level_label: m.level_label,
      lifecycle: m.lifecycle,
      position: m.position,
      program: item ? { id: item.program_id, name: item.name, weeks: item.weeks } : null,
      week,
      program_start: programStart,
      program_end: rec?.end_date ?? null,
      plan_end: m.plan_end,
      joined_at: m.joined_at,
    };
  });

  const ctx = await loadGroupPlanContext(client, coach, group_id);
  const candidates = summary!.auto_rule
    ? await client<Array<{ athlete_id: string; name: string }>>`
        select a.id::text as athlete_id, a.full_name as name
        from athletes a
        where a.coach_id = ${coach} and a.lifecycle_status = 'activo'
          and a.level_id = ${Number(summary!.level!.id)} and a.training_days_per_week = ${summary!.days_per_week}
          and not exists (
            select 1 from athlete_sequence_progress asp where asp.athlete_id = a.id and asp.status = 'active'
          )
        order by a.full_name, a.id
      `
    : [];

  return {
    ...summary!,
    members: memberRows,
    calendar: { anchor: ctx.anchor, items: calendarFrom(summary!.programs, ctx.anchor) },
    rule_candidates: candidates,
  };
}

/** Contexto del grupo: cadena con sus programas, política y el ancla que votan sus miembros. */
export async function loadGroupPlanContext(
  client: Sql,
  coach_id: number,
  group_id: number,
  excluding: number[] = [],
): Promise<GroupPlanContext> {
  const seq = await getSequenceById(coach_id, group_id, client);
  if (!seq) throw new AssignManyError('group_not_found', 'No encuentro ese grupo entre los tuyos.', 404);
  const level = seq.level_id == null
    ? []
    : await client<Array<{ name: string }>>`select name from athlete_levels where id = ${seq.level_id} limit 1`;
  const programs = await loadPrograms(client, coach_id, seq.items.map((i) => Number(i.month_template_id)));
  const chain = seq.items
    .map((i) => ({ position: i.position, weeks: programs.get(Number(i.month_template_id))?.weeks ?? 0, program: programs.get(Number(i.month_template_id))! }))
    .filter((c) => c.program && c.weeks > 0);

  const members = await client<Array<{ athlete_id: string; position: number }>>`
    select athlete_id::text, current_position as position from athlete_sequence_progress
    where sequence_id = ${group_id} and coach_id = ${coach_id} and status = 'active'
  `;
  const voters = members.filter((m) => !excluding.includes(Number(m.athlete_id)));
  const today = boxToday();
  const votes: MemberAnchorVote[] = [];
  if (voters.length > 0) {
    const receiptRows = await client<Array<{ athlete_id: string; month_template_id: string; end_date: string }>>`
      select distinct on (ama.athlete_id, ama.month_template_id)
             ama.athlete_id::text, ama.month_template_id::text, to_char(ama.end_date, 'YYYY-MM-DD') as end_date
      from athlete_month_assignments ama
      where ama.athlete_id = any(${voters.map((v) => Number(v.athlete_id))}::bigint[])
      order by ama.athlete_id, ama.month_template_id, ama.start_date desc
    `;
    const latest = new Map(receiptRows.map((r) => [`${r.athlete_id}|${r.month_template_id}`, r.end_date]));
    for (const v of voters) {
      const item = seq.items.find((i) => i.position === v.position);
      const c = chain.find((x) => x.position === v.position);
      const end = item ? latest.get(`${v.athlete_id}|${item.month_template_id}`) : undefined;
      if (!c || !end) continue;
      votes.push({ position: v.position, program_weeks: c.weeks, receipt_end: end, current: end >= today });
    }
  }
  return {
    id: Number(seq.id),
    name: groupDisplayName({ name: seq.name, level_name: level[0]?.name ?? null, days_per_week: seq.days_per_week }),
    end_policy: seq.end_policy,
    chain: chain.map(({ position, weeks, program }) => ({ position, weeks, program })),
    anchor: groupAnchorFromMembers(votes),
    members: new Set(members.map((m) => Number(m.athlete_id))),
  };
}
